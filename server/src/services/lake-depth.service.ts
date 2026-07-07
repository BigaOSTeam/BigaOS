/**
 * Lake-depth generator — the in-app, pure-Node regional importer.
 *
 * Given a lake name (or OSM relation id) + a known maximum depth, this fetches
 * the lake outline from OpenStreetMap, models bathymetry from distance-to-shore
 * (depth = maxDepth * (dist/maxDist)^profile — islands punched out), and writes
 * a `.lakedepth` tile that the depth engine reads exactly like an EMODnet/GEBCO
 * tile. No GDAL, no conda: runs on the Pi. This is the productised form of
 * scripts/prototype-lake-depth.py.
 *
 * Modeled, NOT measured — a smooth bowl scaled to the real max depth. Good
 * enough for a companion chart; swappable later for a real survey via the same
 * tile slot.
 *
 * Tiles + manifest live under `data/depth-data/custom/`:
 *   <id>.lakedepth   — the depth raster (see geo-raster.ts)
 *   manifest.json    — [{ id, name, relationId, maxDepth, profile, bbox, cells, createdAt }]
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  Ring, Bbox, NODATA,
  extractOuterRings, lakeWaterRings, ringsBbox,
  rasterizeWater, distanceToShore, modelDepth, writeLakeDepth,
} from '../utils/geo-raster';
import { APP_USER_AGENT } from '../utils/app-identity';

// Versioned, contactable UA for the OSM/Overpass/LfU requests this importer makes.
const UA = APP_USER_AGENT;
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const POLYGONS = 'https://polygons.openstreetmap.fr/get_geojson.py';

const TARGET_CELL = 1 / 2000; // ~55 m
const MAX_DIM = 2048;         // cap a side; coarsen the cell for very large lakes
const PAD_CELLS = 3;

export interface LakeCandidate {
  relationId: number;
  name: string;
  center: { lat: number; lon: number };
  areaKm2: number; // rough, from the bounding box (for ranking/display only)
}

export interface ImportedLake {
  id: string;
  name: string;
  relationId: number;
  maxDepth: number;
  profile: number;
  bbox: Bbox;
  cells: number;
  createdAt: string;
}

export type ProgressFn = (
  status: 'converting' | 'indexing' | 'completed' | 'error',
  progress: number,
) => void;

/** Stable id for a lake name (also the tile filename + progress key). */
export function lakeId(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lake';
}

async function fetchText(url: string, init?: any): Promise<string> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

class LakeDepthService {
  private customDir = path.join(__dirname, '..', 'data', 'depth-data', 'custom');
  private manifestPath = path.join(this.customDir, 'manifest.json');

  // -- manifest -------------------------------------------------------------

  listImported(): ImportedLake[] {
    try {
      if (!fs.existsSync(this.manifestPath)) return [];
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')) as ImportedLake[];
    } catch {
      return [];
    }
  }

