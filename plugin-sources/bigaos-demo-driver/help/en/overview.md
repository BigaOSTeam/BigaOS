# Demo Driver

The Demo Driver generates believable fake sensor data so you can use BigaOS without any boat hardware connected. Every dashboard tile, every detail view, every alert path can be exercised end-to-end against demo data — exactly the same code path as a real boat.

## When to enable it

- **Trying BigaOS for the first time** — see live-looking values without any hardware connected.
- **Developing a new feature, theme, or layout** without needing the boat at hand.
- **Showing the system to someone** at a desk, marina office, or boat show.
- **Diagnosing an issue.** If real data is broken, switching to demo isolates whether the problem is in the data path or the UI.

## What it produces

Around two dozen simulated streams covering position (a slow track), heading, speed, depth, wind, batteries, engine RPM, environmental values, and a couple of tank inputs. Numbers move slowly and stay within plausible ranges — they aren't true random noise, more like a calm boat motoring in moderate weather.

Demo tank inputs (`tank_input_0`, `tank_input_1`) drift between roughly **0.4 V (empty)** and **3.0 V (full)**, mirroring what a typical resistive sender produces — useful for testing the Tank calibration wizard.

## A demo banner appears

When the plugin is enabled, BigaOS shows a small **DEMO** marker in the top-right corner of every screen. That's so nobody mistakes simulated data for real data — useful when handing the boat over to a new owner or crewmember.

## Switching back

Disable the Demo Driver in **Settings → Plugins** when you want real data through. If both Demo and a real driver are enabled at the same time, the sensor mapping in **Settings → Plugins → Sources** lets you choose which provides each value.
