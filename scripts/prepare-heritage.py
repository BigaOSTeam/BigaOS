#!/usr/bin/env python
"""
==============================================================================
 BigaOS "Worth a Look" data — bake EMODnet cultural heritage into one GeoJSON
==============================================================================

Pulls the two EMODnet Human Activities cultural-heritage layers and normalises
them into the single slim GeoJSON the BigaOS server reads at runtime
(see server/src/services/heritage.service.ts — the normalisation here MUST match
its online-fallback normaliser so local + online render identically):

  - emodnet:heritageshipwrecks  (~7,073 shipwreck points)
  - emodnet:unescowhl           (~140 UNESCO coastal World Heritage sites)

Output: one FeatureCollection of GeoJSON Points with slim properties
(kind, name, country, depth, year, period, category, desc, url), packaged as a
.tar.gz whose top dir is stripped on extract (server uses tar strip:1), so the
file lands at server/src/data/heritage-data/emodnet/heritage.geojson.

Pure standard library — no GDAL/conda needed (unlike the depth scripts).

Usage:
  python prepare-heritage.py [out_dir]        # default out_dir = tmp/heritage

Then publish (gh CLI authed for BigaOSTeam/BigaOS-data):
  gh release create heritage-data-v1 -R BigaOSTeam/BigaOS-data <out_dir>/heritage-emodnet.tar.gz
  # ...or, to refresh an existing release:
  gh release upload heritage-data-v1 -R BigaOSTeam/BigaOS-data <out_dir>/heritage-emodnet.tar.gz --clobber
"""

import os
import sys
import json
import tarfile
import urllib.request
import urllib.parse

WFS_BASE = 'https://ows.emodnet-humanactivities.eu/wfs'
LAYERS = [
    {'typeName': 'emodnet:heritageshipwrecks', 'kind': 'wreck'},
    {'typeName': 'emodnet:unescowhl',          'kind': 'site'},
]
# CountDefault on the server is 1,000,000, so one high-count request returns each
# layer in full — no paging needed.
COUNT = 100000


def fetch_layer(type_name):
    params = urllib.parse.urlencode({
        'service': 'WFS',
        'version': '2.0.0',
        'request': 'GetFeature',
        'typeNames': type_name,
        'outputFormat': 'application/json',
        'count': str(COUNT),
    })
    url = f'{WFS_BASE}?{params}'
    print(f'  GET {type_name} …')
    req = urllib.request.Request(url, headers={'User-Agent': 'BigaOS-heritage-prep'})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    feats = data.get('features', []) or []
    print(f'    {len(feats)} features')
    return feats


# EMODnet stuffs these placeholders into "no data" cells; treat them as absent
# (else most wrecks would show an "n/a" period/category and a broken "n/a" link).
# Keep in sync with server/src/services/heritage.service.ts.
PLACEHOLDERS = {'', 'null', '<null>', 'n/a', 'na', 'unknown', 'none', '-'}

# Pure-filler descriptions (>1,500 wrecks carry the first one) — drop them.
NO_DESC = {
    'We regret that we are unable to supply descriptive details for this record at present',
    'We regret that we are unable to supply descriptive details for this record at present.',
}

# EN->DE (and future langs) baked into the pack so the chart shows German offline.
# Built by heritage-translate.py (extract -> agents -> merge); structured
# { country:{}, category:{}, period:{}, name:{}, desc:{} } in
# scripts/heritage-translations/de.json. Absent file => EN-only.
TRANSLATIONS = {}
TRANSLATE_FIELDS = ('country', 'category', 'period', 'name', 'desc')


def load_translations():
    global TRANSLATIONS
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'heritage-translations', 'de.json')
    if os.path.exists(path):
        TRANSLATIONS = json.load(open(path, encoding='utf-8'))
        print(f'  loaded {sum(len(v) for v in TRANSLATIONS.values())} DE translations')
    else:
        print('  no translation file — English-only pack')


def clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return None if s.lower() in PLACEHOLDERS else s


