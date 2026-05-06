# Physical Buttons

If you've wired pushbuttons to a Pi client's GPIO (helm panel, cockpit switches, deck-mounted controls), the **buttons** feature turns those into UI shortcuts.

## How a button is wired

A button in BigaOS is one GPIO input on a Pi client running the GPIO agent. Each button has:

- **A source client** — the Pi the button is physically wired to.
- **Device type** — `rpi4b` or `rpi5`.
- **GPIO pin** — BCM pin number.
- **Pull resistor** — `up` (idle HIGH, button to GND), `down` (idle LOW, button to 3V3), or `none` (you've wired your own pull).
- **Trigger edge** — `falling` (default for pull-up wiring) or `rising` (pull-down).
- **Debounce ms** — how long after the first edge to ignore further edges. 50 ms covers most tactile buttons; cheap or worn buttons may need 100–200 ms.

## What a button can do

Each button dispatches one **action** when triggered:

| Action | What it does |
|---|---|
| `toggle_switch` | Flips a specific switch on whichever Pi hosts it. |
| `chart_recenter` | Re-attaches the chart on a target client to GPS. |
| `chart_zoom_in` | Zooms the chart in on a target client. |
| `chart_zoom_out` | Zooms the chart out on a target client. |
| `navigate` | Sends a target client to a specific view (chart, dashboard, instruments, switches, …). |
| `settings_tab` | Sends a target client to a specific Settings tab. |

The **target client** can be different from the source client — a helm-panel button can drive the salon display, and so on.

## On-screen edge label

A button can show its label on a target client's screen at the edge nearest the physical button. Configure:

- **Overlay enabled** — show the label or not.
- **Edge** — top, right, bottom, or left.
- **Percent** — position along that edge (0 % = corner, 100 % = far corner).

This is useful when the buttons aren't labelled on the panel itself — a glance at the screen tells you which button does what.

## Setup

Open **Settings → Buttons** to see every defined button (across all Pi clients) and add new ones. The dialog covers all the fields above, plus an **enabled** toggle. Changes propagate to the relevant Pi agent over WebSocket — no need to restart anything.

## Notes

- Buttons can only be defined on clients with a connected GPIO agent. Clients without an agent (phones, tablets, laptops) are not selectable as a source.
- A button physically wired to one Pi can target a switch hosted on a different Pi without any further configuration.
- Each Pi's GPIO is finite — track which pins you've used so you don't double-book one.
