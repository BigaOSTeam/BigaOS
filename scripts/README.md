# BigaOS Depth Data — regeneration runbook

The "Depth" chart overlay draws vector isobaths from **self-hosted bathymetry
tiles** — there is no live bathymetry API at runtime. This folder holds the
tooling to (re)generate those tiles and publish them.

- **EMODnet DTM** (~115 m) → high-res packs for European seas.
- **GEBCO 2024** (~450 m) → coarse global fallback packs.

Tiles are published as `.tar.gz` assets on the GitHub release
**`BigaOSTeam/BigaOS-data` → `depth-data-v1`**. The server reads them from
`server/src/data/depth-data/<pack>/` (downloaded via Settings → Downloads).
Runtime details: `server/src/services/depth-tile.service.ts`,
`depth-contour.service.ts`, and the `project_depth_contours` memory note.

## When to regenerate

- **New source release** (e.g. EMODnet DTM 2026 / GEBCO 2025): re-pull sources,
  re-run both steps, re-upload with `--clobber`.
- **Add a region/basin**: produce its pack, upload, then wire it in (see
  "Adding a new pack" below).

## Prerequisites

- **GDAL with the netCDF + HDF5 drivers**, via a conda env named `geo`
  (already installed at `C:\Users\Johan\Miniforge3`). All `python` commands
  below run through it:

  ```powershell
  $conda = "C:\Users\Johan\Miniforge3\Scripts\conda.exe"
  ```

  To recreate the env from scratch:
  ```powershell
  & $conda create -y -n geo -c conda-forge gdal libgdal-netcdf libgdal-hdf5
  ```
- **`gh` CLI** authenticated with write access to `BigaOSTeam/BigaOS-data`.
- ~25 GB free scratch space (sources + intermediates; deletable afterwards).

## Tile format contract (what the runtime expects)

- **EPSG:4326**, **Int16** metres (sea floor negative), **nodata `32767`**.
- **Even-degree aligned**, named by SW corner — EMODnet **2°** tiles
  (`EMODnet_Depth_N54E012.tif`), GEBCO **10°** tiles (`GEBCO_Depth_N40W020.tif`).
- DEFLATE + predictor + internally tiled.
- The server indexes tiles by SW corner using `floor(lon/size)*size`, so the
  even-degree alignment is **required** (STEP 1 enforces it).

`prepare-depth-tiles.py` produces exactly this; don't hand-edit tiles.

---

## Sources

### EMODnet (European seas, ~115 m)

Map viewer: <https://emodnet.ec.europa.eu/geoviewer/> → *EMODnet Bathymetry* →
*DTM Tiles* → enable **"Tile structure and download"**, click a tile, choose the
**NetCDF** download. (The *GeoTIFF* download is a rainbow visualization — **do
not** use it; we need the raw `elevation` values, which live in the NetCDF.)

Direct URL pattern (faster than the portal):
`https://downloads.emodnet-bathymetry.eu/v12/{TILE}_2024.nc.zip`

**Tile grid** — letters = latitude bands from the north, numbers = longitude
columns from −36° in ~9.88° steps:

| Lat band | °N | Lon col | °E |
|---|---|---|---|
| A | 80.6–90 | 1 | −36…−26 |
| B | 71.3–80.6 | 2 | −26…−16 |
| C | 61.9–71.3 | 3 | −16…−6 |
| D | 52.5–61.9 | 4 | −6…3.5 |
| E | 43.1–52.5 | 5 | 3.5…13.4 |
| F | 33.8–43.1 | 6 | 13.4…23.3 |
| G | 24.4–33.8 | 7 | 23.3…33 |
|   |   | 8 | 33…43 |

The 22 tiles behind the current European packs:
`C3 C4 D3 D4 D5 D6 D7 C6 C7 E2 E3 E4 E5 E6 E7 E8 F2 F3 F4 F5 F6 F7 F8 G5 G6 G7 G8`.
EMODnet throttles ~80 KB/s per connection, so pull in parallel:

