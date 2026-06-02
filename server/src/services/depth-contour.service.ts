/**
 * Depth Contour Service
 *
 * Generates vector depth contours (isobaths) on demand from the EMODnet
 * Bathymetry DTM (~115 m, all European seas) via its WCS GetCoverage endpoint.
 *
 * Flow: fetch a depth-value GeoTIFF for the requested bbox → parse the grid →
 * run marching-squares (d3-contour) at a set of depth thresholds → emit GeoJSON
 * LineString isobaths tagged with depth (metres). The client renders these as
 * translucent labelled lines over the base map.
 *
 * Online only — nothing is cached to disk; results are held in a small
 * in-memory LRU. Outside EMODnet coverage the WCS returns an error and we
 * yield an empty FeatureCollection.
 *
 * Data: EMODnet Bathymetry (CC BY 4.0). NOT FOR NAVIGATION.
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as GeoTIFF from 'geotiff';
import { contours as d3contours } from 'd3-contour';
import { assertSafeOutboundUrl } from '../utils/url-safety';

const WCS_BASE = 'https://ows.emodnet-bathymetry.eu/wcs';
const COVERAGE_ID = 'emodnet__mean'; // raw mean-depth grid (elevation, m; sea floor < 0)

// Default isobath depths in metres. Coastal-friendly near the surface, sparser
// in deep water. Contours are drawn at the negative of each (elevation grid).
const DEFAULT_DEPTHS = [2, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000];

// Cap the grid we contour over so CPU + payload stay bounded regardless of bbox.
const MAX_GRID_DIM = 384;

// Contours are a zoomed-in feature; refuse spans larger than this (degrees).
const MAX_SPAN_DEG = 3;

// EMODnet elevation outside this range is treated as nodata/land.
const MIN_VALID_M = -12000;
const MAX_VALID_M = 9000;
// Sentinel placed in nodata/land cells: a high "elevation" so no submarine
// contour threads through it.
const LAND_SENTINEL = 1e6;

// EMODnet WCS cold-fetches a fresh region slowly (seen up to ~2 min), so give
// it a long timeout — the result is then cached on disk forever.
const WCS_TIMEOUT_MS = 150000;

// Snap requested bboxes outward to this grid so small pans / zoom jitter reuse
// the same cache entry (and the same warmed EMODnet region).
const SNAP_DEG = 0.25;

// Bump to invalidate all cached contours (e.g. if the coverage, depth set, or
// post-processing like smoothing changes).
const CACHE_VERSION = 'v5';

// Chaikin corner-cutting passes applied to each contour ring to round off the
// "polygony" look from the coarse grid. Each pass ~doubles vertex count; 3
// passes converges close to a smooth quadratic B-spline. (Payload is gzipped.)
const SMOOTH_ITERATIONS = 3;

// Douglas–Peucker tolerance (degrees, ~6 m) — prunes the near-collinear points
// Chaikin leaves on straight runs without visibly changing the curves.
const SIMPLIFY_EPS_DEG = 0.00006;

/** Perpendicular distance from p to the segment a→b (degree units). */
function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  const ex = p[0] - cx;
  const ey = p[1] - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Mark vertices to keep between indices [s,e] (iterative Douglas–Peucker). */
