/**
 * Pure-Node geospatial raster helpers for the in-app regional importer.
 *
 * No GDAL: polygon parsing, even-odd rasterisation, a chamfer distance
 * transform, and a small self-described tile format (`.lakedepth`) that the
 * depth engine reads back. Used by lake-depth.service.ts to model lake
 * bathymetry from an OSM outline + a known maximum depth — the same recipe as
 * scripts/prototype-lake-depth.py, ported to TypeScript.
 *
 * Coordinates are [lon, lat] in EPSG:4326 throughout. Depth is stored as
 * elevation (sea floor NEGATIVE), Int16, with NODATA outside the water — the
 * contract depth-tile.service.ts expects.
 */
import * as fs from 'fs';

export type Ring = Array<[number, number]>; // [lon, lat][]
export interface Bbox { west: number; south: number; east: number; north: number; }

export interface DepthRaster {
  band: Int16Array; // row-major, north->south rows, west->east cols
  width: number;
  height: number;
  bbox: Bbox;
  nodata: number;
  cellDeg: number; // pixel size in degrees (lon)
}

export const NODATA = 32767;
const MAGIC = 'LKD1';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Absolute polygon-ring area via the shoelace formula (deg^2 — only used for ranking). */
export function ringAreaAbs(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a) / 2;
}

/** Even-odd point-in-ring test. */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Pull every outer ring out of an arbitrary GeoJSON value (Feature /
 * FeatureCollection / GeometryCollection / Polygon / MultiPolygon).
 */
export function extractOuterRings(geojson: any): Ring[] {
  const geoms: any[] = [];
  const t = geojson?.type;
  if (t === 'FeatureCollection') {
    for (const f of geojson.features ?? []) if (f?.geometry) geoms.push(f.geometry);
  } else if (t === 'Feature') {
    if (geojson.geometry) geoms.push(geojson.geometry);
  } else if (t === 'GeometryCollection') {
    geoms.push(...(geojson.geometries ?? []));
  } else if (geojson) {
    geoms.push(geojson);
  }

  const rings: Ring[] = [];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates[0]) {
      rings.push(g.coordinates[0] as Ring);
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      for (const poly of g.coordinates) if (poly?.[0]) rings.push(poly[0] as Ring);
    }
  }
  return rings.filter((r) => r.length >= 4 && ringAreaAbs(r) > 0);
}

/**
 * Reduce the outline to "water rings": the largest ring is the lake outer;
 * any smaller ring whose interior point lies inside the lake is an island and
 * is returned as a hole. Even-odd rasterisation of [outer, ...holes] then
 * yields water = inside (islands punched out) without a polygon-difference lib.
 *
 * polygons.osm.fr flattens island inner-rings into separate outer polygons, so
 * this re-cuts them as holes (the bug the prototype hit and fixed).
 */
export function lakeWaterRings(rings: Ring[]): { outer: Ring; holes: Ring[] } {
  if (rings.length === 0) throw new Error('no polygon rings in outline');
  const sorted = [...rings].sort((a, b) => ringAreaAbs(b) - ringAreaAbs(a));
  const outer = sorted[0];
  const holes: Ring[] = [];
  for (const r of sorted.slice(1)) {
    const [plon, plat] = ringRepresentativePoint(r);
    if (pointInRing(plon, plat, outer)) holes.push(r);
  }
  return { outer, holes };
}

/** A point guaranteed to lie inside a (convex-ish) ring: its centroid, else vertex avg. */
function ringRepresentativePoint(ring: Ring): [number, number] {
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return [x / ring.length, y / ring.length];
}

export function ringsBbox(rings: Ring[]): Bbox {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const r of rings) for (const [lon, lat] of r) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return { west, south, east, north };
}

// ---------------------------------------------------------------------------
// Rasterisation + distance transform
// ---------------------------------------------------------------------------

/**
 * Even-odd scanline fill of [outer, ...holes] into a water mask (1 = water).
 * Pixels are cell-centred; row 0 is the northern edge.
 */
export function rasterizeWater(
  outer: Ring, holes: Ring[], bbox: Bbox, width: number, height: number,
): Uint8Array {
  const rings = [outer, ...holes];
  const mask = new Uint8Array(width * height);
  const stepX = (bbox.east - bbox.west) / width;
  const stepY = (bbox.north - bbox.south) / height;

  for (let y = 0; y < height; y++) {
    const lat = bbox.north - (y + 0.5) * stepY;
    // collect x-intersections of all ring edges with this scanline
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][1], yj = ring[j][1];
        if ((yi > lat) !== (yj > lat)) {
          const xi = ring[i][0], xj = ring[j][0];
          xs.push(xi + ((lat - yi) / (yj - yi)) * (xj - xi));
        }
      }
    }
    xs.sort((a, b) => a - b);
    // fill spans between pairs (even-odd)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let px0 = Math.ceil((xs[k] - bbox.west) / stepX - 0.5);
      let px1 = Math.floor((xs[k + 1] - bbox.west) / stepX - 0.5);
      if (px0 < 0) px0 = 0;
      if (px1 >= width) px1 = width - 1;
      for (let px = px0; px <= px1; px++) mask[y * width + px] = 1;
    }
  }
  return mask;
}

