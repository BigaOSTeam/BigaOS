# Tank-Eingänge (ADS1115)

Auf der MacArthur HAT sitzt ein **ADS1115** — ein 16-Bit-ADC mit 4 Kanälen — verdrahtet zu vier analogen Eingängen für resistive Tank-Sender. Das Plugin liest den ADC und liefert pro aktivem Kanal einen `analog_voltage`-Datenstrom.

Die Spannungen bleiben bewusst **unkalibriert** auf Plugin-Ebene. Die Kalibrierung passiert serverseitig in **Einstellungen → Tanks**, wo du einen Tank an einen `tank_input_*`-Stream bindest und die Füllkurve aufnimmst.

## Warum das so designed ist

Die Spannungs-zu-Volumen-Beziehung eines resistiven Senders hängt von der Tankform, dem Sender-Bereich und ggf. einem Spannungsteiler ab. Indem das Plugin ehrlich bleibt (rohe Volt rein, rohe Volt raus) und die Kalibrierung in der Tanks-Funktion liegt, funktioniert dasselbe Plugin für jeden Sender.

## Aktivieren

1. **Einstellungen → Plugins → MacArthur HAT** öffnen.
2. **Enable ADS1115 Tank Inputs** einschalten.
3. **ADS1115 I2C Address** anpassen, falls sie vom Standard `0x48` abweicht (abhängig von der ADDR-Pin-Beschaltung).
4. In **Enabled Tank Channels** die tatsächlich verdrahteten Kanäle auflisten — Standard ist `0,1,2`.

Die vier Streams (`tank_input_0` bis `tank_input_3`) erscheinen anschließend in **Einstellungen → Tanks → Sensor**.

## Verdrahtungs-Checks

- Jeder ADC-Eingang erwartet 0–3,3 V, unabhängig vom Bereich des Senders. Bei höheren Spannungen einen Spannungsteiler vor dem HAT vorsehen.
- Liest ein Kanal dauerhaft ~3,3 V, ist der Eingang offen — Leitung lose oder nicht angeschlossen.
- Liest ein Kanal dauerhaft 0 V, hat der Sender oder seine Rückleitung Schluss zu Masse.

Die Abtastrate steht standardmäßig auf **1 Hz**, das reicht für Tanks und vermeidet Log-Spam. In den Plugin-Einstellungen anhebbar, falls du während der Kalibrierung schnellere Reaktion möchtest.
