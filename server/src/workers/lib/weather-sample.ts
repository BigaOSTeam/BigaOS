/**
 * Serializable weather field + sampler for the weather-routing optimizer.
 *
 * A WeatherField is a coarse set of sample points, each carrying a full hourly
 * time series of wind and waves. It is built once on the main thread (network
 * I/O, rate-limited) and structure-cloned into the optimizer worker, which then
 * samples it cheaply at arbitrary (lat, lon, time) with no further I/O.
 *
 * sampleField does temporal linear interpolation first (directions via U/V to
 * avoid wraparound), then spatial Inverse Distance Weighting — the same IDW the
 * client weather overlay uses (power 2, up to 4 neighbours).
 *
 * Plain number[] arrays (not typed arrays) so NaN gaps survive the worker
 * boundary and signal "no data here/then".
 */

const TWO_PI = Math.PI * 2;

export interface WeatherFieldPoint {
  lat: number;
  lon: number;
  windSpeedKn: number[]; // per hour index
  windDirRad: number[]; // direction wind is coming FROM
  waveHeightM: number[]; // NaN where unknown (e.g. no marine data inshore)
  waveDirRad: number[]; // NaN where unknown
}

export interface WeatherField {
  bbox: { north: number; south: number; east: number; west: number };
  t0Ms: number; // epoch ms of hour index 0
  stepMs: number; // ms per hour index (3_600_000)
  hours: number; // number of hourly samples per point
  points: WeatherFieldPoint[];
  coverage: 'full' | 'partial' | 'none';
  requestedPoints: number;
  sampledPoints: number;
}

export interface WeatherSample {
  windSpeedKn: number;
  windDirRad: number; // FROM
  waveHeightM: number; // 0 when no wave data nearby
  waveDirRad: number; // NaN when no wave data nearby
  hasWaves: boolean;
}

const MAX_NEIGHBORS = 4;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linearly interpolate two angles (radians) via U/V components. */
function lerpAngle(a0: number, a1: number, t: number): number {
  const u = lerp(Math.sin(a0), Math.sin(a1), t);
  const v = lerp(Math.cos(a0), Math.cos(a1), t);
  let dir = Math.atan2(u, v);
  if (dir < 0) dir += TWO_PI;
  return dir;
}

interface TimeSampled {
  speed: number;
  dir: number;
  waveH: number; // NaN if unknown
  waveDir: number; // NaN if unknown
}

/** Interpolate one point's series to a fractional hour index. */
function sampleSeries(p: WeatherFieldPoint, i0: number, i1: number, frac: number): TimeSampled {
  const speed = lerp(p.windSpeedKn[i0], p.windSpeedKn[i1], frac);
  const dir = lerpAngle(p.windDirRad[i0], p.windDirRad[i1], frac);

  const w0 = p.waveHeightM[i0];
  const w1 = p.waveHeightM[i1];
  let waveH = NaN;
  let waveDir = NaN;
  if (Number.isFinite(w0) && Number.isFinite(w1)) {
    waveH = lerp(w0, w1, frac);
    waveDir = lerpAngle(p.waveDirRad[i0], p.waveDirRad[i1], frac);
  } else if (Number.isFinite(w0)) {
    waveH = w0;
    waveDir = p.waveDirRad[i0];
  } else if (Number.isFinite(w1)) {
    waveH = w1;
    waveDir = p.waveDirRad[i1];
  }
  return { speed, dir, waveH, waveDir };
}

/**
 * Sample the field at a location and absolute time. Returns null when no sample
 * point carries wind data (i.e. the field doesn't cover this query).
 */
export function sampleField(field: WeatherField, lat: number, lon: number, timeMs: number): WeatherSample | null {
  const pts = field.points;
  if (pts.length === 0 || field.hours === 0) return null;

  // Fractional hour index, clamped to the series.
  const hRaw = (timeMs - field.t0Ms) / field.stepMs;
  const h = Math.max(0, Math.min(field.hours - 1, hRaw));
  const i0 = Math.floor(h);
  const i1 = Math.min(i0 + 1, field.hours - 1);
  const frac = h - i0;

  // Nearest neighbours by planar distance (good enough at routing scales).
  const neighbors: Array<{ p: WeatherFieldPoint; dist: number }> = [];
  for (const p of pts) {
    const dLat = lat - p.lat;
    const dLon = lon - p.lon;
    neighbors.push({ p, dist: Math.sqrt(dLat * dLat + dLon * dLon) });
  }
  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  let totalW = 0;
  let wU = 0;
  let wV = 0;
  let wSpeed = 0;
  // Waves accumulate separately (only points that have wave data at this time).
  let waveTotalW = 0;
  let waveU = 0;
  let waveV = 0;
  let wHeight = 0;

  for (const { p, dist } of nearby) {
    const s = sampleSeries(p, i0, i1, frac);
    const weight = dist < 0.001 ? 1e6 : 1 / (dist * dist);

    totalW += weight;
    wU += Math.sin(s.dir) * weight;
    wV += Math.cos(s.dir) * weight;
    wSpeed += s.speed * weight;

    if (Number.isFinite(s.waveH)) {
      waveTotalW += weight;
      waveU += Math.sin(s.waveDir) * weight;
      waveV += Math.cos(s.waveDir) * weight;
      wHeight += s.waveH * weight;
    }
  }

  if (totalW === 0) return null;

  let windDir = Math.atan2(wU / totalW, wV / totalW);
  if (windDir < 0) windDir += TWO_PI;

  let waveHeightM = 0;
  let waveDirRad = NaN;
  const hasWaves = waveTotalW > 0;
  if (hasWaves) {
    waveHeightM = wHeight / waveTotalW;
    waveDirRad = Math.atan2(waveU / waveTotalW, waveV / waveTotalW);
    if (waveDirRad < 0) waveDirRad += TWO_PI;
  }

  return {
    windSpeedKn: wSpeed / totalW,
    windDirRad: windDir,
    waveHeightM,
    waveDirRad,
    hasWaves,
  };
}
