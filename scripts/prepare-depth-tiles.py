#!/usr/bin/env python
"""
==============================================================================
 BigaOS depth data · STEP 1 of 2 — tile raw bathymetry into aligned GeoTIFFs
==============================================================================

Turns raw EMODnet DTM NetCDF tiles (or the GEBCO global COG) into the small,
aligned, Int16 GeoTIFF tiles the BigaOS server reads at runtime
(see server/src/services/depth-tile.service.ts). Output tiles are:
  - EPSG:4326, Int16 (metres; sea floor negative), nodata 32767
  - cut on a global grid aligned to TILE_DEG, named by SW corner
    e.g. EMODnet_Depth_N54E012.tif / GEBCO_Depth_N40E000.tif
  - DEFLATE + predictor + internally tiled (fast windowed reads)
Empty (all-land / no-sea) cells are skipped.

Next: STEP 2 = distribute-depth-packs.py (sorts these tiles into release packs).
Full runbook: scripts/README.md.

Usage (run inside the conda 'geo' env, which has GDAL + netCDF/HDF5 drivers):
  conda run -n geo python prepare-depth-tiles.py emodnet <src_dir> <out_dir>
  conda run -n geo python prepare-depth-tiles.py gebco   <src_dir> <out_dir>

  emodnet: <src_dir> holds *.nc.zip and/or *.nc (uses the 'elevation' subdataset)
  gebco:   <src_dir> holds the global *.tif (single Int16 elevation band)
"""

import os
import sys
import glob
import math
import zipfile
from osgeo import gdal

gdal.UseExceptions()

# Per-source layout. cpd = grid cells per degree (sets output resolution).
CONFIG = {
    'emodnet': {'prefix': 'EMODnet_Depth', 'tile_deg': 2,  'cpd': 960},  # ~115 m
    'gebco':   {'prefix': 'GEBCO_Depth',   'tile_deg': 10, 'cpd': 240},  # ~450 m
}
NODATA = 32767
CREATE_OPTS = ['COMPRESS=DEFLATE', 'PREDICTOR=2', 'TILED=YES']


def sw_name(prefix, lat, lon):
    ns, lat_v = ('N', lat) if lat >= 0 else ('S', -lat)
    ew, lon_v = ('E', lon) if lon >= 0 else ('W', -lon)
    return f'{prefix}_{ns}{int(round(lat_v)):02d}{ew}{int(round(lon_v)):03d}.tif'


def normalize_sources(mode, src_dir, work):
    """Return a list of EPSG:4326 Int16 GeoTIFFs to mosaic."""
    res = 1.0 / CONFIG[mode]['cpd']
    out = []
    if mode == 'gebco':
        # GEBCO global COG is already EPSG:4326 Int16 elevation — use as-is.
        return sorted(glob.glob(os.path.join(src_dir, '*.tif')))

    # emodnet: unzip any *.nc.zip, then warp each .nc 'elevation' subdataset.
    for z in glob.glob(os.path.join(src_dir, '*.nc.zip')):
        try:
            with zipfile.ZipFile(z) as zf:
                for n in zf.namelist():
                    if n.endswith('.nc'):
                        zf.extract(n, work)
        except zipfile.BadZipFile:
            print(f'  skip {os.path.basename(z)} (incomplete download)')
    ncs = sorted(glob.glob(os.path.join(src_dir, '*.nc')) +
                 glob.glob(os.path.join(work, '**', '*.nc'), recursive=True))
    for nc in ncs:
        sub = f'NETCDF:"{nc}":elevation'
        norm = os.path.join(work, os.path.basename(nc) + '.norm.tif')
        print(f'  normalize {os.path.basename(nc)}')
        gdal.Warp(norm, sub, srcSRS='EPSG:4326', dstSRS='EPSG:4326',
                  outputType=gdal.GDT_Int16, srcNodata=float('nan'), dstNodata=NODATA,
                  xRes=res, yRes=res, resampleAlg='near', creationOptions=CREATE_OPTS)
        out.append(norm)
    return out


def main():
    mode, src_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    cfg = CONFIG[mode]
    tile_deg, res = cfg['tile_deg'], 1.0 / cfg['cpd']
    os.makedirs(out_dir, exist_ok=True)
    work = os.path.join(out_dir, '_work')
    os.makedirs(work, exist_ok=True)

    sources = normalize_sources(mode, src_dir, work)
    if not sources:
        print('No sources found'); sys.exit(1)
    print(f'{len(sources)} source raster(s)')

    vrt_path = os.path.join(work, 'mosaic.vrt')
    gdal.BuildVRT(vrt_path, sources)
    ds = gdal.Open(vrt_path)
    gt = ds.GetGeoTransform()
    minx, maxy = gt[0], gt[3]
    maxx, miny = minx + ds.RasterXSize * gt[1], maxy + ds.RasterYSize * gt[5]
    ds = None
    print(f'mosaic extent lon[{minx:.3f},{maxx:.3f}] lat[{miny:.3f},{maxy:.3f}]')

    def floor_to(v):
        return math.floor(v / tile_deg) * tile_deg

    kept = 0
    lon = floor_to(minx)
    while lon < maxx:
        lat = floor_to(miny)
        while lat < maxy:
            name = sw_name(cfg['prefix'], lat, lon)
            outp = os.path.join(out_dir, name)
            tmp = outp + '.tmp.tif'
            # Inherit the source nodata (EMODnet 32767 / GEBCO -32767) and remap
            # it to our uniform output nodata.
            gdal.Warp(tmp, vrt_path,
                      outputBounds=(lon, lat, lon + tile_deg, lat + tile_deg),
                      xRes=res, yRes=res, resampleAlg='near',
                      outputType=gdal.GDT_Int16, dstNodata=NODATA,
                      creationOptions=CREATE_OPTS)
            # Keep only cells that actually contain sea (a depth < 0). Drops
            # all-land / all-nodata cells (GEBCO carries positive land elevation
            # everywhere, so "has any data" is not enough).
            keep = False
            t = gdal.Open(tmp)
            try:
                mn, _mx = t.GetRasterBand(1).ComputeRasterMinMax(False)
                keep = mn is not None and mn < 0
            except Exception:
                keep = False
            t = None
            if keep:
                os.replace(tmp, outp); kept += 1
            else:
                os.remove(tmp)
            lat += tile_deg
        lon += tile_deg

    print(f'WROTE {kept} tiles to {out_dir}')


if __name__ == '__main__':
    main()
