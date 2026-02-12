/**
 * GeoTIFF Water Detection Service
 *
 * Uses OSM Water Layer GeoTIFF tiles (90m resolution) for water detection.
 * Each tile covers 5°×5° at 6000×6000 pixels.
 *
 * Water classification values:
 * 0 = Land (no water)
 * 1 = Ocean
 * 2 = Large Lake or River
 * 3 = Major River
 * 4 = Canal
 * 5 = Small Stream
 *
 * Data: OSM Water Layer by Dai Yamazaki (University of Tokyo)
 * License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
 * Source: https://global-hydrodynamics.github.io/OSM_WaterLayer/
 */

import * as fs from 'fs';
import * as path from 'path';
import { isMainThread } from 'worker_threads';

// Mock the web-worker module before importing geotiff when running in a worker thread
// The geotiff library's internal web-worker dependency fails in Node.js worker threads
// because workerData is undefined when not spawned by web-worker itself
if (!isMainThread) {
  try {
    // Override the require cache with a mock that returns a no-op Worker class
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function(id: string) {
      if (id === 'web-worker' || id.includes('web-worker')) {
        // Return a mock Worker class that does nothing
        return class MockWorker {
          constructor() {}
          postMessage() {}
          terminate() {}
          addEventListener() {}
          removeEventListener() {}
        };
      }
      return originalRequire.apply(this, arguments);
    };
  } catch {
    // Ignore errors - the main thread doesn't need this
  }
}

// Now we can safely import geotiff
import * as GeoTIFF from 'geotiff';

export type GeoTiffWaterType = 'land' | 'ocean' | 'lake' | 'river' | 'canal' | 'stream';

interface TileInfo {
  filePath: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface CachedTile {
  tiff: unknown; // GeoTIFF.GeoTIFF - using unknown to avoid import issues in worker threads
  image: unknown; // GeoTIFF.GeoTIFFImage
  rasters: ArrayLike<number>[]; // GeoTIFF.TypedArray[]
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  lastAccessed: number;
}

class GeoTiffWaterService {
  private dataDir: string;
  private tileIndex: Map<string, TileInfo> = new Map();
  private tileCache: Map<string, CachedTile> = new Map();
  private readonly MAX_CACHED_TILES = 10;
  private initialized = false;
  private tileCount = 0;

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data', 'navigation-data');
  }

  /**
   * Initialize the service by scanning for GeoTIFF tiles
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.scanForTiles();
    this.initialized = true;
  }

  /**
   * Reload (rescan for tiles)
   */
  async reload(): Promise<void> {
    this.tileIndex.clear();
    this.tileCache.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Scan data directory for GeoTIFF tiles
   * Expects naming convention: OSM_WaterLayer_N45W010.tif (lat/lon of SW corner)
   */
  private async scanForTiles(): Promise<void> {
    if (!fs.existsSync(this.dataDir)) {
      console.log('  GeoTIFF water layer directory not found');
      return;
    }

    const scanDir = (dir: string): void => {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.endsWith('.tif') || entry.endsWith('.tiff')) {
          const tileInfo = this.parseTileFilename(entry, fullPath);
          if (tileInfo) {
            const key = this.getTileKey(tileInfo.minLon, tileInfo.minLat);
            this.tileIndex.set(key, tileInfo);
            this.tileCount++;
          }
        }
      }
    };

    scanDir(this.dataDir);

