/**
 * BigaOS MacArthur HAT Driver Plugin
 *
 * Reads sensor data from the MacArthur HAT on RPi 5.
 * Supports:
 *   - NMEA 2000 via CAN bus (candump + canboatjs)
 *   - ICM-20948 IMU via I2C (roll, pitch, magnetic heading)
 *
 * Data flow (CAN):
 *   MacArthur HAT -> SocketCAN (can0) -> candump -L
 *   -> parse CAN frame -> canboatjs FromPgn -> PGN handlers
 *   -> api.pushSensorValue() -> SensorMappingService -> Client
 *
 * Data flow (IMU):
 *   MacArthur HAT -> I2C bus 1 -> ICM-20948 registers
 *   -> raw accel/gyro/mag -> calibration correction
 *   -> Madgwick AHRS fusion -> mounting offset correction
 *   -> api.pushSensorValue() -> SensorMappingService -> Client
 */

const { CANConnection } = require('./can-connection');
const { PGNHandlers } = require('./pgn-handlers');
const { IMUConnection } = require('./imu-connection');
const { IMUFusion } = require('./imu-fusion');
const { IMUCalibration } = require('./imu-calibration');
const { TankI2C } = require('./tank-i2c');

let api = null;
let canConnection = null;
let pgnHandlers = null;
let fromPgn = null;
let imuConnection = null;
let imuFusion = null;
let imuCalibration = null;
let tankI2C = null;
let healthCheckTimer = null;
let frameCount = 0;
let parsedCount = 0;
let lastFrameTime = 0;
let rawFrameCount = 0;
let imuSampleCount = 0;
let imuPushCount = 0;
let lastImuPush = 0;
let imuCalibrating = false;

// IMU push rate limiting (ms between pushes)
const IMU_PUSH_INTERVAL = 100; // 10Hz output

/**
 * Parse a raw CAN frame into a PGN message using canboatjs.
 */
function processFrame(frame) {
  if (!fromPgn) return;

  rawFrameCount++;

  const canId = frame.id;
  const src = canId & 0xFF;
  const pf = (canId >> 16) & 0xFF;
  const ps = (canId >> 8) & 0xFF;
  const dp = (canId >> 24) & 0x01;
  const priority = (canId >> 26) & 0x07;

  let pgn, dst;
  if (pf < 240) {
    pgn = (dp << 16) | (pf << 8);
    dst = ps;
  } else {
    pgn = (dp << 16) | (pf << 8) | ps;
    dst = 255;
  }

  // Format as Actisense N2K ASCII: timestamp,prio,pgn,src,dst,len,hex_bytes
  const dataHex = Array.from(frame.data).map(b => b.toString(16).padStart(2, '0')).join(',');
  const line = `${new Date().toISOString()},${priority},${pgn},${src},${dst},${frame.data.length},${dataHex}`;

  try {
    const parsed = fromPgn.parseString(line);

    if (parsed && parsed.fields) {
      frameCount++;
      lastFrameTime = Date.now();
      pgnHandlers.handle(parsed);
    }
  } catch (err) {
    if (rawFrameCount <= 5) {
      api.log(`Parse error for PGN ${pgn}: ${err.message}`);
    }
  }
}

/**
 * Process IMU data through calibration and fusion filter, then push to streams.
 */
function processIMUData(data) {
  if (!imuFusion || !api || !imuCalibration || imuCalibrating) return;

  imuSampleCount++;

  // Apply calibration corrections. Implausible mag readings (electrical
  // bursts) are zeroed so the filter runs gyro+accel only for that sample.
  const correctedMag = imuCalibration.applyMag(data.mag);
  const corrected = {
    accel: data.accel,
    gyro: imuCalibration.applyGyro(data.gyro),
    mag: imuCalibration.checkMagField(correctedMag) ? correctedMag : { x: 0, y: 0, z: 0 },
    timestamp: data.timestamp,
  };

  const attitude = imuFusion.update(corrected);

  // Map device attitude onto the boat frame (mounting alignment)
  const final = imuCalibration.applyMounting(attitude, imuFusion.getQuaternion());

  // Rate-limit pushes to 10Hz
  const now = Date.now();
  if (now - lastImuPush < IMU_PUSH_INTERVAL) return;
  lastImuPush = now;
  imuPushCount++;

  api.pushSensorValue('imu_roll', final.roll);
  api.pushSensorValue('imu_pitch', final.pitch);
  api.pushSensorValue('imu_heading', final.heading);
}

