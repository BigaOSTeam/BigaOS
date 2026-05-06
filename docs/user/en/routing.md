# Routing & Autopilot

BigaOS plans routes that stay in water and follows them with a heading-target autopilot. Both live on the chart.

## Before anything else: install the navigation data

Routing depends on a water-vs-land map BigaOS ships separately from the application itself. **You must install it once before any route can be planned.**

1. Open **Settings → Downloads**.
2. Find the **Navigation Data** entry (OSM Water Layer, ~90 m resolution).
3. Tap **Download** and let it finish downloading, extracting and indexing.

Until that file is installed, the router has no idea what's water and what's land — every route attempt will fail or be silently ignored. The download is one-off — once the file is on the server, every client benefits.

## How routing works

The router uses the OSM Water Layer GeoTIFF you installed above to decide what's water and what's land. When you ask for a route from A to B, it finds a path that stays in water and returns it as a list of waypoints with the total distance.

If the request can't be satisfied, the router reports why:

- **START_ON_LAND** — your starting point is on dry land.
- **END_ON_LAND** — your destination is on dry land.
- **NO_PATH_FOUND** — no water-only path exists between the two points.
- **NARROW_CHANNEL** — the path would be too tight to be safe at this resolution.
- **DISTANCE_TOO_LONG** — the route exceeds the worker's distance limit.
- **MAX_ITERATIONS** — the search hit its compute budget.

## Starting a route

The fastest way: long-press a point on the chart and pick **Navigate here**. BigaOS plans the route and draws it on the chart. The compass in the chart sidebar then shows a small triangle for the active route bearing in addition to your heading.

## Autopilot

Tap the compass in the chart sidebar to open the **Autopilot** panel.

- **Set course** shows the target heading you've chosen.
- **±1° / ±10°** buttons nudge it.
- **Activate** / **Deactivate** turns autopilot output on or off.
- **Follow route** appears when there's an active route — when on, the autopilot continuously sets the target heading to the current route bearing. Manually adjusting the heading turns this off.

> The autopilot in BigaOS is a **target-heading** indicator and (where supported) command source — it does not replace a certified physical autopilot. Whether anything actually steers the boat depends on the plugin and hardware connecting BigaOS to your steering gear.

## Waypoints and markers

Markers you've placed on the chart can serve as route endpoints — long-press a marker and pick the navigate option, or use the **Search** panel to find a place by name and start a route to that result.
