# Erste Schritte

Beim ersten Start fragt jedes BigaOS-Gerät nach zwei Dingen — einer Server-URL und einem Namen.

## 1. Server-URL

Die **Server-URL** zeigt auf den BigaOS-Server an Bord. Auf einem Pi-Display ist sie meist schon eingetragen. Auf dem Telefon scannst du einen QR-Code oder gibst die URL von Hand ein.

Sie lässt sich später jederzeit unter **Einstellungen → Allgemein → Server** ändern (anderes Boot, Wechsel zwischen lokalem WLAN und Tailscale usw.).

## 2. Client-Name

Jedes Gerät, das sich mit dem Server verbindet, ist ein **Client**. Gib ihm einen Namen, der seinen Standort verrät — *Steuerstand-Display*, *Salon-Tablet*, *Telefon Skipper*. Der Name taucht in der Client-Liste auf und hilft, ein bestimmtes Gerät wiederzufinden.

Es gibt zwei Arten von Client:

- **Display** — ein Pi oder fest verbauter Bildschirm an Bord. Läuft im Vollbild, dauerhaft installiert.
- **Remote** — ein Telefon oder Tablet, das du mit dir trägst. Gleiche Daten, kleinerer Bildschirm, leicht angepasste Oberfläche.

## 3. Fertig

Nach der Konfiguration öffnet der Client das **Dashboard** (oder direkt die Karte, wenn das Display im Karten-Modus läuft). Von dort aus:

- Tippe eine Kachel an, um die Detailansicht mit Verlauf und Statistik zu öffnen.
- Über die Seitenleiste wechselst du zwischen Dashboard, Karte, Instrumenten, Relais, Bearbeitungs-Modus, Einstellungen und Hilfe.
- Das Zahnrad öffnet die **Einstellungen**, in denen alles andere steckt — Warnungen, Plugins, Themes, Sprachen, Einheiten, Bootsmaße, Datendownloads, Konsole.

Eine geführte Tour kannst du jederzeit unter **Hilfe → Willkommen** wiederholen.

## Was du zuerst einrichten solltest

Ein paar Minuten hier zahlen sich später aus.

1. **Einstellungen → Schiff** — Bootsmaße und Kettendaten. Der Ketten-Rechner des Ankeralarms und einige andere Funktionen nutzen diese Werte.
2. **Einstellungen → Einheiten** — Geschwindigkeit (kt, km/h, mph, m/s), Wind (auch Beaufort), Tiefe (m oder ft), Distanz, Gewicht, Temperatur, Zeit- und Datumsformat.
3. **Einstellungen → Plugins** — einen Treiber für deine Hardware installieren. Ohne Treiber-Plugin bleiben deine Kacheln leer. Das eingebaute **Demo**-Plugin ist der schnellste Weg, lebendige Werte ohne echtes Boot zu sehen.
4. **Einstellungen → Warnungen** — vier vorgefertigte Alarme (Wind, hoher Wind, niedrige Batterie, hohe Wellen) sind bereit. Schwellen und Töne anpassen oder eigene anlegen.
5. **Einstellungen → Downloads** — die **Navigationsdaten** (OSM Water Layer) herunterladen, damit die Routenplanung funktioniert.
