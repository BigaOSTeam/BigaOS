# USB Seriell (NMEA 0183)

Dieser Treiber liest jedes USB-Gerät aus, das **NMEA 0183** spricht – die
serielle Standardsprache der Marineelektronik – und direkt am Raspberry Pi
steckt. Was das Gerät meldet, wird dekodiert und in BigaOS eingespeist. Eine
USB-GPS-Maus ist das häufigste Beispiel, aber dasselbe Plugin verarbeitet auch
Wind, Tiefe, Logge, Heading und mehr.

Einstecken, Plugin aktivieren – und alle erkannten Werte erscheinen unter
**Einstellungen → Datenquellen** und werden automatisch dem passenden Slot
zugeordnet.

## Was der Treiber versteht

| Daten | Quell-Sätze | Hinweis |
|-------|-------------|---------|
| **Position** | RMC, GGA, GLL | Nur bei gültigem Fix |
| **Geschwindigkeit über Grund** | RMC, VTG | |
| **Kurs über Grund** | RMC, VTG | Bewegungsrichtung, nicht Kompasskurs |
| **Geschwindigkeit durchs Wasser** | VHW | Von einer Logge |
| **Heading (wahr)** | HDT, VHW | |
| **Heading (magnetisch)** | HDG, HDM, VHW | Wird per GPS-Deklination auf wahr korrigiert |
| **Tiefe** | DBT, DPT | Unter dem Geber |
| **Scheinbarer Wind** | MWV, VWR | Geschwindigkeit + Winkel |
| **Wahrer Wind** | MWV, MWD | Geschwindigkeit (Winkel aus MWV) |
| **Wassertemperatur** | MTW | |
| **Ruderwinkel** | RSA | Positiv = Steuerbord |

Das Gerät muss nicht alles davon senden – das Plugin verarbeitet, was
ankommt. Ein GPS liefert die oberen Zeilen, ein Windgeber die Wind-Zeilen, ein
kombinierter Multiplexer womöglich alles.

## Wie das Gerät gelesen wird

Der Treiber liest die NMEA-Rohsätze direkt vom seriellen Gerät, prüft bei jedem
die Prüfsumme und rechnet die Werte in die intern von BigaOS genutzten
Einheiten um (Meter, m/s, Radiant, Kelvin, Dezimalgrad). Er braucht keine
zusätzlichen Bibliotheken und startet daher sofort auf dem Pi.

## Mehrere Quellen

Kommt ein Wert bereits von einem anderen Plugin – etwa die Position von einem
NMEA-2000-GPS am MacArthur HAT –, erscheinen beide Quellen unter Datenquellen,
und du wählst, welche gewinnt. Dieses Plugin parallel zu anderen Treibern zu
betreiben, kostet dich nichts.
