/**
 * Weather data types for BigaOS
 * Used for wind, wave, and marine forecast data
 */

export interface WindData {
  speed: number; // knots
  direction: number; // radians (direction wind is coming FROM, 0 = North)
  gusts: number; // knots
}

export interface WaveData {
  height: number; // meters
  direction: number; // radians
  period: number; // seconds
}

export interface CurrentData {
  velocity: number; // m/s
  direction: number; // radians (direction current is flowing TO)
}

export interface WeatherPoint {
  timestamp: string; // ISO date
  location: { lat: number; lon: number };
  wind: WindData;
  waves?: WaveData;
  swell?: WaveData;
  current?: CurrentData; // ocean current
  pressure?: number; // hPa
  seaTemperature?: number; // celsius
}

export interface WeatherForecast {
  location: { lat: number; lon: number };
  current: WeatherPoint;
  hourly: WeatherPoint[]; // up to 7 days
  fetchedAt: string;
  expiresAt: string;
}

export interface WeatherGridPoint extends WeatherPoint {
  // No additional fields - just a typed alias for grid points
}

export interface WeatherGridBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface WeatherGrid {
  bounds: WeatherGridBounds;
  resolution: number; // degrees between points
  forecastHour: number; // 0 = now, 1 = +1h, etc.
  points: WeatherGridPoint[];
  fetchedAt: string;
}

export interface WeatherSettings {
  enabled: boolean;
  provider: 'open-meteo' | 'custom';
  weatherApiUrl: string;
  marineApiUrl: string;
  refreshIntervalMinutes: number;
}

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  enabled: true,
  provider: 'open-meteo',
  weatherApiUrl: 'https://api.open-meteo.com/v1/forecast',
  marineApiUrl: 'https://marine-api.open-meteo.com/v1/marine',
  refreshIntervalMinutes: 15,
};

// Forecast day limits
export const UPFRONT_FORECAST_DAYS = 3; // Auto-fetch for boat position (72 hours)

// Open-Meteo API response types
export interface OpenMeteoWeatherResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  hourly_units: {
    time: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
    wind_gusts_10m: string;
    pressure_msl?: string;
  };
  hourly: {
    time: string[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    pressure_msl?: (number | null)[];
  };
}

export interface OpenMeteoMarineResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  hourly_units: {
    time: string;
    wave_height?: string;
    wave_direction?: string;
    wave_period?: string;
    swell_wave_height?: string;
    swell_wave_direction?: string;
    swell_wave_period?: string;
    sea_surface_temperature?: string;
    ocean_current_velocity?: string;
    ocean_current_direction?: string;
  };
  hourly: {
    time: string[];
    wave_height?: (number | null)[];
    wave_direction?: (number | null)[];
    wave_period?: (number | null)[];
    swell_wave_height?: (number | null)[];
    swell_wave_direction?: (number | null)[];
    swell_wave_period?: (number | null)[];
    sea_surface_temperature?: (number | null)[];
    ocean_current_velocity?: (number | null)[];
    ocean_current_direction?: (number | null)[];
  };
}

// WebSocket event payload
export interface WeatherUpdateEvent {
  current: WeatherPoint;
  forecast: WeatherPoint[]; // next 48h
  lastUpdated: string;
}

// Cache entry for in-memory caching
export interface WeatherCacheEntry {
  forecast: WeatherForecast;
  fetchedAt: Date;
  expiresAt: Date;
}
