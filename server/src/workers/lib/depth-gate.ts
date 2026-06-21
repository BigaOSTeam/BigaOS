/**
 * Depth gating for the routing workers.
 *
 * Extracted verbatim from route-calculation.worker.ts. Provides synchronous
 * "is this cell deep enough?" lookups by preloading the downloaded depth tiles
 * intersecting the search bounds. Used by both the A* depth router and the
 * weather-routing optimizer (each owns its own DepthGate instance).
 */

import { depthTileService, sampleCachedTile, TileInfo, CachedTile } from '../../services/depth-tile.service';
import { fastDistance, calculateDistance } from './geo';

/** Depth-gating summary returned alongside a calculated route. */
export interface RouteDepthInfo {
  minSafeDepth: number; // metres the route was gated on (draft + safety margin)
  coverage: 'full' | 'partial' | 'none'; // how much of the route has depth data
  shallowestDepth: number | null; // shallowest known depth along the route (m)
  startInShallow: boolean; // known depth at the start is below minSafeDepth
  endInShallow: boolean; // known depth at the destination is below minSafeDepth
}

// Elevation outside this range is nodata/garbage (mirrors the contour service).
export const DEPTH_MIN_VALID_M = -12000;
export const DEPTH_MAX_VALID_M = 9000;
// Depth data (~115 m cells offshore) is least reliable exactly where the boat
// must go — berths, anchorages, marina entrances. Within this radius of the
// start/end the water mask alone governs, so a reachable destination in a
// shallow bay doesn't make the whole route fail.
export const ENDPOINT_GRACE_NM = 0.25;
// Memory bound for preloaded depth tiles (worst case ~10 MB each).
export const MAX_GATE_TILES = 32;

/**
 * DepthGate — synchronous "is this cell deep enough?" lookups for the A* loop.
 *
 * Preloads every downloaded depth tile intersecting the search bounds (custom
 * lake imports first, then EMODnet ~115 m, then GEBCO ~450 m; finest source
 * wins per sample, falling through on nodata). Cells with no depth data are
 * NOT blocked — routing falls back to the water mask there and the route
 * reports partial/none coverage instead of fabricating safety.
 */
export class DepthGate {
  readonly minSafeDepthM: number;
  blockedCells = 0;
  private endpoints: Array<{ lat: number; lon: number }>;
  private customLoaded: Array<{ info: TileInfo; data: CachedTile }> = [];
  private gridLoaded = new Map<string, CachedTile>(); // `${source}:${minLat},${minLon}`
  private seenPaths = new Set<string>();

  constructor(minSafeDepthM: number, start: { lat: number; lon: number }, end: { lat: number; lon: number }) {
    this.minSafeDepthM = minSafeDepthM;
    this.endpoints = [start, end];
  }