/**
 * Run auto-calibration on first startup (gyro bias + mounting offset).
 * Magnetometer calibration requires user action.
 */
async function runAutoCalibration() {
  if (!imuConnection || !imuConnection.isConnected()) return;

  api.log('IMU: No calibration data found — running auto-calibration...');
  imuCalibrating = true;

  try {
    // Step 1: Gyro bias (device must be stationary)
    api.log('IMU: Calibrating gyro bias (keep device still)...');
    const gyroBias = await imuCalibration.calibrateGyro(imuConnection);
    api.log(`IMU: Gyro bias: x=${gyroBias.x.toFixed(4)}, y=${gyroBias.y.toFixed(4)}, z=${gyroBias.z.toFixed(4)}`);

    // Step 2: Let the fusion filter re-converge with corrected gyro data (~3s)
    api.log('IMU: Waiting for AHRS convergence...');
    imuFusion.reset(); // Re-converge with calibrated gyro
    imuCalibrating = false; // Let processIMUData run to feed the filter
    await new Promise(resolve => setTimeout(resolve, 3000));
    imuCalibrating = true;

    // Step 3: Mounting alignment (capture current orientation as level,
    // heading unchanged — align the bow later via "Align Heading")
    api.log('IMU: Calibrating mounting alignment (capturing current orientation as level)...');
    await imuCalibration.alignMounting(imuConnection, imuFusion, null);
    api.log('IMU: Mounting alignment captured');

    // Save
    imuCalibration.calibrated = true;
    imuCalibration.status = 'complete';
    await imuCalibration.save(api);
    api.log('IMU: Auto-calibration complete and saved');
  } catch (err) {
    api.log(`IMU: Auto-calibration failed: ${err.message}`);
    imuCalibration.status = 'idle';
  } finally {
    imuCalibrating = false;
    // Reset fusion after calibration for clean start
    imuFusion.reset();
  }
}

