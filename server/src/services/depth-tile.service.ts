/**
 * Depth Tile Service
 *
 * Reads raw bathymetry depth values from locally-downloaded tiles and assembles
 * a depth-value grid for a requested bbox. Three sources, indexed together and
 * preferred finest-first:
 *   - custom  — user-imported regional tiles (e.g. lakes added via the in-app
 *     importer). Arbitrary extent, NOT on the global grid; indexed by the tile's
 *     real bounds and matched by bbox containment. Stored as `.lakedepth`
 *     (see geo-raster.ts) under `depth-data/custom/`.
 *   - EMODnet Bathymetry DTM (~115 m) — European seas, regional sea-basin packs.
 *   - GEBCO (~450 m) — global fallback, regional packs.
 *
 * EMODnet/GEBCO tiles are cut on a global grid aligned to the per-source tile
 * size, so a tile's extent follows from its filename SW corner. Custom tiles
 * carry their own extent + cell size and are looked up by containment instead.
 *
 * `getValueGrid(bbox)` returns a normalised grid the depth-contour service turns
 * into vector isobaths, or `null` when no downloaded tile covers the bbox.
 * No online source is ever contacted at runtime.
 *
 * Data: EMODnet Bathymetry (CC BY 4.0); GEBCO Compilation Group (gebco.net);
 * custom layers are user-supplied. NOT FOR NAVIGATION.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as GeoTIFF from 'geotiff';
import { readLakeDepth, readLakeDepthHeader } from '../utils/geo-raster';

// Grid-bound sources (cut on a global lat/lon grid) vs. the free-form `custom`.
export type GridSource = 'emodnet' | 'gebco';
export type DepthSource = GridSource | 'custom';

// Per-source tile size (degrees) and nominal cell size (degrees). Prep cuts
// tiles on a global grid aligned to these sizes so a tile's extent follows from
// its SW corner. Cell size sets the resampled output resolution per request.
const SOURCE_TILE_DEG: Record<GridSource, number> = { emodnet: 2, gebco: 10 };
const SOURCE_CELL_DEG: Record<GridSource, number> = {
  emodnet: 1 / 960, // 1/16 arc-minute ≈ 115 m
  gebco: 1 / 240, //   15 arc-seconds ≈ 450 m
};

// Cap the assembled grid per side (matches the contour service's budget).
const MAX_GRID_DIM = 384;

export interface TileInfo {
  filePath: string;
  source: DepthSource;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  cellDeg?: number; // custom only: the tile's native cell size
}

export interface CachedTile {
  band: ArrayLike<number>;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  nodata: number | null;
  lastAccessed: number;
}

/** Normalised grid handed to the contour builder — mirrors the old GeoTIFF read. */
export interface DepthValueGrid {
  band: ArrayLike<number>;
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  nodata: number;
}

export interface DepthBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Marker for cells no downloaded tile covers (and for tile nodata). Far outside
// any real elevation, so the contour builder maps it to its land sentinel.
const NO_VALUE = 1e7;

/**
 * Nearest-pixel sample from a cached tile, or null if the point lies outside it
 * or hits nodata. Shared with the route worker's depth gate, which keeps its
 * own tile set for synchronous lookups in the A* hot loop.
 */
export function sampleCachedTile(tile: CachedTile, lon: number, lat: number): number | null {
  const px = Math.floor(((lon - tile.minX) / (tile.maxX - tile.minX)) * tile.width);
  const py = Math.floor(((tile.maxY - lat) / (tile.maxY - tile.minY)) * tile.height);
  if (px < 0 || px >= tile.width || py < 0 || py >= tile.height) return null;
  const v = tile.band[py * tile.width + px];
  if (v == null || !Number.isFinite(v) || (tile.nodata != null && v === tile.nodata)) return null;
  return v as number;
}

