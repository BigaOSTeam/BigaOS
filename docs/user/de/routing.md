# Routenplanung & Autopilot

BigaOS plant Routen, die im Wasser bleiben, und folgt ihnen mit einem ziel-kurs-basierten Autopilot. Beides lebt an der Karte.

## Allererster Schritt — Navigationsdaten installieren

Die Routenplanung braucht eine Wasser-vs-Land-Karte, die BigaOS getrennt von der App selbst ausliefert. **Sie muss einmal installiert werden, bevor überhaupt eine Route geplant werden kann.**

1. Öffne **Einstellungen → Downloads**.
2. Such den Eintrag **Navigationsdaten** (OSM Water Layer, ca. 90 m Auflösung).
3. Tippe auf **Download** und lass ihn herunterladen, entpacken und indizieren.

Solange diese Datei nicht installiert ist, weiß der Router nicht, was Wasser und was Land ist — jeder Routen­versuch schlägt fehl oder bleibt einfach aus. Der Download ist einmalig — sobald die Datei auf dem Server liegt, profitieren alle Clients.

## So funktioniert die Routenplanung

Der Router nutzt das oben installierte OSM-Water-Layer-GeoTIFF, um Wasser von Land zu unterscheiden. Bei einer Route von A nach B sucht er einen Pfad, der im Wasser bleibt, und gibt eine Liste von Wegpunkten mit Gesamtdistanz zurück.

Wenn der Router nicht erfüllen kann, sagt er warum:

- **START_ON_LAND** — der Startpunkt liegt an Land.
- **END_ON_LAND** — der Zielpunkt liegt an Land.
- **NO_PATH_FOUND** — kein wasser-only-Pfad zwischen den beiden Punkten.
- **NARROW_CHANNEL** — der Pfad wäre zu eng für die Auflösung der Daten.
- **DISTANCE_TOO_LONG** — die Route überschreitet das Distanzlimit des Workers.
- **MAX_ITERATIONS** — die Suche hat ihr Rechenbudget aufgebraucht.

## Route starten

Der schnellste Weg — lange auf einen Punkt der Karte tippen und im Kontextmenü **Hierhin navigieren** wählen. BigaOS plant die Route und zeichnet sie auf der Karte. Der Kompass in der Karten-Seitenleiste zeigt dann zusätzlich zum Kurs ein kleines Dreieck für die aktuelle Routen-Peilung.

## Autopilot

Tippe den Kompass in der Karten-Seitenleiste an, um den **Autopilot**-Bereich zu öffnen.

- **Sollkurs** zeigt den Zielkurs, den du gewählt hast.
- **±1° / ±10°** stupsen ihn in die jeweilige Richtung.
- **Aktivieren** / **Deaktivieren** schaltet die Autopilot-Ausgabe ein oder aus.
- **Route folgen** erscheint, wenn eine Route aktiv ist. Wenn an, setzt der Autopilot den Sollkurs laufend auf die aktuelle Routen-Peilung. Manuelles Anpassen schaltet den Modus aus.

> Der Autopilot in BigaOS ist eine **Sollkurs**-Anzeige und (wo unterstützt) Befehlsquelle — er ersetzt keinen zertifizierten Hardware-Autopiloten. Ob das Boot tatsächlich gesteuert wird, hängt vom Plugin und der Hardware ab, die BigaOS mit der Steuerung verbindet.

## Wegpunkte und Markierungen

Markierungen auf der Karte können als Routenziel dienen — Markierung lange antippen und die Navigieren-Option wählen, oder über die **Suche** einen Ort per Namen finden und eine Route zum Treffer starten.
