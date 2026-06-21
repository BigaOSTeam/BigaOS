/**
 * Route Calculation Worker
 *
 * Runs A* pathfinding in a separate thread to avoid blocking the main event loop.
 * This worker receives route requests via parentPort and sends back results.
 * Uses GeoTIFF navigation data for water detection.
 *
 * The reusable building blocks (geo helpers, water mask, depth gate, distance
 * field) live in ./lib so the weather-routing worker can share them.
 */

import { parentPort } from 'worker_threads';
import { geoTiffWaterService } from '../services/geotiff-water.service';
import { depthTileService } from '../services/depth-tile.service';
import { fastDistance, calculateDistance, getIntKey, PriorityQueue, DIAGONAL_MULT } from './lib/geo';
import { isWater } from './lib/water';
import { DepthGate, RouteDepthInfo, buildDepthInfo } from './lib/depth-gate';
import { DistanceField } from './lib/distance-field';

type RouteFailureReason =
  | 'START_ON_LAND'
  | 'END_ON_LAND'
  | 'NO_PATH_FOUND'
  | 'TOO_SHALLOW'
  | 'DISTANCE_TOO_LONG'
  | 'NARROW_CHANNEL'
  | 'MAX_ITERATIONS';

// Worker-local state
let initialized = false;

/**
 * Initialize the GeoTIFF water service
 */
async function initialize(): Promise<void> {
  if (initialized) return;

  console.log('[Worker] Initializing GeoTIFF water service...');
  await geoTiffWaterService.initialize();
  // Index (not load) downloaded depth tiles for depth-aware routing
  await depthTileService.initialize();
  initialized = true;
  const stats = geoTiffWaterService.getStats();
  console.log(`[Worker] GeoTIFF water service ready: ${stats.tileCount} tiles`);
}

// Depth gate for the route currently being calculated (one request at a time).
// Kept module-level so the standalone helpers below honour it without changing
// the pure isWater cache, which stays valid across requests.
let activeGate: DepthGate | null = null;

/** Water AND (when depth-gated) deep enough — the per-point passability test. */
function isNavigable(lat: number, lon: number): boolean {
  return isWater(lat, lon) && !(activeGate?.blocksRouting(lat, lon) ?? false);
}

/**
 * Find a nearby navigable cell on the grid
 */
function findNearbyWaterCell(
  lat: number,
  lon: number,
  gridSize: number,
  maxSearchRadius: number = 5
): { lat: number; lon: number } | null {
  const snappedLat = Math.round(lat / gridSize) * gridSize;
  const snappedLon = Math.round(lon / gridSize) * gridSize;

  if (isNavigable(snappedLat, snappedLon)) {
    return { lat: snappedLat, lon: snappedLon };
  }

  for (let radius = 1; radius <= maxSearchRadius; radius++) {
    for (let dLat = -radius; dLat <= radius; dLat++) {
      for (let dLon = -radius; dLon <= radius; dLon++) {
        if (Math.abs(dLat) !== radius && Math.abs(dLon) !== radius) continue;

        const testLat = snappedLat + dLat * gridSize;
        const testLon = snappedLon + dLon * gridSize;

        if (isNavigable(testLat, testLon)) {
          return { lat: testLat, lon: testLon };
        }
      }
    }
  }

  return null;
}

/**
 * Check if a direct line between two points stays navigable (fine-grained check)
 */
