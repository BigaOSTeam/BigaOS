# Weather

BigaOS pulls weather forecasts for your current position and presents them two ways: as a **map overlay** with a time slider, and as **forecast tiles** on the dashboard. Forecast values can also drive [alerts](alerts).

## Where the data comes from

By default, the server fetches from [Open-Meteo](https://open-meteo.com) — both the standard forecast API (wind, gusts, pressure, temperatures) and the marine API (wave height, swell, current, sea-surface temperature). Open-Meteo is free and doesn't need an API key.

If you want a different provider, configure the URLs in **Settings → Advanced → Weather data** along with how often to refresh (default 15 min, range 5–60 min). You can disable the weather service entirely from the same place.

## The map overlay

Tap the **Forecast** button in the chart sidebar to open the weather panel. The panel has two sections: **what** to show and **when** to show it.

**Display mode** — the values rendered on the chart:

- **Wind** — wind direction and speed across the area.
- **Waves** — significant wave height.
- **Swell** — primary swell height and direction.
- **Current** — surface-current direction and speed.
- **Temp** — sea-surface temperature.
- **Off** — turn the overlay off without closing the panel.

**Time** — when in the forecast to render:

- Presets: Now, +1 h, +3 h, +6 h, +12 h, +1 d, +2 d, +3 d, +7 d.
- **Custom** — pick any number of hours up to 168 (7 days).

The panel shows the actual forecast time it's rendering (in your time and date format) along with a wind-speed legend in your unit (kt / km/h / mph / m/s / Beaufort).

## Forecast tiles

Several dashboard tiles show short-term forecasts at the boat's position:

- Wave forecast
- Gust forecast
- Pressure forecast
- Sea-temperature forecast
- Air-temperature forecast

Tap any of them to open the **Weather** detail view with hourly data and history.

## Forecast-driven alerts

You can write alerts that read either the **current** weather or the **forecast** N hours ahead:

- *Current* sources: wind gusts, wave height, air temperature, water temperature.
- *Forecast* sources: wind forecast, wave forecast — both with a `forecastHours` setting (e.g. *fire if max wind in next 3 hours exceeds 30 kt*).

The premade **Wind Alert** and **High Wind Warning** are forecast alerts. See [Alerts & Alarms](alerts) for the full list of conditions you can build.
