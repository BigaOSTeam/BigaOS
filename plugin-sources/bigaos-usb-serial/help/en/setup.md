# Setup & Troubleshooting

## Quick start

1. Plug the USB instrument into any USB port on the Raspberry Pi.
2. Install and enable the **USB Serial (NMEA 0183)** plugin.
3. Leave **Serial Device** and **Baud Rate** on *Auto*.
4. Watch **Settings → Data Sources** — the values the device sends appear
   there within a few seconds and map automatically.

## Permissions

Serial devices on the Pi belong to the `dialout` group. During installation
the plugin adds the BigaOS user to that group automatically. **If a reboot is
requested after install, reboot once** — the group change only takes effect
after a restart. This is a one-time step.

## Device and baud rate

- **Auto (recommended):** the driver scans the stable `/dev/serial/by-id`
  names first, then `/dev/ttyACM*` and `/dev/ttyUSB*`, trying the common baud
  rates until it sees valid NMEA data.
- **Manual:** if you have several serial devices and want to pin one down, set
  the exact path (e.g. `/dev/ttyUSB0`) and the device's baud rate. GPS mice
  usually run at 4800 or 9600; most other NMEA 0183 instruments use 4800.

### Known receivers

- **VK-162 "G-Mouse" (u-blox M8 / M8030, 72 channel):** appears as
  `/dev/ttyACM0` at 9600 baud and sends multi-GNSS `GN` sentences. *Auto*
  finds it on the first try. Because the u-blox chip talks USB directly, the
  baud rate is nominal — the connection works regardless of the value.

## Troubleshooting

**No data at all.** Check the cable and that the Pi sees the device — from a
terminal, `ls /dev/ttyUSB* /dev/ttyACM*` should list it. If you just installed
the plugin and skipped the reboot, reboot now so the permission change applies.

**Data but no GPS position.** A GPS is talking but hasn't locked onto the
satellites yet. Move the antenna so it has a clear view of the sky and give it
a few minutes, especially on the first use after a long time switched off.
(This only applies to GPS devices; a wind or depth instrument never sends a
position.)

**Some values missing.** The plugin only pushes what the device actually
sends. Check the plugin's status/diagnostics to see which NMEA sentences are
arriving — if a value's sentence isn't in the list, the device isn't emitting
it.

**Wrong or jumpy position.** Consumer GPS is accurate to a few metres and can
wander at very low speed or near tall structures. This is normal. BigaOS keeps
the last good fix through brief dropouts rather than jumping.

**It picked the wrong port.** Set the **Serial Device** manually to the correct
path instead of *Auto*, then reload the plugin.
