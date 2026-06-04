#!/usr/bin/env python
"""
==============================================================================
 BigaOS depth data · STEP 2 of 2 — sort tiles into named release packs
==============================================================================

Takes the flat EMODnet_Depth_*.tif / GEBCO_Depth_*.tif tiles produced by
STEP 1 (prepare-depth-tiles.py) and copies them into per-pack folders
(<stage>/<pack>/), each ready to tar into a depth-data release asset.

  emodnet : European sea-basin packs (Baltic, North Sea, Iberia, Mediterranean,
            Black Sea). Tiles outside every basin box are DROPPED — the GEBCO
            global packs cover open ocean / Arctic / Sahara.
  gebco   : global longitude-band packs (Americas-Pacific, Americas-Atlantic,
            Europe-Africa, Asia-Oceania). The bands tile the whole globe, so
            every sea tile lands in exactly one.

Tiles are assigned to the FIRST matching box by SW corner; boxes are
[lon_min, lon_max) × [lat_min, lat_max) in degrees. Re-running clears the
target pack folders first.

Full runbook: scripts/README.md.

Usage (conda 'geo' env not required — pure stdlib):
  python distribute-depth-packs.py emodnet <tiles_dir> <stage_dir>
  python distribute-depth-packs.py gebco   <tiles_dir> <stage_dir>
"""

import os
import sys
import glob
import re
import shutil

# Ordered (first match wins). Box = (lon_min, lon_max, lat_min, lat_max).
REGION_SETS = {
    'emodnet': {
        'prefix': 'emodnet',
        'drop_unmatched': True,  # open ocean / Arctic / Sahara → GEBCO covers it
        'regions': [
            ('black-sea',     (26, 43, 40, 48)),   # Black Sea + Sea of Azov
            ('baltic',        (9, 32, 53, 67)),    # Baltic + Gulf of Bothnia/Finland
            ('north-sea',     (-14, 13, 48, 67)),  # North Sea, British Isles, Channel, W/S Norway
            ('iberia',        (-14, -1, 35, 48)),  # Biscay, Atlantic Iberia, Gulf of Cádiz
            ('mediterranean', (-7, 37, 30, 46)),   # whole Mediterranean
        ],
    },
    'gebco': {
        'prefix': 'gebco',
        'drop_unmatched': False,  # longitude bands tile the globe; nothing dropped
        'regions': [
            ('americas-pacific',  (-180, -100, -90, 90)),
            ('americas-atlantic', (-100, -30, -90, 90)),
            ('europe-africa',     (-30, 60, -90, 90)),
            ('asia-oceania',      (60, 180, -90, 90)),
        ],
    },
}

# Matches the SW corner in a tile filename, e.g. ..._N54E012.tif / ..._S30W010.tif
NAME_RE = re.compile(r'_([NS])(\d+)([EW])(\d+)')


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in REGION_SETS:
        print(__doc__)
        sys.exit(1)
    mode, src, stage = sys.argv[1], sys.argv[2], sys.argv[3]
    cfg = REGION_SETS[mode]
    prefix, regions, drop = cfg['prefix'], cfg['regions'], cfg['drop_unmatched']

    # Clear any prior distribution so re-runs don't accumulate stale tiles.
    for name, _ in regions:
        d = os.path.join(stage, f'{prefix}-{name}')
        if os.path.isdir(d):
            shutil.rmtree(d)

    counts, dropped = {}, 0
    for f in glob.glob(os.path.join(src, '*.tif')):
        m = NAME_RE.search(os.path.basename(f))
        if not m:
            continue
        lat = int(m.group(2)) * (-1 if m.group(1) == 'S' else 1)
        lon = int(m.group(4)) * (-1 if m.group(3) == 'W' else 1)
        match = next(
            (n for n, (lo0, lo1, la0, la1) in regions if lo0 <= lon < lo1 and la0 <= lat < la1),
            None,
        )
        if match is None:
            dropped += 1
            continue
        d = os.path.join(stage, f'{prefix}-{match}')
        os.makedirs(d, exist_ok=True)
        shutil.copy2(f, d)
        counts[match] = counts.get(match, 0) + 1

    for n in sorted(counts):
        print(f'{prefix}-{n}: {counts[n]} tiles')
    tail = f', {dropped} dropped (covered by GEBCO)' if drop else ''
    print(f'TOTAL {sum(counts.values())} tiles{tail}')


if __name__ == '__main__':
    main()
