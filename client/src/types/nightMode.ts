/**
 * Night mode (red display) — per-device configuration and activation logic.
 *
 * Night mode reddens the entire screen to preserve the crew's dark adaptation.
 * It is a per-client setting (each display decides for itself) stored under the
 * client-setting key `nightMode`. The reddening itself is a global SVG
 * colour-matrix filter applied in NightModeContext — this file only owns the
 * config shape and the "is it night right now?" decision.
 */

import { getSunTimes } from '../utils/astronomy';

export type NightMode = 'off' | 'on' | 'auto';
export type NightAutoSource = 'sun' | 'schedule';
/** Screen brightness while night mode is active (dimmer is gentler on night vision). */
export type NightIntensity = 'low' | 'medium' | 'high';

export interface NightModeConfig {
  mode: NightMode;
  /** Used when mode === 'auto'. */
  source: NightAutoSource;
  /** Schedule window start, 'HH:MM' local time (used when source === 'schedule'). */
  start: string;
  /** Schedule window end, 'HH:MM' local time. */
  end: string;
  intensity: NightIntensity;
}

export const DEFAULT_NIGHT_MODE: NightModeConfig = {
  mode: 'off',
  source: 'sun',
  start: '21:00',
  end: '06:00',
  intensity: 'medium',
};

/** Maps the brightness preset to a CSS `brightness()` multiplier. */
export const NIGHT_BRIGHTNESS: Record<NightIntensity, number> = {
  low: 0.55,
  medium: 0.75,
  high: 1.0,
};

export interface LatLon {
  lat: number;
  lon: number;
}

/** A (0, 0) fix means "no position yet" for our purposes — treat it as missing. */
export function hasFix(pos: LatLon | null | undefined): pos is LatLon {
  return !!pos && !(pos.lat === 0 && pos.lon === 0);
}

/** Parse 'HH:MM' to minutes-of-day; returns null on malformed input. */
function parseHM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** True if `now` falls inside the [start, end) window, handling midnight wrap. */
function inSchedule(now: Date, start: string, end: string): boolean {
  const s = parseHM(start);
  const e = parseHM(end);
  if (s === null || e === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false; // empty window
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** True if it is currently "night" by civil twilight at the given position. */
function inSunNight(now: Date, pos: LatLon): boolean {
  const sun = getSunTimes(now, pos.lat, pos.lon);
  const lo = sun.dawn ?? sun.sunrise; // morning edge of daylight
  const hi = sun.dusk ?? sun.sunset; // evening edge of daylight
  if (lo && hi) {
    return now.getTime() < lo.getTime() || now.getTime() >= hi.getTime();
  }
  if (sun.alwaysDown) return true; // polar night
  if (sun.alwaysUp) return false; // polar day
  return false;
}

/**
 * Resolve whether night mode should be visually active right now.
 * `pos` is the last-known boat position (may be null / no fix).
 */
export function computeNightActive(
  config: NightModeConfig,
  now: Date,
  pos: LatLon | null,
): boolean {
  if (config.mode === 'on') return true;
  if (config.mode === 'off') return false;
  // mode === 'auto'
  if (config.source === 'sun') {
    // Sun mode needs a position; without a fix, fall back to the schedule
    // window so the user still gets automatic night mode.
    if (hasFix(pos)) return inSunNight(now, pos);
    return inSchedule(now, config.start, config.end);
  }
  return inSchedule(now, config.start, config.end);
}