def clean_year(v):
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    return n if n != 0 else None


def clean_depth(v):
    # least_depth = 0 is EMODnet's "unknown" placeholder (>half the wrecks); drop
    # it rather than show a misleading "0.0 m".
    try:
        n = round(float(v), 1)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def round5(n):
    return round(float(n), 5)


def normalize(feat, kind):
    geom = feat.get('geometry') or {}
    coords = geom.get('coordinates')
    if geom.get('type') != 'Point' or not coords or len(coords) < 2:
        return None
    try:
        lon, lat = float(coords[0]), float(coords[1])
    except (TypeError, ValueError):
        return None
    p = feat.get('properties') or {}

    if kind == 'wreck':
        props = {
            'kind': 'wreck',
            'name': clean_str(p.get('name')),
            'country': clean_str(p.get('country')),
            'depth': clean_depth(p.get('least_depth')) or clean_depth(p.get('max_depth')),
            'year': clean_year(p.get('sink_yr')),
            'period': clean_str(p.get('period')) or clean_str(p.get('dating')),
            'category': clean_str(p.get('obj_type')),
            'desc': clean_str(p.get('obj_desc')) or clean_str(p.get('ship_char')),
            'url': clean_str(p.get('website1')) or clean_str(p.get('website2')) or clean_str(p.get('reference')),
        }
    else:
        sid = clean_str(p.get('source_id'))
        props = {
            'kind': 'site',
            'name': clean_str(p.get('name')),
            'country': clean_str(p.get('country')),
            'year': clean_year(p.get('inscriptio')),
            'category': clean_str(p.get('category')),
            'desc': clean_str(p.get('descriptio')),
            'url': f'https://whc.unesco.org/en/list/{sid}' if sid else None,
        }

    props = {k: v for k, v in props.items() if v is not None}
    if props.get('desc') in NO_DESC:
        props.pop('desc')
    # Bake German variants (<field>_de) where known; the client picks them when
    # the app language is German, else falls back to the English value.
    for field in TRANSLATE_FIELDS:
        val = props.get(field)
        if val is not None:
            de = TRANSLATIONS.get(field, {}).get(val)
            if de:
                props[field + '_de'] = de
    return {
        'type': 'Feature',
        'properties': props,
        'geometry': {'type': 'Point', 'coordinates': [round5(lon), round5(lat)]},
    }


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join('tmp', 'heritage')
    pack_dir = os.path.join(out_dir, 'emodnet')   # tar root (stripped on extract)
    os.makedirs(pack_dir, exist_ok=True)

    load_translations()

    features = []
    for layer in LAYERS:
        for f in fetch_layer(layer['typeName']):
            n = normalize(f, layer['kind'])
            if n:
                features.append(n)

    if not features:
        print('No features fetched — aborting'); sys.exit(1)

    wrecks = sum(1 for f in features if f['properties']['kind'] == 'wreck')
    sites = len(features) - wrecks

    geojson_path = os.path.join(pack_dir, 'heritage.geojson')
    with open(geojson_path, 'w', encoding='utf-8') as fh:
        json.dump({'type': 'FeatureCollection', 'features': features}, fh,
                  ensure_ascii=False, separators=(',', ':'))
    gj_mb = os.path.getsize(geojson_path) / (1024 * 1024)
    print(f'WROTE {geojson_path}: {len(features)} features ({wrecks} wrecks, {sites} sites), {gj_mb:.2f} MB')

    tar_path = os.path.join(out_dir, 'heritage-emodnet.tar.gz')
    with tarfile.open(tar_path, 'w:gz') as tf:
        tf.add(geojson_path, arcname='emodnet/heritage.geojson')
    tar_mb = os.path.getsize(tar_path) / (1024 * 1024)
    print(f'PACKAGED {tar_path}: {tar_mb:.2f} MB')
    print('Publish: gh release create heritage-data-v1 -R BigaOSTeam/BigaOS-data '
          f'{tar_path}')


if __name__ == '__main__':
    main()
