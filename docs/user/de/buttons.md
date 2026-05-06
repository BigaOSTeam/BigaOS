# Physische Tasten

Wenn du Druckknöpfe an die GPIO eines Pi-Clients verdrahtet hast (Steuerstand-Panel, Cockpit-Schalter, Decks-Bedienelemente), verwandelt das **Tasten**-Feature diese in UI-Verknüpfungen.

## Wie eine Taste angebunden ist

Eine Taste in BigaOS ist ein GPIO-Eingang an einem Pi-Client mit GPIO-Agent. Pro Taste:

- **Quell-Client** — der Pi, an dem die Taste physisch hängt.
- **Geräte-Typ** — `rpi4b` oder `rpi5`.
- **GPIO-Pin** — BCM-Pin-Nummer.
- **Pull-Widerstand** — `up` (Leerlauf HIGH, Taste auf GND), `down` (Leerlauf LOW, Taste auf 3V3) oder `none` (eigener Pull verbaut).
- **Flanke** — `falling` (Standard bei Pull-Up) oder `rising` (Pull-Down).
- **Entprellzeit** in ms — wie lange nach der ersten Flanke weitere Flanken ignoriert werden. 50 ms reichen für die meisten Taster, günstige oder ausgeleierte brauchen 100–200 ms.

## Was eine Taste auslösen kann

Jede Taste löst beim Auslösen genau eine **Aktion** aus:

| Aktion | Was passiert |
|---|---|
| `toggle_switch` | Schaltet ein bestimmtes Relais — egal an welchem Pi es hängt. |
| `chart_recenter` | Koppelt die Karte auf einem Ziel-Client wieder an GPS. |
| `chart_zoom_in` | Zoomt die Karte auf einem Ziel-Client herein. |
| `chart_zoom_out` | Zoomt die Karte auf einem Ziel-Client heraus. |
| `navigate` | Schickt einen Ziel-Client auf eine bestimmte Ansicht (Karte, Dashboard, Instrumente, Relais, …). |
| `settings_tab` | Schickt einen Ziel-Client in einen bestimmten Einstellungs-Reiter. |

Der **Ziel-Client** kann ein anderer sein als der Quell-Client — eine Steuerstand-Taste kann das Salon-Display bedienen und umgekehrt.

## Bildschirm-Beschriftung am Rand

Eine Taste kann am Bildschirm des Ziel-Clients eine Beschriftung am Rand zeigen, der ihrer physischen Position am nächsten ist. Einstellbar:

- **Overlay an** — Beschriftung anzeigen oder nicht.
- **Kante** — oben, rechts, unten oder links.
- **Prozent** — Position entlang dieser Kante (0 % = Eck, 100 % = anderes Eck).

Praktisch, wenn das Panel selbst keine Beschriftung trägt — ein Blick auf den Bildschirm und du weißt, was jede Taste macht.

## Einrichtung

**Einstellungen → Tasten** zeigt jede definierte Taste (über alle Pi-Clients) und legt neue an. Der Dialog deckt alle Felder oben ab plus einen **Aktiv**-Schalter. Änderungen gehen direkt per WebSocket an den passenden Pi-Agent — kein Neustart nötig.

## Hinweise

- Tasten lassen sich nur an Clients mit verbundenem GPIO-Agent definieren. Geräte ohne Agent (Telefone, Tablets, Laptops) sind nicht als Quelle wählbar.
- Eine Taste an einem Pi kann ohne weitere Konfiguration ein Relais an einem anderen Pi auslösen.
- Die GPIO-Pins eines Pi sind endlich — behalte den Überblick, damit kein Pin doppelt belegt wird.
