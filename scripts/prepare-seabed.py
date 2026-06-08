#!/usr/bin/env python
"""
==============================================================================
 BigaOS Seabed Composition data — bake EMODnet seabed substrate + Posidonia
==============================================================================

Harvests the two EMODnet Seabed Habitats layers the anchoring overlay uses and
bakes them into slim, pre-classified GeoJSON tiles the BigaOS server reads at
runtime (see server/src/services/seabed.service.ts — the `classifySubstrate`
logic and clip/simplify here MUST match its online-fallback normaliser so local
and online render identically):

  - emodnet_open:eusm2025_subs_full  (EUSeaMap 2025 seabed substrate, Folk classes)
      -> requested with propertyName=substrate,geom_200 (the ≈200 m pre-simplified
         geometry column; the full `geom` is enormous and geom_800 nulls out most
         small polygons)
  - emodnet_open:art17_hab_1120      (Art-17 "Posidonia beds")

Strategy: tile each configured sea region into TILE_DEG cells, GetFeature each
cell's bbox, clip + simplify + classify locally, and write one GeoJSON per
non-empty cell. The runtime service scans the tree and filters per request. Pure
standard library — no GDAL/conda needed (like prepare-heritage.py).

Output: a `.tar.gz` whose top dir is `emodnet/` (stripped on extract; the server
uses tar strip:1), landing tiles at
server/src/data/seabed-data/emodnet/<region>/seabed_<lat>_<lon>.geojson.

NOTE: EMODnet's WFS is throttled and the substrate polygons are large; a full
harvest is a slow one-time dev batch. Narrow REGIONS / raise TILE_DEG to sample.

Usage:
  python prepare-seabed.py [out_dir]          # default out_dir = tmp/seabed

Then publish (gh CLI authed for BigaOSTeam/BigaOS-data):
  gh release create seabed-data-v1 -R BigaOSTeam/BigaOS-data <out_dir>/seabed-emodnet.tar.gz
  # ...or refresh an existing release:
  gh release upload seabed-data-v1 -R BigaOSTeam/BigaOS-data <out_dir>/seabed-emodnet.tar.gz --clobber
"""

import os
import sys
import json
import time
import tarfile
import urllib.request
import urllib.parse

WFS_BASE = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_open/wfs'
SUBSTRATE_TYPE = 'emodnet_open:eusm2025_subs_full'
SUBSTRATE_PROPS = 'substrate,geom_200'   # pre-simplified geometry (≈200 m), not the
                                         # huge `geom` and not the over-coarse geom_800
                                         # (which nulls out most small polygons)
SUBSTRATE_COUNT = 15000  # must reach the geom-bearing polygons among the NULL-geom records
# Seagrass: the EOV seagrass-meadow compilation (real bed outlines + species), NOT the
# near-empty Art-17 grid. Keep in sync with seabed.service.ts.
SEAGRASS_TYPE = 'emodnet_open:seagrass_eov_poly_2025'
SEAGRASS_PROPS = 'habsubtype,hab_origin,anxi_code,geom'
SEAGRASS_COUNT = 6000

TILE_DEG = 2.0        # harvest tile size (degrees)
REQUEST_PAUSE_S = 1.0 # be polite to EMODnet's throttled WFS

# Cruising seas to cover (west, south, east, north). Trim/extend as needed.
REGIONS = {
    'west-med':   (-6.0, 35.0, 10.0, 44.0),
    'central-med': (10.0, 35.0, 19.0, 45.0),
    'adriatic':   (12.0, 40.0, 20.0, 46.0),
    'aegean':     (22.0, 35.0, 28.0, 41.0),
    'biscay':     (-10.0, 43.0, -1.0, 48.5),
    'north-sea':  (-2.0, 50.0, 9.0, 58.0),
    'baltic':     (9.0, 53.0, 26.0, 60.0),
}