function isDirectRouteWater(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  const distMeters = calculateDistance(lat1, lon1, lat2, lon2) * 1852;
  const checkPoints = Math.max(2, Math.ceil(distMeters / 15));

  for (let i = 0; i <= checkPoints; i++) {
    const t = i / checkPoints;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);
    if (!isNavigable(lat, lon)) {
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

interface AStarNode {
  lat: number;
  lon: number;
  g: number;
  f: number;
  parentKey: number;
  key: number;
}

interface RouteCalcResult {
  success: boolean;
  waypoints: Array<{ lat: number; lon: number }>;
  distance: number;
  failureReason?: RouteFailureReason;
  depth?: RouteDepthInfo;
}

/**
 * Find a water-only route between two points using optimized A* pathfinding.
 * With `minSafeDepth` set (metres, draft + safety margin), cells with known
 * depth shallower than it are treated as obstacles wherever downloaded depth
 * tiles cover the area; uncovered cells stay passable and are reported via
 * the result's depth coverage instead.
 */
async function findWaterRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  maxIterations: number = 2000000,
  minSafeDepth?: number
): Promise<RouteCalcResult> {
  try {
    return await findWaterRouteImpl(startLat, startLon, endLat, endLon, maxIterations, minSafeDepth);
  } finally {
    activeGate = null;
  }
}

async function findWaterRouteImpl(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  maxIterations: number,
  minSafeDepth?: number
): Promise<RouteCalcResult> {
  console.log(
    `[Worker] Route request: (${startLat.toFixed(5)}, ${startLon.toFixed(5)}) -> (${endLat.toFixed(5)}, ${endLon.toFixed(5)})${minSafeDepth ? `, min safe depth ${minSafeDepth}m` : ''}`
  );

  // Check distance limit FIRST before any expensive operations
  const totalDistance = calculateDistance(startLat, startLon, endLat, endLon);
  if (totalDistance > 150) {
    console.warn(`[Worker] Route distance (${totalDistance.toFixed(1)} NM) exceeds 150 NM limit`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ],
      distance: totalDistance,
      failureReason: 'DISTANCE_TOO_LONG',
    };
  }

  // Use 90m grid to match GeoTIFF data resolution (0.0008° ≈ 90 meters)
  const gridSize = 0.0008;
  const invGridSize = 1 / gridSize;

  // Depth gate (draft + safety margin). Created even when no depth pack covers
  // the area so the result can report coverage: 'none' honestly.
  const gate =
    minSafeDepth != null && Number.isFinite(minSafeDepth) && minSafeDepth > 0
      ? new DepthGate(minSafeDepth, { lat: startLat, lon: startLon }, { lat: endLat, lon: endLon })
      : null;
  activeGate = gate;

  // Build the distance field for land proximity calculations
  // maxDistance of 50 grid units = ~4.5km detection radius
  const distanceField = new DistanceField(startLat, startLon, endLat, endLon, gridSize, 50, gate);
  await distanceField.build();
  console.log(`[Worker] Distance field ready:`, distanceField.getStats());

  // Check if start/end points are on water (using cached check from distance field)
  const startOnWater = distanceField.isWaterCached(startLat, startLon);
  const endOnWater = distanceField.isWaterCached(endLat, endLon);

  if (!startOnWater) {
    console.warn(`[Worker] Start point is not on water`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'START_ON_LAND',
    };
  }

  if (!endOnWater) {
    console.warn(`[Worker] End point is not on water`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'END_ON_LAND',
    };
  }

  // FAIL FAST for depth gating: an endpoint surrounded by known-shallow water
  // beyond its grace radius can never be reached — say so immediately instead
  // of flooding the search space.
  if (gate) {
    const startSealed = gate.isEndpointSealed(startLat, startLon, gridSize, isWater);
    const endSealed = !startSealed && gate.isEndpointSealed(endLat, endLon, gridSize, isWater);
    if (startSealed || endSealed) {
      console.warn(`[Worker] ${startSealed ? 'Start' : 'End'} point is sealed by water shallower than ${gate.minSafeDepthM}m`);
      const dStart = gate.depthAt(startLat, startLon);
      const dEnd = gate.depthAt(endLat, endLon);
      return {
        success: false,
        waypoints: [
          { lat: startLat, lon: startLon },
          { lat: endLat, lon: endLon },
        ],
        distance: calculateDistance(startLat, startLon, endLat, endLon),
        failureReason: 'TOO_SHALLOW',
        depth: {
          minSafeDepth: gate.minSafeDepthM,
          coverage: 'partial',
          shallowestDepth: null,
          startInShallow: dStart != null && dStart < gate.minSafeDepthM,
          endInShallow: dEnd != null && dEnd < gate.minSafeDepthM,
        },
      };
    }
  }

  // EARLY TERMINATION: Check if direct path is safe using distance field
  // This is much faster than A* for open water routes
  if (distanceField.isDirectPathSafe(startLat, startLon, endLat, endLon)) {
    console.log(`[Worker] Direct route is clear (distance field check)`);
    const directWaypoints = [
      { lat: startLat, lon: startLon },
      { lat: endLat, lon: endLon },
    ];
    return {
      success: true,
      waypoints: directWaypoints,
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      depth: gate ? buildDepthInfo(gate, directWaypoints, startLat, startLon, endLat, endLon) : undefined,
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
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'NARROW_CHANNEL',
    };
  }

  if (!endNode) {
    console.warn(`[Worker] Cannot find water cell near end point`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      failureReason: 'NARROW_CHANNEL',
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
    [-gridSize, -gridSize, gridDistNm * DIAGONAL_MULT],
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
    key: startKey,
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
    key: endKey,
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
          key: newKey,
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

        const jumpSizes = [Math.min(safeJumpCells, 5), Math.min(safeJumpCells, 15), Math.min(safeJumpCells, 30), safeJumpCells];

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
              key: jumpKey,
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
          current,
          forwardNodes,
          forwardClosed,
          forwardQueue,
          endNode.lat,
          endNode.lon,
          backwardClosed,
          backwardNodes
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
          current,
          backwardNodes,
          backwardClosed,
          backwardQueue,
          startNode.lat,
          startNode.lon,
          forwardClosed,
          forwardNodes
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
      if (isNavigable(waypoint.lat, waypoint.lon)) {
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
      totalDist += calculateDistance(validated[i - 1].lat, validated[i - 1].lon, validated[i].lat, validated[i].lon);
    }

    console.log(`[Worker] Water route found: ${validated.length} waypoints, ${totalDist.toFixed(1)} NM, ${iterations} iterations`);
    return {
      success: true,
      waypoints: validated,
      distance: totalDist,
      depth: gate ? buildDepthInfo(gate, validated, startLat, startLon, endLat, endLon) : undefined,
    };
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

  // When depth gating actually blocked cells, the shallow constraint is the
  // likely culprit — tell the user so they can adjust draft/margin instead of
  // puzzling over a "no path" error.
  if (gate && gate.blockedCells > 0 && (failureReason === 'NO_PATH_FOUND' || failureReason === 'NARROW_CHANNEL')) {
    failureReason = 'TOO_SHALLOW';
  }

  console.warn(`[Worker] Pathfinding failed after ${iterations} iterations: ${failureReason}`);
  return {
    success: false,
    waypoints: [
      { lat: startLat, lon: startLon },
      { lat: endLat, lon: endLon },
    ],
    distance: calculateDistance(startLat, startLon, endLat, endLon),
    failureReason,
  };
}

// Message handler
if (parentPort) {
  parentPort.on('message', async (message: { type: string; id: string; data?: any }) => {
    try {
      if (message.type === 'init') {
        await initialize();
        parentPort!.postMessage({ id: message.id, success: true });
      } else if (message.type === 'findRoute') {
        const { startLat, startLon, endLat, endLon, maxIterations, minSafeDepth } = message.data;
        const result = await findWaterRoute(startLat, startLon, endLat, endLon, maxIterations, minSafeDepth);
        parentPort!.postMessage({ id: message.id, success: true, result });
      }
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
