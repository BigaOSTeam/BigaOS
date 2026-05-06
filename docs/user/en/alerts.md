# Alerts & Alarms

The alert system watches the boat's data and the weather forecast, then notifies you — visibly and audibly — when a condition you care about is met.

## How an alert is built

Each alert combines:

- **A name** — what shows up in the banner.
- **A data source** — see the table below.
- **An operator** — `>`, `>=`, `<`, `<=`, `=`, `!=`.
- **A threshold** — in your display unit (kt, m, V, °C, %…).
- **A forecast horizon** *(weather-forecast sources only)* — how many hours ahead to peek.
- **A severity** — *info* (blue), *warning* (orange), *critical* (red).
- **A tone** — picked from a set of built-in sounds, or *None* for silent.
- **A snooze duration** — how long the alert hushes after you dismiss it before it can re-fire.

Alerts can be enabled/disabled individually, and there's a **global** enable/disable for the whole system in **Settings → Alerts**.

## What you can watch

| Source | Origin | Default unit |
|---|---|---|
| Wind speed | Sensor (live) | kt |
| Wind gusts | Weather (current) | kt |
| Wind forecast | Weather (forecast) | kt |
| Wave height | Weather (current) | m |
| Wave forecast | Weather (forecast) | m |
| Speed over ground | Sensor (live) | kt |
| Depth | Sensor (live) | m |
| Battery voltage | Sensor (live) | V |
| Battery state of charge | Sensor (live) | % |
| Air temperature | Weather (current) | °C |
| Water temperature | Weather (current) | °C |

Sensor sources read whatever a driver plugin pushes for that type. If no driver is installed for a type, alerts using it will never fire — there's no sensor data to read.

Weather sources read from the configured weather service (default Open-Meteo) and are subject to the refresh interval set in **Settings → Advanced → Weather data**.

## Premade alerts

Four templates ship enabled out of the box:

- **Wind Alert** — wind forecast > 20 kt within 1 hour.
- **High Wind Warning** — wind forecast > 30 kt within 3 hours.
- **Low Battery** — battery voltage < 12.0 V.
- **High Wave Alert** — wave forecast > 2.0 m within 3 hours.

Disable any of them you don't want, change the thresholds, or hit **Add alert** to write your own.

## Tones

Fifteen built-in sounds, ranging from a single beep to a foghorn or full siren. Pick whatever's easiest to recognise from the helm without being so loud it spooks the crew.

When an alert fires, a banner appears at the top of every connected client. Tap the banner to dismiss the tone. The condition still has to clear before the alert is "over" — dismissing only silences it for the snooze duration.

## Depth alarm

There's a dedicated **depth alarm** built into the chart, separate from the generic alerts list. On the chart, tap the **depth** value in the chart sidebar — a panel opens with preset thresholds (1, 2, 3, 5, 10 m or 3, 6, 10, 15, 30 ft, depending on your unit setting) and a sound on/off toggle. Pick a threshold and the alarm fires the moment depth drops below it.

Why a dedicated panel instead of just a generic alert? Because depth is the one value where you typically want to enable, change, or silence the alarm with a single tap from the chart while underway — opening Settings → Alerts mid-channel isn't practical. The depth value in the chart sidebar shows a small bell next to the label whenever the alarm is armed, so you can see at a glance whether you're protected.

If you want a more elaborate setup (snooze, severity, custom message), you can also wire **Depth (Sensor)** as a data source under **Settings → Alerts** — the two alarms run independently and can both be enabled.

## Anchor alarm

The anchor alarm is its own thing — see [Anchor Alarm](anchor). It uses the same banner + tone system but isn't a generic alert with a configurable data source.