PLACEHOLDERS = {'', 'null', '<null>', 'n/a', 'na', 'unknown', 'none', '-'}
SIMPLIFY_EPS_DEG = 0.0003           # substrate (geom_200 already coarse)
SEAGRASS_SIMPLIFY_EPS_DEG = 0.0018  # seagrass beds come full-res; coarse-simplify them
MIN_PART_AREA_DEG2 = 3e-7           # drop polygon parts too small to carry a glyph


# ---- classification (KEEP IN SYNC with seabed.service.ts classifySubstrate) ----

def classify_substrate(raw):
    """verbatim substrate label -> (substrateKey, holding, sensitive)."""
    s = (raw or '').lower()
    if not s:
        return 'unknown', 'unknown', False
    if 'rock' in s or 'hard substrat' in s or 'boulder' in s:
        return 'rock', 'poor', False
    if 'worm reef' in s or 'sabellaria' in s:
        return 'worm_reef', 'poor', True
    if 'coarse' in s and 'mixed' in s:
        return 'coarse_mixed', 'moderate', False
    if 'coarse' in s or 'gravel' in s or 'shingle' in s or 'pebble' in s or 'stone' in s:
        return 'coarse', 'moderate', False
    if 'mixed' in s:
        return 'mixed', 'moderate', False
    if 'muddy sand' in s or 'sandy mud' in s:
        return 'muddy_sand', 'good', False
    if 'mud' in s:
        return 'mud', 'good', False
    if 'sand' in s:
        return 'sand', 'good', False
    if 'sediment' in s:
        return 'sediment', 'unknown', False
    return 'unknown', 'unknown', False


def clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if s.lower() in PLACEHOLDERS else s


def round5(n):
    return round(float(n), 5)


# ---- geometry: Sutherland–Hodgman clip + Douglas–Peucker (port of TS) ----------

def _lerp_x(a, c, x):
    t = (x - a[0]) / (c[0] - a[0])
    return [x, a[1] + t * (c[1] - a[1])]


def _lerp_y(a, c, y):
    t = (y - a[1]) / (c[1] - a[1])
    return [a[0] + t * (c[0] - a[0]), y]


def clip_ring(ring, bbox):
    w, s, e, n = bbox
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring[:]
    if len(pts) < 3:
        return None
    edges = [
        (lambda p: p[0] >= w, lambda a, c: _lerp_x(a, c, w)),
        (lambda p: p[0] <= e, lambda a, c: _lerp_x(a, c, e)),
        (lambda p: p[1] >= s, lambda a, c: _lerp_y(a, c, s)),
        (lambda p: p[1] <= n, lambda a, c: _lerp_y(a, c, n)),
    ]
    for inside, intersect in edges:
        if not pts:
            break
        out = []
        for i in range(len(pts)):
            cur = pts[i]
            prev = pts[i - 1]
            cur_in = inside(cur)
            prev_in = inside(prev)
            if cur_in:
                if not prev_in:
                    out.append(intersect(prev, cur))
                out.append(cur)
            elif prev_in:
                out.append(intersect(prev, cur))
        pts = out
    if len(pts) < 3:
        return None
    pts.append([pts[0][0], pts[0][1]])
    return pts


def _dp(pts, lo, hi, eps, keep):
    if hi <= lo + 1:
        return
    ax, ay = pts[lo]
    bx, by = pts[hi]
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy or 1e-12
    far, fd = -1, -1.0
    for i in range(lo + 1, hi):
        px, py = pts[i]
        t = ((px - ax) * dx + (py - ay) * dy) / len2
        cx, cy = ax + t * dx, ay + t * dy
        d = (px - cx) ** 2 + (py - cy) ** 2
        if d > fd:
            fd, far = d, i
    if fd > eps * eps and far > 0:
        keep[far] = True
        _dp(pts, lo, far, eps, keep)
        _dp(pts, far, hi, eps, keep)


