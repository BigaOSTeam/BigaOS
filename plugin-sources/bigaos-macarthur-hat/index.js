/**
 * BigaOS MacArthur HAT Driver Plugin
 *
 * Reads sensor data from the MacArthur HAT on RPi 5.
 * Currently supports NMEA 2000 via CAN bus (candump + canboatjs).
 * Future: NMEA 0183 serial inputs, I2C sensors.
 *
 * Data flow:
 *   MacArthur HAT -> SocketCAN (can0) -> candump -L
 *   -> parse CAN frame -> canboatjs FromPgn -> PGN handlers
 *   -> api.pushSensorValue() -> SensorMappingService -> Client
 *
 * Zero unit conversions: canboatjs outputs radians/m/s/K/Pa,
 * matching BigaOS internal units exactly.
 */

const { CANConnection } = require('./can-connection');
const { PGNHandlers } = require('./pgn-handlers');

let api = null;
let canConnection = null;
let pgnHandlers = null;
let fromPgn = null;
let healthCheckTimer = null;
let frameCount = 0;
let parsedCount = 0;
let lastFrameTime = 0;
let rawFrameCount = 0;

/**
 * Parse a raw CAN frame into a PGN message using canboatjs.
 *
 * 29-bit extended CAN ID layout:
 *   Bits 28-26: Priority (3 bits)
 *   Bit  25:    Reserved
 *   Bit  24:    Data Page
 *   Bits 23-16: PF (PDU Format)
 *   Bits 15-8:  PS (PDU Specific)
 *   Bits  7-0:  Source Address
 *
 * PF < 240: PDU1 (addressed), PGN = DP:PF:00, destination = PS
 * PF >= 240: PDU2 (broadcast), PGN = DP:PF:PS, destination = 255
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
    // PDU1: addressed message
    pgn = (dp << 16) | (pf << 8);
    dst = ps;
  } else {
    // PDU2: broadcast message
    pgn = (dp << 16) | (pf << 8) | ps;
    dst = 255;
  }

  // Format data as comma-separated decimal bytes for canboatjs
  const dataStr = Array.from(frame.data).join(',');

  // Write to canboatjs FromPgn transform stream (event-based API)
  fromPgn.write(JSON.stringify({
    pgn,
    src,
    dst,
    prio: priority,
    data: dataStr,
    timestamp: new Date().toISOString(),
  }) + '\n');
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
    if (!loggedDiag && rawFrameCount > 0) {
      const pushed = pgnHandlers ? pgnHandlers.pushCount : 0;
      api.log(`Diagnostics: ${rawFrameCount} raw CAN frames, ${frameCount} parsed with fields, ${pushed} values pushed`);
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

    // Load configuration
    const canInterface = await api.getSetting('canInterface') || 'can0';
    const autoReconnect = await api.getSetting('autoReconnect') !== false;
    const reconnectInterval = await api.getSetting('reconnectInterval') || 5;
    const pgnFilter = await api.getSetting('pgnFilter') || '';

    api.log(`Config: interface=${canInterface}, autoReconnect=${autoReconnect}, reconnectInterval=${reconnectInterval}s`);

    // Initialize canboatjs PGN parser (event-based Transform stream)
    try {
      const { FromPgn } = require('@canboat/canboatjs');
      fromPgn = new FromPgn();

      // Handle parsed PGN messages
      fromPgn.on('pgn', (parsed) => {
        if (parsed && parsed.fields) {
          frameCount++;
          lastFrameTime = Date.now();
          pgnHandlers.handle(parsed);
        }
      });

      fromPgn.on('warning', () => {
        // Silently ignore warnings (unknown PGNs, etc.)
      });

      fromPgn.on('error', (err) => {
        if (rawFrameCount <= 5) {
          api.log(`Parse error: ${err.message}`);
        }
      });

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

    // Initialize PGN handlers
    pgnHandlers = new PGNHandlers(api, { pgnFilter });

    // Create CAN connection
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

    // Start connection
    canConnection.connect();

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

    if (canConnection) {
      canConnection.disconnect();
      canConnection.removeAllListeners();
      canConnection = null;
    }

    fromPgn = null;
    pgnHandlers = null;
    frameCount = 0;
    parsedCount = 0;
    rawFrameCount = 0;
    lastFrameTime = 0;
    api = null;
  },
};
