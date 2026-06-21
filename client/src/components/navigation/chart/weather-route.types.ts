// Client-side mirror of the server weather-route contract.
// Directions are radians (to match createBoatIcon / calculateBearing); speeds
// knots; times absolute epoch ms.

export type PointOfSail =
  | 'no-go'
  | 'close-hauled'
  | 'close-reach'
  | 'beam-reach'
  | 'broad-reach'
  | 'run'
  | 'motoring';

export interface WeatherRouteStep {
  lat: number;
  lon: number;
  etaMs: number;
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

export interface RouteWeatherInfo {
  coverage: 'full' | 'partial' | 'none';
  maxWindKn: number;
  maxWaveM: number;
  warnings: string[]; // warning codes; rendered via i18n
  totalDurationMs: number;
  departureMs: number;
  samplePoints: number;
}

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

export interface WeatherRouteResult {
  success: boolean;
  waypoints: Array<{ lat: number; lon: number }>;
  timeline: WeatherRouteStep[];
  weather: RouteWeatherInfo;
  failureReason?: string;
  departures?: RankedDeparture[]; // present when a best-window scan was requested
}

/** Options chosen in the Start Navigation dialog and passed to the calculation. */
export interface CalculateOptions {
  depthRouting: boolean;
  weatherRouting: boolean;
  departure: { kind: 'now' } | { kind: 'at'; ms: number } | { kind: 'best-window' };
}

/** Transient navigation flow state (lives in ChartView, never persisted). */
export type NavFlow =
  | { phase: 'idle' }
  | { phase: 'dialog'; destination: { lat: number; lon: number }; marker?: import('./map-icons').CustomMarker }
  | { phase: 'calculating'; destination: { lat: number; lon: number }; marker?: import('./map-icons').CustomMarker }
  | {
      phase: 'preview';
      destination: { lat: number; lon: number };
      marker?: import('./map-icons').CustomMarker;
      result: WeatherRouteResult;
      depthOnly: boolean; // true → result came from plain depth routing (no weather)
      scrubMs: number;
    };
