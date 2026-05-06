# Tanks

The tanks feature converts a raw sensor voltage into a real volume for any liquid container on the boat. Five fluid types are supported: **fresh water**, **fuel** (diesel), **gasoline** (petrol), **gray water**, and **black water**.

## How a tank is wired

A tank in BigaOS is bound to one of a plugin's `analog_voltage` streams — a raw 0–3.3 V reading from a hardware ADC. Plugins that produce this kind of stream include any driver that reads resistive tank senders (the **Demo** plugin produces fake ones for testing). Calibration is done on the server side, in BigaOS itself, so the same workflow works regardless of which plugin is providing the voltage.

## Defining a tank

Open **Settings → Tanks** and add a tank. Each one has:

- **A name** — e.g. *Forward Fresh Water* or *Day Tank*.
- **A fluid type** — fresh water, fuel, gasoline, gray water, black water. The type drives the colour and which direction "bad" runs (low for water/fuel, high for waste).
- **A capacity** in litres.
- **A source stream** — `pluginId:streamId` of an `analog_voltage` source from any installed plugin.
- **A calibration curve** — see below.

## Calibrating

A tank's voltage-to-volume curve depends on the tank shape, the sender's resistance range, and any voltage divider on the input. The calibration wizard walks you through measuring at known fill levels:

1. **Empty** the tank, record the sensor reading. That's `0 L`.
2. **Fill in known steps** (e.g. 10 L at a time) — record the reading at each step.
3. **Fill to capacity** — record the final reading.

BigaOS stores those points as `[{rawVolts, liters}]` and interpolates between them at runtime. The tile and detail view always show calibrated volume, never raw voltage.

## Display

A **tank tile** on the dashboard shows current level as a fill bar with the volume in your preferred unit. Tap it for the **Tank** detail view — history, fill rate, and an estimate of when the tank will be full or empty at the current rate.

## Warning direction

Tanks are colour-coded and warned in the right direction automatically:

- **Fuel, fresh water, gasoline** — warn when **low**.
- **Gray water, black water** — warn when **full**.

You can wire any of these into the [alerts](alerts) system using the tank's level as a data source if you want a banner+tone (rather than just a colour change on the tile).
