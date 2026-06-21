/**
 * Isochrone optimizer core (pure, dependency-injected).
 *
 * Time-optimal pathfinding over a time-varying wind/wave field using the
 * classic isochrone method. Land/depth navigability is injected (isWaterFn +
 * an optional DepthGate) so this module has no I/O and is fully unit-testable
 * with a synthetic field and a stub water function.
 *
 * The worker wraps this with the real isWater + a per-request DepthGate.
 */

import { calculateDistance, fastDistance } from './geo';
import { sampleField, WeatherField } from './weather-sample';
import { boatSpeedKn, PolarParams, PointOfSail } from '../../services/polar';
import { WeatherRouteStep, WeatherRouteFailureReason } from '../../types/weather-route.types';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const HOUR_MS = 3_600_000;

// Tunables
export const HEADING_STEP_DEG = 8; // 45 candidate headings
const DT_MS = HOUR_MS; // isochrone time step
const SECTOR_DEG = 2; // bearing-from-start pruning sectors
const ARRIVAL_NM = 0.5; // close enough to count as arrived
const MIN_SPEED_KN = 0.05; // below this the boat makes no way on this heading
const MAX_ISOCHRONES = 400; // hard backstop

export interface Constraints {
  minSafeDepth?: number;
  maxWindKn?: number;
  maxWaveM?: number;
}

/** Navigability checks injected by the caller. */
export interface IsochroneDeps {
  isWater: (lat: number, lon: number) => boolean;
  blocksDepth?: (lat: number, lon: number) => boolean; // true → too shallow
}

export interface OptimizeOnceResult {
  success: boolean;
  failureReason?: WeatherRouteFailureReason;
  waypoints: Array<{ lat: number; lon: number }>;
  timeline: WeatherRouteStep[];
  durationMs: number;
  maxWindKn: number;
  maxWaveM: number;
  upwindPct: number;
  motoringPct: number;
}

// ---- geometry ----

/** Initial bearing (radians, 0..2π, 0 = north) from point 1 to point 2. */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let brg = Math.atan2(y, x);
  if (brg < 0) brg += TWO_PI;
  return brg;
}

/** Step from a point along a heading by a distance in nautical miles. */
function stepLatLon(lat: number, lon: number, headingRad: number, distNm: number): { lat: number; lon: number } {
  const distDeg = distNm / 60;
  const dLat = distDeg * Math.cos(headingRad);
  const dLon = (distDeg * Math.sin(headingRad)) / Math.max(0.1, Math.cos(lat * DEG));
  return { lat: lat + dLat, lon: lon + dLon };
}

/** True wind angle (0..π) between a heading and the wind's FROM direction. */
function trueWindAngle(headingRad: number, windFromRad: number): number {
  let d = Math.abs(windFromRad - headingRad) % TWO_PI;
  if (d > Math.PI) d = TWO_PI - d;
  return d;
}

/** Which tack: wind over starboard side → starboard tack. */
function tackOf(headingRad: number, windFromRad: number): 'port' | 'starboard' {
  let rel = (windFromRad - headingRad) % TWO_PI;
  if (rel < 0) rel += TWO_PI;
  return rel > 0 && rel < Math.PI ? 'starboard' : 'port';
}

interface Node {
  idx: number;
  lat: number;
  lon: number;
  timeMs: number;
  parentIdx: number;
  twsKn?: number;
  twdRad?: number;
  twaRad?: number;
  speedKn?: number;
  waveHM?: number;
  motoring?: boolean;
  headingRad?: number;
  tack?: 'port' | 'starboard';
}

