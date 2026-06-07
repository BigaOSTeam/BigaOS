#!/usr/bin/env python
"""
==============================================================================
 BigaOS · PROTOTYPE — modeled lake-depth tile for the inbuilt depth engine
==============================================================================

Proves the regional-importer concept: take an external lake (here Chiemsee) and
feed REAL, queryable depth into BigaOS's existing depth engine with NO app code
changes — by producing exactly the tile contract that depth-tile.service.ts
reads (EPSG:4326, Int16, sea floor negative, nodata 32767, named by SW corner).

Depth values here are MODELED, not measured: depth = Dmax * (d/dmax)^profile
where d = distance-to-shore from the OSM lake outline. This reproduces GLOBathy's
published "outline + max-depth" approach (a smooth bowl). It is the seed of the
importer's "modeled depth from outline" path; the identical tile is later swapped
for real GLOBathy raster or the LfU survey via the same conversion.

NOT FOR NAVIGATION. Run inside the conda 'geo' env (GDAL + numpy):
  conda run -n geo python scripts/prototype-lake-depth.py
"""
import json
import os
import urllib.request
import shutil
import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()

# --- Chiemsee parameters -----------------------------------------------------
DMAX = 73.0              # m, published max depth
CELL_DEG = 1.0 / 2000.0  # ~55 m grid (finer than the 115 m EMODnet sampling cell)
PROFILE = 1.0            # 1 = linear distance-to-shore (shallow shelf -> deep centre)
NODATA = 32767
REL_ID = 32246           # OSM relation: Chiemsee (natural=water, water=lake)
# SW corner of the EMODnet 2-deg grid cell containing the lake (47.86N,12.45E):
#   floor(12.45/2)*2 = 12 ; floor(47.86/2)*2 = 46  -> N46 E012
OUT_NAME = "EMODnet_Depth_N46E012.tif"

WORK = r"C:\Users\Johan\BigaOS\tmp\chiemsee"
DEST = r"C:\Users\Johan\BigaOS\server\src\data\depth-data\chiemsee"
UA = "BigaOS-prototype/1.0 (lake-depth-importer; contact goetz@mobimedia.de)"


