# Tailscale VPN

Das Tailscale-Plugin gibt dir sicheren Fernzugriff auf das Boot — von überall. Einmal installiert, ist das Boot ein normaler Rechner in deinem Tailscale-Netz, und dein Telefon erreicht es per Namen (`http://bigaos:3000`) — ohne IP-Adressen-Gefummel, ohne Port-Forwarding, ohne klassische VPN-Konfiguration.

## Warum Tailscale

Ein Boot wechselt den Hafen. Jede Marina vergibt andere öffentliche IPs, oft hinter Carrier-Grade-NAT, und wackelnder Mobilfunk killt jede klassische Port-Forwarding-Lösung. Tailscale schießt sich durch all das durch, verschlüsselt Ende zu Ende und gibt dem Boot einen stabilen Namen (MagicDNS).

## Was das Plugin tut

- Installiert `tailscaled` auf dem BigaOS-Server.
- Tritt deinem Tailscale-Netz mit einem Auth-Key bei, den du einmal einfügst.
- Setzt den Hostnamen (Standard `bigaos`), damit MagicDNS sauber auflöst.
- Bewirbt optional Subnetz-Routen, damit andere Geräte im Bordnetz vom Tailscale-Netz aus erreichbar sind.
- Akzeptiert optional Subnetz-Routen anderer Tailscale-Rechner.

Nach dem Setup gehst du mit Telefon oder Laptop auf **`http://bigaos:3000`** — funktioniert überall dort, wo dein Telefon Internet hat.

## Datenschutz

Tailscale-Traffic ist Ende-zu-Ende verschlüsselt. Das Plugin leitet deine Daten nicht über BigaOS- oder Drittanbieter-Server, abgesehen von Tailscale's eigenem Koordinations-Service (der nur die Verbindung aufbaut und nicht den Traffic sieht). Bootsdaten bleiben zwischen deinen Geräten und dem Boot.

## Deaktivieren

Solltest du Tailscale nicht mehr brauchen: Plugin unter **Einstellungen → Plugins** deaktivieren oder deinstallieren. Das `uninstall.sh` entfernt `tailscaled` sauber, sodass das System danach ohne ihn startet.
