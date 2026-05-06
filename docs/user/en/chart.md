# Chart

The chart view shows the boat's live position on a map.

## Opening the chart

From the dashboard, tap the **chart** icon in the sidebar. If your display is configured as **chart-only** (Settings → Chart), the chart *is* the home screen and there's no dashboard.

## What you see

- **The boat icon** marks your current position. It rotates with your heading and leaves a trail.
- **Markers** for waypoints and points of interest you've added.
- **The base map** — street tiles by default, swappable to satellite imagery.
- **The nautical overlay** — OpenSeaMap seamarks layered on top of the base.

## The chart sidebar

A second sidebar runs along one edge of the chart (configurable in **Settings → Chart → Sidebar position** — left or right). It shows:

- **Compass** — current heading, with a triangle pointing at the active route bearing if you're navigating to a destination. Tap the compass to open the **autopilot** panel.
- **Speed** — speed over ground.
- **Depth** — depth below transducer. Tap to open the **depth-alarm** panel (preset thresholds and a sound on/off toggle).
- **Forecast** — toggles the weather overlay on the map. Tap to open the [weather panel](weather).
- **Search** — search any place by name (geocoding via Photon by default), then tap a result to recenter.
- **Map / Satellite** toggle — switch the base layer.
- **Recenter** — re-attach the chart to the boat's GPS position.

## GPS-follow

By default the chart follows the boat. Once you pan, that follow is broken — the map stays where you put it. Tap the **recenter** button to re-attach. The follow indicator on the recenter button shows the active state.

The on-screen zoom buttons (`+` / `−`) zoom **without** breaking GPS-follow, so you can zoom in and out without losing your boat.

## Long-press menu

Long-press anywhere on the chart to open a context menu. From there you can:

- **Set a marker** at the pressed location.
- **Navigate here** — start a route to the pressed point.
- Other actions depending on what's under the press (an existing marker, a route, etc.).

This is independent of GPS-follow — long-pressing doesn't detach the map.

## Markers

A marker has a name, an icon, and a colour. Tap an existing marker to edit, rename, recolour, or delete it. Markers sync across all clients on the boat.

## A note on charts

The map is built from open online tile sources — OpenStreetMap for the base, ArcGIS World Imagery for satellite, OpenSeaMap seamarks for the nautical overlay. BigaOS itself does **not** ship navigation-grade nautical charts (S-57 / CM93 etc.); the seamark overlay is open data, not certified for navigation.

## What else lives on the chart

The chart is also the home of three substantial features that have their own articles:

- **Routing & autopilot** — water-only route planning, route-following autopilot. See [Routing & Autopilot](routing).
- **Anchor alarm** — drop the anchor with a chain-length recommendation, watch the swing radius. See [Anchor Alarm](anchor).
- **Weather overlay** — wind / waves / swell / current / sea-temperature with a time slider. See [Weather](weather).

## Demo mode steering

When the **Demo** plugin is enabled, the chart accepts keyboard input to "drive" the boat: **A / D** turns left / right, **W / S** increases / decreases speed (max 30 kt). A small banner at the bottom of the chart shows the simulated speed. Demo position syncs across all clients.

## Swap the tile sources

All three tile layers — street, satellite and the nautical overlay — pull from public tile servers, and you can point any of them at a different service in **Settings → Advanced → Map tiles**. Paste a `{z}/{x}/{y}` URL template and BigaOS uses it for that layer. Defaults — OpenStreetMap for street, ArcGIS World Imagery for satellite, OpenSeaMap for the seamark overlay — are restored with a single tap on **Reset map tiles** if you want to go back.

This is also the place to swap in a paid tile service, your own self-hosted tile server, or a regional chart provider that publishes raster tiles. The format must be a slippy-map URL template — vector tiles aren't supported.
