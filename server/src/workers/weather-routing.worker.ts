/**
 * Weather Routing Worker (isochrone time-optimal path optimizer)
 *
 * Thin worker-thread adapter around the pure isochrone core (./lib/isochrone).
 * It initializes the water/depth services, builds a per-request DepthGate,
 * injects the real isWater + depth check, runs the optimizer (once for a single
 * route, or per-departure for a best-window scan against the same in-memory
 * field), and assembles the WeatherRouteResult + advisory warnings.
 *
 * Cancellation: worker_threads can't receive an AbortSignal, so the service
 * sends a `cancel` message and the optimizer polls a per-id aborted flag.
 */

import { parentPort } from 'worker_threads';
import { geoTiffWaterService } from '../services/geotiff-water.service';
import { depthTileService } from '../services/depth-tile.service';
import { isWater } from './lib/water';
import { DepthGate } from './lib/depth-gate';
import { WeatherField } from './lib/weather-sample';
import { optimizeOnce, timelineAlongPath, Constraints, OptimizeOnceResult } from './lib/isochrone';
import { PolarParams } from '../services/polar';
import {
  WeatherRouteResult,
  RankedDeparture,
  WeatherRouteFailureReason,
} from '../types/weather-route.types';

const HOUR_MS = 3_600_000;

let initialized = false;

async function initialize(): Promise<void> {
  if (initialized) return;
  console.log('[WeatherWorker] Initializing services...');
  await geoTiffWaterService.initialize();
  await depthTileService.initialize();
  initialized = true;
  console.log('[WeatherWorker] Ready');
}

function buildWarnings(
  coverage: WeatherField['coverage'],
  maxWindKn: number,
  maxWaveM: number,
  motoringPct: number,
  beyondHorizon: boolean
): string[] {
  const w: string[] = [];
  if (coverage === 'partial') w.push('PARTIAL_COVERAGE');
  if (coverage === 'none') w.push('NO_COVERAGE');
  if (beyondHorizon) w.push('WINDOW_BEYOND_FORECAST');
  if (maxWindKn >= 33) w.push('GALE');
  else if (maxWindKn >= 25) w.push('STRONG_WIND');
  if (maxWaveM >= 4) w.push('VERY_HIGH_SEAS');
  else if (maxWaveM >= 2.5) w.push('HIGH_SEAS');
  if (motoringPct >= 0.6) w.push('MOSTLY_MOTORING');
  return w;
}

interface OptimizeMessage {
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  weatherField: WeatherField;
  polar: PolarParams;
  departures: number[]; // one for a single route, many for a scan
  constraints: Constraints;
  // A* water route used as a fallback when the isochrone can't thread the coast.
  fallbackPath?: Array<{ lat: number; lon: number }>;
}

const abortedIds = new Set<string>();

