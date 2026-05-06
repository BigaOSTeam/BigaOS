# Wetter

BigaOS holt Wettervorhersagen für die aktuelle Position und zeigt sie auf zwei Wegen — als **Karten-Overlay** mit Zeit-Slider und als **Vorhersage-Kacheln** auf dem Dashboard. Vorhersagewerte können auch [Warnungen](alerts) auslösen.

## Woher die Daten kommen

Standardmäßig ruft der Server [Open-Meteo](https://open-meteo.com) ab — sowohl die Standard-Vorhersage-API (Wind, Böen, Luftdruck, Temperaturen) als auch die Marine-API (Wellenhöhe, Dünung, Strömung, Wassertemperatur). Open-Meteo ist kostenlos und braucht keinen API-Key.

Möchtest du einen anderen Anbieter, sind die URLs unter **Einstellungen → Erweitert → Wetterdaten** konfigurierbar — zusammen mit dem Refresh-Intervall (Standard 15 min, Bereich 5–60 min). Den Wetter-Service kann man dort auch ganz abschalten.

## Das Karten-Overlay

Tippe **Vorhersage** in der Karten-Seitenleiste, um den Wetter-Bereich zu öffnen. Er hat zwei Teile — **was** angezeigt wird und **wann**.

**Anzeige-Modus** — die Werte, die auf der Karte erscheinen:

- **Wind** — Windrichtung und Geschwindigkeit über die Fläche.
- **Wellen** — signifikante Wellenhöhe.
- **Dünung** — primäre Dünungshöhe und -richtung.
- **Strömung** — Oberflächen-Strömungsrichtung und -Stärke.
- **Temp** — Wassertemperatur an der Oberfläche.
- **Aus** — Overlay deaktivieren, ohne den Bereich zu schließen.

**Zeit** — wann in der Vorhersage gerendert wird:

- Voreingestellt — Jetzt, +1 h, +3 h, +6 h, +12 h, +1 d, +2 d, +3 d, +7 d.
- **Eigene** — beliebige Stundenzahl bis 168 (7 Tage).

Der Bereich zeigt die gerenderte Vorhersagezeit (in deinem Zeit- und Datumsformat) und eine Wind-Skala in deiner Einheit (kt / km/h / mph / m/s / Beaufort).

## Vorhersage-Kacheln

Mehrere Dashboard-Kacheln zeigen Kurzfrist-Vorhersagen an der Bootsposition:

- Wellen-Vorhersage
- Böen-Vorhersage
- Luftdruck-Vorhersage
- Wassertemperatur-Vorhersage
- Lufttemperatur-Vorhersage

Antippen öffnet die **Wetter**-Detailansicht mit stündlichen Daten und Verlauf.

## Vorhersage-basierte Warnungen

Du kannst Warnungen schreiben, die entweder das **aktuelle** Wetter oder die **Vorhersage** N Stunden voraus lesen.

- *Aktuelle* Quellen — Windböen, Wellenhöhe, Lufttemperatur, Wassertemperatur.
- *Vorhersage*-Quellen — Wind-Vorhersage, Wellen-Vorhersage, beide mit einer `forecastHours`-Einstellung (z. B. *auslösen, wenn der Maximalwind in den nächsten 3 Stunden 30 kn überschreitet*).

Die vorgefertigten **Windwarnung** und **hohe Windwarnung** sind Vorhersage-Alarme. Siehe [Warnungen & Alarme](alerts) für die vollständige Bedingungsliste.
