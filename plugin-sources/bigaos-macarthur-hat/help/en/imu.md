# IMU & Calibration

The MacArthur HAT carries an **ICM-20948** — a 9-axis IMU with accelerometer, gyroscope and magnetometer. The plugin runs a Madgwick AHRS fusion at the configured poll rate (default 50 Hz) and emits roll, pitch and magnetic heading at 10 Hz.

## Why use the IMU

- A NMEA 2000 attitude source isn't always available, especially on smaller boats.
- The IMU is dead-reckoning: it works as soon as the Pi boots, before the bus is up.
- It can serve as a redundant attitude source — switch to it from **Settings → Plugins → MacArthur HAT → Sources** if the bus attitude looks wrong.

## Calibration

A raw IMU drifts and is biased by the steel and electronics around it. The plugin includes a **calibration system** with three parts:

- **Gyro bias** — measured at rest. Required for stable heading.
- **Mounting offset** — accounts for the Pi not being installed perfectly level with the boat.
- **Magnetometer hard-iron / soft-iron** — corrects for the magnetic field of the boat itself (steel hull, electronics, alternator).

There's also a **warmup phase** at startup during which heading converges; the values you see in the first ~30 s after a cold boot can wander.

Run the calibration wizard from the plugin's settings panel after the HAT is mounted in its final position. Repeat if you change the mounting orientation or add new metal nearby.

## Heading: magnetic vs. true

The IMU outputs **magnetic heading**. BigaOS automatically applies magnetic declination based on the current GPS position to produce a true-heading value where needed. If GPS isn't available, you'll see magnetic heading on screen instead.
