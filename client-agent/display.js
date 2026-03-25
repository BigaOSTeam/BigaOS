/**
 * Display control module using wlr-randr
 *
 * Controls resolution, rotation, and persists settings to a config file.
 * Works with any wlroots-based compositor (cage, labwc, sway).
 */

const { exec } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const CONFIG_JSON = join(process.env.HOME || '/home/bigaos', 'bigaos-display.json');
const CONFIG_SHELL = join(process.env.HOME || '/home/bigaos', 'bigaos-display.conf');

/**
 * Run a shell command and return stdout.
 */
function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
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
 *
 * Example wlr-randr output:
 *   HDMI-A-1 "..." (enabled)
 *     Modes:
 *       1920x1080 px, 60.000000 Hz (preferred, current)
 *       1024x800 px, 60.000000 Hz
 *     Position: 0,0
 *     Transform: normal
 *     Scale: 1.000000
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
 * Get current display information from wlr-randr.
 */
async function getDisplayInfo() {
  const output = await run('wlr-randr');
  const info = parseWlrRandr(output);
  const config = getConfig();
  return { ...info, config };
}

/**
 * Set display resolution via wlr-randr.
 * @param {string} outputName - e.g., "HDMI-A-1"
 * @param {string} mode - e.g., "1024x800" or "1920x1080"
 */
async function setResolution(outputName, mode) {
  // Strip Hz suffix if present for the --mode flag
  const modeClean = mode.replace(/@\d+Hz$/, '');
  await run(`wlr-randr --output ${outputName} --mode ${modeClean}`);
  console.log(`[Display] Resolution set to ${modeClean} on ${outputName}`);
}

/**
 * Set display rotation/transform via wlr-randr.
 * @param {string} outputName - e.g., "HDMI-A-1"
 * @param {string} transform - "normal", "90", "180", "270"
 */
async function setRotation(outputName, transform) {
  await run(`wlr-randr --output ${outputName} --transform ${transform}`);
  console.log(`[Display] Transform set to ${transform} on ${outputName}`);
}

/**
 * Set display scale/zoom via wlr-randr.
 * Scale > 1 = zoom in (things appear bigger), < 1 = zoom out.
 * @param {string} outputName - e.g., "HDMI-A-1"
 * @param {number} scale - e.g., 1.0, 1.5, 2.0
 */
async function setScale(outputName, scale) {
  await run(`wlr-randr --output ${outputName} --scale ${scale}`);
  console.log(`[Display] Scale set to ${scale} on ${outputName}`);
}

/**
 * Read persisted display config. Returns defaults if file missing.
 */
function getConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_JSON, 'utf8'));
  } catch {
    return { resolution: '', rotation: 'normal', scale: 1.0 };
  }
}

/**
 * Save display config to both JSON (for agent) and shell (for autostart).
 */
function saveConfig(config) {
  const merged = { ...getConfig(), ...config };

  // JSON config for agent
  writeFileSync(CONFIG_JSON, JSON.stringify(merged, null, 2) + '\n');

  // Shell-sourceable config for kiosk autostart
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

module.exports = { getDisplayInfo, setResolution, setRotation, setScale, getConfig, saveConfig };
