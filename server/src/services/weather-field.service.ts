/**
 * Weather Field Service
 *
 * Builds a serializable WeatherField for a route corridor: a CAPPED set of
 * sample points, each with a full hourly wind+wave time series. Fetches every
 * point through weatherService.getWeather so the rate-limit semaphore, in-flight
 * dedupe and DB cache are all honoured. Sample coordinates are snapped to the
 * ~0.1° cache grid so neighbouring passages reuse cached forecasts.
 *
 * One Open-Meteo request returns ALL hours for a point, so cost scales with the
 * number of sample points, not hours. For a typical coastal passage that's
 * ~20-25 points; long ocean passages are coarsened and reported as partial
 * coverage rather than fabricating a dense field.
 */

import { weatherService } from './weather.service';
import { WeatherField, WeatherFieldPoint } from '../workers/lib/weather-sample';
import { WeatherPoint } from '../types/weather.types';

export interface FieldBbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface BuildFieldOptions {
  maxPoints?: number; // hard cap on sample points (rate-limit budget)
  signal?: AbortSignal;
  nowMs?: number; // injectable for tests
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const CACHE_GRID_DEG = 0.1; // matches weather.service COORD_PRECISION
const FORECAST_HORIZON_DAYS = 7; // Open-Meteo marine horizon we rely on
const BATCH_SIZE = 5; // mirrors getWeatherGrid

class AbortError extends Error {
  constructor() {
    super('Weather field build aborted');
    this.name = 'AbortError';
  }
}

function snap(coord: number): number {
  return Math.round(coord / CACHE_GRID_DEG) * CACHE_GRID_DEG;
}

/** Sample coordinates covering the bbox, snapped to the cache grid, capped. */
function sampleGrid(bbox: FieldBbox, maxPoints: number): Array<{ lat: number; lon: number }> {
  const latSpan = Math.max(CACHE_GRID_DEG, bbox.north - bbox.south);
  const lonSpan = Math.max(CACHE_GRID_DEG, bbox.east - bbox.west);
  const area = latSpan * lonSpan;

  let spacing = Math.max(CACHE_GRID_DEG, Math.sqrt(area / Math.max(1, maxPoints)));

  for (let attempt = 0; attempt < 12; attempt++) {
    const snappedSpacing = Math.max(CACHE_GRID_DEG, Math.round(spacing / CACHE_GRID_DEG) * CACHE_GRID_DEG);
    const seen = new Set<string>();
    const coords: Array<{ lat: number; lon: number }> = [];
    for (let lat = bbox.south; lat <= bbox.north + 1e-9; lat += snappedSpacing) {
      for (let lon = bbox.west; lon <= bbox.east + 1e-9; lon += snappedSpacing) {
        const sLat = snap(lat);
        const sLon = snap(lon);
        const key = `${sLat.toFixed(1)},${sLon.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coords.push({ lat: sLat, lon: sLon });
      }
    }
    if (coords.length <= maxPoints) return coords;
    spacing += CACHE_GRID_DEG; // too many — coarsen and retry
  }
  // Fallback: corners + centre
  return [
    { lat: snap(bbox.south), lon: snap(bbox.west) },
    { lat: snap(bbox.north), lon: snap(bbox.east) },
    { lat: snap((bbox.north + bbox.south) / 2), lon: snap((bbox.east + bbox.west) / 2) },
  ];
}

/** Map a fetched hourly series onto the uniform axis, with forward/back wind fill. */
function alignSeries(
  hourly: WeatherPoint[],
  lat: number,
  lon: number,
  t0Ms: number,
  hours: number
): WeatherFieldPoint | null {
  // Bucket each forecast hour by its floored-hour epoch.
  const byHour = new Map<number, WeatherPoint>();
  for (const p of hourly) {
    const ms = new Date(p.timestamp).getTime();
    if (Number.isFinite(ms)) byHour.set(Math.floor(ms / HOUR_MS) * HOUR_MS, p);
  }

  const windSpeedKn = new Array<number>(hours).fill(NaN);
  const windDirRad = new Array<number>(hours).fill(NaN);
  const waveHeightM = new Array<number>(hours).fill(NaN);
  const waveDirRad = new Array<number>(hours).fill(NaN);

  let anyWind = false;
  for (let k = 0; k < hours; k++) {
    const bucket = Math.floor((t0Ms + k * HOUR_MS) / HOUR_MS) * HOUR_MS;
    const pt = byHour.get(bucket);
    if (!pt) continue;
    if (pt.wind && Number.isFinite(pt.wind.speed)) {
      windSpeedKn[k] = pt.wind.speed;
      windDirRad[k] = pt.wind.direction;
      anyWind = true;
    }
    const w = pt.waves ?? pt.swell;
    if (w && Number.isFinite(w.height)) {
      waveHeightM[k] = w.height;
      waveDirRad[k] = w.direction;
    }
  }

  if (!anyWind) return null; // point unusable

  // Forward/back-fill wind gaps so the sampler never hits NaN wind.
  let last = NaN;
  for (let k = 0; k < hours; k++) {
    if (Number.isFinite(windSpeedKn[k])) last = k;
    else if (Number.isFinite(last)) {
      windSpeedKn[k] = windSpeedKn[last];
      windDirRad[k] = windDirRad[last];
    }
  }
  let next = NaN;
  for (let k = hours - 1; k >= 0; k--) {
    if (Number.isFinite(windSpeedKn[k])) next = k;
    else if (Number.isFinite(next)) {
      windSpeedKn[k] = windSpeedKn[next];
      windDirRad[k] = windDirRad[next];
    }
  }

  return { lat, lon, windSpeedKn, windDirRad, waveHeightM, waveDirRad };
}

/**
 * Build a WeatherField covering bbox over [startMs, endMs]. Coverage is honest:
 * 'none' when nothing could be fetched, 'partial' when points failed, the
 * window runs past the forecast horizon, or marine (wave) data is sparse.
 */
export async function buildWeatherField(
  bbox: FieldBbox,
  window: { startMs: number; endMs: number },
  options: BuildFieldOptions = {}
): Promise<WeatherField> {
  const maxPoints = options.maxPoints ?? 25;
  const nowMs = options.nowMs ?? Date.now();
  const signal = options.signal;

  const t0Ms = Math.floor(window.startMs / HOUR_MS) * HOUR_MS;
  const endMs = Math.max(window.endMs, t0Ms + HOUR_MS);
  const hours = Math.min(24 * FORECAST_HORIZON_DAYS, Math.max(2, Math.ceil((endMs - t0Ms) / HOUR_MS) + 1));

  const requiredDays = Math.min(FORECAST_HORIZON_DAYS, Math.max(1, Math.ceil((endMs - nowMs) / DAY_MS) + 1));

  const coords = sampleGrid(bbox, maxPoints);
  const points: WeatherFieldPoint[] = [];

  for (let i = 0; i < coords.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new AbortError();
    const batch = coords.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const forecast = await weatherService.getWeather(c.lat, c.lon, requiredDays);
          if (forecast && forecast.hourly.length > 0) {
            return alignSeries(forecast.hourly, c.lat, c.lon, t0Ms, hours);
          }
        } catch (err) {
          console.error(`[WeatherField] Fetch failed at (${c.lat}, ${c.lon}):`, err);
        }
        return null;
      })
    );
    for (const r of results) if (r) points.push(r);
  }

  // Coverage assessment.
  const horizonMs = nowMs + FORECAST_HORIZON_DAYS * DAY_MS;
  let waveKnown = 0;
  let waveTotal = 0;
  for (const p of points) {
    for (let k = 0; k < hours; k++) {
      waveTotal++;
      if (Number.isFinite(p.waveHeightM[k])) waveKnown++;
    }
  }
  const waveFraction = waveTotal > 0 ? waveKnown / waveTotal : 0;

  let coverage: WeatherField['coverage'];
  if (points.length === 0) {
    coverage = 'none';
  } else if (points.length < coords.length || endMs > horizonMs || waveFraction < 0.5) {
    coverage = 'partial';
  } else {
    coverage = 'full';
  }

  return {
    bbox,
    t0Ms,
    stepMs: HOUR_MS,
    hours,
    points,
    coverage,
    requestedPoints: coords.length,
    sampledPoints: points.length,
  };
}
