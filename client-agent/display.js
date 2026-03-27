/**
 * Display control module
 *
 * Controls resolution and rotation via wlr-randr.
 * Scale/zoom via Chromium's --force-device-scale-factor (wlr-randr fractional
 * scaling looks bad on Pi, so scale changes require a Chromium restart).
 *
 * Also updates labwc touch calibration matrix when rotation changes.
 */

const { exec } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

const HOME = process.env.HOME || '/home/bigaos';
const CONFIG_JSON = join(HOME, 'bigaos-display.json');
const CONFIG_SHELL = join(HOME, 'bigaos-display.conf');
const LABWC_RC = join(HOME, '.config/labwc/rc.xml');

// Calibration matrices for touch rotation
const CALIBRATION_MATRICES = {
  '90':  '0 -1 1 1 0 0 0 0 1',
  '180': '-1 0 1 0 -1 1 0 0 1',
  '270': '0 1 0 -1 0 1 0 0 1',
};

/**
 * Run a shell command with Wayland environment.
 */
function run(cmd) {
  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() || 1000}`,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
  };
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 5000, env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} failed: ${stderr || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * Parse wlr-randr output into structured display info.
 */
function parseWlrRandr(output) {
  const result = { output: '', currentMode: '', currentTransform: 'normal', currentScale: 1.0, availableModes: [] };
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Output name (first non-indented line)
    if (!line.startsWith(' ') && !line.startsWith('\t') && line.trim()) {
      const match = line.match(/^(\S+)/);
      if (match) result.output = match[1];
    }

    // Modes
    const modeMatch = line.match(/^\s+(\d+x\d+)\s+px,\s+([\d.]+)\s+Hz\s*(.*)/);
    if (modeMatch) {
      const mode = modeMatch[1];
      const hz = Math.round(parseFloat(modeMatch[2]));
      const flags = modeMatch[3] || '';
      result.availableModes.push(`${mode}@${hz}Hz`);
      if (flags.includes('current')) {
        result.currentMode = `${mode}@${hz}Hz`;
      }
    }

    // Transform
    const transformMatch = line.match(/^\s+Transform:\s+(\S+)/);
    if (transformMatch) {
      result.currentTransform = transformMatch[1];
    }

    // Scale
    const scaleMatch = line.match(/^\s+Scale:\s+([\d.]+)/);
    if (scaleMatch) {
      result.currentScale = parseFloat(scaleMatch[1]);
    }
  }

  return result;
}

/**
 * Read scale from shell conf (the source of truth — kiosk script reads this).
 */
function getShellScale() {
  try {
    const shell = readFileSync(CONFIG_SHELL, 'utf8');
    const m = shell.match(/^DISPLAY_SCALE="?([^"\n]*)"?/m);
    return m ? parseFloat(m[1]) || 1.0 : 1.0;
  } catch {
    return 1.0;
  }
}

/**
 * Get current display information from wlr-randr.
 */
async function getDisplayInfo() {
  const output = await run('wlr-randr');
  const info = parseWlrRandr(output);
  const config = getConfig();
  // Always read scale from shell conf (source of truth for Chromium)
  const shellScale = getShellScale();
  config.scale = shellScale;
  info.currentScale = shellScale;
  return { ...info, config };
}

/**
 * Set display resolution via wlr-randr.
 */
async function setResolution(outputName, mode) {
  const modeClean = mode.replace(/@\d+Hz$/, '');
  await run(`wlr-randr --output ${outputName} --mode ${modeClean}`);
  console.log(`[Display] Resolution set to ${modeClean} on ${outputName}`);
}

/**
 * Set display rotation via wlr-randr and update touch calibration.
 */
async function setRotation(outputName, transform) {
  await run(`wlr-randr --output ${outputName} --transform ${transform}`);
  console.log(`[Display] Transform set to ${transform} on ${outputName}`);
  updateTouchCalibration(outputName, transform);
}

/**
 * Set display scale by saving config and restarting Chromium.
 * wlr-randr fractional scaling looks bad on Pi, so we use
 * Chromium's --force-device-scale-factor instead.
 */
async function setScale(_outputName, scale) {
  console.log(`[Display] Scale set to ${scale} (Chromium restart needed)`);
  // Scale is applied by restarting Chromium in the caller
}

/**
 * Restart Chromium kiosk to apply new scale factor.
 * The kiosk script reads DISPLAY_SCALE from bigaos-display.conf.
 */
async function restartChromium() {
  try {
    await run('pkill -f chromium');
    console.log('[Display] Chromium killed, kiosk script will relaunch');
  } catch {
    console.log('[Display] No Chromium process found to restart');
  }
}

/**
 * Update labwc touch calibration matrix to match rotation.
 */
function updateTouchCalibration(outputName, transform) {
  if (!existsSync(LABWC_RC)) return;

  try {
    const rc = readFileSync(LABWC_RC, 'utf8');

    // Extract device name from existing rc.xml
    const deviceMatch = rc.match(/deviceName="([^"]+)"/);
    if (!deviceMatch) return;
    const deviceName = deviceMatch[1];

    const calMatrix = CALIBRATION_MATRICES[transform];

    let newRc;
    if (calMatrix) {
      newRc = [
        '<?xml version="1.0"?>',
        '<openbox_config xmlns="http://openbox.org/3.4/rc">',
        `        <touch deviceName="${deviceName}" mapToOutput="${outputName}" mouseEmulation="no"/>`,
        '        <libinput>',
        `                <device deviceName="${deviceName}">`,
        `                        <calibrationMatrix>${calMatrix}</calibrationMatrix>`,
        '                </device>',
        '        </libinput>',
        '</openbox_config>',
      ].join('\n');
    } else {
      newRc = [
        '<?xml version="1.0"?>',
        '<openbox_config xmlns="http://openbox.org/3.4/rc">',
        `        <touch deviceName="${deviceName}" mapToOutput="${outputName}" mouseEmulation="no"/>`,
        '</openbox_config>',
      ].join('\n');
    }

    writeFileSync(LABWC_RC, newRc + '\n');
    console.log(`[Display] Touch calibration updated for ${transform}`);
  } catch (err) {
    console.error(`[Display] Failed to update touch calibration: ${err.message}`);
  }
}

/**
 * Read persisted display config.
 * Tries JSON first, falls back to parsing the shell conf (written by setup script).
 */
function getConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_JSON, 'utf8'));
  } catch {
    // Fall back to shell conf (setup script writes this but not the JSON)
    try {
      const shell = readFileSync(CONFIG_SHELL, 'utf8');
      const get = (key) => {
        const m = shell.match(new RegExp(`^${key}="?([^"\\n]*)"?`, 'm'));
        return m ? m[1] : '';
      };
      return {
        resolution: get('DISPLAY_RESOLUTION') || '',
        rotation: get('DISPLAY_ROTATION') || 'normal',
        scale: parseFloat(get('DISPLAY_SCALE')) || 1.0,
      };
    } catch {
      return { resolution: '', rotation: 'normal', scale: 1.0 };
    }
  }
}

/**
 * Save display config to both JSON (for agent) and shell (for kiosk autostart).
 */
function saveConfig(config) {
  const merged = { ...getConfig(), ...config };

  writeFileSync(CONFIG_JSON, JSON.stringify(merged, null, 2) + '\n');

  const shell = [
    `DISPLAY_RESOLUTION="${merged.resolution || ''}"`,
    `DISPLAY_ROTATION="${merged.rotation || 'normal'}"`,
    `DISPLAY_SCALE="${merged.scale || 1.0}"`,
    '',
  ].join('\n');
  writeFileSync(CONFIG_SHELL, shell);

  console.log(`[Display] Config saved: ${JSON.stringify(merged)}`);
  return merged;
}

module.exports = { getDisplayInfo, setResolution, setRotation, setScale, restartChromium, getConfig, saveConfig };
