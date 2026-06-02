/**
 * Tile calculation utilities for offline map downloads
 * Uses standard Web Mercator (EPSG:3857) tile scheme
 */

import { getTileSource, MapTileUrlOverrides } from './tile-sources';

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TileRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert latitude/longitude to tile coordinates at a given zoom level
 */
export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/**
 * Convert tile coordinates back to latitude/longitude (northwest corner of tile)
 */
export function tileToLatLon(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

/**
 * Get the tile range for a bounding box at a specific zoom level
 */
export function boundsToTileRange(bounds: Bounds, zoom: number): TileRange {
  const n = Math.pow(2, zoom);

  // Handle bounds that cross the antimeridian
  let west = bounds.west;
  let east = bounds.east;
  if (west > east) {
    // Crosses antimeridian - for simplicity, we'll clamp
    west = -180;
    east = 180;
  }

  const xMin = Math.floor(((west + 180) / 360) * n);
  const xMax = Math.floor(((east + 180) / 360) * n);

  // Note: y coordinates are inverted (north = smaller y)
  const northRad = (bounds.north * Math.PI) / 180;
  const southRad = (bounds.south * Math.PI) / 180;

  const yMin = Math.floor((1 - Math.log(Math.tan(northRad) + 1 / Math.cos(northRad)) / Math.PI) / 2 * n);
  const yMax = Math.floor((1 - Math.log(Math.tan(southRad) + 1 / Math.cos(southRad)) / Math.PI) / 2 * n);

  // Clamp to valid tile range
  return {
    xMin: Math.max(0, Math.min(xMin, n - 1)),
    xMax: Math.max(0, Math.min(xMax, n - 1)),
    yMin: Math.max(0, Math.min(yMin, n - 1)),
    yMax: Math.max(0, Math.min(yMax, n - 1)),
  };
}

/**
 * Calculate the number of tiles in a tile range
 */
export function countTilesInRange(range: TileRange): number {
  return (range.xMax - range.xMin + 1) * (range.yMax - range.yMin + 1);
}

/**
 * Calculate total tile count for a region across all zoom levels
 */
export function calculateTotalTiles(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const range = boundsToTileRange(bounds, z);
    total += countTilesInRange(range);
  }
  return total;
}

/**
 * Calculate total tiles for a region with multiple layers
 */
export function calculateTotalTilesWithLayers(
  bounds: Bounds,
  minZoom: number,
  maxZoom: number,
  layerCount: number
): number {
  return calculateTotalTiles(bounds, minZoom, maxZoom) * layerCount;
}

/**
 * Estimate storage size in bytes based on tile count
 * Average tile sizes:
 * - Street (OSM): ~15-20 KB
 * - Satellite (ArcGIS): ~30-50 KB
 * - Nautical (OpenSeaMap): ~5-10 KB (many transparent)
 * Combined average: ~25 KB per tile
 */
export function estimateStorageBytes(tileCount: number, avgTileSizeKB: number = 25): number {
  return tileCount * avgTileSizeKB * 1024;
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Generate all tile coordinates for a region
 */
export function* generateTileCoords(
  bounds: Bounds,
  minZoom: number,
  maxZoom: number
): Generator<TileCoord> {
  for (let z = minZoom; z <= maxZoom; z++) {
    const range = boundsToTileRange(bounds, z);
    for (let x = range.xMin; x <= range.xMax; x++) {
      for (let y = range.yMin; y <= range.yMax; y++) {
        yield { x, y, z };
      }
    }
  }
}

/**
 * Resolve the remote URL for a tile in the given source.
 *
 * Looks up the source in the central registry (`tile-sources.ts`), applies any
 * per-install URL override from the `mapTileUrls` settings object, and
 * substitutes the standard slippy-map placeholders. Throws if the source is
 * unknown or has no remote URL (e.g. an MBTiles-backed source — those are
 * served from disk and never reach this code path).
 */
export function getTileUrl(
  sourceId: string,
  z: number,
  x: number,
  y: number,
  overrides?: MapTileUrlOverrides
): string {
  const source = getTileSource(sourceId);
  if (!source) {
    throw new Error(`Unknown tile source: ${sourceId}`);
  }

  let urlTemplate: string | undefined;
  if (source.customUrlSettingKey && overrides) {
    urlTemplate = overrides[source.customUrlSettingKey];
  }
  if (!urlTemplate) {
    urlTemplate = source.url;
  }
  if (!urlTemplate) {
    throw new Error(`Tile source has no remote URL: ${sourceId}`);
  }

  // Handle {s} subdomain for OSM-style URLs. The `[a, b, c]` set matches the
  // public OSM tile servers; other providers using {s} typically support the
  // same letter pool, and providers that don't use it just leave {s} unused.
  const subdomain = ['a', 'b', 'c'][Math.abs(x + y) % 3];

  return urlTemplate
    .replace('{s}', subdomain)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Get the local file path for a tile.
 */
export function getTileLocalPath(
  baseDir: string,
  sourceId: string,
  z: number,
  x: number,
  y: number
): string {
  return `${baseDir}/${sourceId}/${z}/${x}/${y}.png`;
}

/**
 * Validate bounds are reasonable
 */
export function validateBounds(bounds: Bounds): { valid: boolean; error?: string } {
  if (bounds.north <= bounds.south) {
    return { valid: false, error: 'North must be greater than south' };
  }
  if (bounds.north > 85.0511 || bounds.south < -85.0511) {
    return { valid: false, error: 'Latitude must be between -85.0511 and 85.0511 (Web Mercator limit)' };
  }
  if (bounds.west < -180 || bounds.east > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }
  return { valid: true };
}

/**
 * Calculate bounds area in square kilometers (approximate)
 */
export function calculateBoundsAreaKm2(bounds: Bounds): number {
  const R = 6371; // Earth radius in km
  const latDiff = Math.abs(bounds.north - bounds.south) * (Math.PI / 180);
  const lonDiff = Math.abs(bounds.east - bounds.west) * (Math.PI / 180);
  const avgLat = ((bounds.north + bounds.south) / 2) * (Math.PI / 180);

  const height = R * latDiff;
  const width = R * lonDiff * Math.cos(avgLat);

  return height * width;
}
