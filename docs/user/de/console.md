# Konsole & Logs

**Einstellungen → Erweitert** öffnet die Konsole — eine Live-Sicht der Server-Logs plus eine interaktive Shell. Genau die Sicht, die ein Entwickler dieses Bootes öffnen würde, wenn man fragt „was passiert gerade auf dem Server?".

## Live-Server-Logs

Der obere Teil der Seite streamt `journalctl` für den BigaOS-Dienst. Drei Steuerelemente:

- **Aktualisieren** — holt auf Tippen die letzten ~200 Zeilen.
- **Folgen** — wenn an, hängen neue Log-Zeilen in Echtzeit an und die Anzeige scrollt automatisch ans Ende (außer du hast nach oben gescrollt, um Älteres zu lesen — dann pausiert das Auto-Scrollen, bis du wieder unten bist).
- **Neustart** — startet die Server-Hardware neu. Fragt vorher nach.

Praktisch zum Beobachten von Plugin-Ausgaben, Erkennen, wann ein Sensor-Stream verstummt ist, oder Nachsehen, warum ein Download fehlgeschlagen ist.

## Interaktive Shell

Der untere Teil ist eine Eingabezeile, die Befehle auf dem Server ausführt. **Eingabe** zum Ausführen, **↑** / **↓** für die Historie (letzte 50 Befehle bleiben). Die Ausgabe erscheint unter dem jeweiligen Befehl, stderr wird hervorgehoben und ein Exit-Code ungleich 0 explizit angezeigt.

Ein kleines **?**-Symbol öffnet eine Liste vorbereiteter Befehle, die auf einen Tipp laufen:

- `uname -a` — Kernel und Architektur.
- `uptime` — Last und Laufzeit.
- `df -h` — freier Speicherplatz.
- `free -h` — Arbeitsspeicher.
- `vcgencmd measure_temp` — SoC-Temperatur des Pi.
- `hostname -I` — IP-Adressen.
- `ip -details link show can0` — Status des CAN-Interface (für Boote mit CAN-HAT).
- `i2cdetect -y 1` — alle I2C-Geräte auf Bus 1.
- `systemctl status bigaos --no-pager -l` — Status des BigaOS-Dienstes.
- `node --version` — Node-Version.

Reine Diagnose, nichts Veränderndes. Für destruktive Befehle tippst du sie selbst ein.

## Mit Bedacht nutzen

Die Shell läuft als der Benutzer des BigaOS-Dienstes. Sie kann alles, was dieser Benutzer kann — auch den Server kaputt machen, wenn man `rm -rf` an der falschen Stelle ausführt. Es gibt keine Sandbox. Behandle sie wie einen SSH-Zugang — nützlich, aber nicht der Ort für Experimente mit unbekannten Befehlen.

## Wann du das aufmachst

- Ein Plugin liefert keine Daten — Logs auf Parse-Fehler, Init-Probleme oder „interface not found" prüfen.
- Ein Download hängt lange in **Extracting** — auf der Platte nachschauen (`df -h`, `ls -la /pfad`).
- Server fühlt sich träge an — `uptime`, `free -h`, `vcgencmd measure_temp` (Pi-spezifisch) zeigen, ob es Last, Speicher oder thermisches Drosseln ist.
- Etwas am Bus zickt — `candump can0` oder `i2cdetect -y 1`, um zu bestätigen, dass die Geräte da sind.
