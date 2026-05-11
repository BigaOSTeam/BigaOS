/**
 * Overlay filesystem (read-only protection) control.
 *
 * Raspberry Pi clients use raspi-config's overlayfs to mount root as a
 * read-only overlay (tmpfs upper layer over ext4 lower). This protects
 * the SD card from power-loss corruption but makes settings changes
 * (rotation, scale) ephemeral. The BigaOS Display tab exposes a button
 * to toggle overlay, calling these functions.
 *
 * Actual enable/disable + reboot is delegated to /usr/local/bin/bigaos-overlay.sh
 * via sudo NOPASSWD (installed by client-setup.sh).
 */

const { exec } = require('child_process');

function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 10000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Return 'enabled' | 'disabled' | 'unknown'.
 * Doesn't need sudo — just reads /proc/mounts.
 */
async function getOverlayState() {
  try {
    await run('mount | grep -q overlayroot');
    return 'enabled';
  } catch {
    return 'disabled';
  }
}

/**
 * Toggle overlay and reboot. Reboot is async-detached so the WebSocket
 * response can flush before the system goes down.
 */
async function setOverlay(enabled) {
  const arg = enabled ? 'enable' : 'disable';
  await run(`sudo -n /usr/local/bin/bigaos-overlay.sh ${arg}`);
  setTimeout(() => {
    exec('sudo -n /usr/local/bin/bigaos-overlay.sh reboot', () => {});
  }, 1500);
}

module.exports = { getOverlayState, setOverlay };
