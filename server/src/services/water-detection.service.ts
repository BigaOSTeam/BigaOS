/**
 * Water Detection Service
 *
 * Uses OSM Water Layer GeoTIFF tiles (90m resolution) for water detection.
 * Covers oceans, seas, lakes, rivers, canals, and streams globally.
 *
 * Data files location: server/src/data/navigation-data/
 * Download from: Settings > Navigation Data
 */

import { geoTiffWaterService, GeoTiffWaterType } from './geotiff-water.service';

export type WaterType = 'ocean' | 'lake' | 'land';

export type RouteFailureReason =
  | 'START_ON_LAND'      // Start point is not on water
  | 'END_ON_LAND'        // End point is not on water
  | 'NO_PATH_FOUND'      // A* couldn't find a water path (land blocks the route)
  | 'DISTANCE_TOO_LONG'  // Route is too long for reliable pathfinding
  | 'NARROW_CHANNEL'     // Path exists but data resolution (90m) too coarse for narrow channels
  | 'MAX_ITERATIONS';    // Pathfinding exhausted iterations without finding goal

class WaterDetectionService {
  private cache = new Map<string, WaterType>();
  private readonly CACHE_SIZE = 100000;
  private initialized = false;

  /**
   * Initialize the service by loading data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadData();
  }

  /**
   * Reload the navigation data (called after new data is downloaded)
   */
  async reload(): Promise<void> {
    console.log('Reloading water detection data...');
    this.cache.clear();
    this.initialized = false;
    await geoTiffWaterService.reload();
    await this.loadData();
  }

  /**
   * Internal method to load all data
   */
  private async loadData(): Promise<void> {
    try {
      console.log('Loading water detection data...');
      await geoTiffWaterService.initialize();

      if (geoTiffWaterService.hasData()) {
        const stats = geoTiffWaterService.getStats();
        console.log(`  OSM Water Layer: ${stats.tileCount} GeoTIFF tiles [90m resolution]`);
      } else {
        console.warn('  Navigation data NOT LOADED');
        console.warn('  Download from Settings > Navigation Data');
      }

      this.initialized = true;
      console.log('Water detection service ready');
    } catch (error) {
      console.error('Failed to load water detection data:', error);
    }
  }

  /**
   * Convert GeoTIFF water type to our WaterType
   */
  private geoTiffTypeToWaterType(geoType: GeoTiffWaterType): WaterType {
    switch (geoType) {
      case 'ocean': return 'ocean';
      case 'lake':
      case 'river':
      case 'canal':
      case 'stream':
        return 'lake'; // All freshwater types map to 'lake'
      default:
        return 'land';
    }
  }

