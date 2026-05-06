# Getting Started

When a BigaOS device boots for the first time, it asks for two things: a server URL and a name.

## 1. Server URL

The **server URL** points at the BigaOS server running on the boat. On a Pi display this is usually filled in already. On a phone you'll be asked to scan a QR code or enter the URL by hand.

If you ever need to change it later (different boat, switching between local Wi-Fi and Tailscale), open **Settings → General → Server**.

## 2. Client name

Each device that connects to the server is called a **client**. Give it a name that tells you where it is — *Helm Display*, *Salon Tablet*, *Captain's Phone*. The name shows up in the client list and helps you find a device when you want to push settings to it.

There are two kinds of client:

- **Display** — a Pi or fixed screen on the boat. Lives on the dashboard, runs full-screen.
- **Remote** — a phone or tablet you carry around. Same data, smaller screen, slightly trimmed UI.

## 3. You're in

Once configured the client opens to the **dashboard** (or to the chart if your display is in chart-only mode). From there:

- Tap any tile to dive into a detailed view with history and statistics.
- Use the sidebar to switch between dashboard, chart, instruments, switches, edit-mode, settings, and help.
- The cog opens **Settings**, where everything else lives — alerts, plugins, themes, languages, units, vessel dimensions, navigation data downloads, console.

If you'd like a guided tour of the UI you can replay it any time from **Help → Welcome**.

## What to set up first

A few minutes spent here pays off later:

1. **Settings → Vessel** — your boat's dimensions and chain spec. The anchor-alarm chain calculator and various other features use these.
2. **Settings → Units** — speed (kt, km/h, mph, m/s), wind (also Beaufort), depth (m or ft), distance, weight, temperature, time and date format.
3. **Settings → Plugins** — install a driver for your hardware. Without a driver plugin, your tiles will be empty. The built-in **Demo** plugin is the fastest way to see live-looking values without a real boat.
4. **Settings → Alerts** — four premade alarms (wind, high wind, low battery, high waves) come ready to enable. Tweak the thresholds and tones, or add your own.
5. **Settings → Downloads** — download the **Navigation Data** (OSM Water Layer) so route planning works.
