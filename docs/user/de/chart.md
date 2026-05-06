# Karte

Die Karten-Ansicht zeigt die aktuelle Bootsposition auf einer Karte.

## Karte öffnen

Tippe vom Dashboard aus auf das **Karten**-Symbol in der Seitenleiste. Wenn dein Display im **Karten-Modus** konfiguriert ist (Einstellungen → Karte), ist die Karte direkt die Startseite — es gibt dann kein Dashboard.

## Was du siehst

- **Das Boot-Symbol** zeigt deine aktuelle Position. Es dreht sich mit dem Kurs und hinterlässt eine Spur.
- **Markierungen** für Wegpunkte und Punkte, die du gesetzt hast.
- **Die Basiskarte** — Straßenkacheln als Standard, umschaltbar auf Satellitenbilder.
- **Das nautische Overlay** — OpenSeaMap-Seezeichen, die über die Basiskarte gelegt werden.

## Die Karten-Seitenleiste

Eine zweite Seitenleiste verläuft an einem Rand der Karte (einstellbar unter **Einstellungen → Karte → Position der Seitenleiste** — links oder rechts). Sie zeigt:

- **Kompass** — aktueller Kurs, mit einem Dreieck für die aktive Routen-Peilung, falls du gerade ein Ziel ansteuerst. Tippe den Kompass an, um den **Autopilot**-Bereich zu öffnen.
- **Geschwindigkeit** — Geschwindigkeit über Grund.
- **Tiefe** — Tiefe unter Geber. Tippe darauf, um den **Tiefen-Alarm** zu öffnen (vorgegebene Schwellen und ein Ton-Schalter).
- **Vorhersage** — schaltet das Wetter-Overlay auf der Karte um. Tippen öffnet den [Wetter-Bereich](weather).
- **Suche** — Orte per Namen suchen (Geocoding standardmäßig über Photon), Treffer antippen zum Zentrieren.
- **Karte / Satellit** — Basislayer wechseln.
- **Zentrieren** — die Karte wieder an die Bootsposition koppeln.

## GPS-Folgen

Standardmäßig folgt die Karte dem Boot. Sobald du verschiebst, wird die Kopplung gelöst — die Karte bleibt dort, wo du sie hingezogen hast. Mit dem **Zentrieren**-Knopf koppelst du wieder. Die Anzeige am Knopf zeigt den aktiven Zustand.

Die Bildschirm-Zoom-Knöpfe (`+` / `−`) zoomen, **ohne** die GPS-Kopplung zu verlieren.

## Kontextmenü (langes Tippen)

Lange auf die Karte tippen öffnet ein Kontextmenü. Daraus z. B.:

- **Markierung setzen** an der gedrückten Stelle.
- **Hierhin navigieren** — eine Route zum Punkt starten.
- Weitere Aktionen je nach dem, was unter dem Druckpunkt liegt (bestehende Markierung, Route usw.).

Das ist unabhängig vom GPS-Folgen — langes Tippen löst die Karte nicht vom Boot.

## Markierungen

Eine Markierung hat einen Namen, ein Symbol und eine Farbe. Vorhandene Markierung antippen zum Bearbeiten, Umbenennen, Umfärben oder Löschen. Markierungen werden zwischen allen Clients synchronisiert.

## Hinweis zu den Karten

Die Karte stammt aus offenen Online-Kachelquellen — OpenStreetMap für die Basis, ArcGIS World Imagery für Satellit, OpenSeaMap-Seezeichen für das nautische Overlay. BigaOS bringt **keine** navigationstauglichen Seekarten mit (S-57 / CM93 etc.). Das Seezeichen-Overlay sind offene Daten und nicht für die Navigation zertifiziert.

## Was sonst noch an der Karte hängt

Drei größere Funktionen leben an der Karte und haben eigene Artikel:

- **Routenplanung & Autopilot** — wasserbasierte Routenplanung und routen-folgender Autopilot. Siehe [Routenplanung & Autopilot](routing).
- **Ankeralarm** — Ankerwurf mit Kettenlängen-Empfehlung und Schwojradius-Überwachung. Siehe [Ankeralarm](anchor).
- **Wetter-Overlay** — Wind / Wellen / Dünung / Strömung / Wassertemperatur mit Zeit-Slider. Siehe [Wetter](weather).

## Demo-Steuerung

Wenn das **Demo**-Plugin aktiv ist, akzeptiert die Karte Tastatur-Eingaben zum „Fahren" — **A / D** dreht links/rechts, **W / S** erhöht/senkt die Geschwindigkeit (max. 30 kt). Ein kleines Banner unten zeigt die simulierte Geschwindigkeit. Die Demo-Position synchronisiert sich über alle Clients.

## Kachel-Quellen austauschen

Alle drei Kachel-Layer — Straße, Satellit und das nautische Overlay — kommen aus öffentlichen Tile-Servern, und du kannst jeden davon unter **Einstellungen → Erweitert → Kartenkacheln** auf einen anderen Dienst umstellen. Eine `{z}/{x}/{y}`-URL-Vorlage einfügen und BigaOS nutzt sie für diesen Layer. Standardwerte — OpenStreetMap für Straße, ArcGIS World Imagery für Satellit, OpenSeaMap für die Seezeichen — stellst du mit einem Tipp auf **Kartenkacheln zurücksetzen** wieder her.

Hier hängst du auch einen kostenpflichtigen Tile-Service an, deinen eigenen selbst gehosteten Tile-Server oder einen regionalen Karten-Anbieter, der Raster-Kacheln liefert. Das Format muss eine Slippy-Map-URL-Vorlage sein. Vektor-Kacheln werden nicht unterstützt.