```powershell
$dir = "tmp\depth-src\emodnet"; New-Item -ItemType Directory -Force $dir | Out-Null
$tiles = 'C3','C4','D3','D4','D5','D6','D7','C6','C7','E2','E3','E4','E5','E6','E7','E8','F2','F3','F4','F5','F6','F7','F8','G5','G6','G7','G8'
$a = @('-Z','--parallel-max','8','--retry','6','--retry-delay','12','--retry-all-errors','-C','-','-sS')
foreach ($t in $tiles) { $a += "https://downloads.emodnet-bathymetry.eu/v12/${t}_2024.nc.zip"; $a += '-o'; $a += (Join-Path $dir "${t}_2024.nc.zip") }
& curl.exe @a
```

### GEBCO (global, ~450 m)

Single global Cloud-Optimized GeoTIFF (Int16, EPSG:4326, ~4.3 GB):

```powershell
$dir = "tmp\depth-src\gebco"; New-Item -ItemType Directory -Force $dir | Out-Null
& curl.exe -L --retry 8 -C - -o "$dir\GEBCO_2024.tif" https://data.source.coop/alexgleith/gebco-2024/GEBCO_2024.tif
```

---

## Regenerate

```powershell
$conda = "C:\Users\Johan\Miniforge3\Scripts\conda.exe"
```

### EMODnet packs

```powershell
# STEP 1 — tile ALL European sources into one aligned set (one mosaic → clean
# basin boundaries, no seams).
& $conda run -n geo python scripts\prepare-depth-tiles.py emodnet tmp\depth-src\emodnet tmp\depth-out\emodnet-all

# STEP 2 — sort into sea-basin packs.
& $conda run -n geo python scripts\distribute-depth-packs.py emodnet tmp\depth-out\emodnet-all tmp\pack

# Package — tarball root dir == pack name, so the server's strip:1 extract lands
# the tiles directly in data/depth-data/<pack>/.
foreach ($b in 'baltic','north-sea','iberia','mediterranean','black-sea') {
  & tar.exe -czf "tmp\pack\depth-emodnet-$b.tar.gz" -C tmp\pack "emodnet-$b"
}
```

### GEBCO packs

```powershell
& $conda run -n geo python scripts\prepare-depth-tiles.py gebco tmp\depth-src\gebco tmp\depth-out\gebco
& $conda run -n geo python scripts\distribute-depth-packs.py gebco tmp\depth-out\gebco tmp\pack
foreach ($r in 'americas-pacific','americas-atlantic','europe-africa','asia-oceania') {
  & tar.exe -czf "tmp\pack\depth-gebco-$r.tar.gz" -C tmp\pack "gebco-$r"
}
```

### Publish

```powershell
# Update existing assets in place:
& gh release upload depth-data-v1 -R BigaOSTeam/BigaOS-data (Get-ChildItem tmp\pack\depth-*.tar.gz) --clobber
```

For a brand-new source vintage, cut a new tag instead
(`gh release create depth-data-v2 ...`) and bump `DEPTH_REL` in
`server/src/controllers/navigation-data.controller.ts`.

Output packs are tiny vs. sources (the whole Baltic: ~480 MB of NetCDF →
~18 MB of tiles), so hosting all of them is well under GitHub's 2 GiB/asset cap.

---

## Adding a new pack (region)

