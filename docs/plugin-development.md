# BigaOS Plugin Development Guide

This guide covers everything you need to build, test, and distribute plugins for BigaOS.

## Overview

BigaOS plugins are Node.js modules that run on the server. Each plugin lives in its own directory with a `plugin.json` manifest and a JavaScript entry point. The system discovers plugins at startup, and users manage them through the Settings UI.

**Plugin types:**

| Type | Purpose |
|------|---------|
| `driver` | Read sensor data from hardware or external sources |
| `service` | Background services (logging, cloud sync, etc.) |
| `integration` | Connect to external systems (Signal K, Home Assistant, etc.) |
| `ui-extension` | Add custom dashboard widgets |

## Quick Start

Minimal plugin structure:

```
my-plugin/
  plugin.json    <- manifest (required)
  index.js       <- entry point (required)
  package.json   <- only if you have npm dependencies
```

### 1. Create the manifest (`plugin.json`)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does.",
  "author": "Your Name",
  "type": "driver",
  "main": "index.js",
  "capabilities": ["sensor-data", "settings"],
  "driver": {
    "protocol": "my-protocol",
    "dataStreams": [
      {
        "id": "temperature",
        "name": "Temperature",
        "dataType": "temperature",
        "unit": "K",
        "updateRate": 1,
        "description": "Ambient temperature"
      }
    ]
  }
}
```

### 2. Create the entry point (`index.js`)

```js
let api = null;

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('My plugin activating...');

    // Push data on an interval (auto-cleaned on deactivate)
    api.setInterval(() => {
      api.pushSensorValue('temperature', 295.15); // 22 C in Kelvin
    }, 1000);

    api.log('My plugin active');
  },

  async deactivate() {
    api = null;
  },
};
```

### 3. Install and test

For development, place your plugin folder in `plugins/` and restart the server. It will be discovered automatically.

---

## Plugin Manifest Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, e.g. `"my-nmea0183-driver"`. Use lowercase with hyphens. |
| `name` | string | Human-readable name shown in the UI. |
| `version` | string | Semver version, e.g. `"1.0.0"`. |
| `description` | string | Short description for the marketplace. |
| `author` | string | Author name or organization. |
| `type` | string | One of: `"driver"`, `"service"`, `"integration"`, `"ui-extension"`. |
| `main` | string | Entry point file relative to plugin root, e.g. `"index.js"`. |
| `capabilities` | string[] | List of required capabilities (see below). |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `flag` | string | `"official"` or `"community"`. |
| `builtin` | boolean | If `true`, the plugin cannot be uninstalled. |
| `icon` | string | SVG icon filename relative to plugin root. |
| `license` | string | SPDX license identifier. |
| `homepage` | string | URL to documentation. |
| `repository` | string | URL to source code. |
| `minBigaOSVersion` | string | Minimum compatible BigaOS version. |

### Capabilities

Capabilities gate what API methods your plugin can call. Only declare what you need.

| Capability | Grants access to |
|------------|------------------|
| `sensor-data` | `pushSensorValue()`, `pushSensorDataPacket()` |
| `settings` | `getSetting()`, `setSetting()` |
| `events` | `onEvent()` to listen to system events |
| `alerts` | `triggerAlert()` to fire alerts to the user |
| `network` | Declares that the plugin accesses serial ports, TCP, UDP, etc. |

### Driver Configuration (`driver` section)

Driver plugins declare their data streams and optional config fields:

```json
{
  "driver": {
    "protocol": "nmea0183",
    "dataStreams": [ ... ],
    "configSchema": [ ... ]
  }
}
```

#### Data Streams

Each stream declares one output the plugin can produce. On activation, streams are auto-mapped to internal sensor slots.

```json
{
  "id": "heading",
  "name": "Heading (Magnetic)",
  "dataType": "heading_magnetic",
  "unit": "radians",
  "updateRate": 5,
  "description": "Magnetic heading from compass"
}
```

- `id` - Unique within the plugin. This is the `streamId` you pass to `pushSensorValue()`.
- `dataType` - Maps to a sensor slot type (see Standard Sensor Slots below).
- `updateRate` - Expected updates per second (informational, shown in UI).

#### Config Schema

Define user-configurable settings that appear in the plugin's settings panel:

```json
{
  "configSchema": [
    {
      "key": "serialPort",
      "label": "Serial Port",
      "type": "string",
      "default": "/dev/ttyUSB0",
      "description": "Path to the NMEA 0183 serial port"
    },
    {
      "key": "baudRate",
      "label": "Baud Rate",
      "type": "select",
      "default": "4800",
      "options": [
        { "value": "4800", "label": "4800" },
        { "value": "38400", "label": "38400" }
      ]
    },
    {
      "key": "enabled",
      "label": "Enabled",
      "type": "boolean",
      "default": true
    }
  ]
}
```

Supported config field types: `string`, `number`, `boolean`, `select`, `port`.

---

## Plugin API Reference

Your plugin receives a `PluginAPI` instance in `activate()`. All methods are scoped to your plugin - you cannot access other plugins' settings or streams.

### Sensor Data

```js
// Push a single value to a declared stream
api.pushSensorValue(streamId, value, optionalTimestamp);

