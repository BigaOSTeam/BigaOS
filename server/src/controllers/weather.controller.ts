/**
 * Weather Controller
 *
 * REST API endpoints for weather data.
 */

import { Request, Response } from 'express';
import { weatherService } from '../services/weather.service';
import { WeatherGridBounds } from '../types/weather.types';

export class WeatherController {
  /**
   * GET /api/weather/current
   * Get current weather for a location
   */
  async getCurrent(req: Request, res: Response) {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude' });
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Coordinates out of range' });
    }

    try {
      const forecast = await weatherService.getWeather(lat, lon);
      if (!forecast) {
        return res.status(503).json({ error: 'Weather data unavailable' });
      }

      res.json({
        current: forecast.current,
        location: forecast.location,
        fetchedAt: forecast.fetchedAt,
        expiresAt: forecast.expiresAt,
      });
    } catch (error) {
      console.error('[Weather Controller] getCurrent error:', error);
      res.status(500).json({ error: 'Failed to fetch weather data' });
    }
  }

  /**
   * GET /api/weather/forecast
   * Get hourly forecast for a location
   */
  async getForecast(req: Request, res: Response) {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    const hours = parseInt(req.query.hours as string) || 168; // Default 7 days

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude' });
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Coordinates out of range' });
    }

    try {
      const requiredDays = Math.ceil(hours / 24);
      const forecast = await weatherService.getWeather(lat, lon, requiredDays);
      if (!forecast) {
        return res.status(503).json({ error: 'Weather data unavailable' });
      }

      res.json({
        location: forecast.location,
        current: forecast.current,
        hourly: forecast.hourly.slice(0, hours),
        fetchedAt: forecast.fetchedAt,
        expiresAt: forecast.expiresAt,
      });
    } catch (error) {
      console.error('[Weather Controller] getForecast error:', error);
      res.status(500).json({ error: 'Failed to fetch weather data' });
    }
  }

  /**
   * GET /api/weather/grid
   * Get weather grid for map overlay
   */
  async getGrid(req: Request, res: Response) {
    const north = parseFloat(req.query.north as string);
    const south = parseFloat(req.query.south as string);
    const east = parseFloat(req.query.east as string);
    const west = parseFloat(req.query.west as string);
    let resolution = parseFloat(req.query.resolution as string) || 0.5;
    const hour = parseInt(req.query.hour as string) || 0;

    // Validate bounds
    if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
      return res.status(400).json({ error: 'Invalid bounds parameters' });
    }

    if (north < south) {
      return res.status(400).json({ error: 'North must be greater than south' });
    }

    // Calculate grid size
    const latRange = north - south;
    const lonRange = Math.abs(east - west);
    let estimatedPoints = (latRange / resolution) * (lonRange / resolution);

    // Adaptive resolution: if too many points, increase resolution to fit within limit
    const maxPoints = 200;
    if (estimatedPoints > maxPoints) {
      // Calculate the minimum resolution needed
      const area = latRange * lonRange;
      const minResolution = Math.sqrt(area / maxPoints);
      resolution = Math.max(resolution, minResolution);
      estimatedPoints = (latRange / resolution) * (lonRange / resolution);
    }

    const bounds: WeatherGridBounds = { north, south, east, west };

    try {
      const grid = await weatherService.getWeatherGrid(bounds, resolution, hour);
      res.json(grid);
    } catch (error) {
      console.error('[Weather Controller] getGrid error:', error);
      res.status(500).json({ error: 'Failed to fetch weather grid' });
    }
  }

  /**
   * GET /api/weather/settings
   * Get current weather settings
   */
  getSettings(req: Request, res: Response) {
    const settings = weatherService.getSettings();
    res.json(settings);
  }

  /**
   * PUT /api/weather/settings
   * Update weather settings
   */
  updateSettings(req: Request, res: Response) {
    const settings = req.body;

    // Validate settings
    if (settings.refreshIntervalMinutes !== undefined) {
      const interval = parseInt(settings.refreshIntervalMinutes);
      if (isNaN(interval) || interval < 5 || interval > 120) {
        return res.status(400).json({ error: 'Refresh interval must be between 5 and 120 minutes' });
      }
    }

    try {
      weatherService.updateSettings(settings);
      res.json({ success: true, settings: weatherService.getSettings() });
    } catch (error) {
      console.error('[Weather Controller] updateSettings error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }

  /**
   * DELETE /api/weather/cache
   * Clear weather cache
   */
  async clearCache(req: Request, res: Response) {
    try {
      const clearedCount = await weatherService.clearCache();
      res.json({ success: true, clearedEntries: clearedCount });
    } catch (error) {
      console.error('[Weather Controller] clearCache error:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  }
}

export const weatherController = new WeatherController();
