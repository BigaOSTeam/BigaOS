/**
 * Water-mask helpers for the routing workers.
 *
 * Extracted verbatim from route-calculation.worker.ts. `isWater` keeps its own
 * module-local memo cache; because each worker thread has its own module
 * registry, the cache is per-worker and never shared across requests/threads.
 */

import { geoTiffWaterService, GeoTiffWaterType } from '../../services/geotiff-water.service';

export type WaterType = 'ocean' | 'lake' | 'land';

// Worker-local memo of water classifications (~11 m precision keys).
const cache = new Map<string, WaterType>();
const CACHE_SIZE = 10000;

/**
 * Convert a GeoTIFF classification to the coarse ocean/lake/land bucket.
 */
export function geoTiffToWaterType(geoType: GeoTiffWaterType): WaterType {
  switch (geoType) {
    case 'ocean':
      return 'ocean';
    case 'lake':
    case 'river':
    case 'canal':
    case 'stream':
      return 'lake';
    default:
      return 'land';
  }
}

/**
 * Check if a coordinate is on water (cached, ~11 m precision).
 */
export function isWater(lat: number, lon: number): boolean {
  // Round for caching (~11m precision)
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLon = Math.round(lon * 10000) / 10000;
  const cacheKey = `${roundedLat},${roundedLon}`;

  // Check cache
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) !== 'land';
  }

  // Check GeoTIFF
  const geoType = geoTiffWaterService.getWaterTypeSync(lon, lat);
  const result = geoTiffToWaterType(geoType);

  // Cache result
  if (cache.size >= CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(cacheKey, result);

  return result !== 'land';
}
