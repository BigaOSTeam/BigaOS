/**
 * Tiles Controller
 *
 * Live map-tile proxy + tile-source registry + map-related lookups (geocoding,
 * connectivity, device storage). Tiles are fetched from the upstream provider
 * on demand and streamed to the client — there is no offline/bulk tile
 * download (that feature was removed; offline use is out of scope).
 */

import { Request, Response } from 'express';
import * as https from 'https';
import * as http from 'http';
import { getTileUrl, formatBytes } from '../utils/tile-math';
import {
  TILE_SOURCES,
  getTileSource,
  toPublicTileSource,
  MapTileUrlOverrides,
} from '../utils/tile-sources';
import { connectivityService } from '../services/connectivity.service';
import db from '../database/database';
import { assertSafeOutboundUrl } from '../utils/url-safety';
import { isNumericSegment } from '../utils/path-safety';

// Default geocoding URL
const DEFAULT_NOMINATIM_URL = 'https://photon.komoot.io';

class TilesController {
  // Failed tile cache - stores tile URLs that failed with timestamp.
  // Short TTL only — its job is to keep a brief upstream hiccup from
  // hammering the remote server, not to permanently blank tiles.
  // Timeouts are NOT cached (too transient); only hard upstream errors are.
  // A client retry that includes ?_cb=... bypasses this cache.
  private failedTileCache: Map<string, number> = new Map();
  private readonly FAILED_TILE_CACHE_DURATION_MS = 30 * 1000; // 30 seconds

  private readonly REQUEST_TIMEOUT_MS = 10000;

  constructor() {
    // Clean up expired failed tile cache entries every minute
    setInterval(() => {
      this.cleanupFailedTileCache();
    }, 60 * 1000);
  }

  /**
   * Clean up expired entries from the failed tile cache
   */
  private cleanupFailedTileCache(): void {
    const now = Date.now();
    for (const [url, timestamp] of this.failedTileCache) {
      if (now - timestamp > this.FAILED_TILE_CACHE_DURATION_MS) {
        this.failedTileCache.delete(url);
      }
    }
  }

  /**
   * Check if a tile URL is in the failed cache (and not expired)
   */
  private isFailedTile(url: string): boolean {
    const timestamp = this.failedTileCache.get(url);
    if (!timestamp) return false;

    const now = Date.now();
    if (now - timestamp > this.FAILED_TILE_CACHE_DURATION_MS) {
      // Expired, remove and allow retry
      this.failedTileCache.delete(url);
      return false;
    }
    return true;
  }

  /**
   * Mark a tile URL as failed
   */
  private markTileFailed(url: string): void {
    this.failedTileCache.set(url, Date.now());
  }

