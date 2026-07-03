/**
 * BigaOS USB Serial (NMEA 0183) Driver Plugin
 *
 * Reads any USB serial instrument that speaks NMEA 0183 — plugged into the
 * Raspberry Pi — and feeds whatever it recognises into BigaOS: position,
 * SOG, COG, heading, speed through water, depth, wind, water temperature,
 * rudder angle. A GPS mouse is just one such device.
 *
 * Data flow:
 *   USB instrument -> /dev/ttyUSB0 | /dev/ttyACM0 (NMEA 0183)
 *   -> stty + fs.createReadStream (serial-connection.js)
 *   -> NMEA parse + checksum (nmea-parser.js)
 *   -> api.pushSensorValue() -> SensorMappingService -> Client
 *
 * Fail-safe: position is only pushed when the fix is valid (RMC status 'A' /
 * GGA quality > 0). A lost fix stops the position stream so the system goes
 * stale/null rather than freezing on an old point. Non-position streams are
 * pushed whenever a valid sentence carries them.
 */

const { SerialConnection } = require('./serial-connection');
const { parseSentence } = require('./nmea-parser');

let api = null;
let serial = null;
let healthTimer = null;

// Runtime state (reset on deactivate)
let lastLineTime = 0;
let lineCount = 0;
let parseErrors = 0;
let noDataAlertFired = false;
let fixQuality = 0;
let satellites = null;
const sentenceCounts = {}; // e.g. { RMC: 12, MWV: 40 }

const NO_DATA_MS = 10000; // no NMEA lines at all

// Which parser output fields push into which declared stream.
const FIELD_TO_STREAM = {
  sog: 'sog',
  cog: 'cog',
  headingTrue: 'heading_true',
  headingMagnetic: 'heading_magnetic',
  stw: 'stw',
  depth: 'depth',
  windSpeedApparent: 'wind_speed_apparent',
  windAngleApparent: 'wind_angle_apparent',
  windSpeedTrue: 'wind_speed_true',
  windAngleTrue: 'wind_angle_true',
  waterTemp: 'water_temp',
  rudder: 'rudder',
};

function handleLine(line) {
  lineCount++;
  lastLineTime = Date.now();

  const msg = parseSentence(line);
  if (!msg) return;                 // not NMEA
  if (!msg.valid) { parseErrors++; return; }

  sentenceCounts[msg.type] = (sentenceCounts[msg.type] || 0) + 1;

  if (msg.fixQuality !== undefined) fixQuality = msg.fixQuality;
  if (msg.satellites !== undefined && msg.satellites !== null) satellites = msg.satellites;

  // Position is fail-safe: parser only sets it when the fix is valid.
  if (msg.position) {
    api.pushSensorValue('position', {
      latitude: msg.position.latitude,
      longitude: msg.position.longitude,
      timestamp: new Date(),
    });
  }

  // Everything else: push whatever this sentence carried.
  for (const field in FIELD_TO_STREAM) {
    if (msg[field] !== undefined) api.pushSensorValue(FIELD_TO_STREAM[field], msg[field]);
  }
}

function startHealthCheck() {
  let loggedDiag = false;

  healthTimer = api.setInterval(() => {
    const now = Date.now();
    if (!serial.isConnected()) return; // detection / reconnect handles this

    if (!loggedDiag && lineCount > 0) {
      const seen = Object.keys(sentenceCounts).join(',') || 'none';
      api.log(`Diagnostics: ${lineCount} lines, ${parseErrors} parse errors, sentences=[${seen}], device=${serial.getActiveDevice()} @ ${serial.getActiveBaud()} baud`);
      loggedDiag = true;
    }

    if (lastLineTime > 0 && now - lastLineTime > NO_DATA_MS) {
      if (!noDataAlertFired) {
        api.log(`No serial data for ${Math.round((now - lastLineTime) / 1000)}s`);
        api.triggerAlert({
          name: 'USB Serial No Data',
          message: 'USB Serial: no data received for 10 seconds',
          severity: 'warning',
        });
        noDataAlertFired = true;
      }
      return;
    }
    if (noDataAlertFired && now - lastLineTime < NO_DATA_MS) {
      api.log('Serial data flow restored');
      noDataAlertFired = false;
    }
  }, 5000);
}

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('USB Serial (NMEA 0183) driver activating...');

    const devicePath = (await api.getSetting('devicePath')) || 'auto';
    const baudRate = (await api.getSetting('baudRate')) || 'auto';
    const autoReconnect = (await api.getSetting('autoReconnect')) !== false;
    const reconnectInterval = (await api.getSetting('reconnectInterval')) || 5;

    api.log(`Config: device=${devicePath}, baud=${baudRate}, autoReconnect=${autoReconnect}, reconnectInterval=${reconnectInterval}s`);

    serial = new SerialConnection({
      devicePath,
      baudRate,
      autoReconnect,
      reconnectInterval,
      log: (m, level) => api.log(m, level),
    });

    serial.on('detecting', () => api.log('Scanning serial ports for an NMEA 0183 device...'));
    serial.on('connected', (device, baud) => {
      api.log(`Serial device connected on ${device} @ ${baud} baud`);
      noDataAlertFired = false;
    });
    serial.on('line', handleLine);
    serial.on('disconnected', (reason) => api.log(`Serial device disconnected: ${reason}`));
    serial.on('reconnecting', () => api.log('Reconnecting to serial device...'));
    serial.on('error', (err) => api.log(`Serial error: ${err.message}`, 'warn'));

    // connect() may run auto-detection (async); don't block activation on it.
    serial.connect().catch((err) => api.log(`Serial connect failed: ${err.message}`, 'error'));

    startHealthCheck();
    api.log('USB Serial (NMEA 0183) driver active');
  },

  async deactivate() {
    if (api) api.log('USB Serial (NMEA 0183) driver deactivating...');

    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    if (serial) {
      serial.disconnect();
      serial.removeAllListeners();
      serial = null;
    }

    lastLineTime = 0;
    lineCount = 0;
    parseErrors = 0;
    noDataAlertFired = false;
    fixQuality = 0;
    satellites = null;
    for (const k in sentenceCounts) delete sentenceCounts[k];
    api = null;
  },

  // ── Plugin actions (RPC from client UI) ────────────────────
  async onAction(action) {
    if (action === 'status') {
      return {
        connected: serial ? serial.isConnected() : false,
        device: serial ? serial.getActiveDevice() : null,
        baud: serial ? serial.getActiveBaud() : null,
        lineCount,
        parseErrors,
        sentenceCounts: { ...sentenceCounts },
        // GPS-specific extras (present only if a GPS is attached)
        fixQuality,
        satellites,
      };
    }

    if (action === 'rescan') {
      if (!serial) return { error: 'Driver not active' };
      api.log('Manual rescan requested');
      serial.disconnect();
      serial.stopping = false; // re-arm after disconnect()
      serial.connect().catch((err) => api.log(`Rescan failed: ${err.message}`, 'error'));
      return { status: 'rescanning' };
    }

    return { error: `Unknown action: ${action}` };
  },
};
