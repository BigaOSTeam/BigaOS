# USB Serial (NMEA 0183)

This driver reads any USB instrument that speaks **NMEA 0183** — the standard
serial language of marine electronics — plugged straight into the Raspberry Pi.
Whatever the device reports is decoded and fed into BigaOS. A USB GPS mouse is
the most common example, but the same plugin handles wind, depth, speed log,
heading and more.

Plug it in, enable the plugin, and any values it recognises appear under
**Settings → Data Sources** and map to the right slot automatically.

## What it understands

| Data | Source sentences | Notes |
|------|------------------|-------|
| **Position** | RMC, GGA, GLL | Only when the receiver has a valid fix |
| **Speed over ground** | RMC, VTG | |
| **Course over ground** | RMC, VTG | Direction of travel, not compass heading |
| **Speed through water** | VHW | From a speed log / paddlewheel |
| **Heading (true)** | HDT, VHW | |
| **Heading (magnetic)** | HDG, HDM, VHW | Auto-corrected to true via GPS declination |
| **Depth** | DBT, DPT | Below the transducer |
| **Apparent wind** | MWV, VWR | Speed + angle |
| **True wind** | MWV, MWD | Speed (and angle from MWV) |
| **Water temperature** | MTW | |
| **Rudder angle** | RSA | Positive = starboard |

You don't need a device that sends all of these — the plugin pushes whatever
arrives. A GPS sends the top rows; a wind instrument sends the wind rows; a
combined multiplexer might send everything.

## How it reads the device

The driver reads the raw NMEA sentences directly from the serial device,
validates each one's checksum, and converts the values into the units BigaOS
uses internally (metres, m/s, radians, Kelvin, decimal degrees). It needs no
extra libraries, so it installs and starts instantly on the Pi.

## Multiple sources

If a value already comes in from another plugin — say position from an
NMEA 2000 GPS on the MacArthur HAT — both sources show up under Data Sources
and you choose which one wins. Nothing is lost by running this alongside your
other drivers.
