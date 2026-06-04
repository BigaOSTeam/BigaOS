/**
 * Depth Tile Service
 *
 * Reads raw bathymetry depth values from locally-downloaded GeoTIFF tiles and
 * assembles a depth-value grid for a requested bbox. Two sources, indexed
 * together and preferred finest-first:
 *   - EMODnet Bathymetry DTM (~115 m) — European seas, delivered as regional
 *     sea-basin packs.
 *   - GEBCO (~450 m) — global fallback, delivered as regional packs.
 *
 * Tiles arrive as data packs via the data-management download UI and live under
 * `server/src/data/depth-data/<pack>/`. Filenames carry the source + SW corner,
 * e.g. `EMODnet_Depth_N54E012.tif`, `GEBCO_Depth_N40E000.tif`, and are cut on a
 * global grid aligned to the per-source tile size so a tile's extent is implied
 * by its name (the real extent from the GeoTIFF is used when sampling).
 *
 * `getValueGrid(bbox)` returns a normalised grid the depth-contour service turns
 * into vector isobaths, or `null` when no downloaded tile covers the bbox —
 * which drives the client's "depth data not downloaded" prompt. No online
 * source is ever contacted at runtime.
 *
 * Data: EMODnet Bathymetry (CC BY 4.0); GEBCO Compilation Group (gebco.net).
 * NOT FOR NAVIGATION.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as GeoTIFF from 'geotiff';

export type DepthSource = 'emodnet' | 'gebco';

// Per-source tile size (degrees) and nominal cell size (degrees). Prep cuts
// tiles on a global grid aligned to these sizes so a tile's extent follows from
// its SW corner. Cell size sets the resampled output resolution per request.
const SOURCE_TILE_DEG: Record<DepthSource, number> = { emodnet: 2, gebco: 10 };
const SOURCE_CELL_DEG: Record<DepthSource, number> = {
  emodnet: 1 / 960, // 1/16 arc-minute ≈ 115 m
  gebco: 1 / 240, //   15 arc-seconds ≈ 450 m
};

// Cap the assembled grid per side (matches the contour service's budget).
const MAX_GRID_DIM = 384;

interface TileInfo {
  filePath: string;
  source: DepthSource;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

interface CachedTile {
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

class DepthTileService {
  private dataDir: string;
  private tileIndex: Map<string, TileInfo> = new Map();
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

  /** Rescan tiles (called after a depth pack is downloaded or deleted). */
  async reload(): Promise<void> {
    this.tileIndex.clear();
    this.tileCache.clear();
    this.initialized = false;
    await this.initialize();
  }

  hasData(): boolean {
    return this.tileCount > 0;
  }

  /** Index every `*.tif` under depth-data/ (recursively — one subdir per pack). */
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
        } else if (entry.endsWith('.tif') || entry.endsWith('.tiff')) {
          const info = this.parseTileFilename(entry, full);
          if (info) {
            this.tileIndex.set(this.tileKey(info.source, info.minLon, info.minLat), info);
            this.tileCount++;
          }
        }
      }
    };
    scanDir(this.dataDir);

    if (this.tileCount > 0) {
      const e = Array.from(this.tileIndex.values()).filter((t) => t.source === 'emodnet').length;
      const g = this.tileCount - e;
      console.log(`  Depth tiles: ${this.tileCount} indexed (${e} EMODnet, ${g} GEBCO)`);
    }
  }

  /** `EMODnet_Depth_N54E012.tif` / `GEBCO_Depth_S30W010.tif` → bounds via SW corner + source size. */
  private parseTileFilename(filename: string, fullPath: string): TileInfo | null {
    const m = filename.match(/(EMODnet|GEBCO)_Depth_([NS])(\d+(?:\.\d+)?)([EW])(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const source = m[1].toLowerCase() as DepthSource;
    const minLat = (m[2].toUpperCase() === 'S' ? -1 : 1) * parseFloat(m[3]);
    const minLon = (m[4].toUpperCase() === 'W' ? -1 : 1) * parseFloat(m[5]);
    const size = SOURCE_TILE_DEG[source];
    return { filePath: fullPath, source, minLon, minLat, maxLon: minLon + size, maxLat: minLat + size };
  }

  private tileKey(source: DepthSource, minLon: number, minLat: number): string {
    return `${source}:${minLat.toFixed(3)},${minLon.toFixed(3)}`;
  }

  /** SW corner of the tile (of `source`) that contains a coordinate. */
  private cornerFor(source: DepthSource, lon: number, lat: number): [number, number] {
    const s = SOURCE_TILE_DEG[source];
    return [Math.floor(lon / s) * s, Math.floor(lat / s) * s];
  }

  /** True if any indexed tile of `source` intersects the bbox. */
  private hasSourceCoverage(source: DepthSource, b: DepthBbox): boolean {
    const s = SOURCE_TILE_DEG[source];
    for (let lat = Math.floor(b.south / s) * s; lat < b.north; lat += s) {
      for (let lon = Math.floor(b.west / s) * s; lon < b.east; lon += s) {
        if (this.tileIndex.has(this.tileKey(source, lon, lat))) return true;
      }
    }
    return false;
  }

  /**
   * Cheap index-only check (no tile loads): is any downloaded tile (EMODnet or
   * GEBCO) present for the bbox? Independent of bbox span, so the contour
   * service can report coverage even when a view is too zoomed-out to contour —
   * which keeps the client's "not downloaded" prompt from firing on a fast
   * zoom-out over data that *is* downloaded.
   */
  hasCoverage(b: DepthBbox): boolean {
    return this.hasSourceCoverage('emodnet', b) || this.hasSourceCoverage('gebco', b);
  }

  private async loadTile(info: TileInfo): Promise<CachedTile | null> {
    try {
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

  private async getCachedTile(source: DepthSource, lon: number, lat: number): Promise<CachedTile | null> {
    const [cLon, cLat] = this.cornerFor(source, lon, lat);
    const key = this.tileKey(source, cLon, cLat);

    const hit = this.tileCache.get(key);
    if (hit) { hit.lastAccessed = Date.now(); return hit; }

    const info = this.tileIndex.get(key);
    if (!info) return null;

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

  /** Nearest-pixel sample from a cached tile, or null if the point lies outside it. */
  private sample(tile: CachedTile, lon: number, lat: number): number | null {
    const px = Math.floor(((lon - tile.minX) / (tile.maxX - tile.minX)) * tile.width);
    const py = Math.floor(((tile.maxY - lat) / (tile.maxY - tile.minY)) * tile.height);
    if (px < 0 || px >= tile.width || py < 0 || py >= tile.height) return null;
    const v = tile.band[py * tile.width + px];
    if (v == null || !Number.isFinite(v) || (tile.nodata != null && v === tile.nodata)) return null;
    return v as number;
  }

  /**
   * Assemble a depth-value grid for the bbox from local tiles, preferring the
   * finer EMODnet source where it covers the area, else GEBCO. Returns null when
   * neither source has a downloaded tile intersecting the bbox.
   */
  async getValueGrid(b: DepthBbox): Promise<DepthValueGrid | null> {
    if (!Number.isFinite(b.west) || b.east <= b.west || b.north <= b.south) return null;

    const source: DepthSource | null = this.hasSourceCoverage('emodnet', b)
      ? 'emodnet'
      : this.hasSourceCoverage('gebco', b)
        ? 'gebco'
        : null;
    if (!source) return null;

    const cell = SOURCE_CELL_DEG[source];
    const width = Math.max(2, Math.min(MAX_GRID_DIM, Math.round((b.east - b.west) / cell)));
    const height = Math.max(2, Math.min(MAX_GRID_DIM, Math.round((b.north - b.south) / cell)));
    const band = new Float64Array(width * height);
    const stepX = (b.east - b.west) / width;
    const stepY = (b.north - b.south) / height;

    for (let y = 0; y < height; y++) {
      const lat = b.north - (y + 0.5) * stepY; // cell-centred, north→south
      for (let x = 0; x < width; x++) {
        const lon = b.west + (x + 0.5) * stepX;
        const tile = await this.getCachedTile(source, lon, lat);
        const v = tile ? this.sample(tile, lon, lat) : null;
        band[y * width + x] = v == null ? NO_VALUE : v;
      }
    }

    return { band, width, height, bbox: [b.west, b.south, b.east, b.north], nodata: NO_VALUE };
  }
}

export const depthTileService = new DepthTileService();
