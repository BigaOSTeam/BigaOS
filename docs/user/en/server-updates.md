# Server & Updates

The BigaOS server runs on the boat — usually a Raspberry Pi — and every client talks to it. This page covers the server-side bits you might touch from a client.

## Server connection (mobile clients)

A phone or tablet client has a **server URL** stored locally. Open **Settings → General** to see it and change it (e.g. when switching between boats, or between local Wi-Fi and Tailscale). On a Pi display the URL is fixed to the local server at install time and isn't changeable from the UI.

When the WebSocket can't reach the server, every client shows a red **Server unreachable — Reconnecting...** banner at the top of the screen. The client keeps retrying automatically; once the connection is back, the banner clears.

## Software updates

**Settings → General** has the update widget at the top. It shows:

- The current server version.
- The latest version available, if newer.
- A link to the GitHub release notes.

Hit **Check** to ask the server to check the registry now, or **Install** to apply a pending update. Installing downloads, applies, and restarts the server. Connected clients show an **"Updating…"** overlay until the server is back, then reload automatically to pick up the new client assets.

If the update check fails (no internet, GitHub unreachable), the widget shows a small warning under the version line — try again later or check **Settings → Advanced → Console** for details.

## APK updates (Android)

If you're running the Android APK, app updates ship separately from server updates. When the server has a newer APK cached, a blue **App update available** banner appears at the top of the app — tap it to download and install.

## Reboot & shutdown

The server hardware can be rebooted or shut down from the **Console** in **Settings → Advanced** (the reboot button next to the live logs). On a real boat with a MacArthur HAT, **Shut down** also cuts power via the HAT's power-latch GPIO so the Pi doesn't sit drawing battery — handy when leaving the boat for the season.

While a reboot or shutdown is in progress, every client shows an overlay. Reboots reconnect automatically once the server is back; shutdowns do too if the server returns within ~30 seconds (otherwise the overlay clears so the client doesn't sit there forever).

## Connectivity awareness

The server tracks whether *it* has internet (independent of any client's connectivity). When connectivity changes:

- Going **offline** → an `OFFLINE` badge appears in the top-right of every client.
- Going **online** → a green `ONLINE` flash appears briefly. The chart auto-refreshes its tile cache so any placeholder tiles get replaced with real ones.

Internet loss doesn't affect anything that runs on the boat itself — sensors, switches, alerts, anchor alarm. It only affects features that need an external service (weather forecast, online tile fetches, route planning if the navigation data isn't downloaded).
