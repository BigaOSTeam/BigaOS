# Server & Updates

Der BigaOS-Server läuft an Bord — meist auf einem Raspberry Pi — und jeder Client spricht mit ihm. Diese Seite beschreibt die Server-Themen, die du vom Client aus anfasst.

## Server-Verbindung (mobile Clients)

Ein Telefon oder Tablet hat eine **Server-URL** lokal gespeichert. Unter **Einstellungen → Allgemein** siehst du sie und kannst sie ändern (z. B. beim Wechsel zwischen Booten oder zwischen lokalem WLAN und Tailscale). Auf einem Pi-Display ist die URL auf den lokalen Server festgelegt und nicht aus der Oberfläche änderbar.

Wenn die WebSocket-Verbindung zum Server abreißt, zeigt jeder Client oben ein rotes Banner **Server nicht erreichbar — Verbinde neu...**. Der Client versucht die Verbindung automatisch wiederherzustellen — sobald sie steht, verschwindet das Banner.

## Software-Updates

**Einstellungen → Allgemein** hat oben das Update-Widget. Es zeigt:

- Die aktuelle Server-Version.
- Die neueste verfügbare Version, falls neuer.
- Einen Link zu den GitHub-Release-Notes.

**Prüfen** lässt den Server jetzt in der Registry nachsehen, **Installieren** wendet ein anstehendes Update an. Das Installieren lädt herunter, wendet an und startet den Server neu. Verbundene Clients zeigen ein **„Aktualisiere..."**-Overlay, bis der Server zurück ist, und laden danach automatisch die neuen Client-Daten nach.

Schlägt die Update-Prüfung fehl (kein Internet, GitHub nicht erreichbar), zeigt das Widget einen kleinen Warnhinweis unter der Versionszeile — später nochmal probieren oder in **Einstellungen → Erweitert → Konsole** nachschauen.

## APK-Updates (Android)

Bei der Android-APK gibt es App-Updates getrennt von Server-Updates. Hat der Server eine neuere APK gecacht, erscheint oben im App-Bereich ein blaues Banner **App-Update verfügbar** — antippen für Download und Installation.

## Neustart & Herunterfahren

Server-Hardware wird über die **Konsole** in **Einstellungen → Erweitert** neu gestartet oder heruntergefahren (Reboot-Knopf neben dem Live-Log). Auf einem echten Boot mit MacArthur HAT trennt **Herunterfahren** zusätzlich die Stromversorgung über den HAT-Power-Latch — so zieht der Pi keine Batterie mehr, wenn das Boot überwintert.

Während eines Neustarts oder Shutdowns zeigt jeder Client ein Overlay. Reboots verbinden sich automatisch wieder, sobald der Server zurück ist — Shutdowns ebenso, falls der Server innerhalb von ~30 Sekunden zurückkommt (sonst räumt der Client das Overlay weg, damit nichts ewig stehen bleibt).

## Internet-Status

Der Server merkt sich, ob *er* Internet hat (unabhängig von der Verbindung des Clients zum Server). Bei Wechsel:

- **Offline** → ein `OFFLINE`-Abzeichen erscheint oben rechts auf jedem Client.
- **Online** → ein grüner `ONLINE`-Hinweis blinkt kurz auf. Die Karte aktualisiert ihren Tile-Cache, damit Platzhalter durch echte Kacheln ersetzt werden.

Internet-Verlust beeinflusst nichts, was an Bord passiert — Sensoren, Relais, Warnungen, Ankeralarm. Es wirkt sich nur auf Funktionen aus, die einen externen Dienst brauchen (Wettervorhersage, Online-Tile-Abruf, Routenplanung wenn die Navigationsdaten nicht heruntergeladen sind).
