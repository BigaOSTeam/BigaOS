# IMU & Kalibrierung

Auf der MacArthur HAT sitzt ein **ICM-20948** — eine 9-Achsen-IMU mit Beschleunigungs-, Dreh- und Magnetsensor. Das Plugin betreibt eine Madgwick-AHRS-Fusion mit der eingestellten Abtastrate (Standard 50 Hz) und liefert Krängung, Trimm und magnetischen Kurs mit 10 Hz.

## Wozu die IMU

- Eine NMEA-2000-Lagequelle ist nicht auf jedem Boot vorhanden — gerade bei kleineren.
- Die IMU rechnet eigenständig: sie liefert sofort nach dem Boot, noch bevor der Bus oben ist.
- Sie kann als Reserve-Quelle dienen — Wechsel über **Einstellungen → Plugins → MacArthur HAT → Quellen**, falls die Bus-Lage komisch aussieht.

## Kalibrierung

Eine rohe IMU driftet und wird vom Stahl und der Elektronik in ihrer Nähe verzerrt. Das Plugin bringt ein **Kalibriersystem** mit drei Bausteinen:

- **Gyro-Bias** — wird im Stand gemessen. Voraussetzung für stabilen Kurs.
- **Einbau-Ausrichtung** — gleicht aus, dass der Pi weder waagerecht noch in Fahrtrichtung eingebaut sein muss.
- **Magnetometer Hard-Iron / Soft-Iron** — kompensiert das Magnetfeld des Bootes selbst (Stahlrumpf, Elektronik, Lichtmaschine).

Zusätzlich gibt es eine **Aufwärmphase** beim Start, in der der Kurs konvergiert. Werte in den ersten ~30 s nach einem Kaltstart können wandern.

Den Kalibrier-Assistenten startest du im Einstellungs-Panel des Plugins, sobald die HAT in ihrer Endposition montiert ist. Wiederhole die Kalibrierung, wenn du die Montagerichtung änderst oder neue Metalle in die Nähe kommen.

## Kursausrichtung („diese Richtung ist 90°")

Der Pi zeigt selten genau zum Bug — oft steckt er quer in einem Schrank. Mit der Kursausrichtung sagst du dem Plugin, wo der Bug wirklich ist:

1. Bestimme den aktuellen **missweisenden** Kurs des Bootes mit einer Referenz — Handpeilkompass, Steuerkompass oder die aus der Karte bekannte Richtung des Liegeplatzes.
2. Öffne **Einstellungen → Plugins → MacArthur HAT → Erweitert → IMU-Kalibrierung**.
3. Trage den Kurs unter **Kursausrichtung** ein und drücke **Ausrichten**.

Das Plugin erfasst dabei die komplette 3D-Lage des Geräts und rechnet sie auf die Bootsachsen um — nicht nur den Kurs: Bei verdrehtem Einbau würde sonst Krängung im Trimm auftauchen und umgekehrt. Die Ausrichtung wird mit der Kalibrierung gespeichert und übersteht Neustarts. Wiederhole sie, wenn das Gerät ummontiert wird.

Am besten klappt das bei ruhig liegendem, aufrechtem Boot. Wenn der Kurs noch wandert (oder das Boot schwojt), lehnt das Plugin die Ausrichtung mit einer Meldung ab — ein paar Sekunden warten und erneut versuchen. Wichtig: den *missweisenden* Kurs eingeben, nicht den rechtweisenden. Die Deklination rechnet BigaOS später selbst dazu.

## Schutz vor magnetischen Störungen

Elektrische Verbraucher (Lichtmaschine, Wechselrichter, Pumpen, Gleichstromkabel) erzeugen magnetische Störfelder, die den Kompass vom Kurs ziehen würden. Nach einer Kompasskalibrierung kennt das Plugin die Stärke des örtlichen Erdmagnetfelds — Messwerte, die zu stark davon abweichen, werden verworfen, und das Gyroskop trägt den Kurs durch die Störung. Solange das passiert, zeigt das Einstellungs-Panel **„Magnetische Störung erkannt"**.

Dieser Schutz greift erst, nachdem eine Kompasskalibrierung (Magnetometer) abgeschlossen wurde. Kommt ein Gerät oder Kabel dazu, das die magnetische Umgebung dauerhaft verändert, führe die Kompasskalibrierung erneut durch.

## Kurs: magnetisch vs. rechtweisend

Die IMU liefert **magnetischen Kurs**. BigaOS rechnet automatisch die magnetische Deklination anhand der aktuellen GPS-Position dazu, um wo nötig einen rechtweisenden Wert zu zeigen. Ohne GPS siehst du den magnetischen Kurs.