async function runOptimize(id: string, data: OptimizeMessage): Promise<WeatherRouteResult & { departures?: RankedDeparture[] }> {
  const { start, end, weatherField, polar, departures, constraints, fallbackPath } = data;
  const shouldAbort = () => abortedIds.has(id);
  const bbox = weatherField.bbox;

  const gate =
    constraints.minSafeDepth != null && Number.isFinite(constraints.minSafeDepth) && constraints.minSafeDepth > 0
      ? new DepthGate(constraints.minSafeDepth, start, end)
      : null;

  // Load the water mask (and depth tiles) for the corridor into memory. Without
  // this, getWaterTypeSync/isWater report land everywhere and no path is found.
  await geoTiffWaterService.preloadTiles(bbox.west, bbox.south, bbox.east, bbox.north);
  if (gate) {
    await gate.prepare({ minLat: bbox.south, maxLat: bbox.north, minLon: bbox.west, maxLon: bbox.east });
  }

  const failResult = (reason: WeatherRouteFailureReason): WeatherRouteResult => ({
    success: false,
    failureReason: reason,
    waypoints: [start, end],
    timeline: [],
    weather: {
      coverage: weatherField.coverage,
      maxWindKn: 0,
      maxWaveM: 0,
      warnings: buildWarnings(weatherField.coverage, 0, 0, 0, false),
      totalDurationMs: 0,
      departureMs: departures[0] ?? 0,
      samplePoints: weatherField.sampledPoints,
    },
  });

  // Endpoint sanity (mirrors A*).
  if (!isWater(start.lat, start.lon)) return failResult('START_ON_LAND');
  if (!isWater(end.lat, end.lon)) return failResult('END_ON_LAND');

  const deps = {
    isWater,
    blocksDepth: gate ? (lat: number, lon: number) => gate.blocksRouting(lat, lon) : undefined,
  };

  const runs = departures.map((departMs) => ({
    departMs,
    result: optimizeOnce(start, end, departMs, weatherField, polar, constraints, deps, shouldAbort),
  }));

  let successful = runs.filter((r) => r.result.success);
  let usedFallback = false;

  // Coastal fallback: the isochrone's straight time-step legs can't thread a
  // coastline that A* can. Time the forecast along the A* water route instead.
  if (successful.length === 0 && fallbackPath && fallbackPath.length >= 2) {
    const fb = departures.map((departMs) => ({ departMs, result: timelineAlongPath(fallbackPath, departMs, weatherField, polar, deps) }));
    successful = fb.filter((r) => r.result.success);
    usedFallback = true;
  }

  if (successful.length === 0) {
    let reason = runs[0]?.result.failureReason ?? 'NO_PATH_FOUND';
    // If depth gating blocked cells, the shallow constraint is the likely cause.
    if (gate && gate.blockedCells > 0 && reason === 'NO_PATH_FOUND') reason = 'TOO_SHALLOW';
    return failResult(reason);
  }

  successful.sort((a, b) => a.result.durationMs - b.result.durationMs);
  const horizonMs = weatherField.t0Ms + weatherField.hours * HOUR_MS;

  const toResult = (departMs: number, r: OptimizeOnceResult): WeatherRouteResult => {
    const lastEta = r.timeline.length ? r.timeline[r.timeline.length - 1].etaMs : departMs;
    const beyondHorizon = lastEta > horizonMs;
    const warnings = buildWarnings(weatherField.coverage, r.maxWindKn, r.maxWaveM, r.motoringPct, beyondHorizon);
    if (usedFallback) warnings.unshift('GEOMETRY_FALLBACK');
    return {
      success: true,
      waypoints: r.waypoints,
      timeline: r.timeline,
      weather: {
        coverage: weatherField.coverage,
        maxWindKn: r.maxWindKn,
        maxWaveM: r.maxWaveM,
        warnings,
        totalDurationMs: r.durationMs,
        departureMs: departMs,
        samplePoints: weatherField.sampledPoints,
      },
    };
  };

  const best = successful[0];
  const result = toResult(best.departMs, best.result);

  if (departures.length <= 1) return result;

  const ranked: RankedDeparture[] = successful.map(({ departMs, result: r }) => ({
    departureMs: departMs,
    durationMs: r.durationMs,
    maxWindKn: r.maxWindKn,
    maxWaveM: r.maxWaveM,
    upwindPct: r.upwindPct,
    motoringPct: r.motoringPct,
    waypoints: r.waypoints,
    timeline: r.timeline,
  }));

  return { ...result, departures: ranked };
}

// Message handler
if (parentPort) {
  parentPort.on('message', async (message: { type: string; id: string; data?: any }) => {
    try {
      if (message.type === 'init') {
        await initialize();
        parentPort!.postMessage({ id: message.id, success: true });
      } else if (message.type === 'cancel') {
        abortedIds.add(message.id);
      } else if (message.type === 'optimize') {
        const result = await runOptimize(message.id, message.data as OptimizeMessage);
        abortedIds.delete(message.id);
        parentPort!.postMessage({ id: message.id, success: true, result });
      }
    } catch (error) {
      abortedIds.delete(message.id);
      parentPort!.postMessage({
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
