# MacArthur HAT

Dieses Plugin läuft auf einem Raspberry Pi 5 mit aufgesteckter MacArthur HAT und liest drei unabhängige Busse in einem Plugin:

- **NMEA 2000** über CAN-Bus — Position, Kurs, Geschwindigkeit, Tiefe, Wind, Lage, Batterien, Motor, Umwelt und Tankstände, die deine Bord-Instrumente auf den Bus legen.
- **ICM-20948-IMU** über I2C — eigenständige Krängung, Trimm und magnetischer Kurs, fusioniert mit einem Madgwick-AHRS-Filter. Praktisch, wenn das Boot keinen NMEA-2000-Lagesensor hat oder als zweite Quelle.
- **ADS1115-ADC mit 4 Kanälen** über I2C — Roh-Spannungen von bis zu vier resistiven Tank-Sendern. Die Volumenkurve dazu wird in der Tanks-Funktion von BigaOS kalibriert.

## Was du sofort bekommst

Sobald das Plugin installiert und der CAN-Bus aktiv ist, liefert es etwa 30 Datenströme — also fast alles, was ein typisches Boot über NMEA 2000 sendet. Jeder Wert, für den BigaOS eine Dashboard-Kachel oder Detailansicht hat, füllt sich automatisch ohne Pro-Stream-Konfiguration.

IMU und Tank-Eingänge sind standardmäßig **aus**. Aktivieren in **Einstellungen → Plugins → MacArthur HAT**, sobald die Verkabelung steht.

## Wann du es nutzt

Installiere dieses Plugin, wenn du auf dem Boots-Raspberry-Pi-5 eine MacArthur HAT verbaut hast und das System NMEA 2000, die HAT-IMU und/oder die resistiven Tank-Sender am HAT-ADC lesen soll.
