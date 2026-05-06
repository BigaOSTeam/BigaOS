# IMU & Kalibrierung

Auf der MacArthur HAT sitzt ein **ICM-20948** — eine 9-Achsen-IMU mit Beschleunigungs-, Dreh- und Magnetsensor. Das Plugin betreibt eine Madgwick-AHRS-Fusion mit der eingestellten Abtastrate (Standard 50 Hz) und liefert Krängung, Trimm und magnetischen Kurs mit 10 Hz.

## Wozu die IMU

- Eine NMEA-2000-Lagequelle ist nicht auf jedem Boot vorhanden — gerade bei kleineren.
- Die IMU rechnet eigenständig: sie liefert sofort nach dem Boot, noch bevor der Bus oben ist.
- Sie kann als Reserve-Quelle dienen — Wechsel über **Einstellungen → Plugins → MacArthur HAT → Quellen**, falls die Bus-Lage komisch aussieht.

## Kalibrierung

Eine rohe IMU driftet und wird vom Stahl und der Elektronik in ihrer Nähe verzerrt. Das Plugin bringt ein **Kalibriersystem** mit drei Bausteinen:

- **Gyro-Bias** — wird im Stand gemessen. Voraussetzung für stabilen Kurs.
- **Mounting-Offset** — gleicht aus, dass der Pi nicht perfekt mit den Bootsachsen ausgerichtet ist.
- **Magnetometer Hard-Iron / Soft-Iron** — kompensiert das Magnetfeld des Bootes selbst (Stahlrumpf, Elektronik, Lichtmaschine).

Zusätzlich gibt es eine **Aufwärmphase** beim Start, in der der Kurs konvergiert. Werte in den ersten ~30 s nach einem Kaltstart können wandern.

Den Kalibrier-Assistenten startest du im Einstellungs-Panel des Plugins, sobald die HAT in ihrer Endposition montiert ist. Wiederhole die Kalibrierung, wenn du die Montagerichtung änderst oder neue Metalle in die Nähe kommen.

## Kurs: magnetisch vs. rechtweisend

Die IMU liefert **magnetischen Kurs**. BigaOS rechnet automatisch die magnetische Deklination anhand der aktuellen GPS-Position dazu, um wo nötig einen rechtweisenden Wert zu zeigen. Ohne GPS siehst du den magnetischen Kurs.
