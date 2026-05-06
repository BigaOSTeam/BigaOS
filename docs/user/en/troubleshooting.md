# Troubleshooting

A short list of common problems and where to look.

## "Server unreachable" banner

The client can't talk to the BigaOS server.

- Confirm the server is powered on and has booted.
- On a phone over Tailscale, check Tailscale is running and you can reach the server's tailnet hostname.
- Open **Settings → General → Server** to see the URL the client is using. If it's wrong, change it.

## No instrument data

Tiles show dashes instead of numbers.

BigaOS reads no data on its own — without a plugin, you'll see no values. Always start there:

- **Settings → Plugins** — confirm a driver plugin is **installed**, **enabled** and **connected** (no red dot). The right driver depends on your hardware. The built-in **Demo** plugin is the simplest one to enable to verify the rest of the system is working.
- Each driver plugin ships its own help articles in this sidebar — open the one for your driver to see protocol-specific checks (cable, bus power, addresses, etc.).
- Open the **Sources** panel for the plugin to see whether the streams you expect are *alive* — a stream that hasn't reported in a while is flagged.
- A reboot of the server clears most one-off driver wedges. Use **Settings → Advanced → Console → Reboot**.

## Some values appear, others don't

Multiple drivers may be installed, and the **sensor mapping** has picked the wrong source for that slot. Open the plugin's **Sources** panel and switch the slot's source.

If a value ought to come from a hardware bus, check on the server with the **Console**:

- For NMEA 2000 / CAN: `ip -details link show can0` should show `<UP>` with a non-zero bitrate; `candump can0` should show frames flowing.
- For I2C: `i2cdetect -y 1` should list the device address you expect.

## Alerts not firing

- **Settings → Alerts** — confirm the alert is **enabled** (and that the global toggle is on).
- Forecast-based alerts only fire if the weather service is reachable. Check **Settings → Advanced → Weather data** and that the boat has internet.
- Sensor-based alerts only fire if a driver is producing the relevant value. If `wind_speed` isn't being sensed, an alert reading it can't fire.
- Check the threshold direction (`>` vs `<`) and the unit — alerts are stored in your display unit, so an unexpected unit change would shift the trigger point.

## Anchor alarm "drifting" / firing wrong

- The swing radius is computed from chain length, depth, and your boat length (LOA from **Settings → Vessel**). If LOA isn't set, swing-radius defaults are conservative.
- A weak GPS fix produces noisy positions; very small swing circles (short chain, shallow water) can trip on jitter alone. Increase chain a little or accept some occasional spurious alarms in tight anchorages.

## Switch won't toggle

- Open the switch in **Settings → Switches** and check the **target client** is online (no agent-offline indicator).
- Confirm the GPIO pin number matches what's wired and that the **relay type** (active-low vs active-high) matches your board.
- The Pi GPIO agent runs as a system service — if it's stopped, the **Console** can confirm with `systemctl status bigaos-gpio-agent`.

## Tank reading looks wrong

- The reading depends on the calibration curve. **Settings → Tanks → Edit → Recalibrate** runs the wizard again.
- Check that the **source stream** is still alive — if the plugin producing the analog voltage is offline or the channel got disabled, the tank stops updating.

## Routing fails

- Routing needs **Navigation Data** (OSM Water Layer) downloaded. **Settings → Downloads** — the *Navigation Data* file should be installed.
- The router's failure reason tells you what went wrong: *START_ON_LAND* / *END_ON_LAND* (your point sits on land at this resolution — try moving it slightly), *NO_PATH_FOUND* (no water-only path between A and B), *NARROW_CHANNEL* (the channel is below the resolution the router can navigate safely).

## Reset a single client

If one device is misbehaving, **Settings → Clients → Delete** wipes its config and forces it to re-register on the next connect. The boat-wide state (alerts, switches, tanks, markers) is untouched.

## When you need to look deeper

The **Console** in **Settings → Advanced** is the place — live logs, a shell, and quick-access diagnostics. See [Console & Logs](console). If you're reporting an issue, the version from the General tab and the relevant log lines are what a developer will ask for first.
