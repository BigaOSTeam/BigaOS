/**
 * Route Calculation Worker
 *
 * Runs A* pathfinding in a separate thread to avoid blocking the main event loop.
 * This worker receives route requests via parentPort and sends back results.
 * Uses GeoTIFF navigation data for water detection.
 */

import { parentPort } from 'worker_threads';
import { geoTiffWaterService, GeoTiffWaterType } from '../services/geotiff-water.service';

type WaterType = 'ocean' | 'lake' | 'land';

type RouteFailureReason =
  | 'START_ON_LAND'
  | 'END_ON_LAND'
  | 'NO_PATH_FOUND'
  | 'DISTANCE_TOO_LONG'
  | 'NARROW_CHANNEL'
  | 'MAX_ITERATIONS';

/**
 * Binary Min-Heap Priority Queue for O(log n) insert/extract operations
 */
class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const result = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return result;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = (index << 1) + 1;
      const rightChild = leftChild + 1;
      let smallest = index;

      if (leftChild < length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }
      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

/**
 * DistanceField - Precomputed grid of distances to nearest land
 *
 * Uses a distance transform algorithm to compute land distances for all water cells
 * in a bounding box. Supports on-demand expansion when A* reaches boundaries.
 */
class DistanceField {
  private grid: Map<number, number> = new Map(); // key -> distance in grid units
  private waterGrid: Map<number, boolean> = new Map(); // key -> isWater (cached)
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
    maxDistance: number = 50 // ~4.5km at 90m grid
  ) {
    this.startLat = startLat;
    this.startLon = startLon;
    this.endLat = endLat;
    this.endLon = endLon;
    this.gridSize = gridSize;
    this.invGridSize = 1 / gridSize;
    this.maxDistance = maxDistance;
    this.currentMargin = DistanceField.INITIAL_MARGIN;

    this.bounds = this.calculateBounds(this.currentMargin);
  }

  private calculateBounds(margin: number): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    return {
      minLat: Math.min(this.startLat, this.endLat) - margin,
      maxLat: Math.max(this.startLat, this.endLat) + margin,
      minLon: Math.min(this.startLon, this.endLon) - margin,
      maxLon: Math.max(this.startLon, this.endLon) + margin
    };
  }

  private getKey(lat: number, lon: number): number {
    const latGrid = Math.round(lat * this.invGridSize) | 0;
    const lonGrid = Math.round(lon * this.invGridSize) | 0;
    return (latGrid + 0x7FFFFFFF) * 0x100000 + (lonGrid + 0x7FFFFFFF);
  }

  /**
   * Check if a coordinate is water (with caching)
   */
  private checkWater(lat: number, lon: number): boolean {
    const key = this.getKey(lat, lon);

    if (this.waterGrid.has(key)) {
      return this.waterGrid.get(key)!;
    }

    const geoType = geoTiffWaterService.getWaterTypeSync(lon, lat);
    const isWater = geoType !== 'land';
    this.waterGrid.set(key, isWater);
    return isWater;
  }

  /**
   * Build/rebuild the distance field using a two-pass distance transform
   */
  async build(): Promise<void> {
    const startTime = Date.now();

    // Preload GeoTIFF tiles for the area
    await geoTiffWaterService.preloadTiles(
      this.bounds.minLon,
      this.bounds.minLat,
      this.bounds.maxLon,
      this.bounds.maxLat
    );

    this.grid.clear();
    // Keep waterGrid cache - it's still valid

    const minLatGrid = Math.floor(this.bounds.minLat * this.invGridSize);
    const maxLatGrid = Math.ceil(this.bounds.maxLat * this.invGridSize);
    const minLonGrid = Math.floor(this.bounds.minLon * this.invGridSize);
    const maxLonGrid = Math.ceil(this.bounds.maxLon * this.invGridSize);

    const width = maxLonGrid - minLonGrid + 1;
    const height = maxLatGrid - minLatGrid + 1;

    console.log(`[DistanceField] Building ${width}x${height} grid (${(width * height / 1000000).toFixed(2)}M cells)`);

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
        if (dist > 0) { // Only store water cells
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
    this.currentMargin = Math.min(
      this.currentMargin + DistanceField.EXPAND_STEP,
      DistanceField.MAX_MARGIN
    );

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
      lat >= this.bounds.minLat &&
      lat <= this.bounds.maxLat &&
      lon >= this.bounds.minLon &&
      lon <= this.bounds.maxLon
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
      bounds: this.bounds
    };
  }

  /**
   * Check if a coordinate is water using the cached waterGrid (faster than global isWater)
   */
  isWaterCached(lat: number, lon: number): boolean {
    const key = this.getKey(lat, lon);

    if (this.waterGrid.has(key)) {
      return this.waterGrid.get(key)!;
    }

    // Fall back to GeoTIFF check and cache the result
    const geoType = geoTiffWaterService.getWaterTypeSync(lon, lat);
    const water = geoType !== 'land';
    this.waterGrid.set(key, water);
    return water;
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

// Worker-local state
let initialized = false;
const cache = new Map<string, WaterType>();
const CACHE_SIZE = 10000;

/**
 * Initialize the GeoTIFF water service
 */
async function initialize(): Promise<void> {
  if (initialized) return;

  console.log('[Worker] Initializing GeoTIFF water service...');
  await geoTiffWaterService.initialize();
  initialized = true;
  const stats = geoTiffWaterService.getStats();
  console.log(`[Worker] GeoTIFF water service ready: ${stats.tileCount} tiles`);
}

/**
 * Convert GeoTIFF type to WaterType
 */
function geoTiffToWaterType(geoType: GeoTiffWaterType): WaterType {
  switch (geoType) {
    case 'ocean': return 'ocean';
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
 * Check if a coordinate is on water
 */
function isWater(lat: number, lon: number): boolean {
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

/**
 * Calculate distance between two points in nautical miles (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Find a nearby water cell on the grid
 */
function findNearbyWaterCell(
  lat: number,
  lon: number,
  gridSize: number,
  maxSearchRadius: number = 5
): { lat: number; lon: number } | null {
  const snappedLat = Math.round(lat / gridSize) * gridSize;
  const snappedLon = Math.round(lon / gridSize) * gridSize;

  if (isWater(snappedLat, snappedLon)) {
    return { lat: snappedLat, lon: snappedLon };
  }

  for (let radius = 1; radius <= maxSearchRadius; radius++) {
    for (let dLat = -radius; dLat <= radius; dLat++) {
      for (let dLon = -radius; dLon <= radius; dLon++) {
        if (Math.abs(dLat) !== radius && Math.abs(dLon) !== radius) continue;

        const testLat = snappedLat + dLat * gridSize;
        const testLon = snappedLon + dLon * gridSize;

        if (isWater(testLat, testLon)) {
          return { lat: testLat, lon: testLon };
        }
      }
    }
  }

  return null;
}

/**
 * Check if a direct line between two points crosses land (fine-grained check)
 */
function isDirectRouteWater(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  const distMeters = calculateDistance(lat1, lon1, lat2, lon2) * 1852;
  const checkPoints = Math.max(2, Math.ceil(distMeters / 15));

  for (let i = 0; i <= checkPoints; i++) {
    const t = i / checkPoints;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);
    if (!isWater(lat, lon)) {
      return false;
    }
  }
  return true;
}

/**
 * Simplify a path by removing unnecessary waypoints
 */
function simplifyPath(pathPoints: Array<{ lat: number; lon: number }>): Array<{ lat: number; lon: number }> {
  if (pathPoints.length <= 2) return pathPoints;

  const result: Array<{ lat: number; lon: number }> = [pathPoints[0]];

  for (let i = 1; i < pathPoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = pathPoints[i + 1];

    if (!isDirectRouteWater(prev.lat, prev.lon, next.lat, next.lon)) {
      result.push(pathPoints[i]);
    }
  }

  result.push(pathPoints[pathPoints.length - 1]);
  return result;
}

const DEG_TO_RAD = Math.PI / 180;
const DIAGONAL_MULT = Math.SQRT2;

/**
 * Fast approximate distance for A* heuristic
 */
function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 60;
  const dLon = (lon2 - lon1) * 60 * Math.cos(((lat1 + lat2) / 2) * DEG_TO_RAD);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Integer-based key for faster Map operations
 */
function getIntKey(lat: number, lon: number, invGridSize: number): number {
  const latGrid = Math.round(lat * invGridSize) | 0;
  const lonGrid = Math.round(lon * invGridSize) | 0;
  return (latGrid + 0x7FFFFFFF) * 0x100000 + (lonGrid + 0x7FFFFFFF);
}

interface AStarNode {
  lat: number;
  lon: number;
  g: number;
  f: number;
  parentKey: number;
  key: number;
}

/**
 * Find a water-only route between two points using optimized A* pathfinding
 */
async function findWaterRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  maxIterations: number = 2000000
): Promise<{ success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number; failureReason?: RouteFailureReason }> {
  console.log(`[Worker] Route request: (${startLat.toFixed(5)}, ${startLon.toFixed(5)}) -> (${endLat.toFixed(5)}, ${endLon.toFixed(5)})`);

  // Check distance limit FIRST before any expensive operations
  const totalDistance = calculateDistance(startLat, startLon, endLat, endLon);
  if (totalDistance > 150) {
    console.warn(`[Worker] Route distance (${totalDistance.toFixed(1)} NM) exceeds 150 NM limit`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: totalDistance,
      failureReason: 'DISTANCE_TOO_LONG'
    };
  }

  // Use 90m grid to match GeoTIFF data resolution (0.0008° ≈ 90 meters)
  const gridSize = 0.0008;
  const invGridSize = 1 / gridSize;

  // Build the distance field for land proximity calculations
  // maxDistance of 50 grid units = ~4.5km detection radius
  const distanceField = new DistanceField(startLat, startLon, endLat, endLon, gridSize, 50);
  await distanceField.build();
  console.log(`[Worker] Distance field ready:`, distanceField.getStats());

  // Check if start/end points are on water (using cached check from distance field)
  const startOnWater = distanceField.isWaterCached(startLat, startLon);
  const endOnWater = distanceField.isWaterCached(endLat, endLon);

  if (!startOnWater) {
    console.warn(`[Worker] Start point is not on water`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'START_ON_LAND'
    };
  }

  if (!endOnWater) {
    console.warn(`[Worker] End point is not on water`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'END_ON_LAND'
    };
  }

  // EARLY TERMINATION: Check if direct path is safe using distance field
  // This is much faster than A* for open water routes
  if (distanceField.isDirectPathSafe(startLat, startLon, endLat, endLon)) {
    console.log(`[Worker] Direct route is clear (distance field check)`);
    return {
      success: true,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon }
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon)
    };
  }

  console.log(`[Worker] Direct route blocked, starting A* pathfinding`);
  console.log(`[Worker] Distance: ${totalDistance.toFixed(2)} NM, Grid size: ${gridSize.toFixed(5)}° (~${(gridSize * 111000).toFixed(0)}m)`);

  const startNode = findNearbyWaterCell(startLat, startLon, gridSize);
  const endNode = findNearbyWaterCell(endLat, endLon, gridSize);

  if (!startNode) {
    console.warn(`[Worker] Cannot find water cell near start point`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'NARROW_CHANNEL'
    };
  }

  if (!endNode) {
    console.warn(`[Worker] Cannot find water cell near end point`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'NARROW_CHANNEL'
    };
  }

  const gridDistNm = gridSize * 60;
  const directions: Array<[number, number, number]> = [
    [gridSize, 0, gridDistNm],
    [-gridSize, 0, gridDistNm],
    [0, gridSize, gridDistNm],
    [0, -gridSize, gridDistNm],
    [gridSize, gridSize, gridDistNm * DIAGONAL_MULT],
    [gridSize, -gridSize, gridDistNm * DIAGONAL_MULT],
    [-gridSize, gridSize, gridDistNm * DIAGONAL_MULT],
    [-gridSize, -gridSize, gridDistNm * DIAGONAL_MULT]
  ];

  const gridMeters = gridSize * 111000;
  const edgeCheckPoints = Math.max(2, Math.min(5, Math.ceil(gridMeters / 50)));

  // BIDIRECTIONAL A*: Search from both start and end simultaneously
  // Forward search: start -> end
  const forwardNodes = new Map<number, AStarNode>();
  const forwardClosed = new Set<number>();
  const forwardQueue = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);

  // Backward search: end -> start
  const backwardNodes = new Map<number, AStarNode>();
  const backwardClosed = new Set<number>();
  const backwardQueue = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);

  const startKey = getIntKey(startNode.lat, startNode.lon, invGridSize);
  const endKey = getIntKey(endNode.lat, endNode.lon, invGridSize);

  // Initialize forward search
  const startH = fastDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  const startAStarNode: AStarNode = {
    lat: startNode.lat,
    lon: startNode.lon,
    g: 0,
    f: startH,
    parentKey: -1,
    key: startKey
  };
  forwardNodes.set(startKey, startAStarNode);
  forwardQueue.push(startAStarNode);

  // Initialize backward search
  const endH = fastDistance(endNode.lat, endNode.lon, startNode.lat, startNode.lon);
  const endAStarNode: AStarNode = {
    lat: endNode.lat,
    lon: endNode.lon,
    g: 0,
    f: endH,
    parentKey: -1,
    key: endKey
  };
  backwardNodes.set(endKey, endAStarNode);
  backwardQueue.push(endAStarNode);

  let iterations = 0;
  let meetingKey: number | null = null;
  let bestPathCost = Infinity;
  let expansionCount = 0;

  // Helper function to expand a node in one direction
  const expandNode = (
    current: AStarNode,
    nodes: Map<number, AStarNode>,
    closed: Set<number>,
    queue: PriorityQueue<AStarNode>,
    targetLat: number,
    targetLon: number,
    otherClosed: Set<number>,
    otherNodes: Map<number, AStarNode>
  ): number | null => {
    const currentDistToLand = distanceField.getDistance(current.lat, current.lon);
    const canJump = currentDistToLand > 10;

    // Regular 8-directional neighbors
    for (let i = 0; i < 8; i++) {
      const [dLat, dLon, moveCost] = directions[i];
      const newLat = Math.round((current.lat + dLat) * invGridSize) * gridSize;
      const newLon = Math.round((current.lon + dLon) * invGridSize) * gridSize;
      const newKey = getIntKey(newLat, newLon, invGridSize);

      if (closed.has(newKey)) continue;
      if (!distanceField.isWaterCached(newLat, newLon)) continue;

      // Edge checks when close to land
      if (currentDistToLand < 5) {
        let edgeClear = true;
        for (let j = 1; j < edgeCheckPoints; j++) {
          const t = j / edgeCheckPoints;
          const checkLat = current.lat + t * (newLat - current.lat);
          const checkLon = current.lon + t * (newLon - current.lon);
          if (!distanceField.isWaterCached(checkLat, checkLon)) {
            edgeClear = false;
            break;
          }
        }
        if (!edgeClear) continue;
      }

      // Add penalty for being close to shore (within ~270m / 3 cells)
      let proximityPenalty = 0;
      const newDistToLand = distanceField.getDistance(newLat, newLon);
      if (newDistToLand >= 0 && newDistToLand < 3) {
        // Penalty increases as we get closer to land
        proximityPenalty = (3 - newDistToLand) * 0.05;
      }

      const tentativeG = current.g + moveCost + proximityPenalty;

      const existing = nodes.get(newKey);
      if (!existing || tentativeG < existing.g) {
        const h = fastDistance(newLat, newLon, targetLat, targetLon);
        const newNode: AStarNode = {
          lat: newLat,
          lon: newLon,
          g: tentativeG,
          f: tentativeG + h,
          parentKey: current.key,
          key: newKey
        };
        nodes.set(newKey, newNode);
        queue.push(newNode);

        // Check if this node connects to the other search
        if (otherClosed.has(newKey)) {
          const otherNode = otherNodes.get(newKey);
          if (otherNode) {
            const pathCost = tentativeG + otherNode.g;
            if (pathCost < bestPathCost) {
              bestPathCost = pathCost;
              return newKey;
            }
          }
        }
      }
    }

    // JUMP POINT SEARCH: When far from land, try large jumps toward target
    if (canJump) {
      const toTargetLat = targetLat - current.lat;
      const toTargetLon = targetLon - current.lon;
      const toTargetDist = Math.sqrt(toTargetLat * toTargetLat + toTargetLon * toTargetLon);

      if (toTargetDist > gridSize * 5) {
        const dirLat = toTargetLat / toTargetDist;
        const dirLon = toTargetLon / toTargetDist;
        const safeJumpCells = Math.floor(currentDistToLand * 0.8);

        const jumpSizes = [
          Math.min(safeJumpCells, 5),
          Math.min(safeJumpCells, 15),
          Math.min(safeJumpCells, 30),
          safeJumpCells
        ];

        for (const jumpCells of jumpSizes) {
          if (jumpCells < 3) continue;

          const jumpDist = jumpCells * gridSize;
          const jumpLat = Math.round((current.lat + dirLat * jumpDist) * invGridSize) * gridSize;
          const jumpLon = Math.round((current.lon + dirLon * jumpDist) * invGridSize) * gridSize;
          const jumpKey = getIntKey(jumpLat, jumpLon, invGridSize);

          if (closed.has(jumpKey)) continue;

          const jumpDistToLand = distanceField.getDistance(jumpLat, jumpLon);
          if (jumpDistToLand < 0) continue;

          const jumpDistNm = fastDistance(current.lat, current.lon, jumpLat, jumpLon);
          const tentativeG = current.g + jumpDistNm;

          const existing = nodes.get(jumpKey);
          if (!existing || tentativeG < existing.g) {
            const h = fastDistance(jumpLat, jumpLon, targetLat, targetLon);
            const newNode: AStarNode = {
              lat: jumpLat,
              lon: jumpLon,
              g: tentativeG,
              f: tentativeG + h,
              parentKey: current.key,
              key: jumpKey
            };
            nodes.set(jumpKey, newNode);
            queue.push(newNode);

            // Check if this node connects to the other search
            if (otherClosed.has(jumpKey)) {
              const otherNode = otherNodes.get(jumpKey);
              if (otherNode) {
                const pathCost = tentativeG + otherNode.g;
                if (pathCost < bestPathCost) {
                  bestPathCost = pathCost;
                  return jumpKey;
                }
              }
            }
          }
        }
      }
    }

    return null;
  };

  // Main bidirectional search loop
  while ((!forwardQueue.isEmpty() || !backwardQueue.isEmpty()) && iterations < maxIterations) {
    // Expand forward search
    if (!forwardQueue.isEmpty()) {
      iterations++;
      const current = forwardQueue.pop()!;

      if (!forwardClosed.has(current.key)) {
        forwardClosed.add(current.key);

        // Check boundary expansion
        if (distanceField.isNearBoundary(current.lat, current.lon) && distanceField.canExpand()) {
          console.log(`[Worker] Bidirectional A* reached boundary at iteration ${iterations}, expanding...`);
          await distanceField.expand();
          expansionCount++;
        }

        // Check if forward search reached end
        if (current.key === endKey) {
          meetingKey = endKey;
          break;
        }

        // Check if we met the backward search
        if (backwardClosed.has(current.key)) {
          const backNode = backwardNodes.get(current.key);
          if (backNode) {
            const pathCost = current.g + backNode.g;
            if (pathCost < bestPathCost) {
              bestPathCost = pathCost;
              meetingKey = current.key;
            }
          }
        }

        const newMeeting = expandNode(
          current, forwardNodes, forwardClosed, forwardQueue,
          endNode.lat, endNode.lon, backwardClosed, backwardNodes
        );
        if (newMeeting !== null) meetingKey = newMeeting;
      }
    }

    // Expand backward search
    if (!backwardQueue.isEmpty()) {
      iterations++;
      const current = backwardQueue.pop()!;

      if (!backwardClosed.has(current.key)) {
        backwardClosed.add(current.key);

        // Check boundary expansion
        if (distanceField.isNearBoundary(current.lat, current.lon) && distanceField.canExpand()) {
          console.log(`[Worker] Bidirectional A* reached boundary at iteration ${iterations}, expanding...`);
          await distanceField.expand();
          expansionCount++;
        }

        // Check if backward search reached start
        if (current.key === startKey) {
          meetingKey = startKey;
          break;
        }

        // Check if we met the forward search
        if (forwardClosed.has(current.key)) {
          const fwdNode = forwardNodes.get(current.key);
          if (fwdNode) {
            const pathCost = current.g + fwdNode.g;
            if (pathCost < bestPathCost) {
              bestPathCost = pathCost;
              meetingKey = current.key;
            }
          }
        }

        const newMeeting = expandNode(
          current, backwardNodes, backwardClosed, backwardQueue,
          startNode.lat, startNode.lon, forwardClosed, forwardNodes
        );
        if (newMeeting !== null) meetingKey = newMeeting;
      }
    }

    // Early termination: if we found a meeting point and both queues' best nodes
    // can't improve the path, we're done
    if (meetingKey !== null) {
      const forwardBest = forwardQueue.isEmpty() ? Infinity : forwardQueue.peek()!.f;
      const backwardBest = backwardQueue.isEmpty() ? Infinity : backwardQueue.peek()!.f;
      if (forwardBest >= bestPathCost && backwardBest >= bestPathCost) {
        break;
      }
    }
  }

  if (expansionCount > 0) {
    console.log(`[Worker] Distance field expanded ${expansionCount} time(s) during pathfinding`);
  }

  if (meetingKey !== null) {
    // Reconstruct path: forward path to meeting point + reverse of backward path from meeting point
    const routePath: Array<{ lat: number; lon: number }> = [];

    // Forward path: start -> meeting point
    let currentNode = forwardNodes.get(meetingKey);
    const forwardPath: Array<{ lat: number; lon: number }> = [];
    while (currentNode) {
      forwardPath.unshift({ lat: currentNode.lat, lon: currentNode.lon });
      if (currentNode.parentKey === -1) break;
      currentNode = forwardNodes.get(currentNode.parentKey);
    }

    // Backward path: meeting point -> end (reversed)
    currentNode = backwardNodes.get(meetingKey);
    const backwardPath: Array<{ lat: number; lon: number }> = [];
    while (currentNode) {
      backwardPath.push({ lat: currentNode.lat, lon: currentNode.lon });
      if (currentNode.parentKey === -1) break;
      currentNode = backwardNodes.get(currentNode.parentKey);
    }

    // Combine paths (skip duplicate meeting point)
    routePath.push(...forwardPath);
    if (backwardPath.length > 1) {
      routePath.push(...backwardPath.slice(1));
    }

    // Add original start/end points
    routePath.unshift({ lat: startLat, lon: startLon });
    routePath.push({ lat: endLat, lon: endLon });

    const simplified = simplifyPath(routePath);

    // Validate and adjust waypoints that might be too close to land
    const validated: Array<{ lat: number; lon: number }> = [];
    for (const waypoint of simplified) {
      if (isWater(waypoint.lat, waypoint.lon)) {
        validated.push(waypoint);
      } else {
        // Waypoint ended up on land - try to find nearby water
        const nearbyWater = findNearbyWaterCell(waypoint.lat, waypoint.lon, gridSize, 10);
        if (nearbyWater) {
          console.warn(`[Worker] Adjusted waypoint from (${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}) to water`);
          validated.push(nearbyWater);
        } else {
          // Keep original if we can't find water nearby (shouldn't happen often)
          console.warn(`[Worker] Could not adjust waypoint on land: (${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)})`);
          validated.push(waypoint);
        }
      }
    }

    let totalDist = 0;
    for (let i = 1; i < validated.length; i++) {
      totalDist += calculateDistance(
        validated[i - 1].lat, validated[i - 1].lon,
        validated[i].lat, validated[i].lon
      );
    }

    console.log(`[Worker] Water route found: ${validated.length} waypoints, ${totalDist.toFixed(1)} NM, ${iterations} iterations`);
    return { success: true, waypoints: validated, distance: totalDist };
  }

  // Determine the most likely failure reason
  const hitMaxIterations = iterations >= maxIterations;
  let failureReason: RouteFailureReason;

  if (hitMaxIterations) {
    // Hit max iterations - search space too large or route blocked
    failureReason = 'MAX_ITERATIONS';
  } else if (totalDistance < 5) {
    // Short distance but no path - likely narrow channel or small waterway
    failureReason = 'NARROW_CHANNEL';
  } else {
    // General pathfinding failure - land blocks the route
    failureReason = 'NO_PATH_FOUND';
  }

  console.warn(`[Worker] Pathfinding failed after ${iterations} iterations: ${failureReason}`);
  return {
    success: false,
    waypoints: [
      { lat: startLat, lon: startLon },
      { lat: endLat, lon: endLon }
    ],
    distance: calculateDistance(startLat, startLon, endLat, endLon),
    failureReason
  };
}

// Message handler
if (parentPort) {
  parentPort.on('message', async (message: {
    type: string;
    id: string;
    data?: any;
  }) => {
    try {
      if (message.type === 'init') {
        await initialize();
        parentPort!.postMessage({ id: message.id, success: true });
      } else if (message.type === 'findRoute') {
        const { startLat, startLon, endLat, endLon, maxIterations } = message.data;
        const result = await findWaterRoute(startLat, startLon, endLat, endLon, maxIterations);
        parentPort!.postMessage({ id: message.id, success: true, result });
      }
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