/** Sample a leg for land and (when gated) shallow water. ~250 m steps. */
function segmentNavigable(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  deps: IsochroneDeps
): boolean {
  const distNm = fastDistance(lat1, lon1, lat2, lon2);
  const steps = Math.max(2, Math.min(80, Math.ceil((distNm * 1852) / 250)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = lat1 + t * (lat2 - lat1);
    const lon = lon1 + t * (lon2 - lon1);
    if (!deps.isWater(lat, lon)) return false;
    if (deps.blocksDepth && deps.blocksDepth(lat, lon)) return false;
  }
  return true;
}

function pointOfSailOf(n: Node): PointOfSail {
  if (n.parentIdx < 0) return 'motoring'; // start node — neutral label
  return posFor(n.twaRad ?? 0, n.motoring ?? false);
}

function posFor(twaRad: number, motoring: boolean): PointOfSail {
  const deg = twaRad / DEG;
  if (motoring && deg < 35) return 'motoring';
  if (deg < 35) return 'no-go';
  if (deg < 60) return 'close-hauled';
  if (deg < 80) return 'close-reach';
  if (deg < 100) return 'beam-reach';
  if (deg < 150) return 'broad-reach';
  return 'run';
}

/**
 * Find the time-optimal path from start to end departing at departMs.
 */
export function optimizeOnce(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  departMs: number,
  field: WeatherField,
  polar: PolarParams,
  constraints: Constraints,
  deps: IsochroneDeps,
  shouldAbort: () => boolean = () => false
): OptimizeOnceResult {
  const fail = (failureReason: WeatherRouteFailureReason): OptimizeOnceResult => ({
    success: false,
    failureReason,
    waypoints: [start, end],
    timeline: [],
    durationMs: 0,
    maxWindKn: 0,
    maxWaveM: 0,
    upwindPct: 0,
    motoringPct: 0,
  });

  if (sampleField(field, start.lat, start.lon, departMs) == null) return fail('NO_WEATHER_DATA');

  const directNm = calculateDistance(start.lat, start.lon, end.lat, end.lon);
  const sectorRad = SECTOR_DEG * DEG;
  const headingCount = Math.round(360 / HEADING_STEP_DEG);
  const maxIso = Math.min(MAX_ISOCHRONES, Math.max(6, Math.ceil((directNm / 1.5) * 3)));

  const allNodes: Node[] = [];
  const startNode: Node = { idx: 0, lat: start.lat, lon: start.lon, timeMs: departMs, parentIdx: -1 };
  allNodes.push(startNode);
  let frontier: Node[] = [startNode];

  let bestEndNode: Node | null = null;
  let bestEtaMs = Infinity;

  for (let iso = 0; iso < maxIso; iso++) {
    if (shouldAbort()) break;
    if (bestEndNode && departMs + iso * DT_MS >= bestEtaMs) break;

    const candidates: Node[] = [];

    for (const node of frontier) {
      const dEnd = fastDistance(node.lat, node.lon, end.lat, end.lon);

      if (dEnd <= ARRIVAL_NM) {
        if (node.timeMs < bestEtaMs) {
          bestEtaMs = node.timeMs;
          bestEndNode = node;
        }
      } else {
        const sample = sampleField(field, node.lat, node.lon, node.timeMs);
        if (sample) {
          const brgEnd = bearing(node.lat, node.lon, end.lat, end.lon);
          const twaEnd = trueWindAngle(brgEnd, sample.windDirRad);
          const spEnd = boatSpeedKn(polar, twaEnd, sample.windSpeedKn, sample.waveHeightM);
          if (
            spEnd.speedKn > MIN_SPEED_KN &&
            !(constraints.maxWindKn && sample.windSpeedKn > constraints.maxWindKn) &&
            !(constraints.maxWaveM && sample.hasWaves && sample.waveHeightM > constraints.maxWaveM) &&
            dEnd <= (spEnd.speedKn * DT_MS) / HOUR_MS &&
            segmentNavigable(node.lat, node.lon, end.lat, end.lon, deps)
          ) {
            const finishMs = node.timeMs + (dEnd / spEnd.speedKn) * HOUR_MS;
            if (finishMs < bestEtaMs) {
              bestEtaMs = finishMs;
              bestEndNode = {
                idx: allNodes.length,
                lat: end.lat,
                lon: end.lon,
                timeMs: finishMs,
                parentIdx: node.idx,
                twsKn: sample.windSpeedKn,
                twdRad: sample.windDirRad,
                twaRad: twaEnd,
                speedKn: spEnd.speedKn,
                waveHM: sample.hasWaves ? sample.waveHeightM : 0,
                motoring: spEnd.motoring,
                headingRad: brgEnd,
                tack: tackOf(brgEnd, sample.windDirRad),
              };
              allNodes.push(bestEndNode);
            }
          }
        }
      }

      const sample = sampleField(field, node.lat, node.lon, node.timeMs);
      if (!sample) continue;
      if (constraints.maxWindKn && sample.windSpeedKn > constraints.maxWindKn) continue;
      if (constraints.maxWaveM && sample.hasWaves && sample.waveHeightM > constraints.maxWaveM) continue;

      for (let h = 0; h < headingCount; h++) {
        const headingRad = h * HEADING_STEP_DEG * DEG;
        const twa = trueWindAngle(headingRad, sample.windDirRad);
        const sp = boatSpeedKn(polar, twa, sample.windSpeedKn, sample.waveHeightM);
        if (sp.speedKn <= MIN_SPEED_KN) continue;

        const legNm = (sp.speedKn * DT_MS) / HOUR_MS;
        const next = stepLatLon(node.lat, node.lon, headingRad, legNm);
        if (!segmentNavigable(node.lat, node.lon, next.lat, next.lon, deps)) continue;

        candidates.push({
          idx: -1,
          lat: next.lat,
          lon: next.lon,
          timeMs: node.timeMs + DT_MS,
          parentIdx: node.idx,
          twsKn: sample.windSpeedKn,
          twdRad: sample.windDirRad,
          twaRad: twa,
          speedKn: sp.speedKn,
          waveHM: sample.hasWaves ? sample.waveHeightM : 0,
          motoring: sp.motoring,
          headingRad,
          tack: tackOf(headingRad, sample.windDirRad),
        });
      }
    }

    if (candidates.length === 0) break;

    // Prune: furthest-progress candidate per bearing-from-start sector.
    const buckets = new Map<number, { node: Node; progress: number }>();
    for (const c of candidates) {
      const brg = bearing(start.lat, start.lon, c.lat, c.lon);
      const sector = Math.floor(brg / sectorRad);
      const progress = -fastDistance(c.lat, c.lon, end.lat, end.lon);
      const ex = buckets.get(sector);
      if (!ex || progress > ex.progress) buckets.set(sector, { node: c, progress });
    }

    const nextFrontier: Node[] = [];
    for (const { node } of buckets.values()) {
      node.idx = allNodes.length;
      allNodes.push(node);
      nextFrontier.push(node);
    }
    frontier = nextFrontier;
  }

  if (!bestEndNode) return fail('NO_PATH_FOUND');

  // Backtrack.
  const chain: Node[] = [];
  let cur: Node | undefined = bestEndNode;
  while (cur) {
    chain.push(cur);
    if (cur.parentIdx < 0) break;
    cur = allNodes[cur.parentIdx];
  }
  chain.reverse();

  const timeline: WeatherRouteStep[] = [];
  let maxWindKn = 0;
  let maxWaveM = 0;
  let upwind = 0;
  let motoring = 0;
  for (const n of chain) {
    const tws = n.twsKn ?? 0;
    const wave = n.waveHM ?? 0;
    if (tws > maxWindKn) maxWindKn = tws;
    if (wave > maxWaveM) maxWaveM = wave;
    const pos = pointOfSailOf(n);
    if (pos === 'no-go' || pos === 'close-hauled' || pos === 'close-reach') upwind++;
    if (n.motoring) motoring++;
    timeline.push({
      lat: n.lat,
      lon: n.lon,
      etaMs: n.timeMs,
      twsKn: tws,
      twdRad: n.twdRad ?? 0,
      twaRad: n.twaRad ?? 0,
      pointOfSail: pos,
      tack: n.tack ?? 'starboard',
      headingRad: n.headingRad ?? 0,
      speedKn: n.speedKn ?? 0,
      waveHM: wave,
      motoring: n.motoring ?? false,
    });
  }

  const waypoints = chain.map((n) => ({ lat: n.lat, lon: n.lon }));
  const durationMs = bestEndNode.timeMs - departMs;
  const denom = Math.max(1, chain.length - 1);
  return {
    success: true,
    waypoints,
    timeline,
    durationMs,
    maxWindKn,
    maxWaveM,
    upwindPct: upwind / denom,
    motoringPct: motoring / denom,
  };
}

const MIN_EFF_SPEED_KN = 0.5; // floor so calm-upwind legs don't yield infinite ETA

/** Densify a polyline so no segment is longer than stepNm (keeps original vertices). */
function densify(path: Array<{ lat: number; lon: number }>, stepNm: number): Array<{ lat: number; lon: number }> {
  if (path.length < 2) return path.slice();
  const out: Array<{ lat: number; lon: number }> = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const legNm = calculateDistance(a.lat, a.lon, b.lat, b.lon);
    const n = Math.max(1, Math.ceil(legNm / stepNm));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
    }
  }
  return out;
}

