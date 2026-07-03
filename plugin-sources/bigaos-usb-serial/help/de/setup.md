# Einrichtung & Fehlersuche

## Schnellstart

1. USB-Gerät an einen beliebigen USB-Port des Raspberry Pi stecken.
2. Plugin **USB Seriell (NMEA 0183)** installieren und aktivieren.
3. **Serielles Gerät** und **Baudrate** auf *Auto* lassen.
4. Sieh unter **Einstellungen → Datenquellen** nach – die gesendeten Werte
   erscheinen dort nach wenigen Sekunden und werden automatisch zugeordnet.

## Berechtigungen

Serielle Geräte am Pi gehören zur Gruppe `dialout`. Bei der Installation fügt
das Plugin den BigaOS-Benutzer automatisch dieser Gruppe hinzu. **Wird nach der
Installation ein Neustart verlangt, starte einmal neu** – die Gruppenzuordnung
greift erst nach einem Neustart. Das ist nur einmal nötig.

## Gerät und Baudrate

- **Auto (empfohlen):** Der Treiber sucht zuerst die stabilen Namen unter
  `/dev/serial/by-id`, danach `/dev/ttyACM*` und `/dev/ttyUSB*`, und probiert
  die gängigen Baudraten durch, bis gültige NMEA-Daten kommen.
- **Manuell:** Wenn du mehrere serielle Geräte hast und eines festlegen willst,
  trage den genauen Pfad ein (z. B. `/dev/ttyUSB0`) sowie die Baudrate des
  Geräts. GPS-Mäuse laufen meist mit 4800 oder 9600, die meisten anderen
  NMEA-0183-Instrumente mit 4800.

### Bekannte Empfänger

- **VK-162 „G-Mouse" (u-blox M8 / M8030, 72 Kanäle):** meldet sich als
  `/dev/ttyACM0` mit 9600 Baud und sendet Multi-GNSS-Sätze („GN"). *Auto*
  findet ihn beim ersten Versuch. Da der u-blox-Chip direkt über USB
  kommuniziert, ist die Baudrate nur nominell – die Verbindung funktioniert
  unabhängig vom eingestellten Wert.

## Fehlersuche

**Gar keine Daten.** Prüfe das Kabel und ob der Pi das Gerät erkennt – im
Terminal sollte `ls /dev/ttyUSB* /dev/ttyACM*` es auflisten. Falls du das
Plugin gerade installiert und den Neustart übersprungen hast, starte jetzt neu,
damit die Berechtigung greift.

**Daten, aber keine GPS-Position.** Ein GPS sendet, hat aber noch keine
Satelliten gefunden. Bring die Antenne an eine Stelle mit freier Sicht zum
Himmel und gib ihr ein paar Minuten – besonders beim ersten Einschalten nach
längerer Pause. (Das betrifft nur GPS-Geräte; ein Wind- oder Tiefengeber sendet
nie eine Position.)

**Einzelne Werte fehlen.** Das Plugin gibt nur weiter, was das Gerät
tatsächlich sendet. Prüfe im Status/in der Diagnose des Plugins, welche
NMEA-Sätze ankommen – fehlt der Satz zu einem Wert in der Liste, sendet das
Gerät ihn nicht.

**Falsche oder springende Position.** Consumer-GPS ist auf wenige Meter genau
und kann bei sehr langsamer Fahrt oder neben hohen Aufbauten schwanken. Das ist
normal. BigaOS hält bei kurzen Aussetzern den letzten guten Fix, statt zu
springen.

**Es wurde der falsche Port gewählt.** Stelle **Serielles Gerät** manuell auf
den richtigen Pfad statt auf *Auto* und lade das Plugin neu.
