# Einrichtung

Für die Installation brauchst du ein Tailscale-Konto (das kostenlose Free-Tier reicht für ein Boot vollkommen) und einen Auth-Key.

## 1. Auth-Key holen

1. Auf [tailscale.com](https://tailscale.com) anmelden, dann **Settings → Keys**.
2. Einen neuen **Auth Key** erzeugen. **Reusable** anhaken, wenn das Boot sich nach Ablauf selbst neu authentifizieren soll, oder einen Single-Use-Key, wenn du jedes Mal selbst neu paste möchtest.
3. Schlüssel kopieren — er ist nur einmal sichtbar.

## 2. In BigaOS installieren

1. **Einstellungen → Plugins** → Tailscale VPN suchen → **Installieren**.
2. Plugin-Einstellungen öffnen und den Auth-Key in das Feld **Auth Key** einfügen.
3. Optional den **Hostname** ändern (Standard `bigaos`). Der Hostname ist das, was du später in den Browser tippst — kurz und eindeutig halten.
4. Auf **Verbinden** drücken.

Das Plugin meldet das Gerät bei Tailscale an und bringt die Verbindung hoch. Die Statuszeile zeigt, ob authentifiziert und verbunden.

## 3. Vom Telefon verbinden

1. Tailscale auf dem Telefon oder Laptop installieren und im selben Konto anmelden.
2. Browser auf **`http://<hostname>:3000`** öffnen (z. B. `http://bigaos:3000`).
3. Die BigaOS-Oberfläche lädt, als wärst du im lokalen WLAN.

Löst der Hostname nicht auf, ist MagicDNS in deinem Tailscale-Admin vermutlich aus. Unter **DNS → MagicDNS** auf tailscale.com wieder aktivieren.

## Subnetz-Routen (fortgeschritten)

Wenn andere Geräte im Bordnetz auch von außerhalb erreichbar sein sollen (z. B. Admin-Oberfläche eines LTE-Routers, ein NAS, ein CCTV-System):

1. Subnetz in CIDR-Form unter **Advertise Routes** eintragen, z. B. `192.168.1.0/24`.
2. Im Tailscale-Admin (**Machines → bigaos → Edit route settings**) die Route freigeben.
3. Andere Geräte in deinem Tailnet können IPs in diesem Bereich nun erreichen, als wären sie lokal.
