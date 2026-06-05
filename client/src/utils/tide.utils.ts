/**
 * Tide helpers — derive high/low water, range and state from an hourly
 * sea-level (seaLevel, meters relative to MSL) forecast series.
 *
 * All "hour" values are expressed as a forecast-hour offset from now
 * (0 = current hour, +1 = next hour, ...), matching the weather overlay's
 * `forecastHour` convention so they line up with the time slider.
 */

import type { WeatherPoint } from '../types';

const HOUR_MS = 3600_000;

export interface TideExtreme {
  hour: number; // forecast-hour offset from now (may be negative for the past)
  timestamp: string;
  height: number; // meters relative to MSL
  type: 'high' | 'low';
}

export interface TideRange {
  min: number;
  max: number;
}

export interface TideState {
  height: number | null; // sea level (m, rel. MSL) at the requested hour
  trend: 'rising' | 'falling' | 'slack' | null;
  next: TideExtreme | null; // next turning point after the requested hour
}

/**
 * Index of the current-hour point (the forecastHour = 0 anchor). Mirrors the
 * rest of the app's `new Date(timestamp)` parsing; anchored to the floored
 * current hour so it matches the time label shown in the weather panel.
 */
export function getNowIndex(points: WeatherPoint[], nowMs: number = Date.now()): number {
  if (points.length === 0) return 0;
  const flooredNow = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const idx = points.findIndex((p) => new Date(p.timestamp).getTime() >= flooredNow);
  return idx >= 0 ? idx : 0;
}

/** Sea-level height (m, rel. MSL) at a forecast-hour offset, or null if absent. */
export function getTideHeightAt(
  points: WeatherPoint[],
  forecastHour: number,
  nowMs?: number
): number | null {
  const i = getNowIndex(points, nowMs) + forecastHour;
  const v = points[i]?.seaLevel;
  return v == null ? null : v;
}

/** High- and low-water turning points across the series, in forecast-hour units. */
export function findTideExtrema(points: WeatherPoint[], nowMs?: number): TideExtreme[] {
  const nowIndex = getNowIndex(points, nowMs);
  const out: TideExtreme[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].seaLevel;
    const cur = points[i].seaLevel;
    const next = points[i + 1].seaLevel;
    if (prev == null || cur == null || next == null) continue;
    // `>=`/`<=` on one side tolerates flat tops without double-counting.
    if (cur > prev && cur >= next) {
      out.push({ hour: i - nowIndex, timestamp: points[i].timestamp, height: cur, type: 'high' });
    } else if (cur < prev && cur <= next) {
      out.push({ hour: i - nowIndex, timestamp: points[i].timestamp, height: cur, type: 'low' });
    }
  }
  return out;
}

/**
 * Min/max sea level over a forecast-hour window from now. Used to scale the
 * tide colour ramp to the location's actual low-water..high-water range.
 * Defaults to the whole future series when no window is given.
 */
export function getTideRange(
  points: WeatherPoint[],
  windowHours?: number,
  nowMs?: number
): TideRange {
  const nowIndex = getNowIndex(points, nowMs);
  const end = windowHours != null ? Math.min(points.length, nowIndex + windowHours + 1) : points.length;
  let min = Infinity;
  let max = -Infinity;
  for (let i = nowIndex; i < end; i++) {
    const v = points[i]?.seaLevel;
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

/** Tide state (height, rising/falling, next turning point) at a forecast hour. */
export function getTideStateAt(
  points: WeatherPoint[],
  forecastHour: number,
  nowMs?: number
): TideState {
  const nowIndex = getNowIndex(points, nowMs);
  const i = nowIndex + forecastHour;
  const height = points[i]?.seaLevel ?? null;

  let trend: TideState['trend'] = null;
  const prev = points[i - 1]?.seaLevel;
  const next = points[i + 1]?.seaLevel;
  if (height != null) {
    const before = prev ?? height;
    const after = next ?? height;
    const delta = after - before;
    if (prev == null && next == null) trend = null;
    else if (Math.abs(delta) < 0.04) trend = 'slack';
    else trend = delta > 0 ? 'rising' : 'falling';
  }

  const nextExt = findTideExtrema(points, nowMs).find((e) => e.hour > forecastHour) ?? null;

  return { height, trend, next: nextExt };
}
