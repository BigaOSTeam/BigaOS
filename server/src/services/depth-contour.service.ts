/**
 * Depth Contour Service
 *
 * Generates vector depth contours (isobaths) by running marching-squares
 * (d3-contour) over a depth grid, smoothing/simplifying the lines, and emitting
 * GeoJSON LineString isobaths tagged with depth (metres).
 *
 * **Offline-first, online-fallback** — the grid comes from, in order:
 *   1. `local`  — downloaded tiles via `depthTileService` (fast, offline;
 *                 EMODnet ~115 m basins + GEBCO ~450 m global).
 *   2. `online` — streamed on demand from the global **GEBCO COG** via HTTP
 *                 range reads (~450 m). Works ANYWHERE out of the box (incl. the
 *                 Americas — EMODnet is European-only), and is fast (a couple of
 *                 range requests, not a cold WCS GetCoverage). Disk-cached.
 *   3. `none`   — even GEBCO had nothing / fetch failed.
 * The result reports its `source` so the client can nudge the user to download
 * the relevant pack for offline + faster loading.
 *
 * In-memory LRU (cleared on depth-pack (re)download) + a persistent on-disk
 * cache of online results under `data/depth-contours/`.
 *
 * Data: EMODnet Bathymetry (CC BY 4.0); GEBCO Compilation Group. NOT FOR NAVIGATION.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as GeoTIFF from 'geotiff';
import { contours as d3contours } from 'd3-contour';
import { depthTileService, DepthValueGrid } from './depth-tile.service';
import { assertSafeOutboundUrl } from '../utils/url-safety';
import { APP_USER_AGENT } from '../utils/app-identity';

// Default isobath depths in metres. Coastal-friendly near the surface, sparser
// in deep water. Contours are drawn at the negative of each (elevation grid).
const DEFAULT_DEPTHS = [2, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000];

// Cap the grid we contour over so CPU + payload stay bounded regardless of bbox.
const MAX_GRID_DIM = 384;

// Contours are a zoomed-in feature; refuse spans larger than this (degrees).
const MAX_SPAN_DEG = 3;

// Elevation outside this range is treated as nodata/land.
const MIN_VALID_M = -12000;
const MAX_VALID_M = 9000;
// Sentinel placed in nodata/land cells: a high "elevation" so no submarine
// contour threads through it.
const LAND_SENTINEL = 1e6;

// Snap requested bboxes outward to this grid so small pans / zoom jitter reuse
// the same cache entry.
const SNAP_DEG = 0.25;

// Bump to invalidate cached contours (e.g. if the depth set or post-processing
// like smoothing changes).
const CACHE_VERSION = 'v7';

// Online fallback for areas with no downloaded tile: the global GEBCO 2024 COG
// (Int16 elevation, m; sea floor < 0; EPSG:4326, ~450 m). Read on demand via
// HTTP range requests (geotiff fromUrl) — global + fast, and the same data as
// the downloadable GEBCO packs. Disk-cached so it's computed once per area.
const GEBCO_COG_URL = 'https://data.source.coop/alexgleith/gebco-2024/GEBCO_2024.tif';

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

/** Where the contour grid came from: downloaded tiles, the online GEBCO COG, or nothing. */
export type DepthSource = 'local' | 'online' | 'none';

/** Contours plus where they came from (drives the client's offline/online note). */
export interface DepthContourResult {
  collection: DepthContourCollection;
  source: DepthSource;
}

interface CacheEntry {
  at: number;
  data: DepthContourCollection;
  source: Exclude<DepthSource, 'none'>;
}

const EMPTY: DepthContourCollection = { type: 'FeatureCollection', features: [] };

class DepthContourService {
  // Hot in-memory cache (this process). Cleared on depth-pack (re)download.
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE = 60;
  // De-dupe concurrent builds for the same area.
  private inflight = new Map<string, Promise<{ data: DepthContourCollection; source: Exclude<DepthSource, 'none'> } | null>>();
  // Persistent cache of ONLINE results so a region is contoured once.
  private readonly diskDir: string;
  // Lazily-opened handle to the remote GEBCO COG (reused across range reads).
  private gebcoTiff: Promise<any> | null = null;