function dpRange(points: [number, number][], s: number, e: number, eps: number, keep: boolean[]): void {
  const stack: [number, number][] = [[s, e]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(points[i], points[a], points[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx !== -1) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
}

/**
 * Douglas–Peucker line simplification. Handles closed rings (uses the farthest
 * vertex from the start as a second anchor so the degenerate start==end segment
 * doesn't break it).
 */
function simplify(points: [number, number][], eps: number): [number, number][] {
  const n = points.length;
  if (n < 4) return points;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const closed = points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1];
  if (closed) {
    let fi = 0;
    let fd = -1;
    for (let i = 1; i < n - 1; i++) {
      const dx = points[i][0] - points[0][0];
      const dy = points[i][1] - points[0][1];
      const d = dx * dx + dy * dy;
      if (d > fd) { fd = d; fi = i; }
    }
    keep[fi] = true;
    dpRange(points, 0, fi, eps, keep);
    dpRange(points, fi, n - 1, eps, keep);
  } else {
    dpRange(points, 0, n - 1, eps, keep);
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Chaikin corner-cutting smoothing. Rounds a polyline by replacing each vertex
 * with two points 1/4 and 3/4 along its adjacent edges. Closed rings (first ==
 * last point) stay closed; open lines keep their endpoints fixed.
 */
function chaikin(points: [number, number][], iterations: number): [number, number][] {
  let pts = points;
  const isClosed =
    pts.length > 3 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1];

  for (let it = 0; it < iterations; it++) {
    const src = isClosed ? pts.slice(0, -1) : pts;
    const n = src.length;
    if (n < 3) break;
    const out: [number, number][] = [];
    if (!isClosed) out.push(src[0]);
    const limit = isClosed ? n : n - 1;
    for (let i = 0; i < limit; i++) {
      const a = src[i];
      const b = src[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (isClosed) out.push(out[0]);
    else out.push(src[n - 1]);
    pts = out;
  }
  return pts;
}

export interface DepthBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: { depth: number };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface DepthContourCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

interface CacheEntry {
  at: number;
  data: DepthContourCollection;
}

const EMPTY: DepthContourCollection = { type: 'FeatureCollection', features: [] };

class DepthContourService {
  // Hot in-memory cache (this process).
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE = 60;
  // De-dupe concurrent fetches for the same area so a 2-min cold fetch isn't
  // run N times in parallel.
  private inflight = new Map<string, Promise<DepthContourCollection>>();
  // Persistent on-disk cache — depth data is static, so a cold fetch is paid
  // at most once ever (survives restarts).
  private readonly diskDir: string;

  constructor() {
    this.diskDir = path.join(__dirname, '..', 'data', 'depth-contours');
    try {
      if (!fs.existsSync(this.diskDir)) fs.mkdirSync(this.diskDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create depth-contour cache dir:', err);
    }
  }

  /**
   * Get depth contours (GeoJSON isobaths) for a bbox. Returns an empty
   * collection for out-of-coverage areas, oversized spans, or upstream errors.
   */
  async getContours(reqBbox: DepthBbox, depths: number[] = DEFAULT_DEPTHS): Promise<DepthContourCollection> {
    const bbox = this.snap(reqBbox);
    if (!this.isValidBbox(bbox)) return EMPTY;

    const key = this.cacheKey(bbox, depths);

    // 1) hot memory cache
    const mem = this.cache.get(key);
    if (mem) return mem.data;

    // 2) persistent disk cache
    const disk = this.readDisk(key);
    if (disk) {
      this.putMem(key, disk);
      return disk;
    }

    // 3) coalesce concurrent cold fetches for the same area
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const data = await this.buildContours(bbox, depths);
        this.putMem(key, data);
        this.writeDisk(key, data);
        return data;
      } catch (err) {
        // Out-of-coverage / WCS hiccup / parse failure → no contours, not an error.
        console.warn('Depth contours unavailable for bbox', bbox, err instanceof Error ? err.message : err);
        return EMPTY;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  /** Snap a requested bbox outward to the SNAP_DEG grid for cache reuse. */
  private snap(b: DepthBbox): DepthBbox {
    const q = SNAP_DEG;
    return {
      west: Math.floor(b.west / q) * q,
      south: Math.floor(b.south / q) * q,
      east: Math.ceil(b.east / q) * q,
      north: Math.ceil(b.north / q) * q,
    };
  }

  private isValidBbox(b: DepthBbox): boolean {
    if (![b.west, b.south, b.east, b.north].every((n) => Number.isFinite(n))) return false;
    if (b.east <= b.west || b.north <= b.south) return false;
    if (b.east - b.west > MAX_SPAN_DEG || b.north - b.south > MAX_SPAN_DEG) return false;
    if (b.south < -85 || b.north > 85 || b.west < -180 || b.east > 180) return false;
    return true;
  }

  private cacheKey(b: DepthBbox, depths: number[]): string {
    const r = (n: number) => n.toFixed(3);
    return `${CACHE_VERSION}|${depths.join(',')}|${r(b.west)},${r(b.south)},${r(b.east)},${r(b.north)}`;
  }

  private putMem(key: string, data: DepthContourCollection): void {
    if (this.cache.size >= this.MAX_CACHE) {
      // Evict oldest
      let oldestKey = '';
      let oldest = Infinity;
      for (const [k, v] of this.cache) {
        if (v.at < oldest) { oldest = v.at; oldestKey = k; }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { at: Date.now(), data });
  }

  private diskPath(key: string): string {
    const hash = crypto.createHash('sha1').update(key).digest('hex');
    return path.join(this.diskDir, `${hash}.json`);
  }

  private readDisk(key: string): DepthContourCollection | null {
    try {
      const p = this.diskPath(key);
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        return parsed as DepthContourCollection;
      }
    } catch (err) {
      console.warn('Failed reading depth cache file:', err);
    }
    return null;
  }

  private writeDisk(key: string, data: DepthContourCollection): void {
    try {
      fs.writeFileSync(this.diskPath(key), JSON.stringify(data));
    } catch (err) {
      console.warn('Failed writing depth cache file:', err);
    }
  }

  /**
   * Fetch the EMODnet WCS GeoTIFF for a bbox into an ArrayBuffer.
   */
  private fetchCoverage(bbox: DepthBbox): Promise<ArrayBuffer> {
    const url =
      `${WCS_BASE}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${COVERAGE_ID}` +
      `&format=image/tiff&subset=Lat(${bbox.south},${bbox.north})&subset=Long(${bbox.west},${bbox.east})`;

    // Fixed host, but validate defensively (SSRF guard / CodeQL sanitiser).
    const parsed = assertSafeOutboundUrl(url, 'emodnet wcs');

    return new Promise((resolve, reject) => {
      const req = https.get(parsed, { headers: { 'User-Agent': 'BigaOS/1.0 (Depth Contours)' } }, (res) => {
        const ctype = (res.headers['content-type'] || '').toLowerCase();
        if (res.statusCode !== 200 || !ctype.includes('tif')) {
          res.resume();
          reject(new Error(`WCS returned ${res.statusCode} ${ctype}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(WCS_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error('WCS timeout'));
      });
    });
  }

  private async buildContours(bbox: DepthBbox, depths: number[]): Promise<DepthContourCollection> {
    const ab = await this.fetchCoverage(bbox);
    const tiff = await GeoTIFF.fromArrayBuffer(ab);
    const image = await tiff.getImage();
    const rawW = image.getWidth();
    const rawH = image.getHeight();
    if (rawW < 2 || rawH < 2) return EMPTY;

    // Actual georeferenced extent of the returned grid (the WCS may snap to the
    // native grid, so use this rather than the requested bbox).
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    const nodata = image.getGDALNoData();
    const rasters = await image.readRasters({ pool: null });
    const band = rasters[0] as ArrayLike<number>;

    // Downsample (stride) so the contoured grid is at most MAX_GRID_DIM per side.
    const stride = Math.max(1, Math.ceil(Math.max(rawW, rawH) / MAX_GRID_DIM));
    const W = Math.ceil(rawW / stride);
    const H = Math.ceil(rawH / stride);

    const values: number[] = new Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(rawW - 1, x * stride);
        const sy = Math.min(rawH - 1, y * stride);
        let v = band[sy * rawW + sx];
        if (
          v == null || !Number.isFinite(v) ||
          (nodata != null && v === nodata) ||
          v < MIN_VALID_M || v > MAX_VALID_M
        ) {
          v = LAND_SENTINEL;
        }
        values[y * W + x] = v;
      }
    }

    // Marching squares at negative-depth thresholds.
    const thresholds = depths.map((d) => -d);
    const generator = d3contours().size([W, H]).thresholds(thresholds);
    const multipolys = generator(values);

    // d3-contour coordinates index grid SAMPLES; EMODnet's grid is cell-centred,
    // so a sample at grid index g sits half a cell in from the bbox edge. Without
    // the −0.5 the contours land half a cell to the SE of the basemap.
    const toLon = (x: number) => minX + ((x - 0.5) / W) * (maxX - minX);
    const toLat = (y: number) => maxY - ((y - 0.5) / H) * (maxY - minY);
    const round = (n: number) => Math.round(n * 1e5) / 1e5;

    const features: GeoJSONFeature[] = [];
    for (const mp of multipolys) {
      const depth = -(mp.value as number);
      for (const polygon of mp.coordinates) {
        for (const ring of polygon) {
          if (ring.length < 2) continue;
          // Map grid → lon/lat, smooth (Chaikin), prune redundant points (DP),
          // then round to ~1 m precision.
          const lonlat = ring.map(
            ([x, y]) => [toLon(x), toLat(y)] as [number, number]
          );
          const smoothed = simplify(chaikin(lonlat, SMOOTH_ITERATIONS), SIMPLIFY_EPS_DEG);
          const coordinates = smoothed.map(
            ([lon, lat]) => [round(lon), round(lat)] as [number, number]
          );
          features.push({
            type: 'Feature',
            properties: { depth },
            geometry: { type: 'LineString', coordinates },
          });
        }
      }
    }

    return { type: 'FeatureCollection', features };
  }
}

export const depthContourService = new DepthContourService();
