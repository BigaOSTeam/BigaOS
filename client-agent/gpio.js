/**
 * GPIO control module using pinctrl
 *
 * Uses pinctrl (available on all Pi models) instead of gpiod gpioset,
 * which holds GPIO lines in v2 and causes "device busy" errors.
 * Supports active-low and active-high relay boards.
 * No filesystem writes — safe for read-only OS.
 */

const { exec } = require('child_process');

/**
 * Set a GPIO pin to a given state using pinctrl.
 * @param {number} pin - BCM pin number
 * @param {boolean} state - true = ON, false = OFF
 * @param {string} relayType - 'active-low' or 'active-high'
 * @returns {Promise<boolean>} true on success
 */
function setPin(pin, state, relayType) {
  return new Promise((resolve, reject) => {
    // Active-low: ON = drive low, OFF = drive high (most optocoupler relay boards)
    // Active-high: ON = drive high, OFF = drive low
    const isActiveLow = relayType !== 'active-high';
    const drive = isActiveLow ? (state ? 'dl' : 'dh') : (state ? 'dh' : 'dl');
    const cmd = `pinctrl set ${pin} op ${drive}`;

    exec(cmd, { timeout: 3000 }, (error) => {
      if (error) {
        console.error(`[GPIO] Failed: ${cmd} — ${error.message}`);
        reject(new Error(`pinctrl failed: ${error.message}`));
      } else {
        console.log(`[GPIO] ${cmd} — OK`);
        resolve(true);
      }
    });
  });
}

/**
 * Initialize multiple pins to their expected states.
 * @param {Array<{gpioPin: number, state: boolean, relayType: string}>} pins
 */
async function initializePins(pins) {
  console.log(`[GPIO] Initializing ${pins.length} pin(s)...`);
  for (const pin of pins) {
    try {
      await setPin(pin.gpioPin, pin.state, pin.relayType || 'active-low');
    } catch (err) {
      console.error(`[GPIO] Init failed for pin ${pin.gpioPin}: ${err.message}`);
    }
  }
  console.log('[GPIO] Pin initialization complete');
}

module.exports = { setPin, initializePins };
