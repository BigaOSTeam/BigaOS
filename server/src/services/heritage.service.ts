/**
 * Heritage ("Worth a Look") Service
 *
 * Serves points of interest near the boat — EMODnet **shipwrecks**
 * (`emodnet:heritageshipwrecks`, ~7k) + **UNESCO coastal World Heritage sites**
 * (`emodnet:unescowhl`, ~140) — as a single GeoJSON Point FeatureCollection for
 * a requested bbox.
 *
 * **Offline-first, online-fallback** (same shape as the depth-contour service):
 *   1. `local`  — a downloaded pack under `data/heritage-data/**.geojson`
 *                 (Settings → Downloads). The whole European set is one small
 *                 file, so it's loaded into memory once and filtered per bbox.
 *   2. `online` — live EMODnet Human Activities WFS (GeoJSON), bbox-filtered,
 *                 normalised, disk-cached. Works out of the box.
 *   3. `none`   — the online fetch failed.
 * The result reports its `source` so the client can nudge a download for offline.
 *
 * Both the downloaded pack (produced by scripts/prepare-heritage.py) and this
 * service's online normaliser emit the SAME slim feature shape, so local and
 * online render identically.
 *
 * Data: EMODnet Human Activities (CC BY 4.0; originator AND-International).
 * NOT FOR NAVIGATION — positions can be approximate.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { assertSafeOutboundUrl } from '../utils/url-safety';
import { APP_USER_AGENT } from '../utils/app-identity';

export interface HeritageBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** One normalised point of interest (slim, render-ready, units = metres). */
export interface HeritageFeature {
  type: 'Feature';
  properties: {
    kind: 'wreck' | 'site';
    name?: string;
    country?: string;
    depth?: number; // metres (wrecks only)
    year?: number; // sink year (wrecks) / inscription year (sites)
    period?: string;
    category?: string;
    desc?: string;
    url?: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
}

export interface HeritageCollection {
  type: 'FeatureCollection';
  features: HeritageFeature[];
}

export type HeritageSource = 'local' | 'online' | 'none';

export interface HeritageResult {
  collection: HeritageCollection;
  source: HeritageSource;
}

// EMODnet Human Activities WFS — the two cultural-heritage layers. Output is
// standard GeoJSON ([lon,lat]); the *request* bbox uses lat,lon for EPSG:4326
// in WFS 2.0.0 (axis-order caveat) — see buildWfsUrl below.
const WFS_BASE = 'https://ows.emodnet-humanactivities.eu/wfs';
const WFS_LAYERS: { typeName: string; kind: 'wreck' | 'site' }[] = [
  { typeName: 'emodnet:heritageshipwrecks', kind: 'wreck' },
  { typeName: 'emodnet:unescowhl', kind: 'site' },
];

// Snap requested bboxes outward to this grid so small pans reuse the same cache
// entry. Must match the client's SNAP_DEG. Coarser than depth (POIs are sparse).
const SNAP_DEG = 0.5;

// "Worth a Look" is a zoomed-in feature; refuse spans larger than this so a live
// WFS pull over a continent can't return thousands of points.
const MAX_SPAN_DEG = 6;

// Cap features returned per request (nearest-to-centre first) to keep the marker
// layer light.
const MAX_FEATURES = 600;

// Bump to invalidate cached online results (e.g. if normalisation changes).
const CACHE_VERSION = 'v1';

const EMPTY: HeritageCollection = { type: 'FeatureCollection', features: [] };

// EMODnet stuffs these placeholders into "no data" cells; treat them as absent
// (else most wrecks would show a "n/a" period/category and a broken "n/a" link).
// Keep in sync with scripts/prepare-heritage.py.
const PLACEHOLDERS = new Set(['', 'null', '<null>', 'n/a', 'na', 'unknown', 'none', '-']);

/** Trim a WFS string field; treat empty / null-ish placeholders as absent. */
function cleanStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return PLACEHOLDERS.has(s.toLowerCase()) ? undefined : s;
}

/** Parse a year-ish field to a plain integer, or undefined. */
function cleanYear(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n !== 0 ? Math.trunc(n) : undefined;
}

/**
 * Parse a depth-ish field (metres over the wreck) to a positive number, or
 * undefined. least_depth = 0 is EMODnet's "unknown" placeholder (>half the
 * wrecks), so drop it rather than show a misleading "0.0 m".
 */
function cleanDepth(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined;
}

