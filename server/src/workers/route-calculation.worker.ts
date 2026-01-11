/**
 * Route Calculation Worker
 *
 * Runs A* pathfinding in a separate thread to avoid blocking the main event loop.
 * This worker receives route requests via parentPort and sends back results.
 */

import { parentPort } from 'worker_threads';
import { ShapefileSpatialIndex } from '../services/shapefile-spatial-index';

type WaterType = 'ocean' | 'lake' | 'land';

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
let waterSpatialIndex: ShapefileSpatialIndex | null = null;
let initialized = false;
const cache = new Map<string, WaterType>();
const CACHE_SIZE = 10000;

/**
 * Initialize the spatial index from shapefile
 */
async function initialize(shpPath: string): Promise<void> {
  if (initialized) return;

  console.log('[Worker] Initializing spatial index...');
  waterSpatialIndex = new ShapefileSpatialIndex();
  await waterSpatialIndex.initialize(shpPath);
  initialized = true;
  console.log('[Worker] Spatial index ready');
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

  // Check spatial index
  let result: WaterType = 'land';
  if (waterSpatialIndex && waterSpatialIndex.containsPoint(lon, lat)) {
    result = 'ocean';
  }

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
  const R = 3440.065; // Earth's radius in nautical miles
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
function isDirectRouteWater(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): boolean {
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

// Pre-computed constants for distance calculations
const DEG_TO_RAD = Math.PI / 180;

// Pre-computed diagonal distance multiplier (sqrt(2))
const DIAGONAL_MULT = Math.SQRT2;

/**
 * Fast approximate distance for A* heuristic (no trig functions)
 * Uses equirectangular approximation - accurate enough for grid-based pathfinding
 */
function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 60; // Convert to nautical miles directly
  const dLon = (lon2 - lon1) * 60 * Math.cos(((lat1 + lat2) / 2) * DEG_TO_RAD);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Integer-based key for faster Map operations
 * Encodes lat/lon into a single number (faster than string keys)
 */
function getIntKey(lat: number, lon: number, invGridSize: number): number {
  // Convert to grid coordinates and pack into a single integer
  const latGrid = Math.round(lat * invGridSize) | 0;
  const lonGrid = Math.round(lon * invGridSize) | 0;
  // Pack into 64-bit safe integer (32 bits each, offset to handle negatives)
  return (latGrid + 0x7FFFFFFF) * 0x100000 + (lonGrid + 0x7FFFFFFF);
}

/**
 * A* Node structure optimized for cache locality
 */
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
 *
 * Optimizations applied:
 * - Binary heap priority queue for O(log n) operations instead of O(n) linear scan
 * - Integer keys for faster Map lookups
 * - Fast equirectangular distance approximation for heuristic
 * - Pre-computed direction offsets with distance costs
 * - Reduced edge checking with adaptive sampling
 * - Early termination with goal proximity check
 */
function findWaterRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  maxIterations: number = 10000
): { success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number } {
  console.log(`[Worker] Route request: (${startLat.toFixed(5)}, ${startLon.toFixed(5)}) -> (${endLat.toFixed(5)}, ${endLon.toFixed(5)})`);

  // First check if direct route is possible
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

  // Calculate appropriate grid size based on distance
  const totalDistance = calculateDistance(startLat, startLon, endLat, endLon);
  const gridSize = Math.max(0.0005, Math.min(0.02, totalDistance / 500));
  const invGridSize = 1 / gridSize; // Pre-compute inverse for faster multiplication
  console.log(`[Worker] Distance: ${totalDistance.toFixed(2)} NM, Grid size: ${gridSize.toFixed(5)}° (~${(gridSize * 111000).toFixed(0)}m)`);

  // Find valid water cells near start and end points
  const startNode = findNearbyWaterCell(startLat, startLon, gridSize);
  const endNode = findNearbyWaterCell(endLat, endLon, gridSize);

  if (!startNode) {
    console.warn(`[Worker] Cannot find water cell near start point`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon)
    };
  }

  if (!endNode) {
    console.warn(`[Worker] Cannot find water cell near end point`);
    return {
      success: false,
      waypoints: [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }],
      distance: calculateDistance(startLat, startLon, endLat, endLon)
    };
  }

  // Pre-compute goal threshold
  const goalThreshold = gridSize * 2;
  const goalThresholdSq = goalThreshold * goalThreshold;

  // A* data structures
  const allNodes = new Map<number, AStarNode>();
  const closedSet = new Set<number>();

  // Priority queue with f-score comparison
  const openQueue = new PriorityQueue<AStarNode>((a, b) => a.f - b.f);

  // Pre-compute direction offsets with approximate costs (in grid units)
  // Cardinals cost 1, diagonals cost sqrt(2)
  const gridDistNm = gridSize * 60; // Approximate NM per grid cell
  const directions: Array<[number, number, number]> = [
    [gridSize, 0, gridDistNm],           // N
    [-gridSize, 0, gridDistNm],          // S
    [0, gridSize, gridDistNm],           // E
    [0, -gridSize, gridDistNm],          // W
    [gridSize, gridSize, gridDistNm * DIAGONAL_MULT],    // NE
    [gridSize, -gridSize, gridDistNm * DIAGONAL_MULT],   // NW
    [-gridSize, gridSize, gridDistNm * DIAGONAL_MULT],   // SE
    [-gridSize, -gridSize, gridDistNm * DIAGONAL_MULT]   // SW
  ];

  // Adaptive edge checking - fewer checks for smaller grids
  const gridMeters = gridSize * 111000;
  const edgeCheckPoints = Math.max(2, Math.min(5, Math.ceil(gridMeters / 50)));

  // Initialize start node
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

    // Skip if we've already processed this node with a better path
    if (closedSet.has(current.key)) continue;
    closedSet.add(current.key);

    // Fast goal check using squared distance approximation
    const dLatGoal = current.lat - endNode.lat;
    const dLonGoal = current.lon - endNode.lon;
    if (dLatGoal * dLatGoal + dLonGoal * dLonGoal < goalThresholdSq) {
      foundPath = true;
      goalNode = current;
      break;
    }

    // Explore neighbors
    for (let i = 0; i < 8; i++) {
      const [dLat, dLon, moveCost] = directions[i];
      const newLat = Math.round((current.lat + dLat) * invGridSize) * gridSize;
      const newLon = Math.round((current.lon + dLon) * invGridSize) * gridSize;
      const newKey = getIntKey(newLat, newLon, invGridSize);

      // Skip if already in closed set
      if (closedSet.has(newKey)) continue;

      // Check if destination is water
      if (!isWater(newLat, newLon)) continue;

      // Check intermediate points along the edge (adaptive sampling)
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
    // Reconstruct path
    const routePath: Array<{ lat: number; lon: number }> = [];
    let currentNode: AStarNode | undefined = goalNode;

    while (currentNode) {
      routePath.unshift({ lat: currentNode.lat, lon: currentNode.lon });
      if (currentNode.parentKey === -1) break;
      currentNode = allNodes.get(currentNode.parentKey);
    }

    // Add actual start and end points
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

  console.warn(`[Worker] Pathfinding failed after ${iterations} iterations`);
  return {
    success: false,
    waypoints: [
      { lat: startLat, lon: startLon },
      { lat: endLat, lon: endLon }
    ],
    distance: calculateDistance(startLat, startLon, endLat, endLon)
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
        await initialize(message.data.shpPath);
        parentPort!.postMessage({ id: message.id, success: true });
      } else if (message.type === 'findRoute') {
        const { startLat, startLon, endLat, endLon, maxIterations } = message.data;
        const result = findWaterRoute(startLat, startLon, endLat, endLon, maxIterations);
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