1. **Produce + upload** the pack (steps above; add the new region's box to
   `REGION_SETS` in `distribute-depth-packs.py` if it's a new basin/band).
2. **Register it** — append a `DataFileConfig` in
   `server/src/controllers/navigation-data.controller.ts` (`category: 'depth'`,
   `localPath: 'depth-data/<id>'`, `defaultUrl: \`${DEPTH_REL}/<asset>.tar.gz\``).
3. **Label it** — add `downloads.file_<id>` to `client/src/i18n/en.txt` and
   `de.txt`.

The grouped Downloads tab and the depth-tile service pick it up automatically —
no other code changes.

## Current packs

| Pack id | Source | Coverage |
|---|---|---|
| `depth-emodnet-baltic` | EMODnet ~115 m | Baltic + Gulf of Bothnia/Finland |
| `depth-emodnet-north-sea` | EMODnet ~115 m | North Sea, British Isles, Channel, W/S Norway |
| `depth-emodnet-iberia` | EMODnet ~115 m | Biscay, Atlantic Iberia, Gulf of Cádiz |
| `depth-emodnet-mediterranean` | EMODnet ~115 m | whole Mediterranean |
| `depth-emodnet-black-sea` | EMODnet ~115 m | Black Sea + Sea of Azov |
| `depth-gebco-europe-africa` | GEBCO ~450 m | lon −30…60° |
| `depth-gebco-americas-atlantic` | GEBCO ~450 m | lon −100…−30° |
| `depth-gebco-americas-pacific` | GEBCO ~450 m | lon −180…−100° |
| `depth-gebco-asia-oceania` | GEBCO ~450 m | lon 60…180° |

## Licensing / attribution (keep on-chart)

- **EMODnet Bathymetry DTM** — CC BY 4.0.
- **GEBCO 2024 Grid** — public domain, cite *GEBCO Compilation Group (2024)*.

Both are rendered in the chart attribution (`server/src/utils/tile-sources.ts`).
**NOT FOR NAVIGATION** — free bathymetry is coarse inshore.

---

# BigaOS "Worth a Look" (heritage) data — regeneration runbook

The "Worth a Look" chart overlay shows points of interest near the boat —
**EMODnet shipwrecks** + **UNESCO coastal World Heritage sites** — as tappable
markers. It is offline-first from a downloaded pack, with a live EMODnet WFS
fallback so it works out of the box (see `server/src/services/heritage.service.ts`).

The pack is a **single small GeoJSON** (~7.2k points), published as
`heritage-emodnet.tar.gz` on the GitHub release
**`BigaOSTeam/BigaOS-data` → `heritage-data-v1`**. The server reads it from
`server/src/data/heritage-data/emodnet/heritage.geojson` (downloaded via
Settings → Downloads → "Worth a Look").

## Sources (EMODnet Human Activities WFS — `https://ows.emodnet-humanactivities.eu/wfs`)

| Layer (`typeName`) | Content | ~Count |
|---|---|---|
| `emodnet:heritageshipwrecks` | Shipwrecks (FR/IE/UK/Med) | 7,073 |
| `emodnet:unescowhl` | UNESCO coastal World Heritage sites (European seas) | 140 |

Both are Points, both CC-BY 4.0. `prepare-heritage.py` pulls each in a single
high-count GetFeature (`outputFormat=application/json`, `count=100000`;
`CountDefault` on the server is 1,000,000, so no paging). It normalises both into
one slim shape (`kind, name, country, depth, year, period, category, desc, url`).

> **WFS axis-order note** (for the *runtime* bbox fallback, not this full pull):
> EPSG:4326 in WFS 2.0.0 takes `bbox` as `minLat,minLon,maxLat,maxLon` — append
> `urn:ogc:def:crs:EPSG::4326`. The GeoJSON *output* stays standard `[lon,lat]`.
> The full-dataset pull here uses no bbox, so order is moot.

## Regenerate + publish

```powershell
# Pure stdlib — any Python 3, no conda/GDAL needed.
python scripts\prepare-heritage.py tmp\heritage

# First time — cut the release:
gh release create heritage-data-v1 -R BigaOSTeam/BigaOS-data tmp\heritage\heritage-emodnet.tar.gz `
  --title "Heritage data v1" --notes "EMODnet shipwrecks + UNESCO coastal World Heritage sites."

# Later refreshes — update the asset in place:
gh release upload heritage-data-v1 -R BigaOSTeam/BigaOS-data tmp\heritage\heritage-emodnet.tar.gz --clobber
```

The Downloads tab and the heritage service pick the pack up automatically; the
normaliser in `prepare-heritage.py` and `heritage.service.ts` must stay in sync.

For a brand-new vintage, cut a new tag and bump `HERITAGE_REL` in
`server/src/controllers/navigation-data.controller.ts`.

### Translations (German, extensible)

The EMODnet data is English; we bake localized `<field>_de` fields into the pack
so the chart shows German offline (wreck **names stay original** — proper nouns;
UNESCO **site names use their established German form**). Translation is a
PERSISTENT layer in `scripts/heritage-translations/de.json` (one file per
language) so re-pulling the data doesn't lose it — `prepare-heritage.py` just
re-applies it.

Tooling: `scripts/heritage-translate.py` (`extract` → translate → `merge`). The
translation itself is done by parallel translation agents (the descriptions are
~3,500 distinct strings — too many to hand-translate):

```powershell
# 1) Extract distinct strings into field-tagged batches under <workdir>/in/
python scripts\heritage-translate.py extract tmp\heritage\emodnet\heritage.geojson tmp\heritage\i18n

# 2) Translate every tmp\heritage\i18n\in\*.json -> tmp\heritage\i18n\out\<same>.json
#    (a JSON ARRAY of German strings, SAME order/length as the input "items").
#    Done via a multi-agent translation run (see the heritage-translate-de
#    workflow); agents write the per-batch out/ files directly.

# 3) Merge the per-batch German files into the dictionary
python scripts\heritage-translate.py merge tmp\heritage\i18n scripts\heritage-translations\de.json

# 4) Re-bake (prepare-heritage.py auto-loads the dictionary) and re-upload
python scripts\prepare-heritage.py tmp\heritage
gh release upload heritage-data-v1 -R BigaOSTeam/BigaOS-data tmp\heritage\heritage-emodnet.tar.gz --clobber
```

`merge` reports any missing/length-mismatched batches — re-translate just those
out/ files and merge again. The client (`HeritageLayer.tsx`) shows the `_de`
value when the app language is German, else the English source. The live WFS
fallback has no translations, so un-downloaded areas show English until the pack
is downloaded.

## Licensing / attribution (keep on-chart)

- **EMODnet Human Activities — Cultural Heritage** (shipwrecks + UNESCO WHL) —
  CC BY 4.0, originator AND-International.

Rendered in the chart attribution (`server/src/utils/tile-sources.ts`).
**NOT FOR NAVIGATION** — heritage positions can be approximate.

---

# BigaOS Seabed Composition (anchoring) data — regeneration runbook

Bakes EMODnet seabed substrate + Posidonia into slim, pre-classified GeoJSON
**tiles** for the anchoring overlay. Offline-first: a downloaded pack serves
instantly, with a live EMODnet Seabed Habitats WFS fallback so it works out of the
box (see `server/src/services/seabed.service.ts`).

Pack: `seabed-emodnet.tar.gz` on the GitHub release
**`BigaOSTeam/BigaOS-data` → `seabed-data-v1`**. Tar root is `emodnet/` (stripped on
extract); the server reads tiles from `server/src/data/seabed-data/emodnet/<region>/`.

## Sources (EMODnet Seabed Habitats WFS — `https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_open/wfs`)

| Layer | Theme | Notes |
|---|---|---|
| `emodnet_open:eusm2025_subs_full` | Seabed substrate (EUSeaMap 2025, Folk classes) | fetched as `propertyName=substrate,geom_800` — the pre-simplified geometry column; the full `geom` is enormous |
| `emodnet_open:art17_hab_1120`     | Posidonia beds (Art-17) | small geometries; protected Mediterranean seagrass |

`prepare-seabed.py` tiles each configured sea region (`REGIONS`) into `TILE_DEG`
cells, GetFeatures each cell's bbox, then clips + simplifies + classifies locally.
The substrate is coloured by its **real Folk class**; **holding** quality
(good/moderate/poor) and ecological sensitivity are advisory interpretations.
Pure standard library — no GDAL/conda needed.

## Regenerate + publish

```powershell
# Slow one-time batch — EMODnet's WFS is throttled and substrate polygons are large.
# Narrow REGIONS / raise TILE_DEG in the script to sample a subset first.
python scripts\prepare-seabed.py tmp\seabed

gh release create seabed-data-v1 -R BigaOSTeam/BigaOS-data tmp\seabed\seabed-emodnet.tar.gz `
  --title "Seabed composition v1" --notes "EMODnet seabed substrate + Posidonia (anchoring overlay)"
# ...or refresh:
gh release upload seabed-data-v1 -R BigaOSTeam/BigaOS-data tmp\seabed\seabed-emodnet.tar.gz --clobber
```

The Downloads tab and the seabed service pick the pack up automatically. The
`classify_substrate` logic plus the clip/simplify in `prepare-seabed.py` and
`seabed.service.ts` MUST stay in sync so local and online render identically.

## Licensing / attribution (keep on-chart)

- **EMODnet Seabed Habitats** — EUSeaMap substrate & Posidonia beds — free to use
  with EMODnet attribution.

Rendered in the chart attribution (`server/src/utils/tile-sources.ts`).
**NOT FOR NAVIGATION** — broad-scale / predictive data; holding quality is advisory.

---

# BigaOS Offline Chart Packs (base map + seamarks) — regeneration runbook

The offline chart feature ships two pack families, downloaded via
Settings → Downloads → **Offline Charts**:

- **Base-map packs** — OSM vector tiles as **PMTiles**, one file per cruising
  region (mirroring the depth regions). Served by the Pi over HTTP Range
  (`chart-pack.service.ts`) and rendered client-side by protomaps-leaflet,
  stacked above the online raster base so gaps fall through.
- **Seamark packs** — OpenSeaMap `seamark:*` objects as **GeoJSON**, one per
  region, loaded by `seamark.service.ts` and drawn as vector symbols.

Both are published as `.tar.gz` assets on the GitHub release
**`BigaOSTeam/BigaOS-data` → `chart-packs-v1`**. The server reads them from
`server/src/data/chart-packs/<pack>/` (`osm-<region>/*.pmtiles`,
`seamark-<region>/*.geojson`). Nothing here ever touches osm.org tile servers —
base packs are extracted from the **Protomaps daily planet build** (an
OSM-derived PMTiles archive; extraction reads only byte ranges) and seamarks
from **Geofabrik** raw extracts.

## Prerequisites

- **go-pmtiles** (single static binary): <https://github.com/protomaps/go-pmtiles/releases>.
- **osmium-tool** (for seamark packs): conda `osmium-tool` or `apt install osmium-tool`.
- **`gh` CLI** authenticated with write access to `BigaOSTeam/BigaOS-data`.
- A standard machine — `pmtiles extract` never downloads the ~100 GB planet.

## Regions

Bounding boxes mirror the depth regions (`minLon,minLat,maxLon,maxLat`). A hand-
traced `--region` **polygon** (sea + ~25 km coastal buffer) keeps packs far
smaller than a bbox — strongly preferred for the big regions; version them under
`BigaOS-data/regions/`. Always `--dry-run` first and check the printed size
against GitHub's 2 GiB/asset cap.

| Region | bbox (approx.) |
|---|---|
| `world` | whole planet, `--maxzoom=7` (tens of MB — near-mandatory context) |
| `baltic` | `9,53,30.5,66` |
| `north-sea` | `-11,48,13,62` |
| `iberia` | `-11,35,5,47` |
| `mediterranean` | `-6,30,37,46` |
| `black-sea` | `27,40,42,48` |

## Base-map packs (go-pmtiles)

`--maxzoom=13` for v1 (~19 m/px — plenty offshore/approaches; land detail beyond
falls back online). Each extra zoom roughly doubles the file.

```powershell
$BUILD = (Get-Date).AddDays(-1).ToString('yyyyMMdd')   # yesterday's build
$SRC = "https://build.protomaps.com/$BUILD.pmtiles"

# World context pack.
& pmtiles extract $SRC chart-osm-world.pmtiles --maxzoom=7
tar.exe -czf chart-osm-world-v1.tar.gz chart-osm-world.pmtiles

# A region by bbox (or --region=regions\baltic.geojson for a tight polygon).
& pmtiles extract $SRC chart-osm-baltic.pmtiles --bbox=9,53,30.5,66 --maxzoom=13
tar.exe -czf chart-osm-baltic-v1.tar.gz chart-osm-baltic.pmtiles
```

The tarball must contain the `.pmtiles` file (the server's strip:1 extract lands
it in `chart-packs/osm-<region>/`). Header sanity-check: `pmtiles show <file>`.

## Seamark packs (osmium)

Per region, from Geofabrik **country** extracts (never `europe-latest`). Baltic =
DE, DK, SE, FI, PL, EE, LV, LT + Kaliningrad:

```bash
for c in germany denmark sweden finland poland estonia latvia lithuania russia/kaliningrad; do
  curl -sO "https://download.geofabrik.de/europe/${c}-latest.osm.pbf"
  osmium tags-filter "$(basename ${c})-latest.osm.pbf" nwr/seamark:type -o "sm-$(basename ${c}).osm.pbf"
  rm "$(basename ${c})-latest.osm.pbf"            # keep runner disk flat
done
osmium merge sm-*.osm.pbf -o seamarks-baltic.osm.pbf
osmium export seamarks-baltic.osm.pbf -o seamarks-baltic.geojson \
  --geometry-types=point,linestring,polygon
tar czf seamark-baltic-v1.tar.gz seamarks-baltic.geojson
```

Keep **all** `seamark:*` keys in the export — the client style consumes
`seamark:type`, `seamark:<type>:category`, `seamark:<type>:colour`, and
`seamark:light:*`. Expected size: low tens of MB uncompressed for the whole
Baltic (seamark objects are sparse).

## Publish

```powershell
gh release create chart-packs-v1 -R BigaOSTeam/BigaOS-data `
  chart-osm-world-v1.tar.gz chart-osm-baltic-v1.tar.gz seamark-baltic-v1.tar.gz `
  --title "Chart packs v1" --notes "OSM PMTiles base + OpenSeaMap seamarks."
# ...or refresh an asset in place:
gh release upload chart-packs-v1 -R BigaOSTeam/BigaOS-data chart-osm-baltic-v1.tar.gz --clobber
```

Once uploaded, the Downloads tab entries (already wired in
`navigation-data.controller.ts` → `CHART_DATA_FILES`) just work.

## Adding a region

1. **Produce + upload** its base and/or seamark pack (above).
2. **Register** — append `DataFileConfig` entries in
   `navigation-data.controller.ts` (`category: 'charts'`,
   `localPath: 'chart-packs/osm-<region>'` / `'chart-packs/seamark-<region>'`).
3. **Label** — add `downloads.file_<id>` to `client/src/i18n/{en,de}.txt`.

The Downloads tab, chart-pack service, and seamark service pick them up
automatically — no other code.

## Local dev fixture

For rendering work before the release exists, drop a pack straight into the data
dir (bypassing the download): a small pack via
`pmtiles extract <build-url> tiles.pmtiles --bbox=<small> --maxzoom=12` into
`server/src/data/chart-packs/osm-<region>/tiles.pmtiles`, and/or a hand-authored
`seamark-<region>/seamarks-<region>.geojson`. `server/src/data/` is gitignored;
restart the server (or re-trigger a download) to reindex.

## Licensing / attribution (keep on-chart)

- **Base map** — © OpenStreetMap contributors · Protomaps (ODbL; Protomaps build).
- **Seamarks** — © OpenStreetMap contributors / OpenSeaMap (ODbL).

Both are ODbL-derived; carried in the chart attribution
(`ChartView` merges the Protomaps credit when a base pack is mounted).
**NOT FOR NAVIGATION.**