    if (this.tileCount > 0) {
      console.log(`  GeoTIFF water layer: ${this.tileCount} tiles indexed`);
      // Log a few sample tile keys for debugging
      const sampleKeys = Array.from(this.tileIndex.keys()).slice(0, 5);
      console.log(`  Sample tile keys: ${sampleKeys.join(', ')}`);
    }
  }

  /**
   * Parse tile filename to extract bounds
   * Format: OSM_WaterLayer_N45W010.tif
   * The coordinates indicate the SW corner, tiles are 5°×5°
   */
  private parseTileFilename(filename: string, fullPath: string): TileInfo | null {
    // Match pattern like N45W010 or S30E150
    const match = filename.match(/([NS])(\d+)([EW])(\d+)/i);
    if (!match) return null;

    const latDir = match[1].toUpperCase();
    const latVal = parseInt(match[2], 10);
    const lonDir = match[3].toUpperCase();
    const lonVal = parseInt(match[4], 10);

    const minLat = latDir === 'S' ? -latVal : latVal;
    const minLon = lonDir === 'W' ? -lonVal : lonVal;

    return {
      filePath: fullPath,
      minLon,
      maxLon: minLon + 5,
      minLat,
      maxLat: minLat + 5
    };
  }

  /**
   * Get tile key for a coordinate
   */
  private getTileKey(lon: number, lat: number): string {
    // Round down to nearest 5° (tile SW corner)
    const tileLon = Math.floor(lon / 5) * 5;
    const tileLat = Math.floor(lat / 5) * 5;
    return `${tileLat},${tileLon}`;
  }

  /**
   * Load a GeoTIFF tile into cache
   */
  private async loadTile(tileInfo: TileInfo): Promise<CachedTile | null> {
    try {
      const tiff = await GeoTIFF.fromFile(tileInfo.filePath);
      const image = await tiff.getImage();
      // Disable web workers (pool: null) to avoid issues in Node.js worker threads
      const rasters = await image.readRasters({ pool: null });
      const bbox = image.getBoundingBox() as [number, number, number, number];

      const cached: CachedTile = {
        tiff,
        image,
        rasters: rasters as ArrayLike<number>[],
        width: image.getWidth(),
        height: image.getHeight(),
        bbox,
        lastAccessed: Date.now()
      };

      return cached;
    } catch (error) {
      console.error(`Failed to load GeoTIFF tile: ${tileInfo.filePath}`, error);
      return null;
    }
  }

  /**
   * Get cached tile, loading if necessary
   */
  private async getCachedTile(lon: number, lat: number): Promise<CachedTile | null> {
    const key = this.getTileKey(lon, lat);

    // Check cache first
    if (this.tileCache.has(key)) {
      const cached = this.tileCache.get(key)!;
      cached.lastAccessed = Date.now();
      return cached;
    }

    // Look up tile info
    const tileInfo = this.tileIndex.get(key);
    if (!tileInfo) {
      return null; // No tile for this area
    }

    // Load tile
    const cached = await this.loadTile(tileInfo);
    if (!cached) return null;

    // Evict oldest tile if cache is full
    if (this.tileCache.size >= this.MAX_CACHED_TILES) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [k, v] of this.tileCache) {
        if (v.lastAccessed < oldestTime) {
          oldestTime = v.lastAccessed;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.tileCache.delete(oldestKey);
      }
    }

    this.tileCache.set(key, cached);
    return cached;
  }

  /**
   * Get water type at a coordinate (synchronous lookup from cached data)
   */
  getWaterTypeSync(lon: number, lat: number): GeoTiffWaterType {
    const key = this.getTileKey(lon, lat);
    const cached = this.tileCache.get(key);

    if (!cached) {
      return 'land'; // No tile loaded, assume land
    }

    return this.sampleTile(cached, lon, lat);
  }

  /**
   * Get water type at a coordinate (async, loads tile if needed)
   */
  async getWaterType(lon: number, lat: number): Promise<GeoTiffWaterType> {
    const cached = await this.getCachedTile(lon, lat);
    if (!cached) {
      return 'land'; // No tile available for this area
    }

    return this.sampleTile(cached, lon, lat);
  }

  /**
   * Sample a value from a cached tile
   */
  private sampleTile(tile: CachedTile, lon: number, lat: number): GeoTiffWaterType {
    const [minX, minY, maxX, maxY] = tile.bbox;

    // Calculate pixel coordinates
    const xRatio = (lon - minX) / (maxX - minX);
    const yRatio = (maxY - lat) / (maxY - minY); // Y is inverted in raster coordinates

    const pixelX = Math.floor(xRatio * tile.width);
    const pixelY = Math.floor(yRatio * tile.height);

    // Bounds check
    if (pixelX < 0 || pixelX >= tile.width || pixelY < 0 || pixelY >= tile.height) {
      return 'land';
    }

    // Get pixel value (assuming single band)
    const index = pixelY * tile.width + pixelX;
    const value = tile.rasters[0][index];

    return this.classifyWaterValue(value);
  }

  /**
   * Classify water value to type
   */
  private classifyWaterValue(value: number): GeoTiffWaterType {
    switch (value) {
      case 1: return 'ocean';
      case 2: return 'lake';   // Large lake or river
      case 3: return 'river';  // Major river
      case 4: return 'canal';
      case 5: return 'stream'; // Small stream
      default: return 'land';
    }
  }

  /**
   * Check if coordinate is on water (async)
   */
  async isWater(lon: number, lat: number): Promise<boolean> {
    const type = await this.getWaterType(lon, lat);
    return type !== 'land';
  }

  /**
   * Check if coordinate is on water (sync, from cache only)
   */
  isWaterSync(lon: number, lat: number): boolean {
    const type = this.getWaterTypeSync(lon, lat);
    return type !== 'land';
  }

  /**
   * Preload tiles for a bounding box
   */
  async preloadTiles(minLon: number, minLat: number, maxLon: number, maxLat: number): Promise<number> {
    let loaded = 0;

    // Iterate over all tiles that intersect the bbox
    for (let lat = Math.floor(minLat / 5) * 5; lat <= maxLat; lat += 5) {
      for (let lon = Math.floor(minLon / 5) * 5; lon <= maxLon; lon += 5) {
        const key = this.getTileKey(lon, lat);
        if (!this.tileCache.has(key)) {
          if (this.tileIndex.has(key)) {
            const tile = await this.getCachedTile(lon, lat);
            if (tile) {
              console.log(`  Loaded tile for key ${key}`);
              loaded++;
            }
          }
        }
      }
    }

    return loaded;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if GeoTIFF data is available
   */
  hasData(): boolean {
    return this.tileCount > 0;
  }

  /**
   * Get stats
   */
  getStats(): { tileCount: number; cachedTiles: number } {
    return {
      tileCount: this.tileCount,
      cachedTiles: this.tileCache.size
    };
  }
}

export const geoTiffWaterService = new GeoTiffWaterService();
