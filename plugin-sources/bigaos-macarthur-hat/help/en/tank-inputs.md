# Tank Inputs (ADS1115)

The MacArthur HAT includes an **ADS1115** — a 4-channel 16-bit ADC — wired to four analogue inputs intended for resistive tank senders. The plugin reads the ADC and emits one `analog_voltage` stream per enabled channel.

The voltages are deliberately **uncalibrated** at the plugin level. Calibration happens server-side in **Settings → Tanks**, where you bind a tank to one of the `tank_input_*` streams and walk through the fill curve.

## Why this design

A resistive sender's voltage-to-volume relationship depends on the tank's shape, the sender's range, and any voltage divider you've wired in. By keeping the plugin honest (raw volts in, raw volts out) and putting the calibration in the Tanks feature, the same plugin works for any sender.

## Enabling

1. Open **Settings → Plugins → MacArthur HAT**.
2. Turn **Enable ADS1115 Tank Inputs** on.
3. Set the **ADS1115 I2C Address** if it differs from the default `0x48` (tied to ADDR-pin wiring).
4. List the channels you actually wired in **Enabled Tank Channels** — default is `0,1,2`.

The four streams (`tank_input_0` through `tank_input_3`) appear in **Settings → Tanks → Sensor**.

## Wiring sanity checks

- Each ADC input expects 0–3.3 V, regardless of the sender's native range. Add a divider on the HAT side if your sender swings higher.
- If a channel reads ~3.3 V constantly, the input is floating — a wire is loose or not connected.
- If a channel reads 0 V constantly, the sender or its return is shorted to ground.

The poll rate defaults to **1 Hz**, which is plenty for tanks and keeps log spam down. Adjustable in plugin settings if you want quicker response during calibration.