def simplify_ring(ring, eps):
    n = len(ring)
    if n < 5:
        return ring
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    # Closed rings (first == last) need the farthest vertex anchored first, else the
    # degenerate start==end baseline keeps almost every point (matches the TS fix).
    closed = ring[0][0] == ring[n - 1][0] and ring[0][1] == ring[n - 1][1]
    if closed:
        fi, fd = 0, -1.0
        for i in range(1, n - 1):
            dx = ring[i][0] - ring[0][0]
            dy = ring[i][1] - ring[0][1]
            d = dx * dx + dy * dy
            if d > fd:
                fd, fi = d, i
        keep[fi] = True
        _dp(ring, 0, fi, eps, keep)
        _dp(ring, fi, n - 1, eps, keep)
    else:
        _dp(ring, 0, n - 1, eps, keep)
    out = [p for i, p in enumerate(ring) if keep[i]]
    return out if len(out) >= 4 else ring


def round_ring(ring):
    return [[round5(x), round5(y)] for x, y in ring]


def ring_bounds(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def ring_area(ring):
    """Absolute polygon-ring area (shoelace), in deg²."""
    a = 0.0
    n = len(ring)
    j = n - 1
    for i in range(n):
        a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
        j = i
    return abs(a / 2)


def clip_geometry(geom, bbox, eps=SIMPLIFY_EPS_DEG):
    """Clip a Polygon/MultiPolygon to bbox, keeping only OUTER rings (holes dropped —
    invisible under scattered glyphs, but seagrass beds carry up to ~1,600 holes that
    would otherwise dominate the payload). Matches seabed.service.ts clipFeature."""
    gtype = geom.get('type')
    if gtype == 'Polygon':
        polys = [geom.get('coordinates') or []]
    elif gtype == 'MultiPolygon':
        polys = geom.get('coordinates') or []
    else:
        return None
    w, s, e, n = bbox
    kept = []
    for rings in polys:
        if not rings:
            continue
        minx, miny, maxx, maxy = ring_bounds(rings[0])
        if maxx < w or minx > e or maxy < s or miny > n:
            continue
        outer = clip_ring(rings[0], bbox)
        if not outer:
            continue
        simplified = round_ring(simplify_ring(outer, eps))
        if ring_area(simplified) >= MIN_PART_AREA_DEG2:
            kept.append([simplified])
    if not kept:
        return None
    if len(kept) == 1:
        return {'type': 'Polygon', 'coordinates': kept[0]}
    return {'type': 'MultiPolygon', 'coordinates': kept}


# ---- WFS fetch + normalise ----------------------------------------------------

def fetch_layer(type_name, bbox, props, count):
    w, s, e, n = bbox
    query = {
        'service': 'WFS',
        'version': '2.0.0',
        'request': 'GetFeature',
        'typeNames': type_name,
        'outputFormat': 'application/json',
        'srsName': 'urn:ogc:def:crs:EPSG::4326',
        'count': str(count),
        # EPSG:4326 axis order is lat,lon for the bbox (append the CRS URN).
        'bbox': f'{s},{w},{n},{e},urn:ogc:def:crs:EPSG::4326',
    }
    if props:
        query['propertyName'] = props
    url = f'{WFS_BASE}?{urllib.parse.urlencode(query)}'
    req = urllib.request.Request(url, headers={'User-Agent': 'BigaOS-seabed-prep'})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.load(resp)
    return data.get('features', []) or []


def normalize_substrate(feat, bbox):
    geom = feat.get('geometry') or {}
    clipped = clip_geometry(geom, bbox)
    if not clipped:
        return None
    raw = clean_str((feat.get('properties') or {}).get('substrate'))
    key, holding, sensitive = classify_substrate(raw)
    props = {'kind': 'substrate', 'substrate': raw, 'substrateKey': key, 'holding': holding}
    if sensitive:
        props['sensitive'] = True
    return {'type': 'Feature', 'properties': props, 'geometry': clipped}


def normalize_seagrass(feat, bbox):
    geom = feat.get('geometry') or {}
    clipped = clip_geometry(geom, bbox, SEAGRASS_SIMPLIFY_EPS_DEG)
    if not clipped:
        return None
    p = feat.get('properties') or {}
    species = clean_str(p.get('habsubtype')) or clean_str(p.get('hab_origin'))
    anxi = clean_str(p.get('anxi_code'))
    is_posidonia = (species is not None and 'posidonia' in species.lower()) or anxi == '1120'
    props = {
        'kind': 'seagrass',
        'substrate': species,  # verbatim species, e.g. "Posidonia oceanica" / "Zostera"
        'substrateKey': 'seagrass',
        'holding': 'poor',
        'sensitive': True,
        'protected': True if is_posidonia else None,
    }
    return {'type': 'Feature', 'properties': {k: v for k, v in props.items() if v is not None}, 'geometry': clipped}


def frange(start, stop, step):
    v = start
    while v < stop - 1e-9:
        yield round(v, 6)
        v += step


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join('tmp', 'seabed')
    # Optional 2nd arg: comma-separated region names to harvest (default: all).
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    pack_dir = os.path.join(out_dir, 'emodnet')   # tar root (stripped on extract)
    os.makedirs(pack_dir, exist_ok=True)

    total_tiles = 0
    total_feats = 0
    for region, (rw, rs, re_, rn) in REGIONS.items():
        if only and region not in only:
            continue
        region_dir = os.path.join(pack_dir, region)
        for lat0 in frange(rs, rn, TILE_DEG):
            for lon0 in frange(rw, re_, TILE_DEG):
                bbox = (lon0, lat0, min(lon0 + TILE_DEG, re_), min(lat0 + TILE_DEG, rn))
                feats = []
                try:
                    for raw in fetch_layer(SUBSTRATE_TYPE, bbox, SUBSTRATE_PROPS, SUBSTRATE_COUNT):
                        f = normalize_substrate(raw, bbox)
                        if f:
                            feats.append(f)
                    time.sleep(REQUEST_PAUSE_S)
                    for raw in fetch_layer(SEAGRASS_TYPE, bbox, SEAGRASS_PROPS, SEAGRASS_COUNT):
                        f = normalize_seagrass(raw, bbox)
                        if f:
                            feats.append(f)
                    time.sleep(REQUEST_PAUSE_S)
                except Exception as exc:  # noqa: BLE001 — skip a flaky tile, keep going
                    print(f'  ! {region} {lat0},{lon0} failed: {exc}')
                    continue
                if not feats:
                    continue
                os.makedirs(region_dir, exist_ok=True)
                name = f'seabed_{lat0:.0f}_{lon0:.0f}.geojson'.replace('-', 'm')
                with open(os.path.join(region_dir, name), 'w', encoding='utf-8') as fh:
                    json.dump({'type': 'FeatureCollection', 'features': feats}, fh,
                              ensure_ascii=False, separators=(',', ':'))
                total_tiles += 1
                total_feats += len(feats)
                print(f'  {region} {lat0:.0f},{lon0:.0f}: {len(feats)} features')

    if total_tiles == 0:
        print('No features harvested — aborting'); sys.exit(1)

    tar_path = os.path.join(out_dir, 'seabed-emodnet.tar.gz')
    with tarfile.open(tar_path, 'w:gz') as tf:
        tf.add(pack_dir, arcname='emodnet')
    tar_mb = os.path.getsize(tar_path) / (1024 * 1024)
    print(f'PACKAGED {tar_path}: {total_tiles} tiles, {total_feats} features, {tar_mb:.2f} MB')
    print('Publish: gh release create seabed-data-v1 -R BigaOSTeam/BigaOS-data '
          f'{tar_path}')


if __name__ == '__main__':
    main()
