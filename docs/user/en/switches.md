# Switches

A switch in BigaOS is a physical relay channel on a Pi client — controlled directly via the Pi's GPIO pins, not through a plugin. To use switches you need:

1. A **Pi display client** with the BigaOS GPIO agent installed.
2. Something physical wired to one or more GPIO pins (a relay board is typical).

The agent ships with the Pi setup script and runs as a system service on the Pi. **Settings → Clients** shows whether the agent is connected for each Pi.

## Defining a switch

Open **Settings → Switches** and add a new switch. Each one carries:

- **A name** — *Anchor Light*, *Cabin Lights*, *Fresh Water Pump*…
- **An icon** — pick from 15 built-in icons (lightbulb, anchor light, nav light, pump, fan, horn, heater, fridge, inverter, outlet, water pump, bilge pump, spotlight, radio, generic).
- **Target client** — which Pi-with-agent will physically toggle the relay.
- **Device type** — `rpi4b` or `rpi5` (the Pi 5 has different GPIO mapping internally).
- **GPIO pin** — the BCM pin number wired to your relay's input.
- **Relay type** — `active-low` (most relay boards) or `active-high`.
- **Startup behaviour** — what state to set when the agent comes up: `off`, `on`, or `keep-state` (whatever was last persisted).

## On a dashboard

In dashboard edit mode, drop a **switch tile** and pick the switch it controls from the dropdown. Each client's dashboard chooses independently — the helm might want navigation lights, the salon might want cabin lighting.

You can also open the **Switches view** from the sidebar for a full-screen list of every switch on the boat, with current state and one-tap toggling.

## State sync

Toggle anywhere, see it everywhere. The current state is persisted on the server, so a reboot keeps the right state when `keep-state` is the startup behaviour.

If the **target Pi is offline**, the switch dims in the UI to make it obvious it can't be toggled right now. Once the Pi reconnects, it picks the persisted state up again.

## Triggering switches without tapping the screen

A switch can be wired to a **physical button** — see [Physical Buttons](buttons). Buttons can target switches on a different Pi from the one they're physically wired to, so a helm panel can drive cabin lighting and vice versa.