  constructor() {
    this.diskDir = path.join(__dirname, '..', 'data', 'depth-contours');
    try {
      if (!fs.existsSync(this.diskDir)) fs.mkdirSync(this.diskDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create depth-contour cache dir:', err);
    }
  }

  /**
   * Get depth contours (GeoJSON isobaths) for a bbox, offline-first: downloaded
   * tiles → online GEBCO COG fallback → none. `source` tells the client which, so it can
   * nudge a download for offline + faster loading.
   */
  async getContours(reqBbox: DepthBbox, depths: number[] = DEFAULT_DEPTHS): Promise<DepthContourResult> {
    const bbox = this.snap(reqBbox);
    if (!this.isValidBbox(bbox)) return { collection: EMPTY, source: 'none' };

    const key = this.cacheKey(bbox, depths);

    const mem = this.cache.get(key);
    if (mem) return { collection: mem.data, source: mem.source };

    // Coalesce concurrent builds for the same area.
    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.build(bbox, depths, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, promise);
    }

    let result: { data: DepthContourCollection; source: Exclude<DepthSource, 'none'> } | null;
    try {
      result = await promise;
    } catch (err) {
      console.warn('Depth contours build failed for bbox', bbox, err instanceof Error ? err.message : err);
      return { collection: EMPTY, source: 'none' };
    }

    if (!result) return { collection: EMPTY, source: 'none' };
    this.putMem(key, result.data, result.source);
    return { collection: result.data, source: result.source };
  }

  /**
   * Resolve the depth grid offline-first and build contours. Returns null (→
   * 'none') when neither local tiles nor the online GEBCO COG cover the bbox.
   */
  private async build(
    bbox: DepthBbox,
    depths: number[],
    key: string,
  ): Promise<{ data: DepthContourCollection; source: Exclude<DepthSource, 'none'> } | null> {
    // 1) Offline: downloaded tiles take precedence.
    if (depthTileService.hasCoverage(bbox)) {
      const grid = await depthTileService.getValueGrid(bbox);
      if (grid) return { data: this.buildContoursFromGrid(grid, depths), source: 'local' };
    }
    // 2) Online fallback: stream from the global GEBCO COG (disk-cached).
    const disk = this.readDisk(key);
    if (disk) return { data: disk, source: 'online' };
    const grid = await this.fetchOnlineGrid(bbox);
    if (!grid) return null; // GEBCO fetch failed / no data → 'none'
    const data = this.buildContoursFromGrid(grid, depths);
    this.writeDisk(key, data);
    return { data, source: 'online' };
  }

  /**
   * Cheap up-front check (no contouring / no network): is this bbox covered by
   * downloaded tiles? Lets the client say "fetching online…" immediately for
   * un-downloaded areas instead of only after the online fetch returns.
   */
  hasLocal(reqBbox: DepthBbox): boolean {
    return depthTileService.hasCoverage(this.snap(reqBbox));
  }

  /** Drop cached contours (called when a depth pack is downloaded/deleted). */
  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
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