/**
 * Two-pass chamfer distance transform: distance (in cells) from each water
 * pixel to the nearest non-water pixel (the shore). Background = 0.
 */
export function distanceToShore(mask: Uint8Array, width: number, height: number): Float32Array {
  const D = 1, Dd = Math.SQRT2;
  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? INF : 0;

  const at = (x: number, y: number) => dist[y * width + x];
  // forward pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let m = dist[idx];
      if (x > 0) m = Math.min(m, at(x - 1, y) + D);
      if (y > 0) m = Math.min(m, at(x, y - 1) + D);
      if (x > 0 && y > 0) m = Math.min(m, at(x - 1, y - 1) + Dd);
      if (x < width - 1 && y > 0) m = Math.min(m, at(x + 1, y - 1) + Dd);
      dist[idx] = m;
    }
  }
  // backward pass
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let m = dist[idx];
      if (x < width - 1) m = Math.min(m, at(x + 1, y) + D);
      if (y < height - 1) m = Math.min(m, at(x, y + 1) + D);
      if (x < width - 1 && y < height - 1) m = Math.min(m, at(x + 1, y + 1) + Dd);
      if (x > 0 && y < height - 1) m = Math.min(m, at(x - 1, y + 1) + Dd);
      dist[idx] = m;
    }
  }
  return dist;
}

/**
 * Model bathymetry from a water mask + distance field: depth grows from the
 * shore toward the deepest point, scaled to maxDepth. Stored as negative
 * elevation (Int16), NODATA outside the water.
 *   depth = maxDepth * (dist / maxDist)^profile     (profile 1 = linear)
 */
export function modelDepth(
  mask: Uint8Array, dist: Float32Array, maxDepth: number, profile: number,
): Int16Array {
  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) if (mask[i] && dist[i] > maxDist) maxDist = dist[i];
  if (maxDist <= 0) maxDist = 1;

  const band = new Int16Array(mask.length);
  for (let i = 0; i < band.length; i++) {
    if (!mask[i]) { band[i] = NODATA; continue; }
    const norm = dist[i] / maxDist;
    const depth = maxDepth * Math.pow(norm, profile);
    band[i] = -Math.round(depth); // sea floor negative
  }
  return band;
}

// ---------------------------------------------------------------------------
// .lakedepth sidecar format (geotiff.js can't round-trip Int16 reliably)
//   [ 'LKD1' | uint32 headerLen | JSON header | Int16LE band ]
// ---------------------------------------------------------------------------

export function writeLakeDepth(filePath: string, r: DepthRaster): void {
  const header = JSON.stringify({
    width: r.width, height: r.height,
    west: r.bbox.west, south: r.bbox.south, east: r.bbox.east, north: r.bbox.north,
    nodata: r.nodata, cellDeg: r.cellDeg,
  });
  const headerBuf = Buffer.from(header, 'utf8');
  const head = Buffer.alloc(8);
  head.write(MAGIC, 0, 'ascii');
  head.writeUInt32LE(headerBuf.length, 4);
  const bandBuf = Buffer.from(r.band.buffer, r.band.byteOffset, r.band.byteLength);
  fs.writeFileSync(filePath, Buffer.concat([head, headerBuf, bandBuf]));
}

export function readLakeDepth(filePath: string): DepthRaster {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== MAGIC) throw new Error(`bad .lakedepth magic in ${filePath}`);
  const headerLen = buf.readUInt32LE(4);
  const header = JSON.parse(buf.toString('utf8', 8, 8 + headerLen));
  const bandStart = 8 + headerLen;
  const count = header.width * header.height;
  // copy out so the slice is aligned + owns its memory
  const band = new Int16Array(count);
  for (let i = 0; i < count; i++) band[i] = buf.readInt16LE(bandStart + i * 2);
  return {
    band, width: header.width, height: header.height,
    bbox: { west: header.west, south: header.south, east: header.east, north: header.north },
    nodata: header.nodata, cellDeg: header.cellDeg,
  };
}

/** Read just the header (bounds/dims/cell) without the band — for indexing. */
export function readLakeDepthHeader(
  filePath: string,
): { width: number; height: number; bbox: Bbox; nodata: number; cellDeg: number } {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    if (head.toString('ascii', 0, 4) !== MAGIC) throw new Error(`bad .lakedepth magic in ${filePath}`);
    const headerLen = head.readUInt32LE(4);
    const hbuf = Buffer.alloc(headerLen);
    fs.readSync(fd, hbuf, 0, headerLen, 8);
    const h = JSON.parse(hbuf.toString('utf8'));
    return {
      width: h.width, height: h.height, nodata: h.nodata, cellDeg: h.cellDeg,
      bbox: { west: h.west, south: h.south, east: h.east, north: h.north },
    };
  } finally {
    fs.closeSync(fd);
  }
}
