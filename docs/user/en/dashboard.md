# Dashboard

The dashboard is your home screen. It's a grid of tiles, each showing one piece of information from the boat.

## Tiles

The default layout has speed, heading, depth, wind, position and battery — but you can change all of that. Tile types:

- **Speed**, **heading**, **depth**, **position** — core navigation values.
- **Wind** and **wind rose** — apparent and true wind, with a rose visualisation.
- **Battery** and **battery draw** — voltage, state of charge, current in/out.
- **Roll** and **pitch** — boat attitude.
- **Switch** — toggle a circuit on or off, see its state.
- **Tank** — current level for one of your configured tanks.
- **Weather forecast** tiles — wave forecast, gust forecast, pressure forecast, sea-temperature forecast, air-temperature forecast.

Plugins can also contribute tiles of their own — they show up alongside the built-in ones in the palette.

Tap a tile to open the **detail view** for that value, with history charts and statistics.

## Edit mode

Tap the **pencil** in the sidebar to enter edit mode. While editing:

- **Drag** tiles to rearrange.
- **Resize** by pulling the corner handle.
- **Add** a new tile from the palette.
- **Remove** with the × on the tile.
- **Configure** a switch tile (which switch it controls) or a tank tile (which tank it shows) by tapping its gear.
- **Change row count** with the ± control to fit more or less on screen.
- **Cycle the sidebar** through the four edge positions (left → right → top → bottom → left) with the position button.

Tap **Done** when you're happy. Layouts are stored **per client**, so the helm and the salon can have completely different dashboards.

## Sidebar

The sidebar holds quick links to the chart, instruments view, switches view, edit mode, settings and help. It can sit on any edge — set the position from the cycle button in edit mode. On narrow screens it auto-collapses to icons only.

In **chart-only mode** (Settings → Chart) the dashboard is replaced by the chart as the home screen, so the dashboard sidebar isn't shown. Help is then reachable from inside Settings.