/**
 * Fallback: compute a weather-timed timeline ALONG a fixed (navigable) path —
 * e.g. the A* depth/land route — when the isochrone can't thread a coastline
 * with its straight time-step legs. Marches the clock along the path sampling
 * the forecast; legs closer to the wind than the boat can point are modelled as
 * tacking (reduced VMG along the rhumb). The displayed path stays the navigable
 * route; only timing/conditions come from the forecast.
 */
export function timelineAlongPath(
  path: Array<{ lat: number; lon: number }>,
  departMs: number,
  field: WeatherField,
  polar: PolarParams,
  deps: IsochroneDeps
): OptimizeOnceResult {
  const fail = (reason: WeatherRouteFailureReason): OptimizeOnceResult => ({
    success: false,
    failureReason: reason,
    waypoints: path.length >= 2 ? [path[0], path[path.length - 1]] : path,
    timeline: [],
    durationMs: 0,
    maxWindKn: 0,
    maxWaveM: 0,
    upwindPct: 0,
    motoringPct: 0,
  });
  if (path.length < 2) return fail('NO_PATH_FOUND');

  const dense = densify(path, 1.0); // ~1 NM nodes
  const timeline: WeatherRouteStep[] = [];
  let t = departMs;
  let maxWindKn = 0;
  let maxWaveM = 0;
  let upwind = 0;
  let motoring = 0;

  // Start node — neutral label.
  timeline.push({ lat: dense[0].lat, lon: dense[0].lon, etaMs: t, twsKn: 0, twdRad: 0, twaRad: 0, pointOfSail: 'motoring', tack: 'starboard', headingRad: 0, speedKn: 0, waveHM: 0, motoring: false });

  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const legNm = calculateDistance(a.lat, a.lon, b.lat, b.lon);
    if (legNm < 1e-6) continue;
    const brg = bearing(a.lat, a.lon, b.lat, b.lon);
    const sample = sampleField(field, a.lat, a.lon, t);

    let twsKn = 0;
    let twdRad = 0;
    let twaRad = 0;
    let waveHM = 0;
    let effSpeed: number;
    let isMotoring: boolean;

    if (!sample) {
      // No forecast here — fall back to engine cruise (or hull speed if no engine).
      effSpeed = polar.allowMotor ? polar.motorSpeedKn : Math.max(MIN_EFF_SPEED_KN, polar.maxSpeedKn * 0.4);
      isMotoring = polar.allowMotor;
    } else {
      twsKn = sample.windSpeedKn;
      twdRad = sample.windDirRad;
      waveHM = sample.hasWaves ? sample.waveHeightM : 0;
      twaRad = trueWindAngle(brg, twdRad);
      const sp = boatSpeedKn(polar, twaRad, twsKn, waveHM);
      effSpeed = sp.speedKn;
      isMotoring = sp.motoring;
      // Leg points closer to the wind than the boat can sail → it must tack:
      // progress along the rhumb is the close-hauled VMG, not 0.
      if (!isMotoring && twaRad < polar.noGoAngleRad) {
        const closeHauled = boatSpeedKn(polar, polar.noGoAngleRad, twsKn, waveHM).speedKn;
        const vmg = closeHauled * Math.cos(polar.noGoAngleRad - twaRad);
        if (polar.allowMotor && polar.motorSpeedKn > vmg) {
          effSpeed = polar.motorSpeedKn;
          isMotoring = true;
        } else {
          effSpeed = vmg;
        }
      }
    }
    effSpeed = Math.max(MIN_EFF_SPEED_KN, effSpeed);

    t += (legNm / effSpeed) * HOUR_MS;
    if (twsKn > maxWindKn) maxWindKn = twsKn;
    if (waveHM > maxWaveM) maxWaveM = waveHM;
    const pos = isMotoring ? 'motoring' : posFor(twaRad, false);
    if (pos === 'no-go' || pos === 'close-hauled' || pos === 'close-reach') upwind++;
    if (isMotoring) motoring++;
    timeline.push({ lat: b.lat, lon: b.lon, etaMs: t, twsKn, twdRad, twaRad, pointOfSail: pos, tack: tackOf(brg, twdRad), headingRad: brg, speedKn: effSpeed, waveHM, motoring: isMotoring });
  }

  const denom = Math.max(1, timeline.length - 1);
  return {
    success: true,
    waypoints: path,
    timeline,
    durationMs: t - departMs,
    maxWindKn,
    maxWaveM,
    upwindPct: upwind / denom,
    motoringPct: motoring / denom,
  };
}
