/**
 * ADS1115 Tank Input Reader
 *
 * Reads up to 4 single-ended channels from a Texas Instruments ADS1115
 * 16-bit ADC over I²C. Each channel is wired to a resistive tank sender
 * via a voltage divider; the OS-side TankService applies the user's
 * calibration curve to convert raw voltage → liters.
 *
 * Protocol notes:
 *   - 16-bit conversion register (signed two's-complement) at 0x00.
 *   - Config register at 0x01, single-shot mode triggered by writing
 *     a config value with OS bit (15) = 1.
 *   - We poll one channel at a time via the MUX bits (cfg 14:12):
 *       100 = AIN0, 101 = AIN1, 110 = AIN2, 111 = AIN3.
 *   - PGA fixed at ±4.096 V (cfg 11:9 = 001) → 1 LSB = 125 µV.
 *   - 128 SPS (cfg 8:5 = 100) → ~7.8 ms per conversion, well under our 1 Hz poll.
 *
 * The default I²C bus is bus 1 (same as the IMU). The ADS1115 sits at
 * 0x48 by default, so it does not collide with the ICM-20948 at 0x68.
 */

const { EventEmitter } = require('events');

const ADS1115_DEFAULT_ADDRESS = 0x48;
const ADS1115_REG_CONVERSION = 0x00;
const ADS1115_REG_CONFIG = 0x01;

// Channel MUX bits (cfg[14:12]) for single-ended reads on AIN0..AIN3.
const MUX_SINGLE_ENDED = [0x4, 0x5, 0x6, 0x7];

// PGA = ±4.096 V (cfg[11:9] = 001). LSB size in volts.
const PGA_FSR_VOLTS = 4.096;
const PGA_BITS = 0x1;
const LSB_VOLTS = PGA_FSR_VOLTS / 32768;

// Data rate = 128 SPS (cfg[8:5] = 100). Conversion completes in ~8 ms.
const DR_BITS = 0x4;
const CONVERSION_WAIT_MS = 12;

class TankI2C extends EventEmitter {
  constructor(options = {}) {
    super();
    this.address = parseAddress(options.address, ADS1115_DEFAULT_ADDRESS);
    this.busNumber = options.busNumber || 1;
    this.pollRateHz = clamp(options.pollRateHz || 1, 0.1, 10);
    this.channels = parseChannels(options.channelsEnabled, [0, 1, 2]);
    this.bus = null;
    this.pollTimer = null;
    this.connected = false;
    this.errorCount = 0;
    this.maxErrors = 10;
  }

  async connect() {
    try {
      const i2cBus = require('i2c-bus');
      this.bus = await i2cBus.openPromisified(this.busNumber);

      // Probe by reading the config register — should return 16 bits.
      // If the device isn't there this will throw.
      const buf = Buffer.alloc(2);
      await this.bus.readI2cBlock(this.address, ADS1115_REG_CONFIG, 2, buf);

      this.connected = true;
      this.errorCount = 0;
      this.emit('connected');

      const intervalMs = Math.max(50, Math.round(1000 / this.pollRateHz));
      this.pollTimer = setInterval(() => this._pollAll(), intervalMs);
    } catch (err) {
      this.emit('error', err);
    }
  }

  isConnected() {
    return this.connected;
  }

  disconnect() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.bus) {
      try { this.bus.closeSync(); } catch (e) { /* ignore */ }
      this.bus = null;
    }
    this.connected = false;
    this.emit('disconnected');
  }

  async _pollAll() {
    if (!this.bus || !this.connected) return;

    for (const ch of this.channels) {
      try {
        const volts = await this._readChannel(ch);
        this.errorCount = 0;
        this.emit('reading', { channel: ch, volts });
      } catch (err) {
        this.errorCount++;
        if (this.errorCount <= 3) this.emit('error', err);
        if (this.errorCount >= this.maxErrors) {
          this.emit('error', new Error(`Too many ADS1115 errors (${this.maxErrors}), stopping tank polling`));
          this.disconnect();
          return;
        }
      }
    }
  }

  async _readChannel(channel) {
    const mux = MUX_SINGLE_ENDED[channel];
    // Build config:
    //   bit 15 = OS = 1 (start single conversion)
    //   bits 14:12 = MUX
    //   bits 11:9  = PGA (±4.096 V)
    //   bit 8      = MODE = 1 (single-shot)
    //   bits 7:5   = DR (128 SPS)
    //   bits 4:3   = COMP_MODE/POL = 0
    //   bit 2      = COMP_LAT = 0
    //   bits 1:0   = COMP_QUE = 11 (disable)
    const config =
      (1 << 15) |
      (mux << 12) |
      (PGA_BITS << 9) |
      (1 << 8) |
      (DR_BITS << 5) |
      0x03;

    const cfg = Buffer.from([(config >> 8) & 0xff, config & 0xff]);
    await this.bus.writeI2cBlock(this.address, ADS1115_REG_CONFIG, 2, cfg);

    // Wait for conversion to finish.
    await sleep(CONVERSION_WAIT_MS);

    const out = Buffer.alloc(2);
    await this.bus.readI2cBlock(this.address, ADS1115_REG_CONVERSION, 2, out);
    const raw = out.readInt16BE(0);
    return raw * LSB_VOLTS;
  }
}

// ================================================================
// Helpers
// ================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function parseAddress(value, fallback) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      const n = parseInt(trimmed, 16);
      if (!Number.isNaN(n)) return n;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function parseChannels(value, fallback) {
  if (Array.isArray(value)) {
    return value.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0 && n < 4);
  }
  if (typeof value === 'string') {
    const out = value
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isInteger(n) && n >= 0 && n < 4);
    if (out.length > 0) return out;
  }
  return fallback;
}

module.exports = { TankI2C };
