/**
 * DistanceField — precomputed grid of distances to nearest land/obstacle.
 *
 * Extracted verbatim from route-calculation.worker.ts. Uses a distance
 * transform to compute land distances for all water cells in a bounding box,
 * with on-demand expansion when A* reaches boundaries. Shallow cells (when a
 * DepthGate is active) are treated as obstacles exactly like land.
 */

import { geoTiffWaterService } from '../../services/geotiff-water.service';
import { DepthGate } from './depth-gate';

export class DistanceField {
  private grid: Map<number, number> = new Map(); // key -> distance in grid units
  // key -> navigable (water, and deep enough when a depth gate is active)
  private waterGrid: Map<number, boolean> = new Map();
  private gate: DepthGate | null;
  private bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  private gridSize: number;
  private invGridSize: number;
  private maxDistance: number; // max distance to track (in grid units)

  // Expansion settings
  private static readonly INITIAL_MARGIN = 0.5; // degrees
  private static readonly EXPAND_STEP = 1.0; // degrees
  private static readonly MAX_MARGIN = 15.0; // degrees (~900 NM)
  private static readonly BOUNDARY_THRESHOLD = 10; // cells from edge to trigger expansion

  private startLat: number;
  private startLon: number;
  private endLat: number;
  private endLon: number;
  private currentMargin: number;

  constructor(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    gridSize: number,
    maxDistance: number = 50, // ~4.5km at 90m grid
    gate: DepthGate | null = null
  ) {
    this.startLat = startLat;
    this.startLon = startLon;
    this.endLat = endLat;
    this.endLon = endLon;
    this.gridSize = gridSize;
    this.invGridSize = 1 / gridSize;
    this.maxDistance = maxDistance;
    this.currentMargin = DistanceField.INITIAL_MARGIN;
    this.gate = gate;

    this.bounds = this.calculateBounds(this.currentMargin);
  }

