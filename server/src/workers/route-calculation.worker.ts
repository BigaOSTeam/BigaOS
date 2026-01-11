/**
 * Route Calculation Worker
 *
 * Runs A* pathfinding in a separate thread to avoid blocking the main event loop.
 * This worker receives route requests via parentPort and sends back results.
 * Uses GeoTIFF water data for water detection.
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
 * Check if a straight line between two points crosses land
 */
function checkRouteForLand(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  sampleDistance: number = 0.5
): { crossesLand: boolean; landPoints: Array<{ lat: number; lon: number }> } {
  const distance = calculateDistance(startLat, startLon, endLat, endLon);
  const numSamples = Math.max(Math.ceil(distance / sampleDistance), 10);
  const landPoints: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const lat = startLat + t * (endLat - startLat);
    const lon = startLon + t * (endLon - startLon);

    if (!isWater(lat, lon)) {
      landPoints.push({ lat, lon });
    }
  }

  return {
    crossesLand: landPoints.length > 0,
    landPoints
  };
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
  maxIterations: number = 10000
): Promise<{ success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number; failureReason?: RouteFailureReason }> {
  console.log(`[Worker] Route request: (${startLat.toFixed(5)}, ${startLon.toFixed(5)}) -> (${endLat.toFixed(5)}, ${endLon.toFixed(5)})`);

  // Preload tiles for the bounding box with some margin
  const margin = 0.5; // degrees
  const minLat = Math.min(startLat, endLat) - margin;
  const maxLat = Math.max(startLat, endLat) + margin;
  const minLon = Math.min(startLon, endLon) - margin;
  const maxLon = Math.max(startLon, endLon) + margin;

  const tilesLoaded = await geoTiffWaterService.preloadTiles(minLon, minLat, maxLon, maxLat);
  if (tilesLoaded > 0) {
    console.log(`[Worker] Preloaded ${tilesLoaded} GeoTIFF tiles for route area`);
  }

  // Check if start/end points are on water
  const startOnWater = isWater(startLat, startLon);
  const endOnWater = isWater(endLat, endLon);

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

  const directCheck = checkRouteForLand(startLat, startLon, endLat, endLon, 0.1);
  if (!directCheck.crossesLand) {
    console.log(`[Worker] Direct route is clear`);
    return {
      success: true,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon }
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon)
    };
  }

  console.log(`[Worker] Direct route crosses land at ${directCheck.landPoints.length} points`);

  const totalDistance = calculateDistance(startLat, startLon, endLat, endLon);

  // Check if route is too long for reliable pathfinding
  if (totalDistance > 100) {
    console.warn(`[Worker] Route distance (${totalDistance.toFixed(1)} NM) exceeds limit for pathfinding`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: totalDistance,
      failureReason: 'DISTANCE_TOO_LONG'
    };
  }

  const gridSize = Math.max(0.0005, Math.min(0.02, totalDistance / 500));
  const invGridSize = 1 / gridSize;
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

  const goalThreshold = gridSize * 2;
  const goalThresholdSq = goalThreshold * goalThreshold;

  const allNodes = new Map<number, AStarNode>();
  const closedSet = new Set<number>();
  const openQueue = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);

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

  const startKey = getIntKey(startNode.lat, startNode.lon, invGridSize);
  const startH = fastDistance(startNode.lat, startNode.lon, endNode.lat, endNode.lon);
  const startAStarNode: AStarNode = {
    lat: startNode.lat,
    lon: startNode.lon,
    g: 0,
    f: startH,
    parentKey: -1,
    key: startKey
  };
  allNodes.set(startKey, startAStarNode);
  openQueue.push(startAStarNode);

  let iterations = 0;
  let foundPath = false;
  let goalNode: AStarNode | null = null;

  while (!openQueue.isEmpty() && iterations < maxIterations) {
    iterations++;

    const current = openQueue.pop()!;

    if (closedSet.has(current.key)) continue;
    closedSet.add(current.key);

    const dLatGoal = current.lat - endNode.lat;
    const dLonGoal = current.lon - endNode.lon;
    if (dLatGoal * dLatGoal + dLonGoal * dLonGoal < goalThresholdSq) {
      foundPath = true;
      goalNode = current;
      break;
    }

    for (let i = 0; i < 8; i++) {
      const [dLat, dLon, moveCost] = directions[i];
      const newLat = Math.round((current.lat + dLat) * invGridSize) * gridSize;
      const newLon = Math.round((current.lon + dLon) * invGridSize) * gridSize;
      const newKey = getIntKey(newLat, newLon, invGridSize);

      if (closedSet.has(newKey)) continue;
      if (!isWater(newLat, newLon)) continue;

      let edgeClear = true;
      for (let j = 1; j < edgeCheckPoints; j++) {
        const t = j / edgeCheckPoints;
        const checkLat = current.lat + t * (newLat - current.lat);
        const checkLon = current.lon + t * (newLon - current.lon);
        if (!isWater(checkLat, checkLon)) {
          edgeClear = false;
          break;
        }
      }
      if (!edgeClear) continue;

      const tentativeG = current.g + moveCost;

      const existing = allNodes.get(newKey);
      if (!existing || tentativeG < existing.g) {
        const h = fastDistance(newLat, newLon, endNode.lat, endNode.lon);
        const newNode: AStarNode = {
          lat: newLat,
          lon: newLon,
          g: tentativeG,
          f: tentativeG + h,
          parentKey: current.key,
          key: newKey
        };
        allNodes.set(newKey, newNode);
        openQueue.push(newNode);
      }
    }
  }

  if (foundPath && goalNode) {
    const routePath: Array<{ lat: number; lon: number }> = [];
    let currentNode: AStarNode | undefined = goalNode;

    while (currentNode) {
      routePath.unshift({ lat: currentNode.lat, lon: currentNode.lon });
      if (currentNode.parentKey === -1) break;
      currentNode = allNodes.get(currentNode.parentKey);
    }

    routePath.unshift({ lat: startLat, lon: startLon });
    routePath.push({ lat: endLat, lon: endLon });

    const simplified = simplifyPath(routePath);

    let totalDist = 0;
    for (let i = 1; i < simplified.length; i++) {
      totalDist += calculateDistance(
        simplified[i - 1].lat, simplified[i - 1].lon,
        simplified[i].lat, simplified[i].lon
      );
    }

    console.log(`[Worker] Water route found: ${simplified.length} waypoints, ${totalDist.toFixed(1)} NM, ${iterations} iterations`);
    return { success: true, waypoints: simplified, distance: totalDist };
  }

  // Determine the most likely failure reason
  const hitMaxIterations = iterations >= maxIterations;
  let failureReason: RouteFailureReason;

  if (hitMaxIterations) {
    // Hit max iterations - search space too large or route blocked
    failureReason = totalDistance > 20 ? 'DISTANCE_TOO_LONG' : 'MAX_ITERATIONS';
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
