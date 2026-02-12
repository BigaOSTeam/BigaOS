/**
 * CAN Bus Connection via candump
 *
 * Spawns `candump -L <interface>` as a child process and parses the
 * log-format output into CAN frames. Uses candump instead of native
 * SocketCAN bindings to avoid native Node.js modules.
 *
 * candump log format: (timestamp) interface canid#data
 * Example: (1707000000.123456) can0 09FD0200#FF7FFF7FFFFF0000
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class CANConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.interface = options.interface || 'can0';
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = (options.reconnectInterval || 5) * 1000;
    this.process = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.stopping = false;
    this.lineBuffer = '';
  }

  connect() {
    if (this.process) return;
    this.stopping = false;

    try {
      // -L = log format (timestamp + interface + data)
      this.process = spawn('candump', ['-L', this.interface], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process.stdout.on('data', (chunk) => {
        this.lineBuffer += chunk.toString();
        const lines = this.lineBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        this.lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            const frame = parseCandumpLine(trimmed);
            if (frame) {
              if (!this.connected) {
                this.connected = true;
                this.emit('connected');
              }
              this.emit('frame', frame);
            }
          }
        }
      });

      this.process.stderr.on('data', (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) {
          this.emit('error', new Error(`candump stderr: ${msg}`));
        }
      });

      this.process.on('error', (err) => {
        this.connected = false;
        this.process = null;
        this.emit('error', new Error(`Failed to spawn candump: ${err.message}`));
        this._scheduleReconnect();
      });

      this.process.on('close', (code) => {
        this.connected = false;
        this.process = null;
        this.lineBuffer = '';

        if (!this.stopping) {
          this.emit('disconnected', code);
          this._scheduleReconnect();
        }
      });

    } catch (err) {
      this.emit('error', new Error(`Failed to start candump: ${err.message}`));
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.stopping = true;
    this.connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      // Force kill after 2 seconds if not dead yet
      const proc = this.process;
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
      }, 2000);
      this.process = null;
    }

    this.lineBuffer = '';
  }

  isConnected() {
    return this.connected;
  }

  _scheduleReconnect() {
    if (!this.autoReconnect || this.stopping) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopping && !this.process) {
        this.emit('reconnecting');
        this.connect();
      }
    }, this.reconnectInterval);
  }
}

/**
 * Parse a candump log-format line into a CAN frame.
 *
 * Format: (timestamp) interface canid#data
 * Example: (1707000000.123456) can0 09FD0200#FF7FFF7FFFFF0000
 *
 * Returns { id: number, data: Buffer, timestamp: number } or null on parse failure.
 */
function parseCandumpLine(line) {
  // Match: (timestamp) interface hexid#hexdata
  const match = line.match(/^\((\d+\.\d+)\)\s+\S+\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)$/);
  if (!match) return null;

  const timestamp = parseFloat(match[1]);
  const id = parseInt(match[2], 16);
  const dataHex = match[3];

  // Convert hex data string to Buffer (pairs of hex chars)
  const dataBytes = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    dataBytes.push(parseInt(dataHex.substring(i, i + 2), 16));
  }

  return {
    id,
    data: Buffer.from(dataBytes),
    timestamp,
  };
}

module.exports = { CANConnection, parseCandumpLine };
