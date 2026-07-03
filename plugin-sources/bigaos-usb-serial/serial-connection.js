/**
 * USB Serial Connection (dependency-free)
 *
 * Reads a line-oriented serial device (a USB GPS receiver) without any
 * native Node modules — mirroring how the CAN driver leans on candump
 * instead of native SocketCAN bindings.
 *
 * Approach:
 *   1. `stty` configures the tty (baud, 8N1, raw, clocal, no flow control).
 *   2. `fs.createReadStream` streams the bytes; we split on newlines and
 *      emit one 'line' event per complete NMEA sentence.
 *
 * Device + baud can be auto-detected: candidate devices are probed at a
 * list of common baud rates until one produces a valid NMEA sentence.
 *
 * Events:
 *   'connected'    (device, baud) — first line received after (re)connect
 *   'line'         (string)       — one complete line, trimmed
 *   'disconnected' (reason)
 *   'reconnecting' ()
 *   'error'        (Error)
 *   'detecting'    ()             — auto-detection scan started
 */

const fs = require('fs');
const { execFile } = require('child_process');
const { EventEmitter } = require('events');

const COMMON_BAUDS = [9600, 4800, 38400, 115200, 57600, 19200];
const PROBE_TIMEOUT_MS = 4000;   // per device/baud combination

class SerialConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.devicePath = options.devicePath || 'auto';
    this.baudRate = options.baudRate || 'auto';
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = (options.reconnectInterval || 5) * 1000;
    this.log = options.log || (() => {});

    this.stream = null;
    this.connected = false;
    this.stopping = false;
    this.reconnectTimer = null;
    this.lineBuffer = '';

    this.activeDevice = null;
    this.activeBaud = null;
  }

  isConnected() {
    return this.connected;
  }

  getActiveDevice() {
    return this.activeDevice;
  }

  getActiveBaud() {
    return this.activeBaud;
  }

  async connect() {
    if (this.stream) return;
    this.stopping = false;

    let device = this.devicePath;
    let baud = this.baudRate;

    if (device === 'auto' || baud === 'auto') {
      this.emit('detecting');
      const found = await this._detect(device, baud);
      if (this.stopping) return;
      if (!found) {
        this.emit('error', new Error('No NMEA 0183 device found on any serial port'));
        this._scheduleReconnect();
        return;
      }
      device = found.device;
      baud = found.baud;
    }

    this._open(device, parseInt(baud, 10));
  }

  disconnect() {
    this.stopping = true;
    this.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._closeStream();
    this.lineBuffer = '';
    this.activeDevice = null;
    this.activeBaud = null;
  }

  // ── Internal ──────────────────────────────────────────────

  _closeStream() {
    if (this.stream) {
      const s = this.stream;
      this.stream = null;
      try { s.removeAllListeners(); s.destroy(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * Configure a tty with stty. Resolves even on failure (best-effort) —
   * USB CDC-ACM receivers (u-blox) ignore baud but still need raw mode.
   */
  _configurePort(device, baud) {
    return new Promise((resolve) => {
      const args = [
        '-F', device,
        String(baud),
        'raw', '-echo',
        'cs8', '-cstopb', '-parenb',
        'clocal', '-crtscts',
      ];
      execFile('stty', args, { timeout: 4000 }, (err) => {
        if (err) this.log(`stty on ${device} failed: ${err.message}`, 'warn');
        resolve(!err);
      });
    });
  }

  _open(device, baud) {
    this.activeDevice = device;
    this.activeBaud = baud;
    this.lineBuffer = '';

    this._configurePort(device, baud).then(() => {
      if (this.stopping) return;
      try {
        this.stream = fs.createReadStream(device, { flags: 'r', highWaterMark: 256 });
      } catch (err) {
        this.emit('error', new Error(`Failed to open ${device}: ${err.message}`));
        this._scheduleReconnect();
        return;
      }

      this.stream.on('data', (chunk) => this._onData(chunk));
      this.stream.on('error', (err) => {
        this.connected = false;
        this._closeStream();
        if (!this.stopping) {
          this.emit('disconnected', err.message);
          this._scheduleReconnect();
        }
      });
      this.stream.on('close', () => {
        this.connected = false;
        this._closeStream();
        if (!this.stopping) {
          this.emit('disconnected', 'stream closed');
          this._scheduleReconnect();
        }
      });
    });
  }

  _onData(chunk) {
    this.lineBuffer += chunk.toString('latin1');
    // NMEA lines end in \r\n; split tolerantly on either.
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() || '';

    // Guard against a device that streams bytes but never a newline.
    if (this.lineBuffer.length > 4096) this.lineBuffer = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!this.connected) {
        this.connected = true;
        this.emit('connected', this.activeDevice, this.activeBaud);
      }
      this.emit('line', trimmed);
    }
  }

  _scheduleReconnect() {
    if (!this.autoReconnect || this.stopping) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopping && !this.stream) {
        this.emit('reconnecting');
        this.connect();
      }
    }, this.reconnectInterval);
  }

  // ── Auto-detection ────────────────────────────────────────

  /**
   * Build the ordered candidate device list.
   * Prefers stable /dev/serial/by-id symlinks, then ttyACM*, then ttyUSB*.
   */
  _listCandidates() {
    if (this.devicePath !== 'auto') return [this.devicePath];

    const seen = new Set();
    const out = [];
    const add = (path) => {
      let real = path;
      try { real = fs.realpathSync(path); } catch (_) { /* keep original */ }
      if (seen.has(real)) return;
      seen.add(real);
      out.push(path);
    };

    // Stable by-id symlinks first (survive re-enumeration across reboots).
    try {
      const byId = '/dev/serial/by-id';
      for (const name of fs.readdirSync(byId)) add(`${byId}/${name}`);
    } catch (_) { /* directory may not exist */ }

    // Then raw device nodes.
    try {
      for (const name of fs.readdirSync('/dev')) {
        if (/^ttyACM\d+$/.test(name)) add(`/dev/${name}`);
      }
      for (const name of fs.readdirSync('/dev')) {
        if (/^ttyUSB\d+$/.test(name)) add(`/dev/${name}`);
      }
    } catch (_) { /* ignore */ }

    return out;
  }

  async _detect(devicePath, baudRate) {
    const devices = this._listCandidates();
    const bauds = baudRate === 'auto' ? COMMON_BAUDS : [parseInt(baudRate, 10)];

    this.log(`Auto-detecting NMEA 0183 across ${devices.length} device(s): ${devices.join(', ') || '(none)'}`);

    for (const device of devices) {
      for (const baud of bauds) {
        if (this.stopping) return null;
        const ok = await this._probe(device, baud);
        if (ok) {
          this.log(`NMEA 0183 detected on ${device} @ ${baud} baud`);
          return { device, baud };
        }
      }
    }
    return null;
  }

  /**
   * Open a device at a baud for a few seconds and resolve true if it
   * produces at least one checksum-valid NMEA sentence.
   */
  _probe(device, baud) {
    const { validateChecksum } = require('./nmea-parser');
    return new Promise((resolve) => {
      let done = false;
      let buffer = '';
      let stream = null;
      let timer = null;

      const finish = (result) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (stream) { try { stream.removeAllListeners(); stream.destroy(); } catch (_) {} }
        resolve(result);
      };

      this._configurePort(device, baud).then(() => {
        if (this.stopping) return finish(false);
        try {
          stream = fs.createReadStream(device, { flags: 'r', highWaterMark: 256 });
        } catch (_) {
          return finish(false);
        }
        stream.on('error', () => finish(false));
        stream.on('data', (chunk) => {
          buffer += chunk.toString('latin1');
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          if (buffer.length > 4096) buffer = '';
          for (const line of lines) {
            const t = line.trim();
            if ((t[0] === '$' || t[0] === '!') && t.includes('*') && validateChecksum(t)) {
              return finish(true);
            }
          }
        });
        timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
      });
    });
  }
}

module.exports = { SerialConnection, COMMON_BAUDS };
