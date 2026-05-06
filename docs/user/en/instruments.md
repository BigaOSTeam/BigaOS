# Instrument Views

Every value on the dashboard has a **detail view** behind it. Tap the tile to open it.

## What's in a detail view

Each detail view shows:

- **The current value**, large and clear.
- **Stats** for the chosen window — typical min, average, max.
- **A history chart** with selectable timeframes (last 5 minutes, hour, day, week).
- **Related values** where they make sense (e.g. true and apparent wind side by side).

## Available views

- **Speed** — speed over ground from GPS.
- **Heading** — magnetic or true depending on what the bus reports. BigaOS auto-applies magnetic declination from GPS where needed.
- **Depth** — depth below transducer.
- **Wind** — apparent and true, speed and angle, with a rose.
- **Position** — latitude / longitude.
- **Battery** — voltage, state of charge, current, power, time remaining.
- **Roll** and **Pitch** — attitude over time.
- **Tank** — level history for a single tank, with fill-rate and time-to-full / time-to-empty estimates.
- **Weather** — short-term forecast at the boat's current position.

## The instruments grid

The **Instruments** view (sidebar icon: gauge) is a one-screen overview of *every* instrument at once, useful as a "glance everything" page during watchkeeping.

## Where the data comes from

BigaOS itself reads nothing — every value is produced by a **plugin**. Browse **Settings → Plugins** to see what's installed. If a value isn't appearing, that's almost always the place to start: the right driver may not be installed, may be disabled, or its connection may be down.

A built-in **Demo** plugin generates believable fake data — useful for trying the views without hardware connected.