/** Drop undefined props so the payload stays small. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

class HeritageService {
  private dataDir: string;
  private diskDir: string;
  private features: HeritageFeature[] = [];
  private initialized = false;

  // Online: hot in-memory LRU + persistent disk cache + inflight de-dupe.
  private cache = new Map<string, HeritageCollection>();
  private readonly MAX_CACHE = 40;
  private inflight = new Map<string, Promise<HeritageCollection | null>>();

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'heritage-data');
    this.diskDir = path.join(__dirname, '..', 'data', 'heritage-cache');
    try {
      if (!fs.existsSync(this.diskDir)) fs.mkdirSync(this.diskDir, { recursive: true });
    } catch (err) {
      console.warn('Could not create heritage cache dir:', err);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.loadLocal();
    this.initialized = true;
  }

  /** Re-read the local pack (called after a heritage pack download/delete). */
  async reload(): Promise<void> {
    this.initialized = false;
    this.cache.clear();
    this.inflight.clear();
    await this.initialize();
  }

  /** Whether a downloaded pack is present (coverage is the whole European set). */
  hasLocal(): boolean {
    return this.features.length > 0;
  }

  /** Scan `heritage-data/**.geojson` and load all features into memory. */
  private loadLocal(): void {
    this.features = [];
    if (!fs.existsSync(this.dataDir)) {
      console.log('  Heritage: directory not found (no pack downloaded)');
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
      const w = this.features.filter((f) => f.properties.kind === 'wreck').length;
      console.log(`  Heritage: ${this.features.length} features (${w} wrecks, ${this.features.length - w} sites)`);
    }
  }

  private loadFile(file: string): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const feats = Array.isArray(parsed?.features) ? parsed.features : [];
      for (const f of feats) {
        const g = f?.geometry;
        const c = g?.coordinates;
        if (g?.type !== 'Point' || !Array.isArray(c) || c.length < 2) continue;
        const lon = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const kind = f?.properties?.kind === 'site' ? 'site' : 'wreck';
        this.features.push({
          type: 'Feature',
          properties: { ...f.properties, kind },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        });
      }
    } catch (err) {
      console.warn(`Failed to read heritage file ${file}:`, err);
    }
  }

  /**
   * Features for a bbox, offline-first: local pack → live WFS → none. Returns the
   * `source` so the client can offer a download.
   */
  async getFeatures(reqBbox: HeritageBbox): Promise<HeritageResult> {
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

    let online: HeritageCollection | null;
    try {
      online = await promise;
    } catch (err) {
      console.warn('Heritage online fetch failed for bbox', bbox, err instanceof Error ? err.message : err);
      return { collection: EMPTY, source: 'none' };
    }
    if (!online) return { collection: EMPTY, source: 'none' };
    this.putMem(key, online);
    return { collection: online, source: 'online' };
  }

  // ---- local --------------------------------------------------------------

  private filterLocal(b: HeritageBbox): HeritageCollection {
    const hits = this.features.filter((f) => {
      const [lon, lat] = f.geometry.coordinates;
      return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
    });
    return { type: 'FeatureCollection', features: this.cap(hits, b) };
  }

  /** Cap to MAX_FEATURES, keeping those nearest the bbox centre. */
  private cap(feats: HeritageFeature[], b: HeritageBbox): HeritageFeature[] {
    if (feats.length <= MAX_FEATURES) return feats;
    const cx = (b.west + b.east) / 2;
    const cy = (b.south + b.north) / 2;
    return feats
      .map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return { f, d: (lon - cx) ** 2 + (lat - cy) ** 2 };
      })
      .sort((a, z) => a.d - z.d)
      .slice(0, MAX_FEATURES)
      .map((x) => x.f);
  }

  // ---- online (EMODnet WFS) + disk cache ----------------------------------

  private async fetchOnline(b: HeritageBbox, key: string): Promise<HeritageCollection | null> {
    const disk = this.readDisk(key);
    if (disk) return disk;

    const all: HeritageFeature[] = [];
    for (const layer of WFS_LAYERS) {
      const raw = await this.fetchLayer(b, layer.typeName);
      if (raw === null) return null; // network error → 'none' (don't cache a partial)
      for (const f of raw) {
        const norm = this.normalize(f, layer.kind);
        if (norm) all.push(norm);
      }
    }
    const collection: HeritageCollection = { type: 'FeatureCollection', features: this.cap(all, b) };
    this.writeDisk(key, collection);
    return collection;
  }

  /** GET one WFS layer's features for the bbox as raw GeoJSON, or null on error. */
  private async fetchLayer(b: HeritageBbox, typeName: string): Promise<any[] | null> {
    const url = this.buildWfsUrl(b, typeName);
    try {
      assertSafeOutboundUrl(url, 'emodnet wfs'); // SSRF guard (fixed host)
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      let res: Response;
      try {
        res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': APP_USER_AGENT } });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        console.warn(`Heritage WFS ${typeName} HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as any;
      return Array.isArray(json?.features) ? json.features : [];
    } catch (err) {
      console.warn(`Heritage WFS ${typeName} unavailable:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Build a WFS 2.0.0 GetFeature URL. EPSG:4326 axis order is lat,lon for the
   * *bbox* (append the CRS URN); the GeoJSON output stays standard [lon,lat].
   */
  private buildWfsUrl(b: HeritageBbox, typeName: string): string {
    const bbox = `${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`;
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      count: String(MAX_FEATURES),
      bbox,
    });
    return `${WFS_BASE}?${params.toString()}`;
  }

  /** Raw EMODnet WFS feature → slim render-ready feature, or null if unusable. */
  private normalize(f: any, kind: 'wreck' | 'site'): HeritageFeature | null {
    const c = f?.geometry?.coordinates;
    if (f?.geometry?.type !== 'Point' || !Array.isArray(c) || c.length < 2) return null;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const p = f.properties || {};

    let props: HeritageFeature['properties'];
    if (kind === 'wreck') {
      props = {
        kind,
        name: cleanStr(p.name),
        country: cleanStr(p.country),
        depth: cleanDepth(p.least_depth) ?? cleanDepth(p.max_depth),
        year: cleanYear(p.sink_yr),
        period: cleanStr(p.period) ?? cleanStr(p.dating),
        category: cleanStr(p.obj_type),
        desc: cleanStr(p.obj_desc) ?? cleanStr(p.ship_char),
        url: cleanStr(p.website1) ?? cleanStr(p.website2) ?? cleanStr(p.reference),
      };
    } else {
      const sid = cleanStr(p.source_id);
      props = {
        kind,
        name: cleanStr(p.name),
        country: cleanStr(p.country),
        year: cleanYear(p.inscriptio),
        category: cleanStr(p.category),
        desc: cleanStr(p.descriptio),
        url: sid ? `https://whc.unesco.org/en/list/${sid}` : undefined,
      };
    }

    return {
      type: 'Feature',
      properties: compact(props),
      geometry: { type: 'Point', coordinates: [round5(lon), round5(lat)] },
    };
  }

  private diskPath(key: string): string {
    const hash = crypto.createHash('sha1').update(key).digest('hex');
    return path.join(this.diskDir, `${hash}.json`);
  }

  private readDisk(key: string): HeritageCollection | null {
    try {
      const p = this.diskPath(key);
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) return parsed;
    } catch (err) {
      console.warn('Failed reading heritage cache file:', err);
    }
    return null;
  }

  private writeDisk(key: string, data: HeritageCollection): void {
    try {
      fs.writeFileSync(this.diskPath(key), JSON.stringify(data));
    } catch (err) {
      console.warn('Failed writing heritage cache file:', err);
    }
  }

  private putMem(key: string, data: HeritageCollection): void {
    if (this.cache.size >= this.MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, data);
  }

  // ---- bbox helpers -------------------------------------------------------

  private snap(b: HeritageBbox): HeritageBbox {
    const q = SNAP_DEG;
    return {
      west: Math.floor(b.west / q) * q,
      south: Math.floor(b.south / q) * q,
      east: Math.ceil(b.east / q) * q,
      north: Math.ceil(b.north / q) * q,
    };
  }

  private isValidBbox(b: HeritageBbox): boolean {
    if (![b.west, b.south, b.east, b.north].every((n) => Number.isFinite(n))) return false;
    if (b.east <= b.west || b.north <= b.south) return false;
    if (b.east - b.west > MAX_SPAN_DEG || b.north - b.south > MAX_SPAN_DEG) return false;
    if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return false;
    return true;
  }

  private cacheKey(b: HeritageBbox): string {
    const r = (n: number) => n.toFixed(2);
    return `${CACHE_VERSION}|${r(b.west)},${r(b.south)},${r(b.east)},${r(b.north)}`;
  }
}

export const heritageService = new HeritageService();
