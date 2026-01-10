import { Request, Response } from 'express';
import { waterDetectionService } from '../services/water-detection.service';
import { dummyDataService } from '../services/dummy-data.service';

class NavigationController {
  /**
   * Calculate a water-only route between two points
   * POST /api/navigation/route
   */
  async calculateRoute(req: Request, res: Response) {
    try {
      const { startLat, startLon, endLat, endLon } = req.body;

      if (!waterDetectionService.isInitialized()) {
        return res.status(503).json({
          error: 'Water detection service not initialized'
        });
      }

      if (
        typeof startLat !== 'number' ||
        typeof startLon !== 'number' ||
        typeof endLat !== 'number' ||
        typeof endLon !== 'number'
      ) {
        return res.status(400).json({
          error: 'Invalid parameters. Required: startLat, startLon, endLat, endLon (all numbers)'
        });
      }

      const result = waterDetectionService.findWaterRoute(startLat, startLon, endLat, endLon);

      res.json({
        success: result.success,
        waypoints: result.waypoints,
        distance: result.distance,
        waypointCount: result.waypoints.length,
        crossesLand: !result.success || result.waypoints.length > 2
      });
    } catch (error) {
      console.error('Route calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate route' });
    }
  }

  /**
   * Check if a direct route crosses land
   * POST /api/navigation/check-route
   */
  async checkRoute(req: Request, res: Response) {
    try {
      const { startLat, startLon, endLat, endLon } = req.body;

      if (!waterDetectionService.isInitialized()) {
        return res.status(503).json({
          error: 'Water detection service not initialized'
        });
      }

      if (
        typeof startLat !== 'number' ||
        typeof startLon !== 'number' ||
        typeof endLat !== 'number' ||
        typeof endLon !== 'number'
      ) {
        return res.status(400).json({
          error: 'Invalid parameters. Required: startLat, startLon, endLat, endLon (all numbers)'
        });
      }

      const result = waterDetectionService.checkRouteForLand(startLat, startLon, endLat, endLon);

      res.json({
        crossesLand: result.crossesLand,
        landPointCount: result.landPoints.length
      });
    } catch (error) {
      console.error('Route check error:', error);
      res.status(500).json({ error: 'Failed to check route' });
    }
  }

  /**
   * Check water type at a specific coordinate
   * GET /api/navigation/water-type?lat=X&lon=Y
   */
  async getWaterType(req: Request, res: Response) {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);

      if (!waterDetectionService.isInitialized()) {
        return res.status(503).json({
          error: 'Water detection service not initialized'
        });
      }

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({
          error: 'Invalid parameters. Required: lat, lon (numbers)'
        });
      }

      const waterType = waterDetectionService.getWaterType(lat, lon);
      const isWater = waterType === 'ocean' || waterType === 'lake';

      res.json({
        lat,
        lon,
        waterType,
        isWater
      });
    } catch (error) {
      console.error('Water type check error:', error);
      res.status(500).json({ error: 'Failed to check water type' });
    }
  }

  /**
   * Update demo navigation values (position, heading, speed)
   * POST /api/navigation/demo
   */
  async updateDemoNavigation(req: Request, res: Response) {
    try {
      const { latitude, longitude, heading, speed } = req.body;

      dummyDataService.setDemoNavigation({
        latitude,
        longitude,
        heading,
        speed
      });

      res.json({
        success: true,
        navigation: dummyDataService.getDemoNavigation()
      });
    } catch (error) {
      console.error('Demo navigation update error:', error);
      res.status(500).json({ error: 'Failed to update demo navigation' });
    }
  }

  /**
   * Get current demo navigation values
   * GET /api/navigation/demo
   */
  async getDemoNavigation(req: Request, res: Response) {
    try {
      res.json({
        demoMode: dummyDataService.isDemoMode(),
        navigation: dummyDataService.getDemoNavigation()
      });
    } catch (error) {
      console.error('Demo navigation get error:', error);
      res.status(500).json({ error: 'Failed to get demo navigation' });
    }
  }
}

export const navigationController = new NavigationController();
