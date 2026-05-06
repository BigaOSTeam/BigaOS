# Relais

Ein Relais in BigaOS ist ein physischer Relais-Kanal an einem Pi-Client — direkt über GPIO gesteuert, nicht über ein Plugin. Damit Relais funktionieren, brauchst du:

1. Einen **Pi-Display-Client** mit installiertem BigaOS-GPIO-Agent.
2. Etwas Physisches an einem oder mehreren GPIO-Pins (typischerweise eine Relais-Platine).

Der Agent kommt mit dem Pi-Setup-Skript und läuft als Systemdienst auf dem Pi. **Einstellungen → Clients** zeigt für jeden Pi, ob der Agent verbunden ist.

## Relais anlegen

Öffne **Einstellungen → Relais** und füge ein neues hinzu. Pro Relais:

- **Name** — *Ankerlicht*, *Kabinenlicht*, *Frischwasserpumpe*…
- **Symbol** — aus 15 eingebauten (Glühbirne, Ankerlicht, Navigationslicht, Pumpe, Lüfter, Horn, Heizung, Kühlschrank, Wechselrichter, Steckdose, Wasserpumpe, Bilgenpumpe, Spotlight, Radio, generisch).
- **Ziel-Client** — welcher Pi-mit-Agent das Relais physisch schaltet.
- **Geräte-Typ** — `rpi4b` oder `rpi5` (der Pi 5 hat intern andere GPIO-Zuordnung).
- **GPIO-Pin** — die BCM-Pin-Nummer am Relais-Eingang.
- **Relais-Typ** — `active-low` (die meisten Relais-Boards) oder `active-high`.
- **Verhalten beim Start** — Zustand beim Hochfahren des Agents — `aus`, `an` oder `Letzten Zustand halten`.

## Auf einem Dashboard

Im Bearbeitungs-Modus eine **Relais-Kachel** ablegen und das gewünschte Relais aus der Liste wählen. Jedes Client-Dashboard wählt unabhängig — am Steuerstand vielleicht die Navigationslichter, im Salon die Kabinenbeleuchtung.

Über die Seitenleiste lässt sich auch die **Relais-Ansicht** öffnen — eine Vollbild-Liste aller Relais an Bord, mit aktuellem Zustand und Ein-Tipp-Schalten.

## Synchronisation

Einmal schalten, überall sehen. Der aktuelle Zustand wird serverseitig gespeichert — ein Neustart behält den richtigen Zustand bei `Letzten Zustand halten`.

Ist der **Ziel-Pi offline**, wird das Relais in der Oberfläche gedimmt, damit klar ist, dass gerade nicht geschaltet werden kann. Sobald der Pi wieder verbunden ist, holt er sich den gespeicherten Zustand.

## Schalten ohne Bildschirm

Ein Relais lässt sich an eine **physische Taste** koppeln — siehe [Physische Tasten](buttons). Tasten können Relais an einem anderen Pi auslösen als dem, an den sie selbst angeschlossen sind. So kann ein Steuerstand-Panel die Kabinenbeleuchtung steuern und umgekehrt.
