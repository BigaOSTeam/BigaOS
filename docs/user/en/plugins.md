# Plugins

Plugins extend BigaOS with data sources, drivers, languages and dashboard tiles. **BigaOS reads no data on its own** — every value on every screen reaches the system through a plugin. Without one running, your dashboard tiles will show dashes.

The plugin catalogue is open and growing. Drivers exist for various hardware and protocols; browse **Settings → Plugins** to see what's available and pick whatever matches your boat. Each plugin ships its own help articles in this sidebar, so you can read up on it before installing.

## Browsing

**Settings → Plugins** shows two lists:

- **Installed** — plugins currently on the server, with their version and an enable/disable toggle.
- **Available** — plugins from the configured catalogue (default: the BigaOS GitHub registry; configurable in **Settings → Advanced**).

Tap a plugin to see its description, version history, capabilities, and (if it's a driver) the data streams it advertises.

## Installing

**Install** downloads the plugin, runs `npm install` if it has dependencies, runs the plugin's `setup.sh` if it has one, and registers everything the plugin contributes. Some setups (CAN bus, I2C peripherals) require a system-level change and ask for a reboot — the plugin will display a banner saying so.

Plugins are **auto-enabled** on install. You can disable any plugin without uninstalling it.

## What a plugin can ship

- **Drivers** — sources of sensor data feeding into the system. Each driver advertises one or more data streams that BigaOS can map to its sensor slots (position, heading, depth, wind, batteries, tanks, etc.).
- **Settings UI** — the configuration fields for the plugin appear under its entry in **Settings → Plugins**, generated from the plugin's manifest.
- **Translations** — additional strings or new languages added to BigaOS's i18n system.
- **Help articles** — markdown docs that appear as their own sections in this Help sidebar (this article is in the BigaOS-core section; plugin articles get their own).
- **Dashboard items** — plugin-specific tiles that appear in the dashboard palette.

## Sensor mapping

When a driver pushes a value, the **sensor mapping** layer decides which "slot" it fills. Slots are the standardised sensor types BigaOS knows about — `position`, `heading`, `depth`, `wind_apparent`, `battery_voltage`, etc.

If only one driver is installed, mapping happens automatically. If you have multiple drivers (say, NMEA 2000 + IMU + a demo driver), open the plugin's **Sources** panel to choose which stream feeds which slot. Streams that have stopped reporting recently are flagged so you can spot a dead source.

## Removing a plugin

Tap an installed plugin and choose **Uninstall**. The plugin's `uninstall.sh` runs (if it has one) to clean up system-level changes from setup. Anything that depended on the plugin (a switch wired to its driver, an alert reading one of its streams) becomes inactive but isn't deleted, so you can reinstall later without losing config.

## Demo plugin

The built-in **Demo** plugin generates believable fake data covering most of the boat's instrument set. Enable it from **Settings → Plugins** when you want to explore the UI without hardware. While it's running, a small **DEMO** badge appears in the corner of every screen so simulated data isn't mistaken for the real thing. The demo also lets you "drive" the boat across the chart with the **W A S D** keys.
