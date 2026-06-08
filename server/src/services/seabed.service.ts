/**
 * Seabed Composition Service
 *
 * Serves the seabed-substrate / anchoring overlay as a GeoJSON polygon
 * FeatureCollection for a requested bbox. Two EMODnet Seabed Habitats layers,
 * merged into one slim, render-ready shape:
 *   - **Substrate** (`emodnet_open:eusm2025_subs_full`, EUSeaMap 2025 broad-scale):
 *     the Folk substrate class (`substrate` string attr). The full `geom` is huge
 *     (a single feature can span a whole sea), so we request the pre-simplified
 *     `geom_800` column and clip it to the bbox — that's what keeps the live
 *     fallback small enough to be usable.
 *   - **Posidonia** (`emodnet_open:art17_hab_1120`, Art-17 "Posidonia beds"):
 *     protected Mediterranean seagrass; small geometries.
 *
 * **Offline-first, online-fallback** (same shape as the heritage / depth services):
 *   1. `local`  — a downloaded pack under `data/seabed-data/**.geojson` (already
 *                 baked to the slim shape by scripts/prepare-seabed.py).
 *   2. `online` — live EMODnet Seabed Habitats WFS, clipped + simplified + classified,
 *                 disk-cached. Works out of the box.
 *   3. `none`   — the online fetch failed.
 * The result reports its `source` so the client can nudge a download for offline.
 *
 * Two independent dimensions are surfaced (never collapsed): the **verbatim
 * substrate class** (the real composition, used for the fill colour) and a derived
 * **holding** quality + sensitivity (the anchoring interpretation, shown in the
 * legend / tap card). `classifySubstrate()` MUST stay in sync with the identical
 * logic in scripts/prepare-seabed.py.
 *
 * Data: EMODnet Seabed Habitats (free for use with EMODnet attribution).
 * NOT FOR NAVIGATION — broad-scale / predictive; holding quality is advisory.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { assertSafeOutboundUrl } from '../utils/url-safety';

export interface SeabedBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type SeabedKind = 'substrate' | 'seagrass';
export type Holding = 'good' | 'moderate' | 'poor' | 'unknown';

/** One normalised seabed polygon (slim, render-ready). */
export interface SeabedFeature {
  type: 'Feature';
  properties: {
    kind: SeabedKind;
    /** Verbatim EMODnet substrate / habitat label (the ground detail we show). */
    substrate?: string;
    /** Canonical key the client maps to a fill colour. */
    substrateKey: string;
    /** Derived anchoring interpretation (advisory). */
    holding: Holding;
    /** Ecologically sensitive (seagrass, worm/Sabellaria reef). */
    sensitive?: boolean;
    /** Legally protected habitat in many areas (Posidonia) — informational, not a ban. */
    protected?: boolean;
    country?: string;
    /** Conservation status, when known (seagrass). */
    status?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][]; // [lon,lat]
  };
}

export interface SeabedCollection {
  type: 'FeatureCollection';
  features: SeabedFeature[];
}

export type SeabedSource = 'local' | 'online' | 'none';

export interface SeabedResult {
  collection: SeabedCollection;
  source: SeabedSource;
}

// EMODnet Seabed Habitats WFS (GeoServer). Output is standard GeoJSON ([lon,lat]);
// the *request* bbox uses lat,lon for EPSG:4326 in WFS 2.0.0 (axis-order caveat) —
// same as the heritage service. See buildWfsUrl below.
const WFS_BASE = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_open/wfs';
// Substrate: request a pre-simplified geometry column (NOT the full `geom`, which is
// enormous) plus the Folk class. We use geom_200 (≈200 m): the coarser geom_800
// over-simplifies most small polygons to NULL geometry, so they silently vanish —
// geom_200 keeps ~3–4× more polygons (real on-the-ground detail) for the same fetch
// cost (the records-per-bbox count, not the vertex count, dominates). Posidonia:
// small, fetch all properties + geom.
const SUBSTRATE_TYPE = 'emodnet_open:eusm2025_subs_full';
const SUBSTRATE_PROPS = 'substrate,geom_200';
// Seagrass: the EOV seagrass-meadow polygon compilation (2025) — real bed outlines
// with species (`habsubtype`) and Annex codes, broad coverage (Med Posidonia +
// Atlantic/Baltic Zostera). NOT the old Art-17 reporting grid (`art17_hab_1120`),
// which was a near-empty 10 km grid. No pre-simplified geometry column here, so we
// rely on the server-side bbox clip + Douglas–Peucker to keep payloads small.
const SEAGRASS_TYPE = 'emodnet_open:seagrass_eov_poly_2025';
const SEAGRASS_PROPS = 'habsubtype,hab_origin,anxi_code,geom';