class DepthTileService {
  private dataDir: string;
  private tileIndex: Map<string, TileInfo> = new Map(); // grid sources, keyed by corner
  private customTiles: TileInfo[] = []; // free-form, matched by bbox containment
  private tileCache: Map<string, CachedTile> = new Map();
  private readonly MAX_CACHED_TILES = 12;
  private initialized = false;
  private tileCount = 0;

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'depth-data');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.scanForTiles();
    this.initialized = true;
  }

  /** Rescan tiles (called after a depth pack is downloaded/deleted or a lake imported). */
  async reload(): Promise<void> {
    this.tileIndex.clear();
    this.customTiles = [];
    this.tileCache.clear();
    this.initialized = false;
    await this.initialize();
  }

  hasData(): boolean {
    return this.tileCount > 0;
  }

  /** Index every tile under depth-data/ (recursively — one subdir per pack). */
  private scanForTiles(): void {
    this.tileCount = 0;
    if (!fs.existsSync(this.dataDir)) {
      console.log('  Depth tiles: directory not found (no packs downloaded)');
      return;
    }

    const scanDir = (dir: string): void => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stats = fs.statSync(full);
        if (stats.isDirectory()) {
          scanDir(full);
        } else if (entry.endsWith('.lakedepth')) {
          const info = this.parseCustomTile(full);
          if (info) {
            this.customTiles.push(info);
            this.tileCount++;
          }
        } else if (entry.endsWith('.tif') || entry.endsWith('.tiff')) {
          const info = this.parseTileFilename(entry, full);
          if (info) {
            this.tileIndex.set(this.tileKey(info.source as GridSource, info.minLon, info.minLat), info);
            this.tileCount++;
          }
        }
      }
    };
    scanDir(this.dataDir);

    if (this.tileCount > 0) {
      const e = Array.from(this.tileIndex.values()).filter((t) => t.source === 'emodnet').length;
      const g = this.tileIndex.size - e;
      const c = this.customTiles.length;
      console.log(`  Depth tiles: ${this.tileCount} indexed (${e} EMODnet, ${g} GEBCO, ${c} custom)`);
    }
  }

  /** `EMODnet_Depth_N54E012.tif` / `GEBCO_Depth_S30W010.tif` → bounds via SW corner + source size. */
  private parseTileFilename(filename: string, fullPath: string): TileInfo | null {
    const m = filename.match(/(EMODnet|GEBCO)_Depth_([NS])(\d+(?:\.\d+)?)([EW])(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const source = m[1].toLowerCase() as GridSource;
    const minLat = (m[2].toUpperCase() === 'S' ? -1 : 1) * parseFloat(m[3]);
    const minLon = (m[4].toUpperCase() === 'W' ? -1 : 1) * parseFloat(m[5]);
    const size = SOURCE_TILE_DEG[source];
    return { filePath: fullPath, source, minLon, minLat, maxLon: minLon + size, maxLat: minLat + size };
  }

  /** Read a custom `.lakedepth` tile's real bounds (no band load). */
  private parseCustomTile(fullPath: string): TileInfo | null {
    try {
      const h = readLakeDepthHeader(fullPath);
      return {
        filePath: fullPath,
        source: 'custom',
        minLon: h.bbox.west,
        minLat: h.bbox.south,
        maxLon: h.bbox.east,
        maxLat: h.bbox.north,
        cellDeg: h.cellDeg,
      };
    } catch (err) {
      console.error(`Failed to index custom depth tile ${fullPath}:`, err);
      return null;
    }
  }

  private tileKey(source: GridSource, minLon: number, minLat: number): string {
    return `${source}:${minLat.toFixed(3)},${minLon.toFixed(3)}`;
  }

  /** SW corner of the tile (of `source`) that contains a coordinate. */
  private cornerFor(source: GridSource, lon: number, lat: number): [number, number] {
    const s = SOURCE_TILE_DEG[source];
    return [Math.floor(lon / s) * s, Math.floor(lat / s) * s];
  }

  /** True if any indexed grid tile of `source` intersects the bbox. */
  private hasSourceCoverage(source: GridSource, b: DepthBbox): boolean {
    const s = SOURCE_TILE_DEG[source];
    for (let lat = Math.floor(b.south / s) * s; lat < b.north; lat += s) {
      for (let lon = Math.floor(b.west / s) * s; lon < b.east; lon += s) {
        if (this.tileIndex.has(this.tileKey(source, lon, lat))) return true;
      }
    }
    return false;
  }

  /** True if any custom tile's real bbox intersects the requested bbox. */
  private hasCustomCoverage(b: DepthBbox): boolean {
    return this.customTiles.some(
      (t) => t.minLon < b.east && t.maxLon > b.west && t.minLat < b.north && t.maxLat > b.south,
    );
  }

  /** The custom tile containing a point (smallest-area wins on overlap), or null. */
  private findCustomTile(lon: number, lat: number): TileInfo | null {
    let best: TileInfo | null = null;
    let bestArea = Infinity;
    for (const t of this.customTiles) {
      if (lon >= t.minLon && lon < t.maxLon && lat >= t.minLat && lat < t.maxLat) {
        const area = (t.maxLon - t.minLon) * (t.maxLat - t.minLat);
        if (area < bestArea) { best = t; bestArea = area; }
      }
    }
    return best;
  }

  /**
   * Cheap index-only check (no tile loads): is any downloaded tile present for
   * the bbox? Independent of bbox span, so the contour service can report
   * coverage even when a view is too zoomed-out to contour.
   */
  hasCoverage(b: DepthBbox): boolean {
    return this.hasCustomCoverage(b) || this.hasSourceCoverage('emodnet', b) || this.hasSourceCoverage('gebco', b);
  }

  private async loadTile(info: TileInfo): Promise<CachedTile | null> {
    try {
      if (info.source === 'custom') {
        const r = readLakeDepth(info.filePath);
        return {
          band: r.band,
          width: r.width,
          height: r.height,
          minX: r.bbox.west, minY: r.bbox.south, maxX: r.bbox.east, maxY: r.bbox.north,
          nodata: r.nodata,
          lastAccessed: Date.now(),
        };
      }
      const tiff = await GeoTIFF.fromFile(info.filePath);
      const image = await tiff.getImage();
      const rasters = await image.readRasters({ pool: null });
      const [minX, minY, maxX, maxY] = image.getBoundingBox() as [number, number, number, number];
      return {
        band: rasters[0] as ArrayLike<number>,
        width: image.getWidth(),
        height: image.getHeight(),
        minX, minY, maxX, maxY,
        nodata: image.getGDALNoData(),
        lastAccessed: Date.now(),
      };
    } catch (err) {
      console.error(`Failed to load depth tile ${info.filePath}:`, err);
      return null;
    }
  }

  /** Load (or return cached) a tile by cache key, with LRU eviction. */
  private async getOrLoad(key: string, info: TileInfo): Promise<CachedTile | null> {
    const hit = this.tileCache.get(key);
    if (hit) { hit.lastAccessed = Date.now(); return hit; }

    const loaded = await this.loadTile(info);
    if (!loaded) return null;

    if (this.tileCache.size >= this.MAX_CACHED_TILES) {
      let oldestKey = '';
      let oldest = Infinity;
      for (const [k, v] of this.tileCache) {
        if (v.lastAccessed < oldest) { oldest = v.lastAccessed; oldestKey = k; }
      }
      if (oldestKey) this.tileCache.delete(oldestKey);
    }
    this.tileCache.set(key, loaded);
    return loaded;
  }

  /** Sample one value for a source at a coordinate, or null if uncovered. */
  private async valueAt(source: DepthSource, lon: number, lat: number): Promise<number | null> {
    let info: TileInfo | undefined | null;
    let key: string;
    if (source === 'custom') {
      info = this.findCustomTile(lon, lat);
      if (!info) return null;
      key = `custom:${info.filePath}`;
    } else {
      const [cLon, cLat] = this.cornerFor(source, lon, lat);
      key = this.tileKey(source, cLon, cLat);
      info = this.tileIndex.get(key);
      if (!info) return null;
    }
    const tile = await this.getOrLoad(key, info);
    return tile ? this.sample(tile, lon, lat) : null;
  }

  /** Nearest-pixel sample from a cached tile, or null if the point lies outside it. */
  private sample(tile: CachedTile, lon: number, lat: number): number | null {
    return sampleCachedTile(tile, lon, lat);
  }

  /**
   * Every indexed tile (all sources) intersecting the bbox — no loads, just the
   * index. The route worker uses this to preload its own tile set for
   * synchronous depth gating.
   */
  tilesIntersecting(b: DepthBbox): TileInfo[] {
    const out: TileInfo[] = [];
    for (const t of this.customTiles) {
      if (t.minLon < b.east && t.maxLon > b.west && t.minLat < b.north && t.maxLat > b.south) out.push(t);
    }
    for (const source of ['emodnet', 'gebco'] as GridSource[]) {
      const s = SOURCE_TILE_DEG[source];
      for (let lat = Math.floor(b.south / s) * s; lat < b.north; lat += s) {
        for (let lon = Math.floor(b.west / s) * s; lon < b.east; lon += s) {
          const info = this.tileIndex.get(this.tileKey(source, lon, lat));
          if (info) out.push(info);
        }
      }
    }
    return out;
  }

  /** Raw tile load for callers that manage their own tile lifetime (route worker). */
  loadTileData(info: TileInfo): Promise<CachedTile | null> {
    return this.loadTile(info);
  }

  /** Finest cell size (deg) among custom tiles intersecting the bbox. */
  private customCellDeg(b: DepthBbox): number {
    let cell = SOURCE_CELL_DEG.emodnet;
    for (const t of this.customTiles) {
      if (t.minLon < b.east && t.maxLon > b.west && t.minLat < b.north && t.maxLat > b.south && t.cellDeg) {
        cell = Math.min(cell, t.cellDeg);
      }
    }
    return cell;
  }

  /**
   * Assemble a depth-value grid for the bbox from local tiles, preferring
   * custom (imported) tiles, then the finer EMODnet, then GEBCO. Returns null
   * when no source has a downloaded tile intersecting the bbox.
   */
  async getValueGrid(b: DepthBbox): Promise<DepthValueGrid | null> {
    if (!Number.isFinite(b.west) || b.east <= b.west || b.north <= b.south) return null;

    const source: DepthSource | null = this.hasCustomCoverage(b)
      ? 'custom'
      : this.hasSourceCoverage('emodnet', b)
        ? 'emodnet'
        : this.hasSourceCoverage('gebco', b)
          ? 'gebco'
          : null;
    if (!source) return null;

    const cell = source === 'custom' ? this.customCellDeg(b) : SOURCE_CELL_DEG[source];
    const width = Math.max(2, Math.min(MAX_GRID_DIM, Math.round((b.east - b.west) / cell)));
    const height = Math.max(2, Math.min(MAX_GRID_DIM, Math.round((b.north - b.south) / cell)));
    const band = new Float64Array(width * height);
    const stepX = (b.east - b.west) / width;
    const stepY = (b.north - b.south) / height;

    for (let y = 0; y < height; y++) {
      const lat = b.north - (y + 0.5) * stepY; // cell-centred, north→south
      for (let x = 0; x < width; x++) {
        const lon = b.west + (x + 0.5) * stepX;
        const v = await this.valueAt(source, lon, lat);
        band[y * width + x] = v == null ? NO_VALUE : v;
      }
    }

    return { band, width, height, bbox: [b.west, b.south, b.east, b.north], nodata: NO_VALUE };
  }
}

export const depthTileService = new DepthTileService();
