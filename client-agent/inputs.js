/**
 * GPIO input module — manages gpiomon child processes for physical buttons.
 *
 * For each configured input we spawn one `gpiomon` process. When it reports
 * an edge event we call the configured emitCallback with { buttonId, gpioPin, value }.
 * On config changes we kill removed processes, start new ones, and restart any
 * whose configuration changed.
 *
 * Per-button debounce is applied here too — gpiomon can fire bursts on dirty
 * contacts and the server applies its own debounce as a safety net.
 */

const { spawn } = require('child_process');

/** Map device type → gpiod chip name (matches gpio.js) */
function getChip(deviceType) {
  return deviceType === 'rpi5' ? 'gpiochip4' : 'gpiochip0';
}

/** Build gpiomon args for a given config */
function buildArgs(input) {
  const args = [];
  // Bias: pull up/down (libgpiod ≥ 1.5). Falls back gracefully if unsupported.
  if (input.pull === 'up') args.push('--bias=pull-up');
  else if (input.pull === 'down') args.push('--bias=pull-down');

  // Edge selection (we only support single-edge triggers; both edges would
  // double-fire on a momentary push button)
  if (input.trigger === 'rising') args.push('--rising-edge');
  else args.push('--falling-edge');

  args.push(getChip(input.deviceType));
  args.push(String(input.gpioPin));
  return args;
}

/** Stable signature so we know when to restart a watcher */
function configKey(input) {
  return [
    input.gpioPin,
    input.pull,
    input.trigger,
    input.deviceType,
    input.enabled ? '1' : '0',
  ].join('|');
}

class InputManager {
  /**
   * @param {(event: { buttonId: string, gpioPin: number, value: number, timestamp: number }) => void} emitCallback
   */
  constructor(emitCallback) {
    this.emit = emitCallback;
    /** @type {Map<string, { proc: any, key: string, debounceMs: number, lastFireMs: number, gpioPin: number }>} */
    this.watchers = new Map(); // buttonId -> watcher
  }

  /** Apply a full config snapshot — start/stop/restart watchers as needed. */
  applyConfig(inputs) {
    const desiredIds = new Set();
    for (const input of inputs || []) {
      desiredIds.add(input.buttonId);
      const existing = this.watchers.get(input.buttonId);
      const key = configKey(input);
      if (!input.enabled) {
        if (existing) {
          this._stopWatcher(input.buttonId);
        }
        continue;
      }
      if (!existing) {
        this._startWatcher(input);
      } else if (existing.key !== key) {
        this._stopWatcher(input.buttonId);
        this._startWatcher(input);
      } else if (existing.debounceMs !== input.debounceMs) {
        existing.debounceMs = input.debounceMs;
      }
    }
    // Kill watchers for buttons that no longer exist in the config
    for (const id of Array.from(this.watchers.keys())) {
      if (!desiredIds.has(id)) this._stopWatcher(id);
    }
  }

  shutdown() {
    for (const id of Array.from(this.watchers.keys())) this._stopWatcher(id);
  }

  _startWatcher(input) {
    const args = buildArgs(input);
    let proc;
    try {
      proc = spawn('gpiomon', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.error(`[Inputs] Failed to spawn gpiomon for pin ${input.gpioPin}: ${err.message}`);
      return;
    }

    const watcher = {
      proc,
      key: configKey(input),
      debounceMs: input.debounceMs || 0,
      lastFireMs: 0,
      gpioPin: input.gpioPin,
    };
    this.watchers.set(input.buttonId, watcher);

    let stdoutBuf = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        // Example output: "event:  FALLING EDGE offset: 17 timestamp: [123.456789]"
        let value = 0;
        if (/RISING EDGE/i.test(line)) value = 1;
        else if (/FALLING EDGE/i.test(line)) value = 0;
        else continue;

        const now = Date.now();
        if (watcher.debounceMs > 0 && now - watcher.lastFireMs < watcher.debounceMs) continue;
        watcher.lastFireMs = now;

        try {
          this.emit({
            buttonId: input.buttonId,
            gpioPin: input.gpioPin,
            value,
            timestamp: now,
          });
        } catch (err) {
          console.error(`[Inputs] emit failed: ${err.message}`);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) console.error(`[Inputs] gpiomon pin ${input.gpioPin}: ${text}`);
    });

    proc.on('exit', (code, signal) => {
      const cur = this.watchers.get(input.buttonId);
      if (cur && cur.proc === proc) {
        this.watchers.delete(input.buttonId);
        if (signal !== 'SIGTERM') {
          console.warn(`[Inputs] gpiomon for pin ${input.gpioPin} exited (code=${code}, signal=${signal})`);
        }
      }
    });

    console.log(`[Inputs] Watching pin ${input.gpioPin} (${input.trigger}, pull-${input.pull}, debounce ${input.debounceMs}ms) for button ${input.buttonId}`);
  }

  _stopWatcher(buttonId) {
    const watcher = this.watchers.get(buttonId);
    if (!watcher) return;
    this.watchers.delete(buttonId);
    try {
      watcher.proc.kill('SIGTERM');
    } catch {
      // ignore
    }
    console.log(`[Inputs] Stopped watching pin ${watcher.gpioPin} (button ${buttonId})`);
  }
}

module.exports = { InputManager };
