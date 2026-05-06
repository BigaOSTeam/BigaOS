# Setup & Troubleshooting

The plugin's `setup.sh` runs automatically on install — it brings up the CAN interface, enables I2C if needed, and installs the system packages required for native modules. If it fails, the plugin will still install but the marker in **Settings → Plugins** will tell you a reboot or system fix is required.

## CAN bus checks

If NMEA 2000 streams are not arriving:

1. Confirm the CAN interface is up: `ip link show can0`. It should be `<UP>` and have a non-zero bitrate.
2. Confirm there is traffic: `candump can0`. Active boats spew tens of frames per second.
3. Confirm the CAN bus has 12 V from the boat's network — without bus power, no devices transmit.
4. Check the **CAN Interface** setting if you've named yours something other than `can0` (e.g. `vcan0` for testing).

If the bus is healthy but BigaOS still shows no data, look at **Settings → Plugins → MacArthur HAT → Sources** — it lists every stream the plugin sees and which sensor slot it's mapped to.

## I2C checks (IMU and tank inputs)

Both the ICM-20948 IMU and the ADS1115 ADC use I2C, so I2C must be enabled on the Pi.

1. `i2cdetect -y 1` should list any I2C devices. The IMU appears at `0x68` or `0x69`; the ADS1115 at `0x48`–`0x4B` depending on its ADDR pin.
2. If the IMU isn't detected, double-check the connector orientation and that the **Enable IMU** setting is on.
3. If tank inputs aren't appearing, **Enable ADS1115 Tank Inputs** must be turned on, the ADC address must match, and at least one channel must be in **Enabled Tank Channels** (default `0,1,2`).

## Auto-reconnect

The CAN connection auto-reconnects when the bus drops. The default interval (5 s) is in **Settings → Plugins → MacArthur HAT**. If you frequently see drops, raise the interval to reduce log noise — the data won't appear any faster, since BigaOS doesn't buffer while the bus is down.

## Power-off integration

The HAT supports software-triggered shutdown (GPIO 26 + GPIO 16 for power latch). Triggering **Shut Down** from **Settings → Server** safely cuts power so the Pi doesn't sit at the login screen drawing battery.