function startHealthCheck() {
  let lastCount = 0;
  let noDataAlertFired = false;
  let loggedDiag = false;

  healthCheckTimer = api.setInterval(() => {
    const now = Date.now();
    const receiving = frameCount > lastCount;
    lastCount = frameCount;

    // Log diagnostic info on first few health checks
    if (!loggedDiag && (rawFrameCount > 0 || imuSampleCount > 0)) {
      const pushed = pgnHandlers ? pgnHandlers.pushCount : 0;
      api.log(`Diagnostics: CAN ${rawFrameCount} raw/${frameCount} parsed/${pushed} pushed, IMU ${imuSampleCount} samples/${imuPushCount} pushed`);
      loggedDiag = true;
    }

    if (!canConnection.isConnected()) {
      api.log(`Health: CAN disconnected, waiting for reconnect...`);
      if (!noDataAlertFired) {
        api.triggerAlert({
          name: 'CAN Disconnected',
          message: 'MacArthur HAT: CAN bus disconnected',
          severity: 'warning',
        });
        noDataAlertFired = true;
      }
      return;
    }

    if (!receiving && lastFrameTime > 0 && (now - lastFrameTime) > 10000) {
      api.log(`Health: Connected but no data for ${Math.round((now - lastFrameTime) / 1000)}s`);
      if (!noDataAlertFired) {
        api.triggerAlert({
          name: 'No Data',
          message: 'MacArthur HAT: No data received for 10 seconds',
          severity: 'warning',
        });
        noDataAlertFired = true;
      }
    } else if (receiving) {
      if (noDataAlertFired) {
        api.log('Health: Data flow restored');
        noDataAlertFired = false;
      }
    }
  }, 5000);
}

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('MacArthur HAT driver activating...');

    // ── CAN Bus Setup ───────────────────────────────────────────
    const canInterface = await api.getSetting('canInterface') || 'can0';
    const autoReconnect = await api.getSetting('autoReconnect') !== false;
    const reconnectInterval = await api.getSetting('reconnectInterval') || 5;
    const pgnFilter = await api.getSetting('pgnFilter') || '';

    api.log(`CAN config: interface=${canInterface}, autoReconnect=${autoReconnect}, reconnectInterval=${reconnectInterval}s`);

    // Initialize canboatjs PGN parser
    try {
      const { FromPgn } = require('@canboat/canboatjs');
      fromPgn = new FromPgn();
      api.log('canboatjs PGN parser initialized');
    } catch (err) {
      api.log(`ERROR: Failed to load canboatjs: ${err.message}`);
      api.triggerAlert({
        name: 'Parser Error',
        message: 'MacArthur HAT: Failed to load PGN parser library',
        severity: 'critical',
      });
      throw err;
    }

    pgnHandlers = new PGNHandlers(api, { pgnFilter });

    canConnection = new CANConnection({
      interface: canInterface,
      autoReconnect,
      reconnectInterval,
    });

    canConnection.on('connected', () => {
      api.log(`Connected to CAN interface: ${canInterface}`);
    });
    canConnection.on('disconnected', (code) => {
      api.log(`CAN connection lost (exit code: ${code})`);
    });
    canConnection.on('reconnecting', () => {
      api.log(`Reconnecting to ${canInterface}...`);
    });
    canConnection.on('error', (err) => {
      api.log(`CAN error: ${err.message}`);
    });
    canConnection.on('frame', processFrame);
    canConnection.connect();

    // ── IMU Setup (independent of CAN) ──────────────────────────
    const imuEnabled = await api.getSetting('imuEnabled') !== false;

    if (imuEnabled) {
      const imuAddress = await api.getSetting('imuI2CAddress') || '0x68';
      const imuPollRate = await api.getSetting('imuPollRate') || 50;

      api.log(`IMU config: address=${imuAddress}, pollRate=${imuPollRate}Hz`);

      imuFusion = new IMUFusion({
        sampleInterval: Math.round(1000 / imuPollRate),
      });

      imuCalibration = new IMUCalibration();

      imuConnection = new IMUConnection({
        address: imuAddress,
        pollRate: imuPollRate,
      });

      imuConnection.on('connected', () => {
        api.log('IMU connected: ICM-20948');
      });
      imuConnection.on('data', processIMUData);
      imuConnection.on('error', (err) => {
        api.log(`IMU error: ${err.message}`);
      });
      imuConnection.on('disconnected', () => {
        api.log('IMU disconnected');
      });

      // Connect IMU (errors won't kill the plugin)
      try {
        await imuConnection.connect();

        // Load or auto-calibrate
        const hasCalibration = await imuCalibration.load(api);
        if (hasCalibration) {
          api.log('IMU: Loaded saved calibration data');
        } else {
          // Auto-calibrate on first run (non-blocking)
          setTimeout(() => runAutoCalibration(), 500);
        }
      } catch (err) {
        api.log(`IMU initialization failed: ${err.message} (CAN bus continues)`);
        api.triggerAlert({
          name: 'IMU Error',
          message: `MacArthur HAT: IMU not available (${err.message})`,
          severity: 'warning',
        });
      }
    } else {
      api.log('IMU disabled by configuration');
    }

    // ── ADS1115 Tank Inputs (independent of CAN/IMU) ────────────
    const tankEnabled = await api.getSetting('tankI2CEnabled') === true;

    if (tankEnabled) {
      const tankAddress = await api.getSetting('tankI2CAddress') || '0x48';
      const tankPollRate = await api.getSetting('tankPollRateHz') || 1;
      const tankChannels = await api.getSetting('tankChannelsEnabled') || '0,1,2';

      api.log(`ADS1115 config: address=${tankAddress}, pollRate=${tankPollRate}Hz, channels=${tankChannels}`);

      tankI2C = new TankI2C({
        address: tankAddress,
        pollRateHz: tankPollRate,
        channelsEnabled: tankChannels,
      });

      tankI2C.on('connected', () => {
        api.log('ADS1115 connected for tank inputs');
      });
      tankI2C.on('reading', ({ channel, volts }) => {
        const streamId = `tank_input_${channel}`;
        api.pushSensorValue(streamId, volts);
      });
      tankI2C.on('error', (err) => {
        api.log(`ADS1115 error: ${err.message}`);
      });
      tankI2C.on('disconnected', () => {
        api.log('ADS1115 disconnected');
      });

      try {
        await tankI2C.connect();
      } catch (err) {
        api.log(`ADS1115 initialization failed: ${err.message} (other interfaces continue)`);
        api.triggerAlert({
          name: 'Tank ADC Error',
          message: `MacArthur HAT: ADS1115 not available (${err.message})`,
          severity: 'warning',
        });
      }
    } else {
      api.log('ADS1115 tank inputs disabled by configuration');
    }

    // Start health monitoring
    startHealthCheck();

    api.log('MacArthur HAT driver active');
  },

  async deactivate() {
    if (api) {
      api.log('MacArthur HAT driver deactivating...');
    }

    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }

    if (imuConnection) {
      imuConnection.disconnect();
      imuConnection.removeAllListeners();
      imuConnection = null;
    }

    if (tankI2C) {
      tankI2C.disconnect();
      tankI2C.removeAllListeners();
      tankI2C = null;
    }

    if (canConnection) {
      canConnection.disconnect();
      canConnection.removeAllListeners();
      canConnection = null;
    }

    fromPgn = null;
    pgnHandlers = null;
    imuFusion = null;
    imuCalibration = null;
    imuCalibrating = false;
    frameCount = 0;
    parsedCount = 0;
    rawFrameCount = 0;
    lastFrameTime = 0;
    imuSampleCount = 0;
    imuPushCount = 0;
    lastImuPush = 0;
    api = null;
  },

  // ================================================================
  // Plugin Actions (RPC from client UI)
  // ================================================================

  async onAction(action, params) {
    if (action === 'imu_calibration_status') {
      if (!imuCalibration) return { status: 'unavailable' };
      return imuCalibration.getState();
    }

    if (action === 'imu_recalibrate_gyro_mount') {
      if (!imuConnection || !imuConnection.isConnected() || !imuCalibration || !imuFusion) {
        return { error: 'IMU not connected' };
      }
      if (imuCalibrating) return { error: 'Calibration already in progress' };

      // Run in background (non-blocking)
      (async () => {
        imuCalibrating = true;
        try {
          api.log('IMU: Recalibrating gyro + mounting offset...');
          await imuCalibration.calibrateGyro(imuConnection);
          imuFusion.reset();
          imuCalibrating = false;
          await new Promise(resolve => setTimeout(resolve, 3000));
          imuCalibrating = true;
          await imuCalibration.alignMounting(imuConnection, imuFusion, null);
          imuCalibration.calibrated = true;
          imuCalibration.status = 'complete';
          await imuCalibration.save(api);
          api.log('IMU: Recalibration complete');
        } catch (err) {
          api.log(`IMU: Recalibration failed: ${err.message}`);
          imuCalibration.status = 'idle';
        } finally {
          imuCalibrating = false;
          imuFusion.reset();
        }
      })();

      return { status: 'started' };
    }

    if (action === 'imu_align_heading') {
      if (!imuConnection || !imuConnection.isConnected() || !imuCalibration || !imuFusion) {
        return { error: 'IMU not connected' };
      }
      if (imuCalibrating) return { error: 'Calibration already in progress' };

      const heading = params ? Number(params.heading) : NaN;
      if (!Number.isFinite(heading)) {
        return { error: 'Invalid heading' };
      }
      const target = ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

      // Synchronous: samples ~1s of the converged filter, no fusion reset,
      // so the corrected heading is live immediately after the tare.
      imuCalibrating = true;
      try {
        const result = await imuCalibration.alignMounting(imuConnection, imuFusion, target);
        imuCalibration.calibrated = true;
        imuCalibration.status = 'complete';
        await imuCalibration.save(api);
        api.log(`IMU: Heading aligned — current attitude mapped to ${(target * 180 / Math.PI).toFixed(1)}° magnetic`);
        return { status: 'complete', heading: result.heading };
      } catch (err) {
        api.log(`IMU: Heading alignment failed: ${err.message}`);
        return { error: err.message };
      } finally {
        imuCalibrating = false;
      }
    }

    if (action === 'imu_start_mag_calibration') {
      if (!imuConnection || !imuConnection.isConnected() || !imuCalibration) {
        return { error: 'IMU not connected' };
      }
      imuCalibration.startMagCalibration(imuConnection);
      return { status: 'started' };
    }

    if (action === 'imu_stop_mag_calibration') {
      if (!imuConnection || !imuCalibration) return { error: 'IMU not connected' };
      const result = imuCalibration.stopMagCalibration(imuConnection);
      if (result) {
        await imuCalibration.save(api);
        imuFusion.reset();
        return { status: 'complete', ...result };
      }
      return { error: 'Not enough samples collected' };
    }

    return { error: `Unknown action: ${action}` };
  },
};