// Push a complete StandardSensorData packet (legacy, prefer individual pushes)
api.pushSensorDataPacket(dataObject);
```

`pushSensorValue()` validates that `streamId` is declared in your manifest. Pushing an undeclared stream throws an error.

### Settings

```js
// Read a plugin setting (returns null if not set)
const value = await api.getSetting('serialPort');

// Write a plugin setting
await api.setSetting('serialPort', '/dev/ttyUSB1');
```

Settings are persisted in the database, namespaced as `plugin.<pluginId>.<key>`. They survive restarts and plugin updates.

Config schema defaults are NOT automatically loaded - use `getSetting()` with a fallback:

```js
const port = await api.getSetting('serialPort') || '/dev/ttyUSB0';
```

### Alerts

```js
api.triggerAlert({
  name: 'Connection Lost',
  message: 'Serial port /dev/ttyUSB0 disconnected',
  severity: 'warning',       // 'info' | 'warning' | 'critical'
  tone: 'notification',      // optional
});
```

### Events

```js
api.onEvent('sensor_update', (data) => {
  // React to sensor data changes
});
```

Available events: `sensor_update`, `weather_update`, `alert_triggered`, `alert_cleared`.

### Timers

```js
// Use api.setInterval instead of global setInterval
// These are auto-cleaned on deactivate
const timer = api.setInterval(() => {
  // poll hardware, push data, etc.
}, 1000);

// Manual cleanup if needed
api.clearInterval(timer);
```

### Logging

```js
api.log('Starting up...');                    // info
api.log('Port not found', 'warn');            // warning
api.log('Fatal error occurred', 'error');     // error
```

Output format: `[Plugin:my-plugin] Starting up...`

### Other

```js
api.getPluginId();    // Returns your plugin ID
api.getManifest();    // Returns your parsed plugin.json
```

---

## Standard Units

All sensor data must be in BigaOS standard units. Convert on ingestion, never push raw hardware units.

| Measurement | Standard Unit | Notes |
|-------------|---------------|-------|
| Speed | **m/s** | Convert from knots: `value * 0.514444` |
| Depth | **meters** | |
| Temperature | **Kelvin** | Convert from Celsius: `value + 273.15` |
| Pressure | **Pascal** | Convert from hPa/mbar: `value * 100` |
| Angles | **radians** | Convert from degrees: `value * Math.PI / 180` |
| Position | **decimal degrees** | Latitude/longitude as-is |
| Percentage | **0-100** | Battery SOC, tank levels, humidity |
| Voltage | **Volts** | |
| Current | **Amps** | |
| RPM | **RPM** | Direct value |

The client handles all display conversions (radians to degrees, m/s to knots, Kelvin to Celsius, etc.) based on user preferences. Your plugin only deals with standard units.

---

## Standard Sensor Slot Types

These are the `dataType` values you can use in data stream declarations:

**Navigation:**
- `position` - `{ latitude: number, longitude: number, timestamp: Date }`
- `speed_over_ground` - number (m/s)
- `course_over_ground` - number (radians)
- `heading_magnetic` - number (radians)
- `heading_true` - number (radians)
- `attitude` - `{ roll, pitch, yaw }` (radians)

**Environment:**
- `depth` - number (meters)
- `wind_apparent` - `{ speed: number, angle: number }` (m/s, radians)
- `wind_true` - `{ speed: number, angle: number }` (m/s, radians)
- `temperature_engine` - number (Kelvin)
- `temperature_cabin` - number (Kelvin)
- `temperature_outside` - number (Kelvin)
- `temperature_battery` - number (Kelvin)

**Electrical:**
- `battery_voltage` - number (Volts)
- `battery_current` - number (Amps)
- `battery_soc` - number (%)
- `battery_temperature` - number (Kelvin)

**Propulsion:**
- `motor_state` - `'running'` | `'stopped'`
- `motor_temperature` - number (Kelvin)
- `motor_throttle` - number (%)

**Custom:** You can use any string as a `dataType`. Custom types won't auto-map to built-in sensor slots but can still be mapped manually by users.

---

## Plugin Lifecycle

```
              discoverPlugins()        activatePlugin()
  plugin.json ───────────────> installed ──────────────> enabled
                                  ^                        │
                                  │     deactivatePlugin() │
                                  └────────────────────────┘
