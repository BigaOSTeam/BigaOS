# Fehlerbehebung

Eine kurze Liste typischer Probleme und wo zu suchen ist.

## „Server nicht erreichbar"-Banner

Der Client kann den BigaOS-Server nicht erreichen.

- Prüfe, ob der Server eingeschaltet und gebootet ist.
- Auf einem Telefon mit Tailscale — läuft Tailscale, ist der Tailnet-Hostname erreichbar?
- Öffne **Einstellungen → Allgemein → Server** und sieh dir die genutzte URL an. Bei falscher URL ändern.

## Keine Instrumentendaten

Kacheln zeigen Striche statt Zahlen.

BigaOS liest aus sich heraus keine Daten — ohne Plugin gibt es keine Werte. Daher immer dort anfangen.

- **Einstellungen → Plugins** — ist ein Treiber-Plugin **installiert**, **aktiv** und **verbunden** (kein roter Punkt)? Welcher Treiber der richtige ist, hängt von deiner Hardware ab. Das eingebaute **Demo**-Plugin lässt sich am schnellsten aktivieren, wenn du nur prüfen willst, ob der Rest des Systems funktioniert.
- Jedes Treiber-Plugin bringt eigene Hilfe-Artikel in dieser Seitenleiste mit — öffne den deines Treibers für protokoll­spezifische Checks (Kabel, Bus-Spannung, Adressen usw.).
- Öffne den **Quellen**-Bereich des Plugins und schau, ob die erwarteten Streams *lebendig* sind — ein Stream, der eine Weile nichts gemeldet hat, ist markiert.
- Ein Server-Neustart behebt die meisten einmaligen Treiber-Hänger. **Einstellungen → Erweitert → Konsole → Neustart**.

## Manche Werte erscheinen, andere nicht

Es sind mehrere Treiber installiert und das **Sensor-Mapping** hat die falsche Quelle für diesen Slot. Im **Quellen**-Bereich des Plugins die Quelle des Slots wechseln.

Wenn ein Wert eigentlich von einem Hardware-Bus kommen sollte — auf dem Server in der **Konsole** prüfen.

- Für NMEA 2000 / CAN — `ip -details link show can0` muss `<UP>` mit gesetzter Bitrate zeigen, `candump can0` muss Frames durchrauschen lassen.
- Für I2C — `i2cdetect -y 1` muss die erwartete Adresse listen.

## Warnungen lösen nicht aus

- **Einstellungen → Warnungen** — ist die Warnung **aktiv** (und der globale Schalter an)?
- Vorhersage-basierte Warnungen feuern nur, wenn der Wetter-Service erreichbar ist. **Einstellungen → Erweitert → Wetterdaten** prüfen, Internet auf dem Boot prüfen.
- Sensor-basierte Warnungen feuern nur, wenn ein Treiber den Wert liefert. Wird `wind_speed` nicht gemessen, kann eine Warnung darauf nicht auslösen.
- Schwellrichtung (`>` vs `<`) und Einheit prüfen — Warnungen sind in deiner Anzeige-Einheit gespeichert, ein Einheitenwechsel verschiebt also den Auslösepunkt.

## Ankeralarm „driftet" oder löst falsch aus

- Der Schwojradius rechnet aus Kettenlänge, Tiefe und deiner Bootslänge (LOA aus **Einstellungen → Schiff**). Ohne LOA werden konservative Werte angenommen.
- Ein schwacher GPS-Fix erzeugt verrauschte Positionen — sehr enge Schwojkreise (kurze Kette, flaches Wasser) können allein durch Jitter aus­lösen. In engen Ankerplätzen entweder etwas mehr Kette stecken oder mit gelegentlichen Fehlalarmen leben.

## Relais lässt sich nicht umlegen

- Das Relais unter **Einstellungen → Relais** öffnen — ist der **Ziel-Client** online (kein Agent-Offline-Hinweis)?
- GPIO-Pin-Nummer und **Relais-Typ** (active-low vs active-high) müssen zur Verkabelung passen.
- Der GPIO-Agent läuft als Systemdienst — über die **Konsole** mit `systemctl status bigaos-gpio-agent` bestätigen.

## Tank-Anzeige stimmt nicht

- Die Anzeige hängt an der Kalibrierkurve. **Einstellungen → Tanks → Bearbeiten → Neu kalibrieren** startet den Assistenten erneut.
- Ist der **Quell-Stream** noch lebendig? Wenn das Plugin, das die Spannung liefert, offline ist oder der Kanal deaktiviert wurde, hört der Tank auf zu aktualisieren.

## Routenplanung schlägt fehl

- Routenplanung braucht die **Navigationsdaten** (OSM Water Layer). Unter **Einstellungen → Downloads** muss die Datei *Navigationsdaten* installiert sein.
- Der Fehlergrund verrät, was schief lief — *START_ON_LAND* / *END_ON_LAND* (dein Punkt liegt in dieser Auflösung an Land — leicht versetzen), *NO_PATH_FOUND* (kein Wasser-Pfad zwischen A und B), *NARROW_CHANNEL* (Kanal unter der Auflösung, mit der der Router sicher routen kann).

## Einen einzelnen Client zurücksetzen

Wenn nur ein Gerät zickt — **Einstellungen → Clients → Löschen** verwirft seine Konfiguration und erzwingt eine Neuregistrierung beim nächsten Verbinden. Bordweite Daten (Warnungen, Relais, Tanks, Markierungen) bleiben unangetastet.

## Wenn du tiefer schauen musst

Die **Konsole** in **Einstellungen → Erweitert** ist der Ort — Live-Logs, Shell und Schnellzugriff auf Diagnose-Befehle. Siehe [Konsole & Logs](console). Beim Melden eines Fehlers sind die Version aus der Allgemein-Seite und die relevanten Log-Zeilen das Erste, was ein Entwickler hören will.