  private calculateBounds(margin: number): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    return {
      minLat: Math.min(this.startLat, this.endLat) - margin,
      maxLat: Math.max(this.startLat, this.endLat) + margin,
      minLon: Math.min(this.startLon, this.endLon) - margin,
      maxLon: Math.max(this.startLon, this.endLon) + margin,
    };
  }

  private getKey(lat: number, lon: number): number {
    const latGrid = Math.round(lat * this.invGridSize) | 0;
    const lonGrid = Math.round(lon * this.invGridSize) | 0;
    return (latGrid + 0x7fffffff) * 0x100000 + (lonGrid + 0x7fffffff);
  }

  /**
   * Check if a coordinate is navigable (water — and, with a depth gate, deep
   * enough), with caching. Shallow cells become obstacles exactly like land,
   * so the distance transform, proximity penalties and jump-safety radii all
   * keep the route clear of them.
   */
  private checkWater(lat: number, lon: number): boolean {
    const key = this.getKey(lat, lon);

    if (this.waterGrid.has(key)) {
      return this.waterGrid.get(key)!;
    }

    const geoType = geoTiffWaterService.getWaterTypeSync(lon, lat);
    const navigable = geoType !== 'land' && !(this.gate?.blocksRouting(lat, lon) ?? false);
    this.waterGrid.set(key, navigable);
    return navigable;
  }

  /**
   * Build/rebuild the distance field using a two-pass distance transform
   */
  async build(): Promise<void> {
    const startTime = Date.now();

    // Preload GeoTIFF tiles for the area
    await geoTiffWaterService.preloadTiles(this.bounds.minLon, this.bounds.minLat, this.bounds.maxLon, this.bounds.maxLat);

    // Depth tiles too, so every navigability check below is a sync lookup
    if (this.gate) {
      await this.gate.prepare(this.bounds);
    }

    this.grid.clear();
    // Keep waterGrid cache - it's still valid

    const minLatGrid = Math.floor(this.bounds.minLat * this.invGridSize);
    const maxLatGrid = Math.ceil(this.bounds.maxLat * this.invGridSize);
    const minLonGrid = Math.floor(this.bounds.minLon * this.invGridSize);
    const maxLonGrid = Math.ceil(this.bounds.maxLon * this.invGridSize);

    const width = maxLonGrid - minLonGrid + 1;
    const height = maxLatGrid - minLatGrid + 1;

    console.log(`[DistanceField] Building ${width}x${height} grid (${((width * height) / 1000000).toFixed(2)}M cells)`);

    // First pass: identify land cells and initialize distances
    // Water cells start at maxDistance, land cells at 0
    const tempGrid: number[][] = [];

    for (let latIdx = 0; latIdx < height; latIdx++) {
      tempGrid[latIdx] = [];
      const lat = (minLatGrid + latIdx) * this.gridSize;

      for (let lonIdx = 0; lonIdx < width; lonIdx++) {
        const lon = (minLonGrid + lonIdx) * this.gridSize;
        const isWater = this.checkWater(lat, lon);

        // Initialize: land = 0, water = large number
        tempGrid[latIdx][lonIdx] = isWater ? this.maxDistance : 0;
      }
    }

    // Two-pass distance transform (approximation using Chamfer distance)
    // Forward pass: top-left to bottom-right
    for (let latIdx = 0; latIdx < height; latIdx++) {
      for (let lonIdx = 0; lonIdx < width; lonIdx++) {
        if (tempGrid[latIdx][lonIdx] === 0) continue; // Skip land

        let minDist = tempGrid[latIdx][lonIdx];

        // Check top neighbor
        if (latIdx > 0) {
          minDist = Math.min(minDist, tempGrid[latIdx - 1][lonIdx] + 1);
        }
        // Check left neighbor
        if (lonIdx > 0) {
          minDist = Math.min(minDist, tempGrid[latIdx][lonIdx - 1] + 1);
        }
        // Check top-left diagonal
        if (latIdx > 0 && lonIdx > 0) {
          minDist = Math.min(minDist, tempGrid[latIdx - 1][lonIdx - 1] + 1.414);
        }
        // Check top-right diagonal
        if (latIdx > 0 && lonIdx < width - 1) {
          minDist = Math.min(minDist, tempGrid[latIdx - 1][lonIdx + 1] + 1.414);
        }

        tempGrid[latIdx][lonIdx] = minDist;
      }
    }

    // Backward pass: bottom-right to top-left
    for (let latIdx = height - 1; latIdx >= 0; latIdx--) {
      for (let lonIdx = width - 1; lonIdx >= 0; lonIdx--) {
        if (tempGrid[latIdx][lonIdx] === 0) continue; // Skip land

        let minDist = tempGrid[latIdx][lonIdx];

        // Check bottom neighbor
        if (latIdx < height - 1) {
          minDist = Math.min(minDist, tempGrid[latIdx + 1][lonIdx] + 1);
        }
        // Check right neighbor
        if (lonIdx < width - 1) {
          minDist = Math.min(minDist, tempGrid[latIdx][lonIdx + 1] + 1);
        }
        // Check bottom-right diagonal
        if (latIdx < height - 1 && lonIdx < width - 1) {
          minDist = Math.min(minDist, tempGrid[latIdx + 1][lonIdx + 1] + 1.414);
        }
        // Check bottom-left diagonal
        if (latIdx < height - 1 && lonIdx > 0) {
          minDist = Math.min(minDist, tempGrid[latIdx + 1][lonIdx - 1] + 1.414);
        }

        tempGrid[latIdx][lonIdx] = minDist;
      }
    }

    // Store in the Map with proper keys (only water cells)
    for (let latIdx = 0; latIdx < height; latIdx++) {
      const lat = (minLatGrid + latIdx) * this.gridSize;
      for (let lonIdx = 0; lonIdx < width; lonIdx++) {
        const dist = tempGrid[latIdx][lonIdx];
        if (dist > 0) {
          // Only store water cells
          const lon = (minLonGrid + lonIdx) * this.gridSize;
          const key = this.getKey(lat, lon);
          this.grid.set(key, Math.min(dist, this.maxDistance));
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[DistanceField] Built in ${elapsed}ms, ${this.grid.size} water cells stored`);
  }

  /**
   * Get distance to land for a coordinate (O(1) lookup)
   * Returns distance in grid units, or -1 if outside bounds/on land
   */
  getDistance(lat: number, lon: number): number {
    const key = this.getKey(lat, lon);

    if (this.grid.has(key)) {
      return this.grid.get(key)!;
    }

    // Not in grid - either land or outside bounds
    return -1;
  }

  /**
   * Check if a coordinate is near the boundary and might need expansion
   */
  isNearBoundary(lat: number, lon: number): boolean {
    const threshold = DistanceField.BOUNDARY_THRESHOLD * this.gridSize;

    return (
      lat < this.bounds.minLat + threshold ||
      lat > this.bounds.maxLat - threshold ||
      lon < this.bounds.minLon + threshold ||
      lon > this.bounds.maxLon - threshold
    );
  }

  /**
   * Check if we can expand further
   */
  canExpand(): boolean {
    return this.currentMargin < DistanceField.MAX_MARGIN;
  }

  /**
   * Expand the distance field bounds and rebuild
   */
  async expand(): Promise<boolean> {
    if (!this.canExpand()) {
      console.warn(`[DistanceField] Cannot expand further, at max margin ${this.currentMargin}°`);
      return false;
    }

    const oldMargin = this.currentMargin;
    this.currentMargin = Math.min(this.currentMargin + DistanceField.EXPAND_STEP, DistanceField.MAX_MARGIN);

    console.log(`[DistanceField] Expanding from ${oldMargin}° to ${this.currentMargin}° margin`);

    this.bounds = this.calculateBounds(this.currentMargin);
    await this.build();

    return true;
  }

  /**
   * Check if coordinate is within current bounds
   */
  isInBounds(lat: number, lon: number): boolean {
    return (
      lat >= this.bounds.minLat && lat <= this.bounds.maxLat && lon >= this.bounds.minLon && lon <= this.bounds.maxLon
    );
  }

  /**
   * Get current bounds (for debugging)
   */
  getBounds() {
    return { ...this.bounds };
  }

  /**
   * Get stats (for debugging)
   */
  getStats() {
    return {
      cellCount: this.grid.size,
      waterCacheSize: this.waterGrid.size,
      currentMargin: this.currentMargin,
      bounds: this.bounds,
    };
  }

  /**
   * Check if a coordinate is navigable using the cached waterGrid (faster than global isWater)
   */
  isWaterCached(lat: number, lon: number): boolean {
    return this.checkWater(lat, lon);
  }

  /**
   * Check if a direct line between two points is entirely over water
   * Uses the cached water grid for checking
   * Returns true if the path is safe (all water), false if it crosses land
   */
  isDirectPathSafe(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
    // Check endpoints first
    if (!this.isWaterCached(lat1, lon1) || !this.isWaterCached(lat2, lon2)) {
      return false;
    }

    // Get distances at start and end (if available)
    const startDist = this.getDistance(lat1, lon1);
    const endDist = this.getDistance(lat2, lon2);

    // Calculate the path length in grid units
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const pathLengthDeg = Math.sqrt(dLat * dLat + dLon * dLon);
    const pathLengthCells = pathLengthDeg * this.invGridSize;

    // If both endpoints have known distances and are far from land relative to path length,
    // we can be confident the path is safe
    if (startDist > 0 && endDist > 0) {
      const minDist = Math.min(startDist, endDist);
      if (minDist > pathLengthCells) {
        // The "corridor" from start to end is entirely within safe water
        return true;
      }
    }

    // Otherwise, sample along the path using water cache
    const numSamples = Math.max(10, Math.ceil(pathLengthCells / 2));
    for (let i = 1; i < numSamples; i++) {
      const t = i / numSamples;
      const lat = lat1 + t * dLat;
      const lon = lon1 + t * dLon;

      if (!this.isWaterCached(lat, lon)) {
        return false; // Hit land
      }
    }

    return true;
  }
}
