# Plugins

Plugins erweitern BigaOS um Datenquellen, Treiber, Sprachen und Dashboard-Kacheln. **BigaOS liest aus sich heraus keine Daten** — jeder Wert auf jedem Bildschirm gelangt über ein Plugin ins System. Ohne aktives Plugin zeigen die Dashboard-Kacheln nur Striche.

Der Plugin-Katalog ist offen und wächst. Es gibt Treiber für verschiedenste Hardware und Protokolle. Unter **Einstellungen → Plugins** siehst du, was verfügbar ist, und wählst aus, was zu deinem Boot passt. Jedes Plugin bringt eigene Hilfe-Artikel in dieser Seitenleiste mit, sodass du es vor dem Installieren kennenlernen kannst.

## Browsen

**Einstellungen → Plugins** zeigt zwei Listen:

- **Installiert** — Plugins, die aktuell auf dem Server liegen, mit Version und Aktiv-Schalter.
- **Verfügbar** — Plugins aus dem konfigurierten Katalog (Standard — die BigaOS-GitHub-Registry, einstellbar unter **Einstellungen → Erweitert**).

Plugin antippen für Beschreibung, Versionsverlauf, Capabilities und (bei Treibern) die angebotenen Datenströme.

## Installation

**Installieren** lädt das Plugin herunter, führt bei Bedarf `npm install` aus, ruft das `setup.sh` des Plugins auf, falls vorhanden, und registriert alles, was das Plugin beisteuert. Manche Setups (CAN-Bus, I2C-Peripherie) brauchen System-Änderungen und fordern einen Neustart — das Plugin zeigt dann ein Banner.

Plugins werden bei Installation **automatisch aktiviert**. Du kannst jedes Plugin deaktivieren, ohne es zu deinstallieren.

## Was ein Plugin mitbringen kann

- **Treiber** — Quellen für Sensordaten ins System. Jeder Treiber meldet einen oder mehrere Datenströme an, die BigaOS auf seine Sensor-Slots mappt (Position, Kurs, Tiefe, Wind, Batterien, Tanks usw.).
- **Einstellungs-UI** — die Konfigurationsfelder des Plugins erscheinen unter seinem Eintrag in **Einstellungen → Plugins**, generiert aus dem Plugin-Manifest.
- **Übersetzungen** — zusätzliche Strings oder neue Sprachen für das BigaOS-i18n-System.
- **Hilfe-Artikel** — Markdown-Doku, die als eigene Bereiche in dieser Hilfe erscheint (dieser Artikel ist im BigaOS-Kern-Bereich, Plugin-Artikel haben ihre eigenen).
- **Dashboard-Kacheln** — plugin-spezifische Kacheln, die in der Dashboard-Auswahl erscheinen.

## Sensor-Mapping

Wenn ein Treiber einen Wert pusht, entscheidet die **Sensor-Mapping**-Schicht, welchen Slot er füllt. Slots sind die standardisierten Sensor-Typen, die BigaOS kennt — `position`, `heading`, `depth`, `wind_apparent`, `battery_voltage` usw.

Mit nur einem installierten Treiber passiert das Mapping automatisch. Mit mehreren (z. B. NMEA 2000 + IMU + Demo) öffnest du den **Quellen**-Bereich des Plugins und wählst, welcher Stream welchen Slot füllt. Ströme, die seit längerem nichts mehr gemeldet haben, sind markiert — eine tote Quelle erkennst du auf einen Blick.

## Plugin entfernen

Auf ein installiertes Plugin tippen und **Deinstallieren** wählen. Das `uninstall.sh` läuft (falls vorhanden), um System-Änderungen aus dem Setup zurückzunehmen. Alles, was vom Plugin abhing (ein Relais auf seinem Treiber, eine Warnung auf einem seiner Streams), wird inaktiv aber nicht gelöscht — nach einer Neuinstallation steht die Konfiguration also noch.

## Demo-Plugin

Das eingebaute **Demo**-Plugin erzeugt plausible Testdaten für die meisten Bord-Instrumente. Aktivieren unter **Einstellungen → Plugins**, wenn du die Oberfläche ohne Hardware erkunden willst. Während es läuft, erscheint ein kleines **DEMO**-Abzeichen in der Ecke jedes Bildschirms, damit Test­daten nicht mit echten verwechselt werden. Mit der Demo lässt sich das Boot zudem über die Karte steuern — **W A S D**.