// Snap requested bboxes outward to this grid so small pans reuse the same cache
// entry. Must match the client's SNAP_DEG.
const SNAP_DEG = 0.25;

// Substrate is a zoomed-in feature and the polygons are dense; refuse spans larger
// than this so a live WFS pull can't drag a whole sea-basin's records.
const MAX_SPAN_DEG = 2.0;

// Cap features returned per request (nearest-to-centre first) to keep the layer light.
// Only ~a few hundred polygons actually carry geometry even in dense seas, so this
// is generous headroom rather than a routine truncation.
const MAX_FEATURES = 3000;

// WFS feature cap per layer. EMODnet returns one record per substrate polygon —
// including the many whose simplified geometry is NULL — so this must be high enough
// to reach the geometry-bearing ones in dense areas (a 2° Mediterranean bbox holds
// ~10–11k records). The transfer is the per-record overhead, not the geometry.
const WFS_COUNT = 15000;

// Seagrass has no NULL-geom problem (every record is a real bed), so a few thousand
// is plenty to convey presence even on the seagrass-carpeted Riviera.
const SEAGRASS_WFS_COUNT = 6000;

// Douglas–Peucker tolerance (degrees) applied after clipping. Substrate uses a light
// value (its geom_200 is already ~200 m). Seagrass beds come at full resolution and
// can be extremely vertex-dense (the whole Riviera is one carpet), so they get a much
// coarser tolerance — the exact outline is invisible under scattered glyphs, and this
// keeps the payload sane.
const SIMPLIFY_EPS_DEG = 0.0003;
const SEAGRASS_SIMPLIFY_EPS_DEG = 0.0018;

// Bump to invalidate cached online results (e.g. if classification or the requested
// geometry column changes). v2: substrate geom_800 → geom_200. v3: seagrass source
// art17_hab_1120 → seagrass_eov_poly_2025.
const CACHE_VERSION = 'v3';

const EMPTY: SeabedCollection = { type: 'FeatureCollection', features: [] };

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

// ---- classification (KEEP IN SYNC with scripts/prepare-seabed.py) -------------

/**
 * Map a verbatim EMODnet substrate label → a canonical palette key + advisory
 * anchoring holding quality. Case-insensitive, ordered keyword match so it's
 * durable across regional vocabulary variants ("Sandy mud", "Mud to muddy sand",
 * "Coarse & mixed sediment", …). Holding is advisory, never a navigational claim.
 */
export function classifySubstrate(raw?: string): {
  substrateKey: string;
  holding: Holding;
  sensitive: boolean;
} {
  const s = (raw || '').toLowerCase();
  if (!s) return { substrateKey: 'unknown', holding: 'unknown', sensitive: false };
  if (s.includes('rock') || s.includes('hard substrat') || s.includes('boulder'))
    return { substrateKey: 'rock', holding: 'poor', sensitive: false };
  if (s.includes('worm reef') || s.includes('sabellaria'))
    return { substrateKey: 'worm_reef', holding: 'poor', sensitive: true };
  if (s.includes('coarse') && s.includes('mixed'))
    return { substrateKey: 'coarse_mixed', holding: 'moderate', sensitive: false };
  if (s.includes('coarse') || s.includes('gravel') || s.includes('shingle') || s.includes('pebble') || s.includes('stone'))
    return { substrateKey: 'coarse', holding: 'moderate', sensitive: false };
  if (s.includes('mixed'))
    return { substrateKey: 'mixed', holding: 'moderate', sensitive: false };
  if (s.includes('muddy sand') || s.includes('sandy mud'))
    return { substrateKey: 'muddy_sand', holding: 'good', sensitive: false };
  if (s.includes('mud'))
    return { substrateKey: 'mud', holding: 'good', sensitive: false };
  if (s.includes('sand'))
    return { substrateKey: 'sand', holding: 'good', sensitive: false };
  if (s.includes('sediment'))
    return { substrateKey: 'sediment', holding: 'unknown', sensitive: false };
  return { substrateKey: 'unknown', holding: 'unknown', sensitive: false };
}