```

1. **Discovery** - On server startup, BigaOS scans `plugins/` for directories containing `plugin.json`.
2. **Activation** - `activate(api)` is called with a 30-second timeout. If it throws or times out, the plugin enters `error` state.
3. **Running** - Your intervals run, data flows through `pushSensorValue()`, users see your data on the dashboard.
4. **Deactivation** - `deactivate()` is called with a 10-second timeout. Clean up connections and state here. All `api.setInterval()` timers and event subscriptions are auto-cleaned.

The user controls enable/disable through the Settings > Plugins UI. Plugin states (enabled/disabled) persist across restarts.

---

## Project Structure

```
BigaOS/
  plugins/                      <- Runtime directory (discovered by server)
    bigaos-demo-driver/         <- Built-in plugin (shipped with BigaOS)
      plugin.json
      index.js
    registry.json               <- Plugin marketplace registry
    bigaos-nmea2000.tar.gz      <- Downloaded plugin tarballs
  plugin-sources/               <- Source code for non-builtin plugins
    bigaos-nmea2000/
      plugin.json
      index.js
      can-connection.js
      pgn-handlers.js
      package.json
```

- **`plugins/`** - Runtime directory. The server discovers plugins here. Builtin plugins (like the demo driver) live here permanently. Non-builtin plugins are installed here from the marketplace and deleted on uninstall.
- **`plugin-sources/`** - Git-tracked source code for non-builtin plugins. A GitHub Action builds tarballs from here and commits them to `plugins/*.tar.gz` for marketplace distribution.

---

## Distributing Your Plugin

### 1. Package as a tarball

Your plugin must be packaged as a `.tar.gz` with the plugin directory as the root:

```
my-plugin.tar.gz
  my-plugin/
    plugin.json
    index.js
    package.json       (if you have dependencies)
    node_modules/      (optional, bundled deps)
```

For official plugins with source in `plugin-sources/`, run:

```
npm run build:plugins
```

This installs production dependencies and creates `plugins/<plugin-id>.tar.gz`.

### 2. Host the tarball

Upload the `.tar.gz` to a URL accessible by the target BigaOS instance. GitHub raw URLs work well:

```
https://github.com/your-org/your-repo/raw/main/plugins/my-plugin.tar.gz
```

### 3. Add to the registry

Add an entry to `plugins/registry.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What it does.",
  "author": "Your Name",
  "type": "driver",
  "flag": "community",
  "latestVersion": "1.0.0",
  "capabilities": ["sensor-data", "settings"],
  "downloadUrl": "https://example.com/my-plugin.tar.gz",
  "repository": "https://github.com/your-org/my-plugin",
  "versions": [
    {
      "version": "1.0.0",
      "downloadUrl": "https://example.com/my-plugin.tar.gz",
      "releaseDate": "2026-01-15",
      "changelog": "Initial release"
    }
  ]
}
```

Users will see your plugin in Settings > Plugins > Marketplace and can install it with one click.

### What happens on install

1. BigaOS downloads the tarball from `downloadUrl`
2. Extracts it to `plugins/<plugin-id>/`
3. If `package.json` exists, runs `npm install --production`
4. Reads `plugin.json` and adds the plugin to the system
5. User enables the plugin through the UI

### What happens on uninstall

1. Plugin is deactivated (connections closed, timers cleared)
2. Sensor mappings for this plugin are removed
3. The `plugins/<plugin-id>/` directory is deleted
4. Plugin state is removed from the database

---

## Example: Minimal Sensor Plugin

A complete example reading a temperature sensor via I2C:

**plugin.json:**
```json
{
  "id": "bigaos-i2c-temp",
  "name": "I2C Temperature Sensor",
  "version": "1.0.0",
  "description": "Read temperature from an I2C sensor (e.g. DS18B20, BME280).",
  "author": "Your Name",
  "type": "driver",
  "main": "index.js",
  "capabilities": ["sensor-data", "settings", "alerts"],
  "driver": {
    "protocol": "i2c",
    "dataStreams": [
      {
        "id": "cabin_temp",
        "name": "Cabin Temperature",
        "dataType": "temperature_cabin",
        "unit": "K",
        "updateRate": 0.1,
        "description": "Cabin temperature from I2C sensor"
      }
    ],
    "configSchema": [
      {
        "key": "i2cAddress",
        "label": "I2C Address",
        "type": "string",
        "default": "0x76",
        "description": "I2C device address in hex"
      },
      {
        "key": "pollInterval",
        "label": "Poll Interval (seconds)",
        "type": "number",
        "default": 10
      }
    ]
  }
}
```

**index.js:**
```js
const { execSync } = require('child_process');

const CELSIUS_TO_KELVIN = 273.15;
let api = null;

function readTemperature(address) {
  try {
    // Example: read from sysfs or i2c-tools
    const raw = execSync(`i2cget -y 1 ${address} 0x00 w`, {
      timeout: 5000,
      encoding: 'utf-8',
    });
    const celsius = parseInt(raw, 16) / 256; // depends on sensor
    return celsius + CELSIUS_TO_KELVIN;
  } catch (err) {
    return null;
  }
}

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('I2C temperature sensor activating...');

    const address = await api.getSetting('i2cAddress') || '0x76';
    const interval = (await api.getSetting('pollInterval') || 10) * 1000;

    let failCount = 0;

    api.setInterval(() => {
      const temp = readTemperature(address);
      if (temp !== null) {
        api.pushSensorValue('cabin_temp', temp);
        failCount = 0;
      } else {
        failCount++;
        if (failCount === 5) {
          api.triggerAlert({
            name: 'Sensor Failure',
            message: `I2C temperature sensor at ${address} not responding`,
            severity: 'warning',
          });
        }
      }
    }, interval);

    api.log(`Polling ${address} every ${interval / 1000}s`);
  },

  async deactivate() {
    api = null;
  },
};
```

---

## Tips

- **Use `api.setInterval()`** instead of `setInterval()`. The API version is auto-cleaned on deactivate so you don't leak timers.
- **Convert units on ingestion.** Push standard units only. The client handles display conversion.
- **Declare all streams.** `pushSensorValue()` throws if the stream ID isn't in your manifest.
- **Keep plugins pure JS.** Avoid native Node.js modules when possible - they require compilation on the target platform. Use child processes to call system tools (like `candump`, `i2cget`) instead.
- **Handle errors gracefully.** Hardware disconnects, parse failures, and timeouts are normal. Log them, fire alerts if persistent, and continue running.
- **Use config schema.** Don't hardcode serial ports, addresses, or intervals. Make them configurable so users can adjust without editing code.
- **Save state in `deactivate()`.** Use `api.setSetting()` to persist runtime state (calibration, counters, etc.) that should survive restarts.
