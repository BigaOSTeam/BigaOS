/**
 * Tiles Controller
 *
 * Live map-tile proxy + tile-source registry + map-related lookups (geocoding,
 * connectivity, device storage). Tiles are fetched from the upstream provider
 * on demand, backed by a server-side disk cache (see tile-cache.service): N
 * clients share one upstream fetch per tile, revisited areas cost nothing
 * upstream, and previously-seen areas stay usable offline (stale tiles instead
 * of white squares). All outbound requests carry a versioned, contactable
 * User-Agent per the OSMF tile-usage policy.
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
import { tileCacheService, CachedTile } from '../services/tile-cache.service';
import db from '../database/database';
import { assertSafeOutboundUrl } from '../utils/url-safety';
import { isNumericSegment } from '../utils/path-safety';
import { APP_USER_AGENT } from '../utils/app-identity';

// Default geocoding URL
const DEFAULT_NOMINATIM_URL = 'https://photon.komoot.io';

// Defensive per-tile ceiling for the upstream fetch: real tiles are ≤ ~100 KB,
// so anything larger is almost certainly not a tile — refuse it rather than
// buffer it into memory or cache it.
const MAX_PROXY_TILE_BYTES = 1024 * 1024; // 1 MiB

// Raw result of an upstream tile fetch, buffered so it can be both streamed to
// the client and teed into the disk cache.
interface RawTileResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

class TilesController {
  // Failed tile cache - stores tile URLs that failed with timestamp.
  // Short TTL only — its job is to keep a brief upstream hiccup from
  // hammering the remote server, not to permanently blank tiles.
  // Timeouts are NOT cached (too transient); only hard upstream errors are.
  // A client retry that includes ?_cb=... bypasses this cache.
  private failedTileCache: Map<string, number> = new Map();
  private readonly FAILED_TILE_CACHE_DURATION_MS = 30 * 1000; // 30 seconds

  private readonly REQUEST_TIMEOUT_MS = 10000;

  // In-flight upstream fetches keyed by `source/z/x/y`, so concurrent requests
  // for the same tile (multiple clients panning the same view) collapse into a
  // single upstream request — the multi-client amplification that makes one Pi
  // look like a scraper.
  private inflight: Map<string, Promise<RawTileResponse>> = new Map();

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
   * Serve a tile through the caching decision ladder:
   *
   *   1. validate source + coords
   *   2. (local pack hit — Phase 3, not yet wired)
   *   3. disk cache hit, fresh?            → serve, X-Tile-Source: cache
   *   4. offline and cache has any copy?   → serve stale, X-Tile-Source: cache-stale
   *   5. failedTileCache hit (no _cb)?     → stale copy if any, else 204
   *   6. fetch upstream (deduped)          → serve + tee into cache, X-Tile-Source: remote
   *   7. upstream non-200/error + stale?   → serve stale, else 204
   */
  async serveTile(req: Request, res: Response): Promise<void> {
    const { source, z, x, y } = req.params;

    // 1. Validate source against the registry
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
    const zi = parseInt(z);
    const xi = parseInt(x);
    const yi = parseInt(yValue);

    const online = connectivityService.getOnlineStatus();

    // 3 + 4. Disk cache. Fresh → serve. Stale but offline → serve rather than
    // fetch (bad-internet-while-navigating is the whole point of the cache).
    // Stale + online → fall through to a refetch, keeping this copy as a
    // fallback if the refetch fails.
    const cached = await tileCacheService.get(source, zi, xi, yi);
    if (cached && (tileCacheService.isFresh(cached.ageMs) || !online)) {
      this.serveCached(res, cached, tileCacheService.isFresh(cached.ageMs) ? 'cache' : 'cache-stale');
      return;
    }

    let url: string;
    try {
      url = getTileUrl(source, zi, xi, yi, this.getMapTileUrls());
    } catch (error) {
      console.error('Error building tile URL:', error);
      if (cached) {
        this.serveCached(res, cached, 'cache-stale');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.status(204).end();
      return;
    }

    // 5. Recent hard failure and not an explicit retry → don't hammer upstream.
    // The client's BufferedTileLayer adds `_cb=...` on tileerror retries to
    // bypass this cache once the upstream may have recovered.
    const isClientRetry = typeof req.query._cb !== 'undefined';
    if (!isClientRetry && this.isFailedTile(url)) {
      if (cached) {
        this.serveCached(res, cached, 'cache-stale');
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.status(204).end();
      return;
    }

    // 6 + 7. Fetch upstream (deduped across concurrent clients); the fetch tees
    // a 200 into the disk cache. Degrade to a stale copy, then to 204.
    let resp: RawTileResponse;
    try {
      resp = await this.fetchDeduped(source, zi, xi, yi, url);
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Timeout';
      // Only cache hard failures, not timeouts — timeouts are usually transient
      // and caching them turns one slow request into a white tile for the TTL.
      if (!isTimeout) {
        this.markTileFailed(url);
        console.error('Error proxying tile:', error);
      }
      if (cached) {
        this.serveCached(res, cached, 'cache-stale');
        return;
      }
      if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-cache');
        res.status(204).end();
      }
      return;
    }

    if (resp.statusCode === 200 && resp.body.length > 0) {
      res.setHeader('Content-Type', resp.headers['content-type'] || 'image/png');
      this.forwardCacheHeaders(res, resp.headers);
      res.setHeader('X-Tile-Source', 'remote');
      res.end(resp.body);
      return;
    }

    // Non-200 (or empty 200): a failure. Prefer a stale copy over a white tile;
    // otherwise 204 and let the client retry with `_cb`.
    this.markTileFailed(url);
    if (cached) {
      this.serveCached(res, cached, 'cache-stale');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.status(204).end();
  }

  /** Serve a tile from the disk cache with browser-cacheable headers. */
  private serveCached(res: Response, tile: CachedTile, label: 'cache' | 'cache-stale'): void {
    res.setHeader('Content-Type', tile.contentType);
    res.setHeader('X-Tile-Source', label);
    // Real tile bytes — let the browser hold them too (7-day policy floor). The
    // reconnect handler force-reloads visible tiles with `_cb=`, so a stale copy
    // held in the browser is refreshed the moment connectivity returns.
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.end(tile.body);
  }

  /**
   * Copy the safe caching headers from the upstream response to the client so
   * the browser reuses tiles it has already seen instead of heuristically
   * re-fetching them — needless load on both the Pi and upstream. Default to
   * the OSMF policy's 7-day floor when upstream sends no Cache-Control.
   */
  private forwardCacheHeaders(res: Response, headers: http.IncomingHttpHeaders): void {
    for (const h of ['cache-control', 'etag', 'expires', 'last-modified'] as const) {
      const v = headers[h];
      if (typeof v === 'string') res.setHeader(h, v);
    }
    if (!headers['cache-control']) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days, policy minimum
    }
  }

  /**
   * Fetch a tile from upstream, deduplicated across concurrent requests for the
   * same tile: five clients panning the same view trigger exactly one upstream
   * request. On a 200 the body is teed into the disk cache exactly once
   * (fire-and-forget — a cache write must never delay serving the tile).
   */
  private fetchDeduped(source: string, z: number, x: number, y: number, url: string): Promise<RawTileResponse> {
    const key = `${source}/${z}/${x}/${y}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = this.fetchTile(url)
      .then((resp) => {
        if (resp.statusCode === 200 && resp.body.length > 0) {
          const ct = (resp.headers['content-type'] as string) || 'image/png';
          void tileCacheService.put(source, z, x, y, ct, resp.body);
        }
        return resp;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, p);
    return p;
  }

  /**
   * GET a tile URL and collect the (small) body into a Buffer, following
   * redirects. Rejects on network error/timeout; resolves with the raw
   * status/headers/body otherwise (including non-200, where the caller decides
   * how to degrade). Buffering — rather than piping straight to the response —
   * is what lets us tee into the cache and refuse truncated bodies; tiles are
   * tiny so the memory cost is trivial.
   */
  private fetchTile(url: string, redirectsLeft: number = 5): Promise<RawTileResponse> {
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
          'User-Agent': APP_USER_AGENT,
        },
      }, (response) => {
        const status = response.statusCode || 0;

        // Handle redirects
        if ((status === 301 || status === 302) && response.headers.location) {
          if (redirectsLeft <= 0) {
            response.resume();
            reject(new Error('Too many redirects'));
            return;
          }
          response.resume(); // drain the redirect body so the socket frees
          this.fetchTile(response.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }

        if (status !== 200) {
          response.resume(); // drain so the socket can be reused
          resolve({ statusCode: status || 500, headers: response.headers, body: Buffer.alloc(0) });
          return;
        }

        // Refuse an implausibly large declared body before buffering it.
        const declared = parseInt((response.headers['content-length'] as string) || '', 10);
        if (Number.isFinite(declared) && declared > MAX_PROXY_TILE_BYTES) {
          response.destroy();
          reject(new Error('Tile too large'));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_PROXY_TILE_BYTES) {
            response.destroy();
            reject(new Error('Tile too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          // Refuse a truncated body (declared length not met) rather than
          // stream/cache half a PNG.
          if (Number.isFinite(declared) && received !== declared) {
            reject(new Error('Truncated tile'));
            return;
          }
          resolve({ statusCode: 200, headers: response.headers, body: Buffer.concat(chunks) });
        });
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
        const { exec } = require('child_process');
        const execAsync = require('util').promisify(exec);
        const os = require('os');

        if (os.platform() === 'win32') {
          // Windows: use PowerShell to get disk space
          const drive = process.cwd().charAt(0).toUpperCase();
          const { stdout: psOutput } = await execAsync(`powershell -Command "Get-PSDrive ${drive} | Select-Object Used,Free | ConvertTo-Json"`);
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
          const { stdout: dfOutput } = await execAsync('df -B1 .');
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

      // Tile-cache footprint feeds the Settings storage display. `totalRegions`
      // will carry the number of installed chart packs once Phase 3 lands; for
      // now it stays 0 (no packs).
      const cache = await tileCacheService.stats();
      res.json({
        totalRegions: 0,
        completeRegions: 0,
        totalBytes: cache.bytes,
        totalSize: formatBytes(cache.bytes),
        deviceStorage,
      });
    } catch (error) {
      console.error('Error getting storage stats:', error);
      res.status(500).json({ error: 'Failed to get storage stats' });
    }
  }

  /**
   * Clear the server-side disk tile cache. Backs the "Clear tile cache" button
   * in Settings → Downloads.
   */
  async clearCache(_req: Request, res: Response): Promise<void> {
    try {
      await tileCacheService.clear();
      const cache = await tileCacheService.stats();
      res.json({ ok: true, totalBytes: cache.bytes, totalSize: formatBytes(cache.bytes) });
    } catch (error) {
      console.error('Error clearing tile cache:', error);
      res.status(500).json({ error: 'Failed to clear tile cache' });
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
          'User-Agent': APP_USER_AGENT,
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
