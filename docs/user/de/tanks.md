# Tanks

Das Tank-Feature wandelt eine rohe Sensorspannung in ein reales Volumen für jeden Flüssigkeits­behälter an Bord um. Fünf Flüssigkeitstypen sind unterstützt — **Frischwasser**, **Diesel**, **Benzin**, **Grauwasser** und **Schwarzwasser**.

## Wie ein Tank verbunden ist

Ein Tank in BigaOS hängt an einem `analog_voltage`-Datenstrom eines Plugins — eine rohe 0–3,3 V-Messung von einem Hardware-ADC. Plugins, die so etwas liefern, sind alle Treiber, die resistive Tank-Sender auslesen (das **Demo**-Plugin liefert auch welche zum Testen). Die Kalibrierung passiert serverseitig in BigaOS — der Ablauf ist identisch, egal welches Plugin die Spannung liefert.

## Tank anlegen

Öffne **Einstellungen → Tanks** und füge einen Tank hinzu. Pro Tank:

- **Name** — z. B. *Frischwasser vorn* oder *Tagestank*.
- **Flüssigkeitstyp** — Frischwasser, Diesel, Benzin, Grauwasser, Schwarzwasser. Der Typ bestimmt Farbe und Warnrichtung (niedrig bei Wasser/Treibstoff, hoch bei Abwasser).
- **Kapazität** in Litern.
- **Quell-Stream** — `pluginId:streamId` einer `analog_voltage`-Quelle aus einem installierten Plugin.
- **Kalibrierkurve** — siehe unten.

## Kalibrieren

Die Spannungs-zu-Volumen-Kurve hängt von Tankform, Sender-Widerstand und ggf. einem Spannungsteiler am Eingang ab. Der Kalibrier-Assistent führt durch die Messung an bekannten Füllständen:

1. **Tank leeren**, Sensorwert notieren — das ist `0 L`.
2. **In bekannten Schritten füllen** (z. B. je 10 L), bei jedem Schritt den Wert notieren.
3. **Bis voll füllen**, den Endwert notieren.

BigaOS speichert das als `[{rawVolts, liters}]`-Punkte und interpoliert zur Laufzeit. Kachel und Detailansicht zeigen immer kalibrierte Volumen, nie die rohe Spannung.

## Anzeige

Eine **Tank-Kachel** auf dem Dashboard zeigt den aktuellen Stand als Balken mit dem Volumen in deiner Einheit. Tippen öffnet die **Tank**-Detailansicht — Verlauf, Verbrauchsrate und eine Schätzung, wann der Tank voll/leer ist.

## Warnrichtung

Tanks werden automatisch in der richtigen Richtung gewarnt und gefärbt:

- **Diesel, Frischwasser, Benzin** — warnen bei **niedrigem** Stand.
- **Grauwasser, Schwarzwasser** — warnen bei **hohem** Stand.

Du kannst jeden Tank-Füllstand auch in das [Warnsystem](alerts) einbinden, wenn du Banner und Ton möchtest und nicht nur eine Färbung der Kachel.
