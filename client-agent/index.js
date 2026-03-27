#!/usr/bin/env node
/**
 * BigaOS Client Agent
 *
 * Lightweight Node.js process that runs on a Raspberry Pi client.
 * Connects to the BigaOS server via WebSocket and handles:
 *   - GPIO commands (relay board control via gpiod)
 *   - Display settings (resolution, rotation via wlr-randr)
 *
 * Configuration via environment variables:
 *   BIGAOS_SERVER_URL  — e.g., http://192.168.1.100:3000
 *   BIGAOS_CLIENT_ID   — UUID matching a registered client in BigaOS
 *
 * Install:
 *   npm install
 *   BIGAOS_SERVER_URL=http://... BIGAOS_CLIENT_ID=... node index.js
 */

const { io } = require('socket.io-client');
const { setPin, initializePins } = require('./gpio');
const { getDisplayInfo, setResolution, setRotation, setScale, restartChromium, getConfig, saveConfig } = require('./display');

// ── Configuration ──────────────────────────────────────────
const SERVER_URL = process.env.BIGAOS_SERVER_URL;
const CLIENT_ID = process.env.BIGAOS_CLIENT_ID;

if (!SERVER_URL || !CLIENT_ID) {
  console.error('Error: BIGAOS_SERVER_URL and BIGAOS_CLIENT_ID must be set.');
  console.error('  Example:');
  console.error('    BIGAOS_SERVER_URL=http://192.168.1.100:3000 \\');
  console.error('    BIGAOS_CLIENT_ID=your-client-uuid \\');
  console.error('    node index.js');
  process.exit(1);
}

console.log(`BigaOS Client Agent`);
console.log(`  Server: ${SERVER_URL}`);
console.log(`  Client: ${CLIENT_ID}`);
console.log('');

// ── Socket.IO Connection ───────────────────────────────────
const socket = io(SERVER_URL, {
  auth: {
    clientId: CLIENT_ID,
    type: 'client-agent',
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// ── Connection Events ──────────────────────────────────────
socket.on('connect', () => {
  console.log(`[Agent] Connected to server (socket: ${socket.id})`);
});

socket.on('disconnect', (reason) => {
  console.log(`[Agent] Disconnected: ${reason}`);
});

socket.on('connect_error', (error) => {
  console.error(`[Agent] Connection error: ${error.message}`);
});

// ── GPIO Initialization ────────────────────────────────────
// Server sends this when we connect — set all pins to expected states
socket.on('gpio_init', async (data) => {
  console.log(`[Agent] Received gpio_init with ${data.switches.length} switch(es)`);
  await initializePins(data.switches);
});

// ── GPIO Command Execution ─────────────────────────────────
// Server sends this when a switch needs to be toggled
socket.on('gpio_command', async (command) => {
  console.log(`[Agent] GPIO command: pin ${command.gpioPin} → ${command.targetState ? 'ON' : 'OFF'} (switch: ${command.switchId})`);

  try {
    await setPin(command.gpioPin, command.targetState, command.relayType || 'active-low');
    socket.emit('gpio_command_result', {
      switchId: command.switchId,
      success: true,
    });
    console.log(`[Agent] Command succeeded: ${command.switchId}`);
  } catch (error) {
    socket.emit('gpio_command_result', {
      switchId: command.switchId,
      success: false,
      error: error.message,
    });
    console.error(`[Agent] Command failed: ${command.switchId} — ${error.message}`);
  }
});

// ── Display: Get Info ──────────────────────────────────────
// Server requests current display state
socket.on('display_get_info', async () => {
  console.log('[Agent] Display info requested');
  try {
    const info = await getDisplayInfo();
    socket.emit('display_info', info);
    console.log(`[Agent] Display info sent: ${info.output} ${info.currentMode} ${info.currentTransform}`);
  } catch (error) {
    socket.emit('display_info', {
      output: '',
      currentMode: '',
      currentTransform: 'normal',
      availableModes: [],
      config: getConfig(),
      error: error.message,
    });
    console.error(`[Agent] Display info failed: ${error.message}`);
  }
});

// ── Display: Set Settings ──────────────────────────────────
// Server sends resolution/rotation changes
socket.on('display_set', async (data) => {
  console.log(`[Agent] Display set: ${JSON.stringify(data)}`);

  try {
    // Get current display output name
    let outputName = data.output;
    if (!outputName) {
      const info = await getDisplayInfo();
      outputName = info.output;
    }

    if (!outputName) {
      throw new Error('No display output found');
    }

    // Apply resolution
    if (data.resolution) {
      await setResolution(outputName, data.resolution);
    }

    // Apply rotation
    if (data.rotation) {
      await setRotation(outputName, data.rotation);
    }

    // Check if scale actually changed before restarting Chromium
    const oldConfig = getConfig();
    const scaleChanged = data.scale !== undefined && data.scale !== (oldConfig.scale ?? 1.0);

    // Persist config (includes scale for Chromium restart)
    const config = saveConfig({
      ...(data.resolution && { resolution: data.resolution }),
      ...(data.rotation && { rotation: data.rotation }),
      ...(data.scale !== undefined && { scale: data.scale }),
    });

    // Only restart Chromium if scale actually changed
    if (scaleChanged) {
      await restartChromium();
    }

    socket.emit('display_set_result', { success: true, config });
    console.log('[Agent] Display settings applied');
  } catch (error) {
    socket.emit('display_set_result', { success: false, error: error.message });
    console.error(`[Agent] Display set failed: ${error.message}`);
  }
});

// ── Graceful Shutdown ──────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Agent] Received ${signal}, disconnecting...`);
  socket.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[Agent] Waiting for connection...');
