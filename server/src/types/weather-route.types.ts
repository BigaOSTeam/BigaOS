/**
 * Shared types for weather (isochrone) routing — used by the optimizer worker,
 * its worker service, and the navigation controller.
 *
 * Directions are radians; speeds knots; distances nautical miles; times epoch ms.
 */

import type { PointOfSail } from '../services/polar';

export type WeatherRouteFailureReason =
  | 'START_ON_LAND'
  | 'END_ON_LAND'
  | 'NO_PATH_FOUND'
  | 'TOO_SHALLOW'
  | 'NO_WEATHER_DATA'
  | 'WINDOW_BEYOND_FORECAST';

/** One node of the optimized passage: where the boat is and the conditions there. */
export interface WeatherRouteStep {
  lat: number;
  lon: number;
  etaMs: number; // absolute arrival time at this point
  twsKn: number; // true wind speed
  twdRad: number; // true wind direction (FROM)
  twaRad: number; // true wind angle off the bow (0..π)
  pointOfSail: PointOfSail;
  tack: 'port' | 'starboard';
  headingRad: number;
  speedKn: number;
  waveHM: number;
  motoring: boolean;
}

/** Advisory summary that travels with a committed weather route. */
export interface RouteWeatherInfo {
  coverage: 'full' | 'partial' | 'none';
  maxWindKn: number;
  maxWaveM: number;
  warnings: string[]; // warning codes (i18n'd client-side)
  totalDurationMs: number;
  departureMs: number;
  samplePoints: number;
}

export interface WeatherRouteResult {
  success: boolean;
  waypoints: Array<{ lat: number; lon: number }>;
  timeline: WeatherRouteStep[];
  weather: RouteWeatherInfo;
  failureReason?: WeatherRouteFailureReason;
}

/** One ranked option from the best-departure-window scan (timeline embedded). */
export interface RankedDeparture {
  departureMs: number;
  durationMs: number;
  maxWindKn: number;
  maxWaveM: number;
  upwindPct: number;
  motoringPct: number;
  waypoints: Array<{ lat: number; lon: number }>;
  timeline: WeatherRouteStep[];
}
