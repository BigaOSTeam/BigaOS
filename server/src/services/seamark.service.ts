/**
 * Seamark service — offline vector seamarks (buoys, lights, beacons…).
 *
 * Per-region GeoJSON packs (extracted from OpenStreetMap `seamark:*` data by
 * the pack CI) extract under `data/chart-packs/seamark-<region>/*.geojson`. This
 * service loads them into memory and serves a bbox- and zoom-filtered
 * FeatureCollection from `/seamarks/features`; the client (Phase D) draws its
 * own OpenSeaMap-style symbols. Where no pack is installed the existing
 * `nautical` raster overlay keeps working online (client-side), so this
 * endpoint is local-only: it returns features, or empty when no pack is present.
 *
 * Modeled on heritage.service (scan-on-load + linear bbox filter — seamarks are
 * sparse enough that a spatial-index dependency isn't worth it). Inert until a
 * pack is downloaded.
 *
 * Data: © OpenStreetMap contributors / OpenSeaMap (ODbL). NOT FOR NAVIGATION.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SeamarkBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

type Bounds = [number, number, number, number]; // [w, s, e, n]

interface IndexedFeature {
  feature: any; // raw GeoJSON Feature, all seamark:* props preserved
  bounds: Bounds;
  minZoom: number;
}

export type SeamarkSource = 'local' | 'none';

export interface SeamarkResult {
  collection: { type: 'FeatureCollection'; features: any[] };
  source: SeamarkSource;
}

// Cap features per response so a wide/low-zoom request can't ship the whole
// pack. Nearest-to-centre first.
const MAX_FEATURES = 5000;

// Spans wider than this never make sense for a symbol layer; refuse them.
const MAX_SPAN_DEG = 8;

const EMPTY: SeamarkResult = { collection: { type: 'FeatureCollection', features: [] }, source: 'none' };

const MAJOR_TYPES = new Set(['light_major', 'lighthouse', 'landmark', 'light_vessel']);

/**
 * Lowest zoom at which a seamark shows, by `seamark:type`. Keeps low zooms from
 * shipping every mooring buoy: major lights/landmarks from z9, the lateral /
 * cardinal buoy-and-beacon system from z11, everything else from z13.
 */
function seamarkMinZoom(type: unknown): number {
  if (typeof type !== 'string' || !type) return 13;
  if (MAJOR_TYPES.has(type)) return 9;
  if (type.startsWith('buoy_') || type.startsWith('beacon_') || type === 'light_minor') return 11;
  return 13;
}

/** Bounding box of any GeoJSON geometry, or null if it has no usable coords. */
function geometryBounds(geometry: any): Bounds | null {
  if (!geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coords: any): void => {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(coords)) for (const c of coords) visit(c);
  };
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries ?? []) {
      const b = geometryBounds(g);
      if (b) {
        minX = Math.min(minX, b[0]);
        minY = Math.min(minY, b[1]);
        maxX = Math.max(maxX, b[2]);
        maxY = Math.max(maxY, b[3]);
      }
    }
  } else if (Array.isArray(geometry.coordinates)) {
    visit(geometry.coordinates);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [minX, minY, maxX, maxY];
}

class SeamarkService {
  private readonly dataDir = path.join(__dirname, '..', 'data', 'chart-packs');
  private features: IndexedFeature[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.loadLocal();
    this.initialized = true;
  }

  /** Re-read the packs (after a chart/seamark pack download/delete). */
  async reload(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  hasLocal(): boolean {
    return this.features.length > 0;
  }

  private loadLocal(): void {
    this.features = [];
    if (!fs.existsSync(this.dataDir)) {
      console.log('  Seamarks: directory not found (no pack downloaded)');
      return;
    }
    const scan = (dir: string): void => {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        let st: fs.Stats;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) scan(full);
        else if (entry.toLowerCase().endsWith('.geojson') || entry.toLowerCase().endsWith('.json')) {
          this.loadFile(full);
        }
      }
    };
    scan(this.dataDir);
    if (this.features.length > 0) console.log(`  Seamarks: ${this.features.length} features loaded`);
  }

  private loadFile(file: string): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const feats = Array.isArray(parsed?.features) ? parsed.features : [];
      for (const f of feats) {
        const bounds = geometryBounds(f?.geometry);
        if (!bounds) continue;
        const props = f?.properties ?? {};
        this.features.push({ feature: f, bounds, minZoom: seamarkMinZoom(props['seamark:type']) });
      }
    } catch (err) {
      console.warn(`Failed to read seamark file ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Features intersecting the bbox that are visible at `zoom`, capped and
   * nearest-to-centre first. Local-only: 'local' when a pack is present,
   * else 'none'.
   */
  getFeatures(reqBbox: SeamarkBbox, zoom: number): SeamarkResult {
    if (!this.isValidBbox(reqBbox)) return EMPTY;
    if (!this.hasLocal()) return EMPTY;

    const { west, south, east, north } = reqBbox;
    const z = Number.isFinite(zoom) ? zoom : 13;

    const hits: IndexedFeature[] = [];
    for (const item of this.features) {
      if (z < item.minZoom) continue;
      const [w, s, e, n] = item.bounds;
      // AABB intersection test.
      if (e < west || w > east || n < south || s > north) continue;
      hits.push(item);
    }

    const capped = this.cap(hits, reqBbox).map((h) => h.feature);
    return { collection: { type: 'FeatureCollection', features: capped }, source: 'local' };
  }

  private isValidBbox(b: SeamarkBbox): boolean {
    if (![b.west, b.south, b.east, b.north].every((n) => Number.isFinite(n))) return false;
    if (b.east <= b.west || b.north <= b.south) return false;
    return b.east - b.west <= MAX_SPAN_DEG && b.north - b.south <= MAX_SPAN_DEG;
  }

  /** Cap to MAX_FEATURES, keeping those nearest the bbox centre. */
  private cap(items: IndexedFeature[], b: SeamarkBbox): IndexedFeature[] {
    if (items.length <= MAX_FEATURES) return items;
    const cx = (b.west + b.east) / 2;
    const cy = (b.south + b.north) / 2;
    return items
      .map((it) => {
        const mx = (it.bounds[0] + it.bounds[2]) / 2;
        const my = (it.bounds[1] + it.bounds[3]) / 2;
        return { it, d: (mx - cx) ** 2 + (my - cy) ** 2 };
      })
      .sort((a, z) => a.d - z.d)
      .slice(0, MAX_FEATURES)
      .map((x) => x.it);
  }
}

export const seamarkService = new SeamarkService();