def fetch_outline(path):
    """Stitched GeoJSON (lake outer ring + island holes) from polygons.osm.fr."""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print(f"  outline cached ({os.path.getsize(path)} bytes)")
        return
    url = f"https://polygons.openstreetmap.fr/get_geojson.py?id={REL_ID}&params=0"
    print(f"  fetching {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=90).read()
    with open(path, "wb") as f:
        f.write(data)
    print(f"  saved {len(data)} bytes")


def _all_polygons(gj):
    """Flatten the GeoJSON to a flat list of POLYGON geometries."""
    t = gj.get("type")
    if t == "FeatureCollection":
        raw = [ft["geometry"] for ft in gj["features"] if ft.get("geometry")]
    elif t == "Feature":
        raw = [gj["geometry"]]
    elif t == "GeometryCollection":
        raw = list(gj["geometries"])
    else:
        raw = [gj]

    polys = []
    for g in raw:
        og = ogr.CreateGeometryFromJson(json.dumps(g))
        if og is None:
            continue
        name = og.GetGeometryName()
        if name == "MULTIPOLYGON":
            for k in range(og.GetGeometryCount()):
                polys.append(og.GetGeometryRef(k).Clone())
        elif name == "POLYGON":
            polys.append(og.Clone())
    return [p for p in polys if p.GetArea() > 0]


def load_lake_water(path):
    """Lake water = largest polygon MINUS the smaller polygons sitting inside it.

    polygons.osm.fr flattens island inner-rings into separate outer polygons, so
    we re-cut them as holes; otherwise islands render as (deep) water.
    """
    with open(path, "r", encoding="utf-8") as f:
        gj = json.load(f)

    polys = _all_polygons(gj)
    if not polys:
        raise SystemExit("No polygonal geometry found in outline")
    polys.sort(key=lambda g: g.GetArea(), reverse=True)

    lake = polys[0]
    islands = [p for p in polys[1:] if lake.Contains(p.PointOnSurface())]
    water = lake
    for isl in islands:
        water = water.Difference(isl)
    print(f"   lake part + {len(islands)} island(s) subtracted")
    return water


def main():
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(DEST, exist_ok=True)
    gj_path = os.path.join(WORK, "chiemsee_outline.geojson")

    print("1. outline")
    fetch_outline(gj_path)
    geom = load_lake_water(gj_path)

    minx, maxx, miny, maxy = geom.GetEnvelope()
    pad = 3 * CELL_DEG
    minx, miny = minx - pad, miny - pad
    maxx, maxy = maxx + pad, maxy + pad
    width = int(round((maxx - minx) / CELL_DEG))
    height = int(round((maxy - miny) / CELL_DEG))
    gt = (minx, CELL_DEG, 0, maxy, 0, -CELL_DEG)
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    wkt = srs.ExportToWkt()
    print(f"   extent lon[{minx:.4f},{maxx:.4f}] lat[{miny:.4f},{maxy:.4f}]  grid {width}x{height}")

    print("2. rasterize lake mask (islands become holes -> shore)")
    mem = gdal.GetDriverByName("MEM")
    mask = mem.Create("", width, height, 1, gdal.GDT_Byte)
    mask.SetGeoTransform(gt)
    mask.SetProjection(wkt)
    vds = ogr.GetDriverByName("Memory").CreateDataSource("m")
    lyr = vds.CreateLayer("l", srs, ogr.wkbMultiPolygon)
    feat = ogr.Feature(lyr.GetLayerDefn())
    feat.SetGeometry(geom)
    lyr.CreateFeature(feat)
    gdal.RasterizeLayer(mask, [1], lyr, burn_values=[1])

    print("3. distance-to-shore (gdal ComputeProximity)")
    prox = mem.Create("", width, height, 1, gdal.GDT_Float32)
    prox.SetGeoTransform(gt)
    prox.SetProjection(wkt)
    gdal.ComputeProximity(mask.GetRasterBand(1), prox.GetRasterBand(1),
                          ["VALUES=0", "DISTUNITS=PIXEL"])

    m = mask.GetRasterBand(1).ReadAsArray()
    d = prox.GetRasterBand(1).ReadAsArray()
    inside = m == 1
    n_inside = int(inside.sum())
    if n_inside == 0:
        raise SystemExit("Lake mask is empty")
    dmax_px = float(d[inside].max())

    print("4. model depth -> negative elevation, Int16")
    norm = np.zeros(d.shape, dtype=np.float64)
    norm[inside] = d[inside] / dmax_px
    depth = DMAX * np.power(norm, PROFILE)         # 0 at shore .. DMAX at centre
    elev = np.full(d.shape, NODATA, dtype=np.int16)
    elev[inside] = np.round(-depth[inside]).astype(np.int16)  # sea floor negative

    out_path = os.path.join(WORK, OUT_NAME)
    out = gdal.GetDriverByName("GTiff").Create(
        out_path, width, height, 1, gdal.GDT_Int16,
        options=["COMPRESS=DEFLATE", "PREDICTOR=2", "TILED=YES"])
    out.SetGeoTransform(gt)
    out.SetProjection(wkt)
    band = out.GetRasterBand(1)
    band.SetNoDataValue(NODATA)
    band.WriteArray(elev)
    out.FlushCache()
    out = None

    dest_path = os.path.join(DEST, OUT_NAME)
    shutil.copyfile(out_path, dest_path)

    deepest = int(elev[inside].min())
    print(f"   wrote {out_path}")
    print(f"   copied -> {dest_path}")
    print(f"   lake cells={n_inside}  deepest={deepest} m  (target -{DMAX:.0f})")
    print("DONE")


if __name__ == "__main__":
    main()
