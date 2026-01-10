/**
 * Tiles Controller
 *
 * Handles offline map tile downloads, region management, and tile serving.
 * Downloads tiles from OpenStreetMap, ArcGIS, and OpenSeaMap for offline use.
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  Bounds,
  calculateTotalTiles,
  estimateStorageBytes,
  generateTileCoords,
  getTileUrl,
  validateBounds,
  formatBytes,
  TileCoord,
} from '../utils/tile-math';
import { connectivityService } from '../services/connectivity.service';
import db from '../database/database';

// Default geocoding URL
const DEFAULT_NOMINATIM_URL = 'https://photon.komoot.io';

// Pre-generated 256x256 PNG placeholder tile - black background with white "Not downloaded" text
const PLACEHOLDER_TILE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAACXBIWXMAAAsTAAALEwEAmpwYAAAPBUlEQVR4nO3bZahtRRvA8cfuVgwMFLGwC/OLiC2i2IpioB9sMVDsbmxRUVExUOwERRQ7wcTuFhO75uUZmMXa5577en19cR84v4HFPWvttdeeNfc//5l5ZiYiojiUAQZivJbB0DPgUAYYCAIAARFgIPQAQEAEGAhDABAQAQZCDAAERICBEAQEARFgIMwCgIAIMBCmAUFABBgI6wBAQAQYCAuBQEAEGAgrAUFABBgI6wBAQAQYCHsBQEAEGAibgUBABBgIuwFBQAQYCNuBQUAERRmAAAQYKOO4DIaeAYcywEAQAAiIAAOhBwACIsBAGAKAgAgwEGIAICACDIQgIAiIAANhFgAERICBMA0IAiLAQFgHAAIiwEBYCAQCIsBAWAkIAiLAQFgKDAIiwEDYCwACIsBA2AwEAiLAQNgNCAIiwEDYDgwCIijKAAQgwEAZx2Uw9Aw4lAEGggBAQAQYCD0AEBABBsIQAAREgIEQAwABEWAgBAFBQAQYCLMAICACDIRpQBAQAQbCOgAQEAEGwkIgEBABBsJKQBAQAQbCUmAQEAEGwl4AEBABBsJmIBAQAQbCbkAQEAEGwnZgEBBBUQYgAAEGyjgug6FnwKEMMBAEAAIiwEDoAYCACDAQhgAgIAIMhBgACIgAAyEICAIiwECYBQABEWAgTAOCgAgwENYBgIAIMBAWAoGACDAQVgKCgAgwEJYCg4AIMBD2AoCACDAQNgOBgAgwEHYDgoAIMBC2A4OACIoyAAEIMFDGcRkMPQMOZYCBIAAQEAEGQg8ABESAgTAEAAERYCDEAEBABBgIQUAQEAEGwiwACIgAA2EaEAREgIGwDgAERICBsBAIBESAgbASEAREgIGwFBgERICBsBcABESAgbAZCAREgIGwGxAERICBsB0YBERQlAEIQICBMo7LYOgZcCgDDAQBgIAIMBB6ACAgAgyEIQAIiAADIQYAAiLAQAgCgoAIMBBmAUBABBgI04AgIAIMhHUAICACDISFQCAgAgyElYAgIAIMhKXAICACDIS9ACAgAgyEzUAgIAIMhN2AICACDITtwCAggqIMQAACDJRxXAZDz4BDGWAgCAAERICB0AMAARFgIAwBQEAEGAgxABAQAQZCEBAERICBMAsAAiLAQJgGBAERYCCsAwABEWAgLAQCARFgIKwEBAERYCAsBQYBEWAg7AUAARFgIGwGAgERYCDsBgQBEWAgbAcGAREUZQACEGCgjOMyGHoGHMoAA0EAQ4VgmmmmKV999VU9DjnkkIHP5pprru6zWWed9W8/e4EFFiibbrrp3/7e8ccfX3/z0ksvHRMVZNlll635+fLLL/+137ziiivqbx599NH/+FmZ73zWCiusMPSyjLFzDD0DY0YALf3www9l4YUX7j6be+65u89mm222v/XcXXbZpT7v7LPP/tt5OuOMM+pvXnvttUMvnzyy4mT6888//7XfvOGGG+pvnnLKKf/4WZnvTKusssrQyzLGzjH0DIw5AWS65557/i8CuOqqq+r3COB/+38hgCCAYQgg0+abb/5fBZDXzzvvvPLGG2+UL774ojzyyCNl22237T4/9NBDy8cff1y/9/7775f77ruvzDjjjBP9/ZNPPrm88sor9d5jjz22SmNkD2CKKaYo++yzT3nmmWfqb+b9J5xwQplhhhnq5+uuu279new9tO9sv/329drll1/eXdt4443rtdNPP72ep/DyfPHFF6+V7tNPPy3PPvts2W+//f6yB5DX8zsffPBB+eSTT8ptt91WVl111YF7Fllkkfoeb731Vu2Kv/zyy7VVn3baabt7Zp555nLhhReWN998s9637777lhtvvHGCHkDm8eabb655fO+998pll11W5p133oHfW2655eo7ZX4ef/zxmh89gBiNveG3vmNNAFkRWqXNCjuaAOaZZ57y0Ucf1Ws///xzV9EzZeXtt/79NLEexJ133lk//+WXX8oTTzxRvv766/rckQJoFSJh/vDDD8tvv/1Wz5988sky3XTT1Yrwxx9/lB9//LGe95+d12efffZ6LZ+ZKSWV57/++ms9z/dIqWQFbCmlMjEBrLPOOl0+v/nmm5rv9h4bbrhhV7Zvv/12V6aPPvpol+9WVlNNNVV57rnnuiHYY489Vv9tz24CyKFZCiTTa6+9Vl5//fX6d0ojBdIq/08//VSv5/9Riqw9xxAgCOCvBLDSSiuVzz//vP6dLeRoAshWJ9Pzzz9fg4R5bbfddusqWrZSkzoEyOBaSxtssEG9Nt9883WVqQkgW+1MWVnXXnvtrjVseW3By6xgmbICZsX67rvvBno1U045ZVeJFltssQEB5Hu1CpkVrF9JRwpgsskm6+65+uqr63fy2dnTaJU9z+eff/76/tdcc02Zeuqp63ePPPLIes/dd99dzzfZZJPu3bI88trSSy/d5asJIAOimW699dYy+eST1x7RvffeW68deOCBXeAwU/aSmgSPOOIIAgg9gEnqAWQrs/POO3dAZgs4UgDZ/c604447Djzn1VdfHYBxUgSQw4ZM2Z3tX89K1RfAxRdfXM+z+9u/76STTqrXcgiS5wcffHA9P/fcc8uaa65Z/37xxRfrv+ecc06VR7vWntEq2hZbbNFdu+WWW+q1HOaMJoClllqqK5eFFlqo+15fmCuvvHJ3Pctum222qe+R75rpoYceqp+lvDI9/PDDA++Wn/cFkC19posuuqhstdVW9WgV/vbbb6/3ZG8oU3/4kpJuSRAw+mU8/O73WBRAtm4PPvhgPc8ucV8A+VnrwrbucTseeOCBev3EE0+cZAHstddeXW+if31kDKB1/y+44IKB+/bee+8un3m+6KKL1vOMTRx11FH17+222658//335YUXXqixhn7L3hfAWmut1V1rFev8888fVQBNLplay55Hlk973vrrr18/u+6667oyy3xmFz9Tlld+55RTT63nd9xxx8C7pez6Avjss8/KxFJW/LynDV9S4u052VMQA4jR+Bt+5RuLAshrSy65ZB3L9lPrAbz77rsTtDLZBW6xgN13371eu/LKKwda0dGOXCOQKeeos8vcrrexexPAWWedVc9TTP3vt55B607nkRU90zvvvNON/fPzrAQt78svv/wEAui3jq0rPzEBLLjggl259OfW+z2DHGLsscce9e/sHaWc8p7999+/Xrv//vsHJPjSSy8NvFt7jyaAFifYddddu3v6gcS+hI855pjuWg6VWtIDCAKYFAHkkS35aAI47bTT6nm2SDluzyj3JZdc0gXD5phjjnpfdlUz3XXXXTU41W8p+13mJppsCbOyZtf2999/HxDA6quv3rViGbzLbvdOO+3UBbi23nrr7pnHHXdcl+enn366XjvggAO6a9lK9vPwvwggjwxYZnrqqaeqUHL83lr3/DfvyUU8rYVOweWMRfteuye/21LKIcs5ZztaagLIxVGZUgTZrc9n5ftlvGTPPfccuCf/b9ZYY41avtmzIIAYrQEafus7lgWQQaR+RLwJIMFrwbZ+yuh7BrTa97OH0E9LLLHEqL+flbNV7pbaWLY/C5Ct2sj7RhsWtMrarzwZVGupP034TwSQrX3ORoxMOcZvrf2KK67Ydf8zKv/tt992MYAMFOaQIe8788wzB56RAsxAXv8dUo4t8Jift2h/XptzzjnrPbPMMkvXc2gpfyenBEe+YzgUQkKQLVNClkebKmtHtiLtsxZVbt/ZYYcdajc/W5icMWjQ98Vy+OGH17nx7CFkdH9i0OV4+frrr6/j5Y022qjOXedv5vi9f99qq61WA3z5mxm1bzMHI48c4+f3l1lmmXqeFS1bx7yWw5v+vdnTyesZsW/Xttxyy3pts802q+eZ9zzPGEL/uynFDHrmWoAMHGbvZOSS6YwXpFDynmzZp59++vqckeWdAdGbbrqplml+Z7311qv3tCnFPGaaaaZy0EEH1fsyLnLYYYdN8H+Wgs53zcBgm8nJPI58x3AoBBBgIMZvGQw9Aw5lgIEgABAQAQZCDwAERICBMAQAARFgIMQAQEAEGAhBQBAQAQbCLAAIiAADYRoQBESAgbAOAAREgIGwEAgERICBsBIQBESAgbAUGAREgIGwFwAERICBsBkIBESAgbAbEAREgIGwHRgERFCUAQhAgIEyjstg6BlwKAMMBAGAgAgwEHoAICACDIQhAAiIAAMhBgACIsBACAKCgAgwEGYBQEAEGAjTgCAgAgyEdQAgIAIMhIVAICACDISVgCAgAgyEpcAgIAIMhL0AICACDITNQCAgAgyE3YAgIAIMhO3AICCCogxAAAIMlHFcBkPPgEMZYCAIAAREgIHQAwABEWAgDAFAQAQYCDEAEBABBkIQEAREgIEwCwACIsBAmAYEARFgIKwDAAERYCAsBAIBEWAgrAQEARFgICwFBgERYCDsBQABEWAgbAYCARFgIOwGBAERYCBsBwYBERRlAAIQYKCM4zIYegYcygADQQAgIAIMhB4ACIgAA2EIAAIiwECIAYCACDAQgoAgIAIMhFkAEBABBsI0IAiIAANhHQAIiAADYSEQCIgAA2ElIAiIAANhKTAIiAADYS8ACIgAA2EzEAiIAANhNyAIiAADYTswCIigKAMQgAADZRyXwdAz4FAGGAgCAAERYCD0AEBABBgIQwAQEAEGQgwABESAgRAEBAERYCDMAoCACDAQpgFBQAQYCOsAQEAEGAgLgUBABBgIKwFBQAQYCEuBQUAEGAh7AUBABBgIm4FAQAQYCLsBQUAEGAjbgUFABEUZgAAEGCjjuAyGngGHMsBAEAAIiAADoQcAAiLAQBgCgIAIMBBiACAgAgyEICAIiAADYRYABESAgTANCAIiwEBYBwACIsBAWAgEAiLAQFgJCAIiwEBYCgwCIsBA2AsAAiLAQNgMBAIiwEDYDQgCIsBA2A4MAiIoygAEIMBAGcdlMPQMOJQBBoIAQEAEGAg9ABAQAQbCEAAERICBEAMAARFgIAQBQUAEGAizACAgAgyEaUAQEAEGwjoAEBABBsJCIBAQAQbCSkAQEAEGwlJgEBABBsJeABAQAQbCZiAQEAEGwm5AEBABBsJ2YBAQQVEGIAABBso4LoOhZ8ChDDAQBAACIsBA6AGAgAgwEP9OGfwHMEv46QtBrgYAAAAASUVORK5CYII=';

type TileLayer = 'street' | 'satellite' | 'nautical';

interface OfflineRegion {
  id: string;
  name: string;
  bounds: Bounds;
  minZoom: number;
  maxZoom: number;
  layers: TileLayer[];
  createdAt: string;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  totalTiles: number;
  downloadedTiles: number;
  storageBytes: number;
  error?: string;
}

interface TileDownloadProgress {
  regionId: string;
  status: 'downloading' | 'complete' | 'error' | 'cancelled';
  currentLayer: TileLayer;
  currentZoom: number;
  tilesDownloaded: number;
  totalTiles: number;
  bytesDownloaded: number;
  errors: number;
  startTime: number;
}

interface ActiveTileDownload {
  progress: TileDownloadProgress;
  abortController: AbortController;
}

// Tile reference tracking - maps tile path to array of region IDs that use it
interface TileRefs {
  [tilePath: string]: string[];
}

class TilesController {
  private dataDir: string;
  private tilesDir: string;
  private regionsPath: string;
  private tileRefsPath: string;
  private activeDownloads: Map<string, ActiveTileDownload> = new Map();

  // Download settings
  private readonly CONCURRENT_DOWNLOADS = 4;
  private readonly DELAY_BETWEEN_BATCHES_MS = 100;
  private readonly REQUEST_TIMEOUT_MS = 30000;
  private readonly MAX_RETRIES = 3;

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.tilesDir = path.join(this.dataDir, 'tiles');
    this.regionsPath = path.join(this.tilesDir, 'regions.json');
    this.tileRefsPath = path.join(this.tilesDir, 'tile-refs.json');

    // Ensure directories exist
    this.ensureDirectories();

    // Clean up any stuck downloads from previous server runs
    this.cleanupStuckDownloads();
  }

  /**
   * Mark any 'downloading' or 'pending' regions as error on startup
   * (they were interrupted by server restart)
   */
  private cleanupStuckDownloads(): void {
    try {
      const regions = this.loadRegions();
      let hasChanges = false;

      for (const region of regions) {
        if (region.status === 'downloading' || region.status === 'pending') {
          region.status = 'error';
          region.error = 'Download interrupted by server restart';
          hasChanges = true;
          console.log(`Marked interrupted download as error: ${region.name}`);
        }
      }

      if (hasChanges) {
        this.saveRegions(regions);
      }
    } catch (error) {
      console.error('Error cleaning up stuck downloads:', error);
    }
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.tilesDir)) {
      fs.mkdirSync(this.tilesDir, { recursive: true });
    }
  }

  /**
   * Load regions from JSON file
   */
  private loadRegions(): OfflineRegion[] {
    try {
      if (fs.existsSync(this.regionsPath)) {
        const content = fs.readFileSync(this.regionsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading regions:', error);
    }
    return [];
  }

  /**
   * Save regions to JSON file
   */
  private saveRegions(regions: OfflineRegion[]): void {
    try {
      fs.writeFileSync(this.regionsPath, JSON.stringify(regions, null, 2));
    } catch (error) {
      console.error('Error saving regions:', error);
      throw error;
    }
  }

  /**
   * Load tile references from JSON file
   */
  private loadTileRefs(): TileRefs {
    try {
      if (fs.existsSync(this.tileRefsPath)) {
        const content = fs.readFileSync(this.tileRefsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading tile refs:', error);
    }
    return {};
  }

  /**
   * Save tile references to JSON file
   */
  private saveTileRefs(refs: TileRefs): void {
    try {
      fs.writeFileSync(this.tileRefsPath, JSON.stringify(refs));
    } catch (error) {
      console.error('Error saving tile refs:', error);
      throw error;
    }
  }

  /**
   * Add a tile reference for a region
   */
  private addTileRef(tilePath: string, regionId: string): void {
    const refs = this.loadTileRefs();
    if (!refs[tilePath]) {
      refs[tilePath] = [];
    }
    if (!refs[tilePath].includes(regionId)) {
      refs[tilePath].push(regionId);
      this.saveTileRefs(refs);
    }
  }

  /**
   * Remove all tile references for a region and return tiles that should be deleted
   */
  private removeTileRefsForRegion(regionId: string): string[] {
    const refs = this.loadTileRefs();
    const tilesToDelete: string[] = [];

    for (const tilePath in refs) {
      const regionIndex = refs[tilePath].indexOf(regionId);
      if (regionIndex !== -1) {
        refs[tilePath].splice(regionIndex, 1);
        // If no more regions reference this tile, mark it for deletion
        if (refs[tilePath].length === 0) {
          tilesToDelete.push(tilePath);
          delete refs[tilePath];
        }
      }
    }

    this.saveTileRefs(refs);
    return tilesToDelete;
  }

  /**
   * Get all saved regions
   */
  async getRegions(_req: Request, res: Response): Promise<void> {
    try {
      const regions = this.loadRegions();

      // Include active download progress
      const regionsWithProgress = regions.map(region => {
        const activeDownload = this.activeDownloads.get(region.id);
        return {
          ...region,
          downloadProgress: activeDownload?.progress
        };
      });

      // Sort: downloading first, then by createdAt (newest first)
      regionsWithProgress.sort((a, b) => {
        // Downloading/pending regions first
        const aIsActive = a.status === 'downloading' || a.status === 'pending';
        const bIsActive = b.status === 'downloading' || b.status === 'pending';

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        // Then sort by date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      res.json({ regions: regionsWithProgress });
    } catch (error) {
      console.error('Error getting regions:', error);
      res.status(500).json({ error: 'Failed to get regions' });
    }
  }

  /**
   * Create a new region and start downloading
   */
  async createRegion(req: Request, res: Response): Promise<void> {
    const { name, bounds, minZoom = 0, maxZoom = 16, layers = ['street', 'satellite', 'nautical'] } = req.body;

    // Validate input
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    if (!bounds || typeof bounds !== 'object') {
      res.status(400).json({ error: 'Bounds are required' });
      return;
    }

    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      res.status(400).json({ error: boundsValidation.error });
      return;
    }

    if (!Array.isArray(layers) || layers.length === 0) {
      res.status(400).json({ error: 'At least one layer must be selected' });
      return;
    }

    // Calculate tile count
    const tilesPerLayer = calculateTotalTiles(bounds, minZoom, maxZoom);
    const totalTiles = tilesPerLayer * layers.length;
    const estimatedBytes = estimateStorageBytes(totalTiles);

    // Generate unique ID
    const id = `region-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const region: OfflineRegion = {
      id,
      name,
      bounds,
      minZoom,
      maxZoom,
      layers,
      createdAt: new Date().toISOString(),
      status: 'pending',
      totalTiles,
      downloadedTiles: 0,
      storageBytes: 0,
    };

    // Save region
    const regions = this.loadRegions();
    regions.push(region);
    this.saveRegions(regions);

    // Start download in background
    this.startRegionDownload(region);

    res.json({
      message: 'Region created, download starting',
      region,
      estimate: {
        totalTiles,
        estimatedSize: formatBytes(estimatedBytes),
        estimatedBytes,
      }
    });
  }

  /**
   * Delete a region and its tiles (only tiles not used by other regions)
   */
  async deleteRegion(req: Request, res: Response): Promise<void> {
    const { regionId } = req.params;

    const regions = this.loadRegions();
    const regionIndex = regions.findIndex(r => r.id === regionId);

    if (regionIndex === -1) {
      res.status(404).json({ error: 'Region not found' });
      return;
    }

    // Cancel if downloading
    const activeDownload = this.activeDownloads.get(regionId);
    if (activeDownload) {
      activeDownload.abortController.abort();
      this.activeDownloads.delete(regionId);
    }

    // Remove tile references for this region and get tiles to delete
    const tilesToDelete = this.removeTileRefsForRegion(regionId);

    // Delete only tiles that are no longer referenced by any region
    let deletedCount = 0;
    for (const relativeTilePath of tilesToDelete) {
      const tilePath = path.join(this.tilesDir, relativeTilePath);
      try {
        if (fs.existsSync(tilePath)) {
          fs.unlinkSync(tilePath);
          deletedCount++;

          // Try to remove empty parent directories
          const tileDir = path.dirname(tilePath);
          this.removeEmptyDirs(tileDir);
        }
      } catch (error) {
        console.error(`Error deleting tile ${tilePath}:`, error);
      }
    }

    console.log(`Deleted ${deletedCount} tiles unique to region ${regionId}`);

    // Remove region from list
    regions.splice(regionIndex, 1);
    this.saveRegions(regions);

    res.json({
      success: true,
      message: 'Region deleted',
      tilesDeleted: deletedCount,
      tilesKept: tilesToDelete.length === 0 ? 'all tiles shared with other regions' : undefined
    });
  }

  /**
   * Remove empty directories recursively up to tilesDir
   */
  private removeEmptyDirs(dirPath: string): void {
    // Don't remove beyond tilesDir
    if (!dirPath.startsWith(this.tilesDir) || dirPath === this.tilesDir) {
      return;
    }

    try {
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        fs.rmdirSync(dirPath);
        // Recursively check parent
        this.removeEmptyDirs(path.dirname(dirPath));
      }
    } catch (error) {
      // Directory not empty or other error, stop
    }
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(req: Request, res: Response): Promise<void> {
    const { regionId } = req.params;

    const activeDownload = this.activeDownloads.get(regionId);
    if (!activeDownload) {
      res.json({ success: false, message: 'No active download for this region' });
      return;
    }

    activeDownload.abortController.abort();
    activeDownload.progress.status = 'cancelled';

    // Update region status
    const regions = this.loadRegions();
    const region = regions.find(r => r.id === regionId);
    if (region) {
      region.status = 'error';
      region.error = 'Cancelled by user';
      this.saveRegions(regions);
    }

    this.activeDownloads.delete(regionId);

    res.json({ success: true, message: 'Download cancelled' });
  }

  /**
   * Calculate estimate for a region without creating it
   */
  async getEstimate(req: Request, res: Response): Promise<void> {
    const { bounds, minZoom = 0, maxZoom = 16, layers = ['street', 'satellite', 'nautical'] } = req.body;

    if (!bounds) {
      res.status(400).json({ error: 'Bounds are required' });
      return;
    }

    const boundsValidation = validateBounds(bounds);
    if (!boundsValidation.valid) {
      res.status(400).json({ error: boundsValidation.error });
      return;
    }

    const tilesPerLayer = calculateTotalTiles(bounds, minZoom, maxZoom);
    const totalTiles = tilesPerLayer * (layers?.length || 3);
    const estimatedBytes = estimateStorageBytes(totalTiles);

    res.json({
      tilesPerLayer,
      totalTiles,
      estimatedSize: formatBytes(estimatedBytes),
      estimatedBytes,
    });
  }

  /**
   * Start downloading tiles for a region
   */
  private async startRegionDownload(region: OfflineRegion): Promise<void> {
    const abortController = new AbortController();
    const progress: TileDownloadProgress = {
      regionId: region.id,
      status: 'downloading',
      currentLayer: region.layers[0],
      currentZoom: region.minZoom,
      tilesDownloaded: 0,
      totalTiles: region.totalTiles,
      bytesDownloaded: 0,
      errors: 0,
      startTime: Date.now(),
    };

    this.activeDownloads.set(region.id, { progress, abortController });

    // Update region status
    const regions = this.loadRegions();
    const regionToUpdate = regions.find(r => r.id === region.id);
    if (regionToUpdate) {
      regionToUpdate.status = 'downloading';
      this.saveRegions(regions);
    }

    try {
      for (const layer of region.layers) {
        if (abortController.signal.aborted) break;

        progress.currentLayer = layer;

        for (const coord of generateTileCoords(region.bounds, region.minZoom, region.maxZoom)) {
          if (abortController.signal.aborted) break;

          progress.currentZoom = coord.z;

          // Download tile with retries and track reference
          const success = await this.downloadTileWithRetry(layer, coord, abortController.signal, region.id);

          if (success) {
            progress.tilesDownloaded++;
            // Estimate bytes (we don't track actual size for performance)
            progress.bytesDownloaded += 25 * 1024; // ~25KB average
          } else {
            progress.errors++;
          }

          // Small delay every batch to avoid rate limiting
          if (progress.tilesDownloaded % this.CONCURRENT_DOWNLOADS === 0) {
            await this.delay(this.DELAY_BETWEEN_BATCHES_MS);
          }

          // Periodically save progress
          if (progress.tilesDownloaded % 100 === 0) {
            this.updateRegionProgress(region.id, progress);
          }
        }
      }

      if (!abortController.signal.aborted) {
        progress.status = 'complete';
        this.updateRegionProgress(region.id, progress, 'complete');
        console.log(`Region download complete: ${region.name} (${progress.tilesDownloaded} tiles)`);
      }

    } catch (error) {
      console.error(`Region download failed: ${region.id}`, error);
      progress.status = 'error';
      this.updateRegionProgress(region.id, progress, 'error', error instanceof Error ? error.message : 'Download failed');
    } finally {
      // Keep progress available for a while, then clean up
      setTimeout(() => {
        this.activeDownloads.delete(region.id);
      }, 30000);
    }
  }

  /**
   * Update region progress in storage
   */
  private updateRegionProgress(
    regionId: string,
    progress: TileDownloadProgress,
    status?: 'complete' | 'error',
    error?: string
  ): void {
    const regions = this.loadRegions();
    const region = regions.find(r => r.id === regionId);
    if (region) {
      region.downloadedTiles = progress.tilesDownloaded;
      region.storageBytes = progress.bytesDownloaded;
      if (status) {
        region.status = status;
      }
      if (error) {
        region.error = error;
      }
      this.saveRegions(regions);
    }
  }

  /**
   * Download a single tile with retries
   */
  private async downloadTileWithRetry(
    layer: TileLayer,
    coord: TileCoord,
    abortSignal: AbortSignal,
    regionId: string
  ): Promise<boolean> {
    // Use relative path for tile refs (from tilesDir)
    const relativeTilePath = `${layer}/${coord.z}/${coord.x}/${coord.y}.png`;
    const tilePath = path.join(this.tilesDir, relativeTilePath);

    // If tile already exists, just add reference and return
    if (fs.existsSync(tilePath)) {
      this.addTileRef(relativeTilePath, regionId);
      return true;
    }

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      if (abortSignal.aborted) return false;

      try {
        await this.downloadTile(layer, coord, tilePath, abortSignal);
        // Track that this region uses this tile
        this.addTileRef(relativeTilePath, regionId);
        return true;
      } catch (error) {
        if (abortSignal.aborted) return false;

        // Wait before retry with exponential backoff
        if (attempt < this.MAX_RETRIES - 1) {
          await this.delay(Math.pow(2, attempt) * 500);
        }
      }
    }

    return false;
  }

  /**
   * Download a single tile
   */
  private downloadTile(
    layer: TileLayer,
    coord: TileCoord,
    tilePath: string,
    abortSignal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const url = getTileUrl(layer, coord.z, coord.x, coord.y);
      const protocol = url.startsWith('https') ? https : http;

      // Ensure directory exists
      const dir = path.dirname(tilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const abortHandler = () => {
        req.destroy();
        reject(new Error('Aborted'));
      };
      abortSignal.addEventListener('abort', abortHandler, { once: true });

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'BigaOS/1.0 (Offline Map Downloader)',
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            abortSignal.removeEventListener('abort', abortHandler);
            // For redirects, we need to follow manually
            this.downloadTileFromUrl(redirectUrl, tilePath, abortSignal)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          abortSignal.removeEventListener('abort', abortHandler);
          // 404 for nautical tiles is common (empty ocean areas)
          if (response.statusCode === 404 && layer === 'nautical') {
            // Create empty/transparent tile marker
            resolve();
            return;
          }
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(tilePath);

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          abortSignal.removeEventListener('abort', abortHandler);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(tilePath, () => {});
          abortSignal.removeEventListener('abort', abortHandler);
          reject(err);
        });
      });

      req.on('error', (err) => {
        abortSignal.removeEventListener('abort', abortHandler);
        reject(err);
      });

      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        abortSignal.removeEventListener('abort', abortHandler);
        reject(new Error('Timeout'));
      });
    });
  }

  /**
   * Download tile from a specific URL (for redirects)
   */
  private downloadTileFromUrl(url: string, tilePath: string, abortSignal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (abortSignal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'BigaOS/1.0 (Offline Map Downloader)',
        }
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(tilePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(tilePath, () => {});
          reject(err);
        });
      });

      req.on('error', reject);
      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  /**
   * Serve a tile - local first, then proxy to remote
   */
  async serveTile(req: Request, res: Response): Promise<void> {
    const { source, z, x, y } = req.params;

    // Validate source
    if (!['street', 'satellite', 'nautical'].includes(source)) {
      res.status(400).json({ error: 'Invalid tile source' });
      return;
    }

    // Remove .png extension from y if present
    const yValue = y.replace('.png', '');

    const tilePath = path.join(this.tilesDir, source, z, x, `${yValue}.png`);

    // Try to serve local tile first
    if (fs.existsSync(tilePath)) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-Tile-Source', 'local');
      res.setHeader('X-Offline-Mode', String(!connectivityService.getOnlineStatus()));
      fs.createReadStream(tilePath).pipe(res);
      return;
    }

    // Check connectivity status from connectivity service
    if (!connectivityService.getOnlineStatus()) {
      // No internet and no local tile - return a placeholder tile
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-Tile-Source', 'placeholder');
      res.setHeader('X-Offline-Mode', 'true');
      // Don't cache placeholder tiles - we want fresh tiles when back online
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      // Return a placeholder tile with "Not Downloaded" text
      const placeholderBuffer = Buffer.from(PLACEHOLDER_TILE_BASE64, 'base64');
      res.send(placeholderBuffer);
      return;
    }

    // Proxy to remote tile server
    try {
      const url = getTileUrl(source as TileLayer, parseInt(z), parseInt(x), parseInt(yValue));
      res.setHeader('X-Offline-Mode', 'false');
      await this.proxyTile(url, res);
    } catch (error) {
      console.error('Error proxying tile:', error);
      // Only send error response if headers haven't been sent yet
      if (!res.headersSent) {
        res.setHeader('X-Offline-Mode', 'true');
        res.status(502).json({ error: 'Failed to fetch tile' });
      }
    }
  }

  /**
   * Proxy a tile request to remote server
   */
  private proxyTile(url: string, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'BigaOS/1.0 (Tile Proxy)',
        }
      }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.proxyTile(redirectUrl, res).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          res.status(response.statusCode || 500).end();
          resolve();
          return;
        }

        res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
        res.setHeader('X-Tile-Source', 'remote');

        response.pipe(res);
        response.on('end', resolve);
        response.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
  }

  /**
   * Utility: delay for a given number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get total storage used by offline tiles and device storage info
   */
  async getStorageStats(_req: Request, res: Response): Promise<void> {
    try {
      const regions = this.loadRegions();
      const totalRegions = regions.length;
      const completeRegions = regions.filter(r => r.status === 'complete').length;

      let totalBytes = 0;
      for (const region of regions) {
        totalBytes += region.storageBytes || 0;
      }

      // Get device storage info
      let deviceStorage = {
        total: 0,
        used: 0,
        available: 0,
        totalFormatted: 'Unknown',
        usedFormatted: 'Unknown',
        availableFormatted: 'Unknown',
        usedPercent: 0
      };

      try {
        const { execSync } = require('child_process');
        // Use df command (works on Linux/Mac/Git Bash on Windows)
        const dfOutput = execSync('df -B1 .', { encoding: 'utf-8' });
        const lines = dfOutput.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          // df -B1 output: Filesystem 1B-blocks Used Available Use% Mounted
          if (parts.length >= 4) {
            deviceStorage.total = parseInt(parts[1]) || 0;
            deviceStorage.used = parseInt(parts[2]) || 0;
            deviceStorage.available = parseInt(parts[3]) || 0;
            deviceStorage.totalFormatted = formatBytes(deviceStorage.total);
            deviceStorage.usedFormatted = formatBytes(deviceStorage.used);
            deviceStorage.availableFormatted = formatBytes(deviceStorage.available);
            deviceStorage.usedPercent = deviceStorage.total > 0
              ? Math.round((deviceStorage.used / deviceStorage.total) * 100)
              : 0;
          }
        }
      } catch (err) {
        console.error('Error getting device storage:', err);
      }

      res.json({
        totalRegions,
        completeRegions,
        totalBytes,
        totalSize: formatBytes(totalBytes),
        deviceStorage
      });
    } catch (error) {
      console.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage stats' });
    }
  }

  /**
   * Get current connectivity status
   */
  getStatus(_req: Request, res: Response): void {
    res.json(connectivityService.getStatus());
  }

  /**
   * Get the nominatim URL from settings or use default
   */
  private getNominatimUrl(): string {
    try {
      const apiUrlsSetting = db.getSetting('apiUrls');
      if (apiUrlsSetting) {
        const apiUrls = JSON.parse(apiUrlsSetting);
        if (apiUrls.nominatimUrl) {
          return apiUrls.nominatimUrl;
        }
      }
    } catch (error) {
      console.error('Error reading apiUrls setting:', error);
    }
    return DEFAULT_NOMINATIM_URL;
  }

  /**
   * Search locations via geocoding API (Photon)
   * Only searches when online - returns empty results when offline
   */
  async searchLocations(req: Request, res: Response): Promise<void> {
    const { q, limit = '5', lang = 'en' } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    // Check connectivity - if offline, return empty results
    if (!connectivityService.getOnlineStatus()) {
      res.json({
        results: [],
        offline: true,
        message: 'Search unavailable - offline mode'
      });
      return;
    }

    try {
      const nominatimUrl = this.getNominatimUrl();
      const params = new URLSearchParams({
        q,
        limit: limit.toString(),
        lang: lang.toString(),
      });

      const response = await fetch(
        `${nominatimUrl}/api?${params.toString()}`,
        {
          headers: {
            'Accept-Language': lang.toString(),
            'User-Agent': 'BigaOS/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data: any = await response.json();

      // Photon returns GeoJSON format with features array
      if (!data.features || !Array.isArray(data.features)) {
        res.json({ results: [], offline: false });
        return;
      }

      // Transform Photon's GeoJSON response to SearchResult format
      const results = data.features.map((feature: any) => {
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [0, 0];

        // Build display name from available properties
        const nameParts: string[] = [];
        if (props.name) nameParts.push(props.name);
        if (props.street) nameParts.push(props.street);
        if (props.city) nameParts.push(props.city);
        if (props.state) nameParts.push(props.state);
        if (props.country) nameParts.push(props.country);

        return {
          lat: coords[1].toString(),
          lon: coords[0].toString(),
          display_name: nameParts.join(', ') || 'Unknown location',
          type: props.type || props.osm_value || 'unknown',
          osm_id: props.osm_id,
          osm_type: props.osm_type,
          name: props.name,
          city: props.city,
          country: props.country,
        };
      });

      res.json({ results, offline: false });
    } catch (error) {
      console.error('Geocoding search error:', error);
      res.status(500).json({
        error: 'Search failed',
        results: [],
        offline: false
      });
    }
  }
}

export const tilesController = new TilesController();
