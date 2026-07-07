# IMU & Calibration

The MacArthur HAT carries an **ICM-20948** — a 9-axis IMU with accelerometer, gyroscope and magnetometer. The plugin runs a Madgwick AHRS fusion at the configured poll rate (default 50 Hz) and emits roll, pitch and magnetic heading at 10 Hz.

## Why use the IMU

- A NMEA 2000 attitude source isn't always available, especially on smaller boats.
- The IMU is dead-reckoning: it works as soon as the Pi boots, before the bus is up.
- It can serve as a redundant attitude source — switch to it from **Settings → Plugins → MacArthur HAT → Sources** if the bus attitude looks wrong.

## Calibration

A raw IMU drifts and is biased by the steel and electronics around it. The plugin includes a **calibration system** with three parts:

- **Gyro bias** — measured at rest. Required for stable heading.
- **Mounting alignment** — accounts for the Pi not being installed level or facing the bow.
- **Magnetometer hard-iron / soft-iron** — corrects for the magnetic field of the boat itself (steel hull, electronics, alternator).

There's also a **warmup phase** at startup during which heading converges; the values you see in the first ~30 s after a cold boot can wander.

Run the calibration wizard from the plugin's settings panel after the HAT is mounted in its final position. Repeat if you change the mounting orientation or add new metal nearby.

## Heading alignment ("this direction is 90°")

The Pi rarely sits facing the bow — it might be mounted sideways in a cabinet. Heading alignment tells the plugin where the bow actually is:

1. Determine the boat's current **magnetic** heading with a reference — a handheld bearing compass, the ship's steering compass, or a known berth/jetty bearing from the chart.
2. Open **Settings → Plugins → MacArthur HAT → Advanced → IMU Calibration**.
3. Enter that heading under **Heading Alignment** and press **Align**.

The plugin captures the device's full 3D orientation and maps it onto the boat's axes — not just heading: with a rotated mounting, heel would otherwise bleed into pitch and vice versa. Alignment is stored with the calibration, so it survives reboots. Repeat it whenever the device is remounted.

Best done with the boat level and stationary. If the compass is still settling (or the boat is swinging), the alignment is rejected with a "heading not stable" message — wait a few seconds and try again. Enter the *magnetic* heading, not true: BigaOS adds declination later, on top of this value.

## Magnetic interference rejection

Electrical loads (alternator, inverter, pumps, DC cables) create magnetic bursts that would drag the compass off course. After a compass calibration the plugin knows the strength of the local geomagnetic field, and any magnetometer reading that deviates too far from it is discarded — the gyroscope carries the heading through the disturbance. The settings panel shows **"Magnetic interference detected"** while this is happening.

This protection only becomes active once a compass (magnetometer) calibration has been completed. If a device or cable that permanently changed the magnetic environment was added, run the compass calibration again.

## Heading: magnetic vs. true

The IMU outputs **magnetic heading**. BigaOS automatically applies magnetic declination based on the current GPS position to produce a true-heading value where needed. If GPS isn't available, you'll see magnetic heading on screen instead.
