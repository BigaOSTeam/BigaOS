# Einrichtung & Fehlersuche

Das `setup.sh` des Plugins läuft bei der Installation automatisch — es bringt das CAN-Interface hoch, aktiviert I2C falls nötig und installiert System-Pakete für native Module. Schlägt es fehl, wird das Plugin trotzdem installiert. In **Einstellungen → Plugins** erscheint dann ein Hinweis, dass ein Neustart oder eine System-Korrektur nötig ist.

## CAN-Bus prüfen

Wenn keine NMEA-2000-Datenströme ankommen:

1. Ist das CAN-Interface aktiv? `ip link show can0` — Status muss `<UP>` sein, mit gesetzter Bitrate.
2. Gibt es Verkehr? `candump can0` — auf einem aktiven Boot rauschen Dutzende Frames pro Sekunde durch.
3. Hat der CAN-Bus 12 V vom Bordnetz? Ohne Bus-Spannung sendet kein Gerät.
4. Stimmt die Einstellung **CAN Interface**, falls dein Interface nicht `can0` heißt (z. B. `vcan0` zum Testen)?

Ist der Bus gesund, BigaOS zeigt aber trotzdem nichts: **Einstellungen → Plugins → MacArthur HAT → Quellen** listet jeden Datenstrom, den das Plugin sieht, und auf welchen Sensor-Slot er gemappt ist.

## I2C prüfen (IMU und Tank-Eingänge)

ICM-20948-IMU und ADS1115-ADC nutzen beide I2C — der Bus muss am Pi aktiviert sein.

1. `i2cdetect -y 1` listet alle I2C-Geräte. Die IMU erscheint bei `0x68` oder `0x69`, der ADS1115 bei `0x48`–`0x4B` je nach ADDR-Pin.
2. Wird die IMU nicht erkannt: Steckverbindung und die Einstellung **Enable IMU** prüfen.
3. Erscheinen keine Tank-Eingänge: **Enable ADS1115 Tank Inputs** muss an sein, die ADC-Adresse muss passen, und mindestens ein Kanal muss in **Enabled Tank Channels** stehen (Standard `0,1,2`).

## Auto-Reconnect

Die CAN-Verbindung verbindet sich automatisch neu, wenn der Bus abreißt. Standard-Intervall ist 5 s, einstellbar in **Einstellungen → Plugins → MacArthur HAT**. Bei häufigen Abrissen das Intervall erhöhen, um Log-Spam zu reduzieren — die Daten erscheinen dadurch nicht schneller, da BigaOS keine Daten zwischenpuffert, während der Bus aus ist.

## Power-Off-Integration

Die HAT unterstützt softwaregesteuertes Abschalten (GPIO 26 + GPIO 16 als Power-Latch). **Herunterfahren** unter **Einstellungen → Server** trennt die Stromversorgung sauber, damit der Pi nicht weiter Batterie zieht.
