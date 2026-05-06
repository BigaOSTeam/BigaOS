# Displays & Telefone

BigaOS ist für Boote mit **vielen Bildschirmen und vielen Personen** gemacht. Jedes Gerät, das sich mit dem Server verbindet, ist ein *Client*, und das System hält alle synchron.

## Zwei Arten von Client

- **Display** — ein fester Bildschirm an Bord. Pi am Steuerstand, Tablet im Salon, Zweit­monitor am Kartentisch. Vollbild, optimiert für Festeinbau.
- **Remote** — Telefon oder Tablet, das du mitnimmst. Gleiche Daten, leicht reduzierte Oberfläche, optimiert für eine Hand.

Die Art wird beim Setup festgelegt und erscheint neben dem Namen in der Client-Liste.

## Pi-mit-Agent vs alles andere

Eine Teilmenge der Display-Clients sind **Pi-Clients mit installiertem BigaOS-GPIO-Agent** (typischerweise die fest verbauten). Sie bekommen ein paar Zusatz-Fähigkeiten:

- Einen Reiter **Einstellungen → Anzeige** für Auflösung, Drehung und Skalierung über `wlr-randr`.
- Sind als Ziel für **Relais** wählbar (GPIO-Ausgang).
- Sind als Quelle für **Tasten** wählbar (GPIO-Eingang).

Telefone, Tablets und browserbasierte Displays sind vollwertige BigaOS-Clients, können aber keine Relais oder Tasten hosten — keine GPIO.

## Was pro Client und was geteilt ist

Manches ist **pro Client**, sodass jedes Gerät auf seinen Standort und seinen Nutzer abgestimmt werden kann:

- Dashboard-Layout und Kacheln.
- Position der Seitenleiste (Dashboard 4-Wege, Karte links/rechts).
- Startseite.
- Karten-Modus.
- Aktive Ansicht (damit ein Reload dort weiter macht, wo man war).

Anderes ist **geteilt**, weil es das Boot oder das System als Ganzes beschreibt:

- Bootsmaße und Kettendaten.
- Theme (dunkel / hell).
- Sprache.
- Warnungen.
- Relais und ihre Zustände.
- Tanks und Kalibrierungen.
- Markierungen.
- Plugins und Treiber.
- Wetter-Einstellungen, Navigationsdaten, Server-Einstellungen.

## Einen Client hinzufügen

Für ein neues Display:

1. Gerät einschalten, auf den BigaOS-Server zeigen lassen.
2. Der Setup-Assistent fragt nach Name und Typ.
3. Fertig — der Client erscheint unter **Einstellungen → Clients**.

Für ein neues Telefon:

1. BigaOS-Web-App oder APK installieren.
2. QR-Code unter **Einstellungen → Clients → Telefon hinzufügen** scannen oder Server-URL von Hand eingeben.
3. Namen vergeben.

## Clients verwalten

**Einstellungen → Clients** zeigt jeden registrierten Client, Online-Status, letzte Aktivität und einen Lösch-Knopf. Löschen entfernt die Pro-Client-Einstellungen und der Client registriert sich beim nächsten Verbinden neu. Bordweite Daten (Warnungen, Relais, Tanks, Markierungen) bleiben unangetastet.
