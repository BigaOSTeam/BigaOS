/**
 * WeatherDataService - Weather data provider with standard units
 *
 * This service wraps the existing weatherService and normalizes all data
 * to NMEA2000 standard units:
 * - Wind speed: m/s (converted from knots)
 * - Temperature: Kelvin (converted from Celsius)
 * - Pressure: Pascal (converted from hPa)
 * - Waves: meters (no conversion needed)
 */

import { EventEmitter } from 'events';
import { weatherService } from './weather.service';
import {
  WeatherForecast,
  WeatherPoint,
  WeatherUpdateEvent,
  WeatherSettings,
} from '../types/weather.types';
import {
  StandardWeatherForecast,
  StandardWeatherPoint,
} from '../types/data.types';
import {
  knotsToMs,
  celsiusToKelvin,
  CONVERSIONS,
} from '../types/units.types';

const DEG_TO_RAD = Math.PI / 180;

export class WeatherDataService extends EventEmitter {
  private cachedStandardWeather: StandardWeatherForecast | null = null;
  private getPositionCallback: (() => { lat: number; lon: number } | null) | null = null;

  /**
   * Initialize the weather service
   */
  async initialize(getPosition: () => { lat: number; lon: number } | null): Promise<void> {
    this.getPositionCallback = getPosition;

    // Set up callback to receive weather updates from the underlying service
    weatherService.setUpdateCallback((event: WeatherUpdateEvent) => {
      this.onWeatherUpdate(event);
    });

    // Start auto-fetch with position callback
    weatherService.startAutoFetch(getPosition);

    console.log('[WeatherDataService] Initialized');
  }

  /**
   * Handle weather update from underlying service
   */
  private onWeatherUpdate(event: WeatherUpdateEvent): void {
    // Convert to standard units and cache
    const standardForecast = this.normalizeWeatherForecast({
      location: event.current.location,
      current: event.current,
      hourly: event.forecast,
      fetchedAt: event.lastUpdated,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
    });

    this.cachedStandardWeather = standardForecast;

    // Emit normalized data
    this.emit('weather_data', standardForecast);
  }

  /**
   * Get weather forecast in STANDARD units
   */
  async getWeather(
    lat: number,
    lon: number,
    days?: number
  ): Promise<StandardWeatherForecast | null> {
    const raw = await weatherService.getWeather(lat, lon, days);
    if (!raw) return null;
    return this.normalizeWeatherForecast(raw);
  }

  /**
   * Get cached weather in STANDARD units
   */
  getCachedWeather(): StandardWeatherForecast | null {
    return this.cachedStandardWeather;
  }

  /**
   * Get current weather point in STANDARD units
   */
  async getCachedCurrent(): Promise<StandardWeatherPoint | null> {
    const current = await weatherService.getCachedCurrent();
    if (!current) return null;
    return this.normalizeWeatherPoint(current);
  }

  /**
   * Get forecast array in STANDARD units
   */
  async getCachedForecast(): Promise<StandardWeatherPoint[]> {
    const forecast = await weatherService.getCachedForecast();
    return forecast.map((p) => this.normalizeWeatherPoint(p));
  }

  /**
   * Stop auto-fetching
   */
  stop(): void {
    weatherService.stopAutoFetch();
    console.log('[WeatherDataService] Stopped');
  }

  /**
   * Get current settings
   */
  getSettings(): WeatherSettings {
    return weatherService.getSettings();
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<WeatherSettings>): void {
    weatherService.updateSettings(settings);
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<number> {
    this.cachedStandardWeather = null;
    return weatherService.clearCache();
  }

  // ============================================================================
  // Normalization Functions (convert to standard units)
  // ============================================================================

  /**
   * Normalize a complete weather forecast to standard units
   */
  private normalizeWeatherForecast(forecast: WeatherForecast): StandardWeatherForecast {
    return {
      location: forecast.location,
      current: this.normalizeWeatherPoint(forecast.current),
      hourly: forecast.hourly.map((p) => this.normalizeWeatherPoint(p)),
      fetchedAt: forecast.fetchedAt,
      expiresAt: forecast.expiresAt,
    };
  }

  /**
   * Normalize a single weather point to standard units
   *
   * Input (from Open-Meteo):
   * - Wind: knots
   * - Waves: meters
   * - Temperature: Celsius
   * - Pressure: hPa
   * - Current velocity: m/s (already standard)
   *
   * Output (standard units):
   * - Wind: m/s
   * - Waves: meters
   * - Temperature: Kelvin
   * - Pressure: Pascal
   * - Current velocity: m/s
   */
  private normalizeWeatherPoint(point: WeatherPoint): StandardWeatherPoint {
    return {
      timestamp: point.timestamp,
      location: point.location,
      wind: {
        speed: knotsToMs(point.wind.speed), // knots → m/s
        direction: point.wind.direction * DEG_TO_RAD, // degrees → radians
        gusts: knotsToMs(point.wind.gusts), // knots → m/s
      },
      waves: point.waves
        ? {
            height: point.waves.height, // meters, no conversion
            direction: point.waves.direction * DEG_TO_RAD, // degrees → radians
            period: point.waves.period, // seconds, no conversion
          }
        : undefined,
      swell: point.swell
        ? {
            height: point.swell.height, // meters, no conversion
            direction: point.swell.direction * DEG_TO_RAD, // degrees → radians
            period: point.swell.period, // seconds, no conversion
          }
        : undefined,
      current: point.current
        ? {
            velocity: point.current.velocity, // m/s, already standard
            direction: point.current.direction * DEG_TO_RAD, // degrees → radians
          }
        : undefined,
      pressure: point.pressure !== undefined
        ? point.pressure * CONVERSIONS.HPA_TO_PA // hPa → Pascal
        : undefined,
      seaTemperature: point.seaTemperature !== undefined
        ? celsiusToKelvin(point.seaTemperature) // Celsius → Kelvin
        : undefined,
    };
  }
}

// Export singleton instance
export const weatherDataService = new WeatherDataService();