  private saveManifest(lakes: ImportedLake[]): void {
    fs.mkdirSync(this.customDir, { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(lakes, null, 2));
  }

  remove(id: string): boolean {
    const lakes = this.listImported();
    const idx = lakes.findIndex((l) => l.id === id);
    if (idx < 0) return false;
    const tile = path.join(this.customDir, `${id}.lakedepth`);
    if (fs.existsSync(tile)) fs.unlinkSync(tile);
    lakes.splice(idx, 1);
    this.saveManifest(lakes);
    return true;
  }

  // -- OSM lookups ----------------------------------------------------------

  /** Search OSM for water relations matching a name (for the Add-a-lake picker). */
  async searchLakes(query: string): Promise<LakeCandidate[]> {
    const q = query.trim().replace(/["\\]/g, '');
    if (!q) return [];
    const ql = `[out:json][timeout:25];relation["natural"="water"]["name"~"${q}",i];out tags bb;`;
    const body = await fetchText(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(ql)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const json = JSON.parse(body);
    const out: LakeCandidate[] = [];
    for (const el of json.elements ?? []) {
      if (el.type !== 'relation' || !el.bounds) continue;
      const b = el.bounds;
      const center = { lat: (b.minlat + b.maxlat) / 2, lon: (b.minlon + b.maxlon) / 2 };
      // rough area: bbox span in km (lat 111 km/deg; lon scaled by cos(lat))
      const dLat = (b.maxlat - b.minlat) * 111;
      const dLon = (b.maxlon - b.minlon) * 111 * Math.cos((center.lat * Math.PI) / 180);
      out.push({
        relationId: el.id,
        name: el.tags?.name ?? `relation ${el.id}`,
        center,
        areaKm2: Math.round(dLat * dLon),
      });
    }
    // biggest first — the lake the user means is usually the largest match
    return out.sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, 12);
  }

  /** Stitched lake outline (outer + island holes) for an OSM relation. */
  private async fetchOutlineRings(relationId: number): Promise<Ring[]> {
    // Primary: polygons.osm.fr returns a stitched (Multi)Polygon (handles split
    // outer ways + islands). Fallback: Overpass `out geom` closed ways.
    try {
      const gj = JSON.parse(await fetchText(`${POLYGONS}?id=${relationId}&params=0`));
      const rings = extractOuterRings(gj);
      if (rings.length) return rings;
    } catch (e) {
      console.warn(`  polygons.osm.fr failed for ${relationId}, trying Overpass:`, (e as Error).message);
    }
    const ql = `[out:json][timeout:60];rel(${relationId});out geom;`;
    const body = await fetchText(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(ql)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const json = JSON.parse(body);
    const rings: Ring[] = [];
    for (const el of json.elements ?? []) {
      for (const m of el.members ?? []) {
        if (m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 4) {
          const r = m.geometry.map((p: any) => [p.lon, p.lat] as [number, number]);
          // only keep closed ways (a self-contained ring)
          const a = r[0], z = r[r.length - 1];
          if (Math.abs(a[0] - z[0]) < 1e-9 && Math.abs(a[1] - z[1]) < 1e-9) rings.push(r);
        }
      }
    }
    if (!rings.length) throw new Error(`no usable outline geometry for relation ${relationId}`);
    return rings;
  }

  // -- generation -----------------------------------------------------------

  async generate(
    opts: { name: string; relationId: number; maxDepth: number; profile?: number },
    onProgress?: ProgressFn,
  ): Promise<ImportedLake> {
    const profile = opts.profile && opts.profile > 0 ? opts.profile : 1.0;
    const maxDepth = Math.abs(opts.maxDepth);
    if (!Number.isFinite(maxDepth) || maxDepth <= 0) throw new Error('maxDepth must be a positive number');

    onProgress?.('converting', 5);
    const rings = await this.fetchOutlineRings(opts.relationId);
    const { outer, holes } = lakeWaterRings(rings);

    // bbox padded by a few cells, snapped so extent = grid exactly
    let cell = TARGET_CELL;
    const raw = ringsBbox([outer]);
    let west = raw.west - PAD_CELLS * cell;
    let south = raw.south - PAD_CELLS * cell;
    let east = raw.east + PAD_CELLS * cell;
    let north = raw.north + PAD_CELLS * cell;
    let width = Math.ceil((east - west) / cell);
    let height = Math.ceil((north - south) / cell);
    if (width > MAX_DIM || height > MAX_DIM) {
      cell *= Math.max(width, height) / MAX_DIM;
      width = Math.ceil((east - west) / cell);
      height = Math.ceil((north - south) / cell);
    }
    east = west + width * cell;
    north = south + height * cell;
    const bbox: Bbox = { west, south, east, north };

    onProgress?.('converting', 35);
    const mask = rasterizeWater(outer, holes, bbox, width, height);
    let cells = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) cells++;
    if (cells === 0) throw new Error('rasterised lake is empty (bad outline?)');

    onProgress?.('converting', 65);
    const dist = distanceToShore(mask, width, height);
    const band = modelDepth(mask, dist, maxDepth, profile);

    onProgress?.('indexing', 85);
    const id = lakeId(opts.name);
    fs.mkdirSync(this.customDir, { recursive: true });
    writeLakeDepth(path.join(this.customDir, `${id}.lakedepth`), {
      band, width, height, bbox, nodata: NODATA, cellDeg: cell,
    });

    const lake: ImportedLake = {
      id, name: opts.name, relationId: opts.relationId, maxDepth, profile,
      bbox, cells, createdAt: new Date().toISOString(),
    };
    const lakes = this.listImported().filter((l) => l.id !== id);
    lakes.push(lake);
    this.saveManifest(lakes);

    // 'completed' is emitted by the caller after the depth index is reloaded.
    onProgress?.('indexing', 95);
    return lake;
  }
}

export const lakeDepthService = new LakeDepthService();
