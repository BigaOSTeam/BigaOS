# MacArthur HAT

This plugin runs on a Raspberry Pi 5 fitted with a MacArthur HAT and reads three independent buses in one plugin:

- **NMEA 2000** over CAN bus — position, heading, speed, depth, wind, attitude, batteries, engine, environment, and tank levels broadcast by your boat's existing instruments.
- **ICM-20948 IMU** over I2C — independent roll, pitch and magnetic heading, fused with a Madgwick AHRS filter. Useful when the boat doesn't have a NMEA 2000 attitude sensor, or as a redundant source.
- **ADS1115 4-channel ADC** over I2C — raw voltages from up to four resistive tank senders. The voltages are calibrated into volume by the Tanks feature in BigaOS.

## What you get out of the box

Once installed and connected to a working CAN bus, the plugin exposes around 30 data streams covering most of what a typical boat broadcasts on NMEA 2000. Any value that has a corresponding dashboard tile or instrument view in BigaOS will start populating automatically — no per-stream setup needed.

The IMU and tank-input features are off by default. Enable them in **Settings → Plugins → MacArthur HAT** once the wiring is confirmed.

## When to use it

Install this plugin when you have a MacArthur HAT on the boat's Raspberry Pi 5 and you want the system to read NMEA 2000 traffic, the on-HAT IMU, and/or the resistive tank senders wired to the HAT's ADC.
