# Instrumenten-Ansichten

Hinter jedem Wert auf dem Dashboard steckt eine **Detailansicht**. Tippe einfach die Kachel an.

## Was eine Detailansicht zeigt

- **Den aktuellen Wert**, groß und gut ablesbar.
- **Statistik** für das gewählte Zeitfenster — typische Min, Mittel, Max.
- **Verlaufsdiagramm** mit wählbarer Zeitspanne (letzte 5 Minuten, Stunde, Tag, Woche).
- **Verwandte Werte**, wo es Sinn ergibt (z. B. wahrer und scheinbarer Wind nebeneinander).

## Verfügbare Ansichten

- **Geschwindigkeit** — Geschwindigkeit über Grund vom GPS.
- **Kurs** — magnetisch oder rechtweisend, je nach Bus-Quelle. BigaOS rechnet die magnetische Deklination automatisch dazu, wenn nötig.
- **Tiefe** — Tiefe unter Geber.
- **Wind** — scheinbar und wahr, Geschwindigkeit und Winkel, mit Rose.
- **Position** — Breite/Länge.
- **Batterie** — Spannung, Ladezustand, Strom, Leistung, Restlaufzeit.
- **Krängung** und **Trimm** — Bootslage über Zeit.
- **Tank** — Verlauf des Füllstands eines Tanks, mit Verbrauchs­rate und einer Schätzung für voll/leer.
- **Wetter** — Kurzfrist-Vorhersage an der aktuellen Bootsposition.

## Das Instrumenten-Raster

Die **Instrumente**-Ansicht (Symbol in der Seitenleiste — Tachometer) ist eine Übersichts­seite mit *allen* Instrumenten auf einen Blick — nützlich beim Wachhalten.

## Woher die Daten kommen

BigaOS selbst liest gar nichts — jeder Wert wird von einem **Plugin** geliefert. Unter **Einstellungen → Plugins** siehst du, was installiert ist. Fehlt ein Wert, ist die Antwort fast immer dort zu finden — der passende Treiber ist vielleicht nicht installiert, deaktiviert oder seine Verbindung ist weg.

Ein eingebautes **Demo**-Plugin erzeugt plausible Testdaten — praktisch, um die Ansichten ohne angeschlossene Hardware auszuprobieren.