// ---- geometry helpers ---------------------------------------------------------

type Ring = number[][]; // [ [lon,lat], ... ]

/** Bounding box of a ring as [minLon, minLat, maxLon, maxLat]. */
function ringBounds(ring: Ring): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Sutherland–Hodgman clip of a ring against an axis-aligned bbox (convex), edge by
 * edge. Returns the clipped ring (closed), or null if nothing survives.
 */
function clipRing(ring: Ring, b: SeabedBbox): Ring | null {
  // Drop a trailing duplicate (closing) point; we re-close at the end.
  let pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  if (pts.length < 3) return null;

  // edges: keep points on the "inside"; param along boundary for intersections.
  const edges: { inside: (p: number[]) => boolean; intersect: (a: number[], c: number[]) => number[] }[] = [
    { inside: (p) => p[0] >= b.west, intersect: (a, c) => lerpX(a, c, b.west) },
    { inside: (p) => p[0] <= b.east, intersect: (a, c) => lerpX(a, c, b.east) },
    { inside: (p) => p[1] >= b.south, intersect: (a, c) => lerpY(a, c, b.south) },
    { inside: (p) => p[1] <= b.north, intersect: (a, c) => lerpY(a, c, b.north) },
  ];

  for (const e of edges) {
    if (pts.length === 0) break;
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const curIn = e.inside(cur);
      const prevIn = e.inside(prev);
      if (curIn) {
        if (!prevIn) out.push(e.intersect(prev, cur));
        out.push(cur);
      } else if (prevIn) {
        out.push(e.intersect(prev, cur));
      }
    }
    pts = out;
  }
  if (pts.length < 3) return null;
  pts.push([pts[0][0], pts[0][1]]); // re-close
  return pts;
}

function lerpX(a: number[], c: number[], x: number): number[] {
  const t = (x - a[0]) / (c[0] - a[0]);
  return [x, a[1] + t * (c[1] - a[1])];
}
function lerpY(a: number[], c: number[], y: number): number[] {
  const t = (y - a[1]) / (c[1] - a[1]);
  return [a[0] + t * (c[0] - a[0]), y];
}

/** Douglas–Peucker simplification of a ring. Closed rings (first == last) need the
 *  farthest vertex anchored first, else the degenerate start==end baseline keeps
 *  almost every point (which left dense seagrass beds barely simplified). */
function simplifyRing(ring: Ring, eps: number): Ring {
  const n = ring.length;
  if (n < 5) return ring;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const closed = ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
  if (closed) {
    let fi = 0, fd = -1;
    for (let i = 1; i < n - 1; i++) {
      const dx = ring[i][0] - ring[0][0];
      const dy = ring[i][1] - ring[0][1];
      const d = dx * dx + dy * dy;
      if (d > fd) { fd = d; fi = i; }
    }
    keep[fi] = true;
    dp(ring, 0, fi, eps, keep);
    dp(ring, fi, n - 1, eps, keep);
  } else {
    dp(ring, 0, n - 1, eps, keep);
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}
function dp(pts: Ring, lo: number, hi: number, eps: number, keep: boolean[]): void {
  if (hi <= lo + 1) return;
  const [ax, ay] = pts[lo];
  const [bx, by] = pts[hi];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-12;
  let far = -1, fd = -1;
  for (let i = lo + 1; i < hi; i++) {
    const [px, py] = pts[i];
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  if (fd > eps * eps && far > 0) {
    keep[far] = true;
    dp(pts, lo, far, eps, keep);
    dp(pts, far, hi, eps, keep);
  }
}

const roundRing = (ring: Ring): Ring => ring.map(([x, y]) => [round5(x), round5(y)]);

/** Absolute polygon-ring area (shoelace), in deg². */
function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}
// Drop polygon parts smaller than this (≈ a 60 m square). The seagrass layer has
// huge multipolygons full of tiny bed fragments that bloat the payload but are too
// small to ever show a glyph — culling them is invisible and cuts size sharply.
const MIN_PART_AREA_DEG2 = 3e-7;

/**
 * Clip a feature's geometry to the bbox and simplify. Returns the same feature with
 * clipped geometry, or null if nothing intersects the bbox.
 */
function clipFeature(f: SeabedFeature, b: SeabedBbox, eps: number = SIMPLIFY_EPS_DEG): SeabedFeature | null {
  const polys: number[][][][] = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates as number[][][]]
    : (f.geometry.coordinates as number[][][][]);

  const keptPolys: number[][][][] = [];
  for (const rings of polys) {
    if (!Array.isArray(rings) || rings.length === 0) continue;
    // Cheap reject: skip polygons whose outer ring can't touch the bbox.
    const [minX, minY, maxX, maxY] = ringBounds(rings[0]);
    if (maxX < b.west || minX > b.east || maxY < b.south || minY > b.north) continue;

    // Outer ring only — drop holes. For a glyph-scatter overlay the interior gaps
    // don't matter, and seagrass beds carry up to ~1,600 holes (sand patches within
    // a meadow) that would otherwise dominate the payload (62k+ vertices for one
    // bed). A stray glyph over a filled gap is invisible vs the win.
    const outer = clipRing(rings[0], b);
    if (!outer) continue; // outer ring outside the bbox → drop the polygon
    const simplified = roundRing(simplifyRing(outer, eps));
    // Skip parts too small to ever carry a glyph (drops seagrass speckle).
    if (ringArea(simplified) >= MIN_PART_AREA_DEG2) keptPolys.push([simplified]);
  }
  if (keptPolys.length === 0) return null;

  const geometry: SeabedFeature['geometry'] = keptPolys.length === 1
    ? { type: 'Polygon', coordinates: keptPolys[0] }
    : { type: 'MultiPolygon', coordinates: keptPolys };
  return { ...f, geometry };
}