  private putMem(key: string, data: DepthContourCollection, source: Exclude<DepthSource, 'none'>): void {
    if (this.cache.size >= this.MAX_CACHE) {
      let oldestKey = '';
      let oldest = Infinity;
      for (const [k, v] of this.cache) {
        if (v.at < oldest) { oldest = v.at; oldestKey = k; }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { at: Date.now(), data, source });
  }

  // ---- Online (GEBCO COG) fallback + persistent disk cache ----------------

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
   * Online depth grid streamed from the global GEBCO COG via HTTP range reads,
   * shaped like a local tile grid. The GeoTIFF handle is cached so only the
   * windowed tiles are fetched per call (not the whole 4 GB file or its header
   * each time). Returns null on error / too-small a window.
   */
  private async fetchOnlineGrid(bbox: DepthBbox): Promise<DepthValueGrid | null> {
    try {
      assertSafeOutboundUrl(GEBCO_COG_URL, 'gebco cog'); // SSRF guard (fixed URL)
      if (!this.gebcoTiff)
        this.gebcoTiff = GeoTIFF.fromUrl(GEBCO_COG_URL, { headers: { 'User-Agent': APP_USER_AGENT } });
      const image = await (await this.gebcoTiff).getImage();
      const [ox, oy] = image.getOrigin() as [number, number, number]; // (-180, 90)
      const [rx, ry] = image.getResolution() as [number, number, number]; // ry < 0 (north-up)
      const W = image.getWidth();
      const H = image.getHeight();
      const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      const x0 = clamp(Math.floor((bbox.west - ox) / rx), W);
      const x1 = clamp(Math.ceil((bbox.east - ox) / rx), W);
      const y0 = clamp(Math.floor((bbox.north - oy) / ry), H); // north → smaller row
      const y1 = clamp(Math.ceil((bbox.south - oy) / ry), H);
      if (x1 - x0 < 2 || y1 - y0 < 2) return null;
      const rasters = await image.readRasters({ window: [x0, y0, x1, y1], pool: null });
      const nodata = image.getGDALNoData();
      return {
        band: rasters[0] as ArrayLike<number>,
        width: x1 - x0,
        height: y1 - y0,
        // [minX, minY, maxX, maxY]; y grows southward so y1 is the south edge.
        bbox: [ox + x0 * rx, oy + y1 * ry, ox + x1 * rx, oy + y0 * ry],
        nodata: nodata == null ? NaN : nodata,
      };
    } catch (err) {
      console.warn('Online depth (GEBCO COG) unavailable for bbox', bbox, err instanceof Error ? err.message : err);
      this.gebcoTiff = null; // reset so a later call re-opens the COG
      return null;
    }
  }

  /** Build contours from a normalised depth grid (local tile or online GEBCO COG). */
  private buildContoursFromGrid(grid: DepthValueGrid, depths: number[]): DepthContourCollection {
    const { band, width: rawW, height: rawH, nodata } = grid;
    const [minX, minY, maxX, maxY] = grid.bbox;
    if (rawW < 2 || rawH < 2) return EMPTY;

    // Downsample (stride) so the contoured grid is at most MAX_GRID_DIM per side.
    // (The tile service already caps its output, so this is normally a no-op.)
    const stride = Math.max(1, Math.ceil(Math.max(rawW, rawH) / MAX_GRID_DIM));
    const W = Math.ceil(rawW / stride);
    const H = Math.ceil(rawH / stride);

    const values: number[] = new Array(W * H);
    // Track the deepest (most-negative) real value so we can drop thresholds
    // below it — see the artifact note in the contour loop.
    let deepest = Infinity;
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
        if (v < LAND_SENTINEL && v < deepest) deepest = v;
      }
    }

    // Marching squares at negative-depth thresholds.
    const thresholds = depths.map((d) => -d);
    const generator = d3contours().size([W, H]).thresholds(thresholds);
    const multipolys = generator(values);

    // d3-contour coordinates index grid SAMPLES; the grid is cell-centred, so a
    // sample at grid index g sits half a cell in from the bbox edge. Without the
    // −0.5 the contours land half a cell to the SE of the basemap.
    const toLon = (x: number) => minX + ((x - 0.5) / W) * (maxX - minX);
    const toLat = (y: number) => maxY - ((y - 0.5) / H) * (maxY - minY);
    const round = (n: number) => Math.round(n * 1e5) / 1e5;

    const features: GeoJSONFeature[] = [];
    for (const mp of multipolys) {
      // Drop thresholds below the deepest real value. d3-contour treats the area
      // outside the grid as −∞, so any threshold deeper than every cell still
      // yields a ring tracing the whole data extent — a spurious rectangle along
      // the region edges (very visible in shallow seas like the Baltic).
      if ((mp.value as number) <= deepest) continue;
      const depth = -(mp.value as number);
      for (const polygon of mp.coordinates) {
        for (const ring of polygon) {
          if (ring.length < 2) continue;
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
