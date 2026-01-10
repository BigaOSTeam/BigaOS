/**
 * Route Calculation Worker
 *
 * Runs A* pathfinding in a separate thread to avoid blocking the main event loop.
 * This worker receives route requests via parentPort and sends back results.
 */

import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { ShapefileSpatialIndex } from '../services/shapefile-spatial-index';

type WaterType = 'ocean' | 'lake' | 'land';

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

/**
 * Find a water-only route between two points using A* pathfinding
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

  // A* pathfinding
  const allNodes = new Map<string, {
    lat: number;
    lon: number;
    g: number;
    f: number;
    parent: string | null;
  }>();

  const openSet = new Set<string>();
  const closedSet = new Set<string>();

  const getKey = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const heuristic = (lat: number, lon: number) =>
    calculateDistance(lat, lon, endNode.lat, endNode.lon);

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

    // Find node with lowest f score
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

    // Check if we reached the goal
    if (calculateDistance(current.lat, current.lon, endNode.lat, endNode.lon) < gridSize * 2) {
      foundPath = true;
      goalKey = currentKey;
      break;
    }

    // Explore neighbors
    for (const [dLat, dLon] of directions) {
      const newLat = Math.round((current.lat + dLat) / gridSize) * gridSize;
      const newLon = Math.round((current.lon + dLon) / gridSize) * gridSize;
      const newKey = getKey(newLat, newLon);

      if (closedSet.has(newKey)) continue;
      if (!isWater(newLat, newLon)) continue;

      // Check intermediate points along the edge
      const gridMeters = gridSize * 111000;
      const checkPoints = Math.max(2, Math.ceil(gridMeters / 15));
      let edgeClear = true;
      for (let i = 1; i < checkPoints; i++) {
        const t = i / checkPoints;
        const checkLat = current.lat + t * (newLat - current.lat);
        const checkLon = current.lon + t * (newLon - current.lon);
        if (!isWater(checkLat, checkLon)) {
          edgeClear = false;
          break;
        }
      }
      if (!edgeClear) continue;

      const tentativeG = current.g + calculateDistance(current.lat, current.lon, newLat, newLon);

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

  if (foundPath) {
    // Reconstruct path
    const routePath: Array<{ lat: number; lon: number }> = [];
    let currentKey: string | null = goalKey;

    while (currentKey) {
      const node = allNodes.get(currentKey);
      if (node) {
        routePath.unshift({ lat: node.lat, lon: node.lon });
        currentKey = node.parent;
      } else {
        break;
      }
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