  /** Load tiles for (possibly expanded) bounds; already-loaded tiles are kept. */
  async prepare(bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }): Promise<void> {
    const fresh = depthTileService
      .tilesIntersecting({ west: bounds.minLon, south: bounds.minLat, east: bounds.maxLon, north: bounds.maxLat })
      .filter((t) => !this.seenPaths.has(t.filePath));
    if (fresh.length === 0) return;

    const slots = MAX_GATE_TILES - this.seenPaths.size;
    let toLoad = fresh;
    if (fresh.length > slots) {
      // Keep the tiles nearest the route when over budget.
      const refs = [
        ...this.endpoints,
        {
          lat: (this.endpoints[0].lat + this.endpoints[1].lat) / 2,
          lon: (this.endpoints[0].lon + this.endpoints[1].lon) / 2,
        },
      ];
      const score = (t: TileInfo) => {
        const cLat = (t.minLat + t.maxLat) / 2;
        const cLon = (t.minLon + t.maxLon) / 2;
        return Math.min(...refs.map((r) => fastDistance(cLat, cLon, r.lat, r.lon)));
      };
      toLoad = [...fresh].sort((a, b) => score(a) - score(b)).slice(0, Math.max(0, slots));
      console.warn(`[DepthGate] Tile budget reached: loading ${toLoad.length} of ${fresh.length} new tiles`);
    }

    for (const info of toLoad) {
      this.seenPaths.add(info.filePath);
      const data = await depthTileService.loadTileData(info);
      if (!data) continue;
      if (info.source === 'custom') {
        this.customLoaded.push({ info, data });
        // Smallest-area first so overlapping imports prefer the local one.
        this.customLoaded.sort(
          (a, b) =>
            (a.info.maxLon - a.info.minLon) * (a.info.maxLat - a.info.minLat) -
            (b.info.maxLon - b.info.minLon) * (b.info.maxLat - b.info.minLat)
        );
      } else {
        this.gridLoaded.set(`${info.source}:${info.minLat},${info.minLon}`, data);
      }
    }
    if (toLoad.length > 0) {
      console.log(
        `[DepthGate] ${this.customLoaded.length + this.gridLoaded.size} depth tiles loaded (min safe depth ${this.minSafeDepthM}m)`
      );
    }
  }

  hasAnyData(): boolean {
    return this.customLoaded.length > 0 || this.gridLoaded.size > 0;
  }

  /** Water depth in metres (positive down) at a point, or null where no loaded tile has data. */
  depthAt(lat: number, lon: number): number | null {
    for (const t of this.customLoaded) {
      if (lon >= t.info.minLon && lon < t.info.maxLon && lat >= t.info.minLat && lat < t.info.maxLat) {
        const v = sampleCachedTile(t.data, lon, lat);
        if (v != null && v > DEPTH_MIN_VALID_M && v < DEPTH_MAX_VALID_M) return -v;
      }
    }
    for (const source of ['emodnet', 'gebco'] as const) {
      const size = source === 'emodnet' ? 2 : 10;
      const tile = this.gridLoaded.get(`${source}:${Math.floor(lat / size) * size},${Math.floor(lon / size) * size}`);
      if (!tile) continue;
      const v = sampleCachedTile(tile, lon, lat);
      if (v != null && v > DEPTH_MIN_VALID_M && v < DEPTH_MAX_VALID_M) return -v;
    }
    return null;
  }

  /** True when routing must treat the cell as blocked: depth known and shallower than the safe depth, outside the endpoint grace radius. */
  blocksRouting(lat: number, lon: number): boolean {
    const d = this.depthAt(lat, lon);
    if (d == null || d >= this.minSafeDepthM) return false;
    for (const p of this.endpoints) {
      if (fastDistance(lat, lon, p.lat, p.lon) <= ENDPOINT_GRACE_NM) return false;
    }
    this.blockedCells++;
    return true;
  }

  /**
   * A gated route can only reach an endpoint through its grace disk. When the
   * ring of water just outside the grace radius is entirely known-shallow (no
   * deep and no unknown cells), the endpoint is provably sealed — fail fast
   * instead of letting A* flood the whole bank until MAX_ITERATIONS.
   */
  isEndpointSealed(cLat: number, cLon: number, gridSize: number, isWaterFn: (lat: number, lon: number) => boolean): boolean {
    const innerNm = ENDPOINT_GRACE_NM;
    const outerNm = ENDPOINT_GRACE_NM + 3 * gridSize * 60; // ring 3 cells wide
    const outerDeg = outerNm / 60 / Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
    let sawWater = false;
    for (let lat = cLat - outerDeg; lat <= cLat + outerDeg; lat += gridSize) {
      for (let lon = cLon - outerDeg; lon <= cLon + outerDeg; lon += gridSize) {
        const distNm = fastDistance(cLat, cLon, lat, lon);
        if (distNm <= innerNm || distNm > outerNm) continue;
        if (!isWaterFn(lat, lon)) continue; // land seals on its own
        sawWater = true;
        const d = this.depthAt(lat, lon);
        if (d == null || d >= this.minSafeDepthM) return false; // a way in (or unknowable)
      }
    }
    return sawWater; // every water cell in the ring is known-shallow
  }
}

/**
 * Sample depth along a finished route (~100 m steps) for the coverage report:
 * how much of it had depth data, and the shallowest known spot.
 */
export function buildDepthInfo(
  gate: DepthGate,
  waypoints: Array<{ lat: number; lon: number }>,
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): RouteDepthInfo {
  let known = 0;
  let unknown = 0;
  let shallowest: number | null = null;
  const STEP_NM = 0.054; // ~100 m
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const legNm = calculateDistance(a.lat, a.lon, b.lat, b.lon);
    const steps = Math.min(800, Math.max(1, Math.ceil(legNm / STEP_NM)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const d = gate.depthAt(a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon));
      if (d == null) {
        unknown++;
      } else {
        known++;
        if (shallowest == null || d < shallowest) shallowest = d;
      }
    }
  }
  // Endpoint pixels are often nodata in the source data (berths sit on "land"
  // cells at 115 m resolution) — don't let a sliver downgrade full coverage.
  const coverage: RouteDepthInfo['coverage'] =
    known === 0 ? 'none' : unknown / (known + unknown) < 0.02 ? 'full' : 'partial';
  const dStart = gate.depthAt(startLat, startLon);
  const dEnd = gate.depthAt(endLat, endLon);
  return {
    minSafeDepth: gate.minSafeDepthM,
    coverage,
    shallowestDepth: shallowest,
    startInShallow: dStart != null && dStart < gate.minSafeDepthM,
    endInShallow: dEnd != null && dEnd < gate.minSafeDepthM,
  };
}