class SeabedService {
  private dataDir: string;
  private diskDir: string;
  private features: SeabedFeature[] = [];
  private initialized = false;

  private cache = new Map<string, SeabedCollection>();
  private readonly MAX_CACHE = 40;
  private inflight = new Map<string, Promise<SeabedCollection | null>>();

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'seabed-data');
    this.diskDir = path.join(__dirname, '..', 'data', 'seabed-cache');
    try {
      if (!fs.existsSync(this.diskDir)) fs.mkdirSync(this.diskDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create seabed cache dir:', err);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.loadLocal();
    this.initialized = true;
  }

  /** Re-read the local pack (called after a seabed pack download/delete). */
  async reload(): Promise<void> {
    this.initialized = false;
    this.cache.clear();
    this.inflight.clear();
    await this.initialize();
  }

  /** Whether a downloaded pack is present. */
  hasLocal(): boolean {
    return this.features.length > 0;
  }

  /** Scan `seabed-data/**.geojson` and load all (already-slim) features into memory. */
  private loadLocal(): void {
    this.features = [];
    if (!fs.existsSync(this.dataDir)) {
      console.log('  Seabed: directory not found (no pack downloaded)');
      return;
    }
    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = fs.statSync(full);
        if (st.isDirectory()) scan(full);
        else if (entry.toLowerCase().endsWith('.geojson') || entry.toLowerCase().endsWith('.json')) {
          this.loadFile(full);
        }
      }
    };
    scan(this.dataDir);
    if (this.features.length > 0) {
      console.log(`  Seabed: ${this.features.length} polygons loaded`);
    }
  }

  private loadFile(file: string): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const feats = Array.isArray(parsed?.features) ? parsed.features : [];
      for (const f of feats) {
        const g = f?.geometry;
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates)) continue;
        const p = f.properties || {};
        const kind: SeabedKind = p.kind === 'seagrass' ? 'seagrass' : 'substrate';
        this.features.push({
          type: 'Feature',
          properties: {
            kind,
            substrate: p.substrate,
            substrateKey: p.substrateKey || classifySubstrate(p.substrate).substrateKey,
            holding: p.holding || classifySubstrate(p.substrate).holding,
            sensitive: p.sensitive,
            protected: p.protected,
            country: p.country,
            status: p.status,
          },
          geometry: g,
        });
      }
    } catch (err) {
      console.warn(`Failed to read seabed file ${file}:`, err);
    }
  }

  /**
   * Features for a bbox, offline-first: local pack → live WFS → none. Returns the
   * `source` so the client can offer a download.
   */
  async getFeatures(reqBbox: SeabedBbox): Promise<SeabedResult> {
    const bbox = this.snap(reqBbox);
    if (!this.isValidBbox(bbox)) return { collection: EMPTY, source: 'none' };

    if (this.hasLocal()) {
      return { collection: this.filterLocal(bbox), source: 'local' };
    }

    const key = this.cacheKey(bbox);
    const mem = this.cache.get(key);
    if (mem) return { collection: mem, source: 'online' };

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.fetchOnline(bbox, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, promise);
    }

    let online: SeabedCollection | null;
    try {
      online = await promise;
    } catch (err) {
      console.warn('Seabed online fetch failed for bbox', bbox, err instanceof Error ? err.message : err);
      return { collection: EMPTY, source: 'none' };
    }
    if (!online) return { collection: EMPTY, source: 'none' };
    this.putMem(key, online);
    return { collection: online, source: 'online' };
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  // ---- local --------------------------------------------------------------

  private filterLocal(b: SeabedBbox): SeabedCollection {
    const hits: SeabedFeature[] = [];
    for (const f of this.features) {
      const eps = f.properties.kind === 'seagrass' ? SEAGRASS_SIMPLIFY_EPS_DEG : SIMPLIFY_EPS_DEG;
      const clipped = clipFeature(f, b, eps);
      if (clipped) hits.push(clipped);
    }
    return { type: 'FeatureCollection', features: this.cap(hits, b) };
  }

  /** Cap to MAX_FEATURES, keeping those whose centroid is nearest the bbox centre. */
  private cap(feats: SeabedFeature[], b: SeabedBbox): SeabedFeature[] {
    if (feats.length <= MAX_FEATURES) return feats;
    const cx = (b.west + b.east) / 2;
    const cy = (b.south + b.north) / 2;
    return feats
      .map((f) => ({ f, d: distSq(featureCentre(f), cx, cy) }))
      .sort((a, z) => a.d - z.d)
      .slice(0, MAX_FEATURES)
      .map((x) => x.f);
  }

  // ---- online (EMODnet WFS) + disk cache ----------------------------------

  private async fetchOnline(b: SeabedBbox, key: string): Promise<SeabedCollection | null> {
    const disk = this.readDisk(key);
    if (disk) return disk;

    const all: SeabedFeature[] = [];

    const substrate = await this.fetchLayer(b, SUBSTRATE_TYPE, SUBSTRATE_PROPS, WFS_COUNT);
    if (substrate === null) return null; // network error → 'none' (don't cache a partial)
    for (const raw of substrate) {
      const norm = this.normalizeSubstrate(raw, b);
      if (norm) all.push(norm);
    }

    const seagrass = await this.fetchLayer(b, SEAGRASS_TYPE, SEAGRASS_PROPS, SEAGRASS_WFS_COUNT);
    if (seagrass === null) return null;
    for (const raw of seagrass) {
      const norm = this.normalizeSeagrass(raw, b);
      if (norm) all.push(norm);
    }

    const collection: SeabedCollection = { type: 'FeatureCollection', features: this.cap(all, b) };
    this.writeDisk(key, collection);
    return collection;
  }

  /** GET one WFS layer's features for the bbox as raw GeoJSON, or null on error. */
  private async fetchLayer(b: SeabedBbox, typeName: string, propertyName: string | null, count: number): Promise<any[] | null> {
    const url = this.buildWfsUrl(b, typeName, propertyName, count);
    try {
      assertSafeOutboundUrl(url, 'emodnet seabed wfs'); // SSRF guard (fixed host)
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      let res: Response;
      try {
        res = await fetch(url, { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        console.warn(`Seabed WFS ${typeName} HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as any;
      return Array.isArray(json?.features) ? json.features : [];
    } catch (err) {
      console.warn(`Seabed WFS ${typeName} unavailable:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Build a WFS 2.0.0 GetFeature URL. EPSG:4326 axis order is lat,lon for the
   * *bbox* (append the CRS URN); the GeoJSON output stays standard [lon,lat].
   */
  private buildWfsUrl(b: SeabedBbox, typeName: string, propertyName: string | null, count: number): string {
    const bbox = `${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`;
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'urn:ogc:def:crs:EPSG::4326',
      count: String(count),
      bbox,
    });
    if (propertyName) params.set('propertyName', propertyName);
    return `${WFS_BASE}?${params.toString()}`;
  }

  /** Raw substrate WFS feature → slim, clipped, classified feature, or null. */
  private normalizeSubstrate(f: any, b: SeabedBbox): SeabedFeature | null {
    const g = this.readGeometry(f);
    if (!g) return null;
    const p = f.properties || {};
    const raw = cleanStr(p.substrate);
    const { substrateKey, holding, sensitive } = classifySubstrate(raw);
    const feat: SeabedFeature = {
      type: 'Feature',
      properties: compact({ kind: 'substrate', substrate: raw, substrateKey, holding, sensitive: sensitive || undefined }),
      geometry: g,
    };
    return clipFeature(feat, b);
  }

  /** Raw seagrass WFS feature → slim, clipped feature, or null. */
  private normalizeSeagrass(f: any, b: SeabedBbox): SeabedFeature | null {
    const g = this.readGeometry(f);
    if (!g) return null;
    const p = f.properties || {};
    const species = cleanStr(p.habsubtype) ?? cleanStr(p.hab_origin);
    const anxi = cleanStr(p.anxi_code);
    // Posidonia is the legally-protected Annex-I habitat (1120); other seagrass
    // (e.g. Zostera) is ecologically sensitive but gets the softer note.
    const isPosidonia = (species ? /posidonia/i.test(species) : false) || anxi === '1120';
    const feat: SeabedFeature = {
      type: 'Feature',
      properties: compact({
        kind: 'seagrass',
        substrate: species, // verbatim species, e.g. "Posidonia oceanica" / "Zostera"
        substrateKey: 'seagrass',
        holding: 'poor' as Holding,
        sensitive: true,
        protected: isPosidonia || undefined,
      }),
      geometry: g,
    };
    return clipFeature(feat, b, SEAGRASS_SIMPLIFY_EPS_DEG);
  }

  /** Pull a Polygon/MultiPolygon geometry from a raw WFS feature, or null. */
  private readGeometry(f: any): SeabedFeature['geometry'] | null {
    const g = f?.geometry;
    if (!g || !Array.isArray(g.coordinates)) return null;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      return { type: g.type, coordinates: g.coordinates };
    }
    return null;
  }

  // ---- disk + memory cache ------------------------------------------------

  private diskPath(key: string): string {
    const hash = crypto.createHash('sha1').update(key).digest('hex');
    return path.join(this.diskDir, `${hash}.json`);
  }

  private readDisk(key: string): SeabedCollection | null {
    try {
      const p = this.diskPath(key);
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) return parsed;
    } catch (err) {
      console.warn('Failed reading seabed cache file:', err);
    }
    return null;
  }

  private writeDisk(key: string, data: SeabedCollection): void {
    try {
      fs.writeFileSync(this.diskPath(key), JSON.stringify(data));
    } catch (err) {
      console.warn('Failed writing seabed cache file:', err);
    }
  }

  private putMem(key: string, data: SeabedCollection): void {
    if (this.cache.size >= this.MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, data);
  }

  // ---- bbox helpers -------------------------------------------------------

  private snap(b: SeabedBbox): SeabedBbox {
    const q = SNAP_DEG;
    return {
      west: Math.floor(b.west / q) * q,
      south: Math.floor(b.south / q) * q,
      east: Math.ceil(b.east / q) * q,
      north: Math.ceil(b.north / q) * q,
    };
  }

  private isValidBbox(b: SeabedBbox): boolean {
    if (![b.west, b.south, b.east, b.north].every((n) => Number.isFinite(n))) return false;
    if (b.east <= b.west || b.north <= b.south) return false;
    if (b.east - b.west > MAX_SPAN_DEG || b.north - b.south > MAX_SPAN_DEG) return false;
    if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return false;
    return true;
  }

  private cacheKey(b: SeabedBbox): string {
    const r = (n: number) => n.toFixed(2);
    return `${CACHE_VERSION}|${r(b.west)},${r(b.south)},${r(b.east)},${r(b.north)}`;
  }
}

// EMODnet stuffs these placeholders into "no data" cells; treat them as absent.
const PLACEHOLDERS = new Set(['', 'null', '<null>', 'n/a', 'na', 'unknown', 'none', '-']);
function cleanStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return PLACEHOLDERS.has(s.toLowerCase()) ? undefined : s;
}
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
function featureCentre(f: SeabedFeature): [number, number] {
  const first = f.geometry.type === 'Polygon'
    ? (f.geometry.coordinates as number[][][])[0]
    : (f.geometry.coordinates as number[][][][])[0]?.[0];
  if (!first || first.length === 0) return [0, 0];
  const [minX, minY, maxX, maxY] = ringBounds(first);
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}
function distSq([x, y]: [number, number], cx: number, cy: number): number {
  return (x - cx) ** 2 + (y - cy) ** 2;
}

export const seabedService = new SeabedService();
