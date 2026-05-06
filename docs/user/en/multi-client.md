# Displays & Phones

BigaOS is built for a boat with **many screens and many people**. Every device that connects to the server is a *client*, and the system keeps them in sync.

## Two kinds of client

- **Display** — a fixed screen on the boat. Pi at the helm, tablet in the salon, second monitor at the chart table. Runs full-screen, optimised for permanent install.
- **Remote** — a phone or tablet you carry around. Same data, slightly trimmed UI, designed for one-hand use.

The kind is set during setup and shows up next to the name in the client list.

## Pi-with-agent vs everything else

A subset of display clients are **Pi clients with the BigaOS GPIO agent** installed (typically the ones permanently wired into the boat). Those gain a few extra abilities:

- A **Settings → Display** tab for native resolution, rotation, and scale via `wlr-randr`.
- Eligibility as a target for **Switches** (GPIO output).
- Eligibility as a source for **Buttons** (GPIO input).

Phones, tablets, and any browser-based display act as full BigaOS clients but can't host switches or buttons because they don't have GPIO.

## What's per-client vs. shared

Some things are **per-client**, so each device can be configured for where it lives and who uses it:

- Dashboard layout and tiles.
- Sidebar position (4-way for the dashboard, left/right for the chart).
- Start page.
- Chart-only mode.
- Active view (so a reload restores where you were).

Some things are **shared across all clients** because they describe the boat or the system as a whole:

- Vessel dimensions and chain spec.
- Theme (dark / light).
- Language.
- Alerts.
- Switches and switch state.
- Tanks and calibrations.
- Markers.
- Plugins and drivers.
- Weather settings, navigation data, server settings.

## Adding a client

For a new display:

1. Boot the device pointed at the BigaOS server.
2. The setup wizard asks for a name and type.
3. Done — it appears in **Settings → Clients**.

For a new phone:

1. Open the BigaOS web app or install the APK.
2. Scan the QR code from **Settings → Clients → Add phone**, or enter the server URL by hand.
3. Give it a name.

## Managing clients

**Settings → Clients** shows every registered client, online status, last seen, and a button to delete. Deleting a client wipes its per-client settings and prompts it to re-register on next connect. Boat-wide state (alerts, switches, tanks, markers) is untouched.