  /**
   * Get the water type at a coordinate (sync - uses cached tiles only).
   */
  getWaterType(lat: number, lon: number): WaterType {
    if (!this.initialized) {
      console.warn('Water detection service not initialized');
      return 'land';
    }

    // Round for caching (~11m precision)
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Get water type from GeoTIFF (sync - cached tiles only)
    const geoType = geoTiffWaterService.getWaterTypeSync(lon, lat);
    const result = this.geoTiffTypeToWaterType(geoType);

    // Cache result
    if (this.cache.size >= this.CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Get the water type at a coordinate (async - loads tiles on demand).
   */
  async getWaterTypeAsync(lat: number, lon: number): Promise<WaterType> {
    if (!this.initialized) {
      console.warn('Water detection service not initialized');
      return 'land';
    }

    // Round for caching (~11m precision)
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Get water type from GeoTIFF (async - loads tile if needed)
    const geoType = await geoTiffWaterService.getWaterType(lon, lat);
    const result = this.geoTiffTypeToWaterType(geoType);

    // Cache result
    if (this.cache.size >= this.CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Check if a coordinate is on water (async - loads tiles on demand)
   */
  async isWaterAsync(lat: number, lon: number): Promise<boolean> {
    const type = await this.getWaterTypeAsync(lat, lon);
    return type === 'ocean' || type === 'lake';
  }

  /**
   * Preload GeoTIFF tiles for a bounding box
   */
  async preloadTiles(minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<number> {
    return geoTiffWaterService.preloadTiles(minLon, minLat, maxLon, maxLat);
  }

  /**
   * Check if a coordinate is on water
   */
  isWater(lat: number, lon: number): boolean {
    const type = this.getWaterType(lat, lon);
    return type === 'ocean' || type === 'lake';
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.CACHE_SIZE
    };
  }

  /**
   * Get water classification grid for a bounding box (for debug overlay)
   * This async version loads tiles on demand.
   */
  async getWaterGrid(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
    gridSize: number = 0.005
  ): Promise<Array<{ lat: number; lon: number; type: WaterType }>> {
    if (!this.initialized) {
      return [];
    }

    // Preload tiles for the bounding box first
    await this.preloadTiles(minLat, maxLat, minLon, maxLon);

    const points: Array<{ lat: number; lon: number; type: WaterType }> = [];
    const maxPoints = 2500;
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    let effectiveGridSize = gridSize;
    const totalPoints = Math.ceil(latRange / gridSize) * Math.ceil(lonRange / gridSize);
    if (totalPoints > maxPoints) {
      effectiveGridSize = Math.sqrt((latRange * lonRange) / maxPoints);
    }

    for (let lat = minLat; lat <= maxLat; lat += effectiveGridSize) {
      for (let lon = minLon; lon <= maxLon; lon += effectiveGridSize) {
        // Now use sync since tiles are preloaded
        const type = this.getWaterType(lat, lon);
        points.push({ lat, lon, type });
      }
    }

    return points;
  }

  /**
   * Check if any navigation data is loaded
   */
  hasNavigationData(): boolean {
    return geoTiffWaterService.hasData();
  }

  /**
   * Calculate distance between two points in nautical miles (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if a straight line between two points crosses land (sync - requires preloaded tiles)
   */
  checkRouteForLand(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    collectAllPoints: boolean = false
  ): { crossesLand: boolean; landPoints: Array<{ lat: number; lon: number }> } {
    const distanceNm = this.calculateDistance(startLat, startLon, endLat, endLon);
    const distanceMeters = distanceNm * 1852;
    const sampleIntervalMeters = 11;
    const numSamples = Math.max(Math.ceil(distanceMeters / sampleIntervalMeters), 2);

    const landPoints: Array<{ lat: number; lon: number }> = [];

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const lat = startLat + t * (endLat - startLat);
      const lon = startLon + t * (endLon - startLon);

      if (!this.isWater(lat, lon)) {
        landPoints.push({ lat, lon });
        if (!collectAllPoints) {
          return { crossesLand: true, landPoints };
        }
      }
    }

    return {
      crossesLand: landPoints.length > 0,
      landPoints
    };
  }

  /**
   * Check if a straight line between two points crosses land (async - preloads tiles)
   */
  async checkRouteForLandAsync(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    collectAllPoints: boolean = false
  ): Promise<{ crossesLand: boolean; landPoints: Array<{ lat: number; lon: number }> }> {
    // Preload tiles for the route
    const minLat = Math.min(startLat, endLat);
    const maxLat = Math.max(startLat, endLat);
    const minLon = Math.min(startLon, endLon);
    const maxLon = Math.max(startLon, endLon);
    await this.preloadTiles(minLat, maxLat, minLon, maxLon);

    return this.checkRouteForLand(startLat, startLon, endLat, endLon, collectAllPoints);
  }

  /**
   * Find a nearby water cell on the grid
   */
  private findNearbyWaterCell(
    lat: number,
    lon: number,
    gridSize: number,
    maxSearchRadius: number = 5
  ): { lat: number; lon: number } | null {
    const snappedLat = Math.round(lat / gridSize) * gridSize;
    const snappedLon = Math.round(lon / gridSize) * gridSize;

    if (this.isWater(snappedLat, snappedLon)) {
      return { lat: snappedLat, lon: snappedLon };
    }

    for (let radius = 1; radius <= maxSearchRadius; radius++) {
      for (let dLat = -radius; dLat <= radius; dLat++) {
        for (let dLon = -radius; dLon <= radius; dLon++) {
          if (Math.abs(dLat) !== radius && Math.abs(dLon) !== radius) continue;

          const testLat = snappedLat + dLat * gridSize;
          const testLon = snappedLon + dLon * gridSize;

          if (this.isWater(testLat, testLon)) {
            return { lat: testLat, lon: testLon };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find a water-only route between two points using A* pathfinding
   */
  async findWaterRoute(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    maxIterations: number = 100000
  ): Promise<{
    success: boolean;
    waypoints: Array<{ lat: number; lon: number }>;
    distance: number;
    failureReason?: RouteFailureReason;
  }> {
    // Preload tiles for the bounding box with some margin
    const margin = 0.5; // degrees
    const minLat = Math.min(startLat, endLat) - margin;
    const maxLat = Math.max(startLat, endLat) + margin;
    const minLon = Math.min(startLon, endLon) - margin;
    const maxLon = Math.max(startLon, endLon) + margin;

    const tilesLoaded = await this.preloadTiles(minLat, maxLat, minLon, maxLon);
    if (tilesLoaded > 0) {
      console.log(`Preloaded ${tilesLoaded} GeoTIFF tiles for route area`);
    }

    const startWater = this.isWater(startLat, startLon);
    const endWater = this.isWater(endLat, endLon);
    console.log(`Route request: (${startLat.toFixed(5)}, ${startLon.toFixed(5)}) -> (${endLat.toFixed(5)}, ${endLon.toFixed(5)})`);
    console.log(`  Start on water: ${startWater}, End on water: ${endWater}`);

    // Check if start/end points are on water
    if (!startWater) {
      console.warn(`  Start point is not on water`);
      return {
        success: false,
        waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
        distance: this.calculateDistance(startLat, startLon, endLat, endLon),
        failureReason: 'START_ON_LAND'
      };
    }

    if (!endWater) {
      console.warn(`  End point is not on water`);
      return {
        success: false,
        waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
        distance: this.calculateDistance(startLat, startLon, endLat, endLon),
        failureReason: 'END_ON_LAND'
      };
    }

    const directCheck = this.checkRouteForLand(startLat, startLon, endLat, endLon, false);
    if (!directCheck.crossesLand) {
      console.log(`  Direct route is clear`);
      return {
        success: true,
        waypoints: [
          { lat: startLat, lon: startLon },
          { lat: endLat, lon: endLon }
        ],
        distance: this.calculateDistance(startLat, startLon, endLat, endLon)
      };
    }

    console.log(`  Direct route crosses land, starting pathfinding`);

    // Calculate distance to choose appropriate grid sizes
    const routeDistanceNm = this.calculateDistance(startLat, startLon, endLat, endLon);
    console.log(`  Route distance: ${routeDistanceNm.toFixed(2)} NM`);

    // Check if route is too long for reliable pathfinding
    if (routeDistanceNm > 100) {
      console.warn(`  Route distance (${routeDistanceNm.toFixed(1)} NM) exceeds limit for pathfinding`);
      return {
        success: false,
        waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
        distance: routeDistanceNm,
        failureReason: 'DISTANCE_TOO_LONG'
      };
    }

    // For longer routes, start with coarser grids
    let gridSizes: number[];
    if (routeDistanceNm > 10) {
      // Long route: start coarse
      gridSizes = [0.005, 0.002, 0.001, 0.0005];
    } else if (routeDistanceNm > 5) {
      // Medium route
      gridSizes = [0.002, 0.001, 0.0005, 0.0002];
    } else {
      // Short route: fine grids
      gridSizes = [0.001, 0.0005, 0.0002, 0.0001];
    }

    let hitMaxIterations = false;

    for (const gridSize of gridSizes) {
      console.log(`  Trying grid size: ${gridSize.toFixed(5)}° (~${(gridSize * 111000).toFixed(0)}m)`);

      const result = this.runAStar(startLat, startLon, endLat, endLon, gridSize, maxIterations);

      if (result.hitMaxIterations) {
        hitMaxIterations = true;
      }

      if (result.success) {
        const validatedPath = this.validateAndRefinePath(result.waypoints);
        if (validatedPath.success) {
          console.log(`Water route found: ${validatedPath.waypoints.length} waypoints, ${validatedPath.distance.toFixed(1)} NM`);
          return validatedPath;
        } else {
          // Path found but validation failed - likely narrow channel issue
          console.log(`  Path found but validation failed - possibly narrow channel`);
        }
      }
    }

    // Determine the most likely failure reason
    let failureReason: RouteFailureReason;
    if (hitMaxIterations) {
      // If we hit max iterations, the search space is too large
      failureReason = routeDistanceNm > 20 ? 'DISTANCE_TOO_LONG' : 'MAX_ITERATIONS';
    } else if (routeDistanceNm < 5) {
      // Short distance but no path - likely narrow channel or small waterway
      failureReason = 'NARROW_CHANNEL';
    } else {
      // General pathfinding failure - land blocks the route
      failureReason = 'NO_PATH_FOUND';
    }

    console.warn(`Water route pathfinding failed: ${failureReason}`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon }
      ],
      distance: this.calculateDistance(startLat, startLon, endLat, endLon),
      failureReason
    };
  }

  /**
   * Run A* pathfinding at a specific grid resolution
   */
  private runAStar(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    gridSize: number,
    maxIterations: number
  ): { success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number; hitMaxIterations: boolean } {
    const startNode = this.findNearbyWaterCell(startLat, startLon, gridSize);
    const endNode = this.findNearbyWaterCell(endLat, endLon, gridSize);

    if (!startNode || !endNode) {
      return {
        success: false,
        waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
        distance: this.calculateDistance(startLat, startLon, endLat, endLon),
        hitMaxIterations: false
      };
    }

    const allNodes = new Map<string, {
      lat: number;
      lon: number;
      g: number;
      f: number;
      parent: string | null;
    }>();

    const openSet = new Set<string>();
    const closedSet = new Set<string>();

    const getKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
    const heuristic = (lat: number, lon: number) =>
      this.calculateDistance(lat, lon, endNode.lat, endNode.lon);

    const startKey = getKey(startNode.lat, startNode.lon);
    allNodes.set(startKey, {
      lat: startNode.lat,
      lon: startNode.lon,
      g: 0,
      f: heuristic(startNode.lat, startNode.lon),
      parent: null
    });
    openSet.add(startKey);

    const directions = [
      [gridSize, 0], [-gridSize, 0], [0, gridSize], [0, -gridSize],
      [gridSize, gridSize], [gridSize, -gridSize], [-gridSize, gridSize], [-gridSize, -gridSize]
    ];

    let iterations = 0;
    let foundPath = false;
    let goalKey = '';

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Log progress every 10000 iterations
      if (iterations % 10000 === 0) {
        const current = allNodes.get(Array.from(openSet)[0])!;
        const distToGoal = this.calculateDistance(current.lat, current.lon, endNode.lat, endNode.lon);
        console.log(`    A* iteration ${iterations}: open=${openSet.size}, closed=${closedSet.size}, dist to goal=${distToGoal.toFixed(2)} NM`);
      }

      let currentKey = '';
      let lowestF = Infinity;
      for (const key of openSet) {
        const node = allNodes.get(key)!;
        if (node.f < lowestF) {
          lowestF = node.f;
          currentKey = key;
        }
      }

      const current = allNodes.get(currentKey)!;
      openSet.delete(currentKey);
      closedSet.add(currentKey);

      if (this.calculateDistance(current.lat, current.lon, endNode.lat, endNode.lon) < gridSize * 2) {
        foundPath = true;
        goalKey = currentKey;
        break;
      }

      for (const [dLat, dLon] of directions) {
        const newLat = Math.round((current.lat + dLat) / gridSize) * gridSize;
        const newLon = Math.round((current.lon + dLon) / gridSize) * gridSize;
        const newKey = getKey(newLat, newLon);

        if (closedSet.has(newKey)) continue;
        if (!this.isWater(newLat, newLon)) continue;

        const tentativeG = current.g + this.calculateDistance(current.lat, current.lon, newLat, newLon);

        const existing = allNodes.get(newKey);
        if (!existing || tentativeG < existing.g) {
          allNodes.set(newKey, {
            lat: newLat,
            lon: newLon,
            g: tentativeG,
            f: tentativeG + heuristic(newLat, newLon),
            parent: currentKey
          });
          openSet.add(newKey);
        }
      }
    }

    const hitMax = iterations >= maxIterations;

    if (foundPath) {
      const path: Array<{ lat: number; lon: number }> = [];
      let currentKey: string | null = goalKey;

      while (currentKey) {
        const node = allNodes.get(currentKey);
        if (node) {
          path.unshift({ lat: node.lat, lon: node.lon });
          currentKey = node.parent;
        } else {
          break;
        }
      }

      path.unshift({ lat: startLat, lon: startLon });
      path.push({ lat: endLat, lon: endLon });

      let totalDist = 0;
      for (let i = 1; i < path.length; i++) {
        totalDist += this.calculateDistance(
          path[i - 1].lat, path[i - 1].lon,
          path[i].lat, path[i].lon
        );
      }

      return { success: true, waypoints: path, distance: totalDist, hitMaxIterations: false };
    }

    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: this.calculateDistance(startLat, startLon, endLat, endLon),
      hitMaxIterations: hitMax
    };
  }

  /**
   * Validate a path at high resolution and refine if needed
   */
  private validateAndRefinePath(
    path: Array<{ lat: number; lon: number }>
  ): { success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number } {
    if (path.length < 2) {
      return { success: false, waypoints: path, distance: 0 };
    }

    const refinedPath: Array<{ lat: number; lon: number }> = [path[0]];

    for (let i = 1; i < path.length; i++) {
      const prev = refinedPath[refinedPath.length - 1];
      const curr = path[i];

      const check = this.checkRouteForLand(prev.lat, prev.lon, curr.lat, curr.lon, false);

      if (check.crossesLand) {
        const microRoute = this.runAStar(prev.lat, prev.lon, curr.lat, curr.lon, 0.0001, 10000);

        if (microRoute.success && !this.pathCrossesLand(microRoute.waypoints)) {
          for (let j = 1; j < microRoute.waypoints.length; j++) {
            refinedPath.push(microRoute.waypoints[j]);
          }
        } else {
          return { success: false, waypoints: path, distance: 0 };
        }
      } else {
        refinedPath.push(curr);
      }
    }

    const simplified = this.simplifyPath(refinedPath);

    let totalDist = 0;
    for (let i = 1; i < simplified.length; i++) {
      totalDist += this.calculateDistance(
        simplified[i - 1].lat, simplified[i - 1].lon,
        simplified[i].lat, simplified[i].lon
      );
    }

    return { success: true, waypoints: simplified, distance: totalDist };
  }

  /**
   * Check if any segment of a path crosses land
   */
  private pathCrossesLand(path: Array<{ lat: number; lon: number }>): boolean {
    for (let i = 1; i < path.length; i++) {
      const check = this.checkRouteForLand(
        path[i - 1].lat, path[i - 1].lon,
        path[i].lat, path[i].lon,
        false
      );
      if (check.crossesLand) return true;
    }
    return false;
  }

  /**
   * Check if a direct line between two points is all water
   */
  private isDirectRouteWater(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
    const distMeters = this.calculateDistance(lat1, lon1, lat2, lon2) * 1852;
    const checkPoints = Math.max(2, Math.ceil(distMeters / 15));

    for (let i = 0; i <= checkPoints; i++) {
      const t = i / checkPoints;
      const lat = lat1 + t * (lat2 - lat1);
      const lon = lon1 + t * (lon2 - lon1);
      if (!this.isWater(lat, lon)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Simplify a path by removing unnecessary waypoints
   */
  private simplifyPath(path: Array<{ lat: number; lon: number }>): Array<{ lat: number; lon: number }> {
    if (path.length <= 2) return path;

    const result: Array<{ lat: number; lon: number }> = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
      const prev = result[result.length - 1];
      const next = path[i + 1];

      if (!this.isDirectRouteWater(prev.lat, prev.lon, next.lat, next.lon)) {
        result.push(path[i]);
      }
    }

    result.push(path[path.length - 1]);
    return result;
  }
}

export const waterDetectionService = new WaterDetectionService();
