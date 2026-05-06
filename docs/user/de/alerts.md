# Warnungen & Alarme

Das Warnsystem überwacht Bootsdaten und die Wettervorhersage und meldet sich — sichtbar und hörbar —, sobald eine Bedingung eintritt, die du im Auge behalten willst.

## So entsteht eine Warnung

Jede Warnung kombiniert:

- **Einen Namen** — was im Banner erscheint.
- **Eine Datenquelle** — siehe Tabelle unten.
- **Einen Operator** — `>`, `>=`, `<`, `<=`, `=`, `!=`.
- **Einen Schwellwert** — in deiner Anzeige-Einheit (kn, m, V, °C, %…).
- **Einen Vorhersage-Horizont** *(nur Vorhersage-Quellen)* — wie viele Stunden voraus geprüft wird.
- **Eine Stufe** — *Info* (blau), *Warnung* (orange), *Kritisch* (rot).
- **Einen Ton** — aus einer Auswahl eingebauter Klänge, oder *Keiner* für stumm.
- **Eine Schlummerdauer** — wie lange die Warnung nach dem Wegtippen pausiert, bevor sie wieder auslösen kann.

Warnungen lassen sich einzeln aktivieren und deaktivieren, und es gibt einen **globalen** An/Aus-Schalter unter **Einstellungen → Warnungen**.

## Was du überwachen kannst

| Quelle | Herkunft | Standard-Einheit |
|---|---|---|
| Windgeschwindigkeit | Sensor (live) | kn |
| Windböen | Wetter (aktuell) | kn |
| Wind-Vorhersage | Wetter (Vorhersage) | kn |
| Wellenhöhe | Wetter (aktuell) | m |
| Wellen-Vorhersage | Wetter (Vorhersage) | m |
| Geschwindigkeit über Grund | Sensor (live) | kn |
| Tiefe | Sensor (live) | m |
| Batteriespannung | Sensor (live) | V |
| Batterie-Ladezustand | Sensor (live) | % |
| Lufttemperatur | Wetter (aktuell) | °C |
| Wassertemperatur | Wetter (aktuell) | °C |

Sensor-Quellen lesen das, was ein Treiber-Plugin für diesen Typ liefert. Ohne passenden Treiber feuern Warnungen darauf nie — es liegen schlicht keine Sensordaten vor.

Wetter-Quellen lesen aus dem konfigurierten Wetter-Service (Standard Open-Meteo) und unterliegen dem Refresh-Intervall aus **Einstellungen → Erweitert → Wetterdaten**.

## Vorgefertigte Warnungen

Vier Vorlagen sind ab Werk aktiv:

- **Windwarnung** — Wind-Vorhersage > 20 kn innerhalb 1 Stunde.
- **Hohe Windwarnung** — Wind-Vorhersage > 30 kn innerhalb 3 Stunden.
- **Niedrige Batterie** — Batteriespannung < 12,0 V.
- **Hohe Wellen** — Wellen-Vorhersage > 2,0 m innerhalb 3 Stunden.

Deaktiviere die, die du nicht brauchst, ändere Schwellen, oder leg über **Hinzufügen** eigene an.

## Töne

Fünfzehn eingebaute Klänge — vom einzelnen Piep bis zum Nebelhorn oder Vollalarm. Wähl, was sich vom Steuerstand am besten erkennen lässt, ohne die Crew aufzuschrecken.

Wenn eine Warnung auslöst, erscheint auf jedem verbundenen Client oben ein Banner. Das Banner antippen schaltet den Ton stumm. Die Bedingung muss noch enden, bevor die Warnung „vorbei" ist — Wegtippen pausiert nur für die Schlummerdauer.

## Tiefenalarm

Es gibt einen eigenständigen **Tiefenalarm** direkt an der Karte — getrennt von der generischen Warnungs-Liste. Auf der Karte den **Tiefe**-Wert in der Karten-Seitenleiste antippen — ein Bereich öffnet sich mit voreingestellten Schwellen (1, 2, 3, 5, 10 m oder 3, 6, 10, 15, 30 ft je nach Einheit) und einem Ton-Schalter. Schwelle wählen, und der Alarm geht los, sobald die Tiefe darunter fällt.

Warum ein eigener Bereich statt eine generische Warnung? Weil die Tiefe der Wert ist, bei dem man unterwegs in der Regel mit einem Tipp aus der Karte aktivieren, ändern oder stumm schalten will — mitten in der Fahrrinne in die Einstellungen wechseln ist nicht praktisch. Der Tiefe-Wert in der Karten-Seitenleiste zeigt ein kleines Glöckchen neben der Beschriftung, sobald der Alarm scharf ist — auf einen Blick siehst du, ob abgesichert ist.

Wenn du Schlummerdauer, Stufe oder eigene Texte brauchst, lässt sich **Tiefe (Sensor)** auch als Datenquelle unter **Einstellungen → Warnungen** einbinden — die beiden Alarme laufen unabhängig voneinander und können beide aktiv sein.

## Ankeralarm

Der Ankeralarm ist eine eigene Sache — siehe [Ankeralarm](anchor). Er nutzt dasselbe Banner- und Tonsystem, ist aber keine generische Warnung mit konfigurierbarer Datenquelle.
