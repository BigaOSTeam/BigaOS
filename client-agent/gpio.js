/**
 * GPIO control module using gpiod (gpioset/gpioget)
 *
 * Works on both RPi 4B (gpiochip0) and RPi 5 (gpiochip4).
 * No filesystem writes — safe for read-only OS.
 */

const { exec } = require('child_process');

/** Map device type to gpiod chip name */
function getChip(deviceType) {
  return deviceType === 'rpi5' ? 'gpiochip4' : 'gpiochip0';
}

/**
 * Set a GPIO pin to a given state using gpioset.
 * @param {number} pin - BCM pin number
 * @param {boolean} state - true = HIGH, false = LOW
 * @param {string} deviceType - 'rpi4b' or 'rpi5'
 * @returns {Promise<boolean>} true on success
 */
function setPin(pin, state, deviceType) {
  return new Promise((resolve, reject) => {
    const chip = getChip(deviceType);
    const value = state ? 1 : 0;
    const cmd = `gpioset ${chip} ${pin}=${value}`;

    exec(cmd, { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[GPIO] Failed: ${cmd} — ${error.message}`);
        reject(new Error(`gpioset failed: ${error.message}`));
      } else {
        console.log(`[GPIO] ${cmd} — OK`);
        resolve(true);
      }
    });
  });
}

/**
 * Initialize multiple pins to their expected states.
 * @param {Array<{gpioPin: number, deviceType: string, state: boolean}>} pins
 */
async function initializePins(pins) {
  console.log(`[GPIO] Initializing ${pins.length} pin(s)...`);
  for (const pin of pins) {
    try {
      await setPin(pin.gpioPin, pin.state, pin.deviceType);
    } catch (err) {
      console.error(`[GPIO] Init failed for pin ${pin.gpioPin}: ${err.message}`);
    }
  }
  console.log('[GPIO] Pin initialization complete');
}

module.exports = { setPin, initializePins };