  /**
   * Serve a tile by proxying it from the upstream provider.
   */
  async serveTile(req: Request, res: Response): Promise<void> {
    const { source, z, x, y } = req.params;

    // Validate source against the registry
    if (!getTileSource(source)) {
      res.status(400).json({ error: 'Invalid tile source' });
      return;
    }

    // Remove .png extension from y if present
    const yValue = y.replace('.png', '');

    // z/x/y must be plain integers; reject anything else so they can't
    // contain path separators or `..` segments.
    if (!isNumericSegment(z) || !isNumericSegment(x) || !isNumericSegment(yValue)) {
      res.status(400).json({ error: 'Invalid tile coordinate' });
      return;
    }

    try {
      const url = getTileUrl(source, parseInt(z), parseInt(x), parseInt(yValue), this.getMapTileUrls());

      // Skip failure-cache check if the client is explicitly retrying with a cache-buster.
      // The client's BufferedTileLayer adds `_cb=...` on tileerror retries so a brief
      // upstream hiccup doesn't strand the tile as a white square for the cache TTL.
      const isClientRetry = typeof req.query._cb !== 'undefined';

      if (!isClientRetry && this.isFailedTile(url)) {
        // Return 204 No Content - tile shows as empty/transparent; the client's
        // retry logic re-attempts with `_cb=` to bypass this cache.
        res.setHeader('Cache-Control', 'no-cache');
        res.status(204).end();
        return;
      }

      await this.proxyTile(url, res);
    } catch (error) {
      const url = getTileUrl(source, parseInt(z), parseInt(x), parseInt(yValue), this.getMapTileUrls());
      const isTimeout = error instanceof Error && error.message === 'Timeout';

      // Only cache hard failures, not timeouts. Timeouts are usually transient
      // (slow upstream, brief network blip) and caching them just turns one slow
      // request into a white tile for the entire cache TTL.
      if (!isTimeout) {
        this.markTileFailed(url);
        console.error('Error proxying tile:', error);
      }

      // Return 204 No Content - tile will appear empty/transparent temporarily.
      if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-cache');
        res.status(204).end();
      }
    }
  }

  /**
   * Proxy a tile request to remote server
   */
  private proxyTile(url: string, res: Response): Promise<void> {
    return new Promise((resolve, reject) => {
      let parsedUrl: URL;
      try {
        parsedUrl = assertSafeOutboundUrl(url, 'tile url');
      } catch (err) {
        reject(err as Error);
        return;
      }
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const req = protocol.get(parsedUrl, {
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
   * Get device storage info (used by the settings UI to show free space).
   */
  async getStorageStats(_req: Request, res: Response): Promise<void> {
    try {
      // Device storage info
      const deviceStorage = {
        total: 0,
        used: 0,
        available: 0,
        totalFormatted: 'Unknown',
        usedFormatted: 'Unknown',
        availableFormatted: 'Unknown',
        usedPercent: 0,
      };

      try {
        const { execSync } = require('child_process');
        const os = require('os');

        if (os.platform() === 'win32') {
          // Windows: use PowerShell to get disk space
          const drive = process.cwd().charAt(0).toUpperCase();
          const psOutput = execSync(`powershell -Command "Get-PSDrive ${drive} | Select-Object Used,Free | ConvertTo-Json"`, { encoding: 'utf-8' });
          const driveInfo = JSON.parse(psOutput.trim());
          deviceStorage.used = driveInfo.Used || 0;
          deviceStorage.available = driveInfo.Free || 0;
          deviceStorage.total = deviceStorage.used + deviceStorage.available;
          deviceStorage.totalFormatted = formatBytes(deviceStorage.total);
          deviceStorage.usedFormatted = formatBytes(deviceStorage.used);
          deviceStorage.availableFormatted = formatBytes(deviceStorage.available);
          deviceStorage.usedPercent = deviceStorage.total > 0
            ? Math.round((deviceStorage.used / deviceStorage.total) * 100)
            : 0;
        } else {
          // Linux/Mac: use df command
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
        }
      } catch (err) {
        console.error('Error getting device storage:', err);
      }

      // Region fields kept at zero for response-shape compatibility with the
      // client (offline tile regions no longer exist).
      res.json({
        totalRegions: 0,
        completeRegions: 0,
        totalBytes: 0,
        totalSize: formatBytes(0),
        deviceStorage,
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
   * Expose the tile-source registry to the client so the chart UI can render
   * its base/overlay controls, attribution, and disclaimers from data.
   */
  getTileSources(_req: Request, res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ sources: TILE_SOURCES.map(toPublicTileSource) });
  }

  /**
   * Read per-install tile URL overrides from the `mapTileUrls` setting. These
   * let an operator point a source at a different provider (e.g. a paid
   * satellite tile service) without code changes. Returns undefined if unset,
   * in which case the registry's built-in URLs are used.
   */
  private getMapTileUrls(): MapTileUrlOverrides | undefined {
    try {
      const setting = db.getSetting('mapTileUrls');
      if (setting) {
        return JSON.parse(setting) as MapTileUrlOverrides;
      }
    } catch (error) {
      console.error('Error reading mapTileUrls setting:', error);
    }
    return undefined;
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
      const safeNominatim = assertSafeOutboundUrl(nominatimUrl, 'nominatimUrl');
      const params = new URLSearchParams({
        q,
        limit: limit.toString(),
        lang: lang.toString(),
      });
      // Build the request URL relative to the validated base.
      const requestUrl = new URL('api', safeNominatim.toString().replace(/\/?$/, '/'));
      requestUrl.search = params.toString();

      const response = await fetch(requestUrl, {
        headers: {
          'Accept-Language': lang.toString(),
          'User-Agent': 'BigaOS/1.0',
        },
      });

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
