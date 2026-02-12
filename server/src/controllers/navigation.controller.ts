import { Request, Response } from 'express';
import { waterDetectionService } from '../services/water-detection.service';
import { routeWorkerService } from '../services/route-worker.service';
import { getDataController } from '../services/data.controller';

class NavigationController {
  /**
   * Calculate a water-only route between two points
   * Uses worker thread to avoid blocking the main event loop
   * POST /api/navigation/route
   */
  async calculateRoute(req: Request, res: Response) {
    try {
      const { startLat, startLon, endLat, endLon } = req.body;

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

      // Check if navigation data is loaded
      if (!waterDetectionService.hasNavigationData()) {
        return res.status(503).json({
          error: 'NO_NAVIGATION_DATA',
          message: 'Navigation data not loaded. Please download ocean/lake data in Settings > Data Management.'
        });
      }

      // Use worker thread for route calculation (non-blocking)
      if (!routeWorkerService.isReady()) {
        // Don't fall back to main thread - it blocks and causes disconnects
        // Return a simple direct route instead
        console.warn('[Navigation] Route worker not ready, returning direct route');
        const R = 3440.065; // Earth radius in nautical miles
        const dLat = (endLat - startLat) * Math.PI / 180;
        const dLon = (endLon - startLon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return res.json({
          success: true,
          waypoints: [
            { lat: startLat, lon: startLon },
            { lat: endLat, lon: endLon }
          ],
          distance,
          waypointCount: 2,
          crossesLand: false,
          workerUnavailable: true
        });
      }

      const result = await routeWorkerService.findWaterRoute(startLat, startLon, endLat, endLon);
      res.json({
        success: result.success,
        waypoints: result.waypoints,
        distance: result.distance,
        waypointCount: result.waypoints.length,
        crossesLand: !result.success || result.waypoints.length > 2,
        failureReason: result.failureReason
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

      const result = await waterDetectionService.checkRouteForLandAsync(startLat, startLon, endLat, endLon);

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

      const waterType = await waterDetectionService.getWaterTypeAsync(lat, lon);
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

      const dataController = getDataController();
      if (dataController) {
        dataController.setDemoNavigation({
          latitude,
          longitude,
          heading,
          speed
        });
      }

      res.json({
        success: true,
        navigation: dataController?.getDemoNavigation()
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
      const dataController = getDataController();
      res.json({
        demoMode: true,
        navigation: dataController?.getDemoNavigation()
      });
    } catch (error) {
      console.error('Demo navigation get error:', error);
      res.status(500).json({ error: 'Failed to get demo navigation' });
    }
  }

  /**
   * Get water classification grid for debug overlay
   * GET /api/navigation/debug/water-grid?minLat=X&maxLat=X&minLon=X&maxLon=X&gridSize=X
   */
  async getWaterGrid(req: Request, res: Response) {
    try {
      const minLat = parseFloat(req.query.minLat as string);
      const maxLat = parseFloat(req.query.maxLat as string);
      const minLon = parseFloat(req.query.minLon as string);
      const maxLon = parseFloat(req.query.maxLon as string);
      const gridSize = req.query.gridSize ? parseFloat(req.query.gridSize as string) : 0.005;

      if (!waterDetectionService.isInitialized()) {
        return res.status(503).json({
          error: 'Water detection service not initialized'
        });
      }

      if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLon) || isNaN(maxLon)) {
        return res.status(400).json({
          error: 'Invalid parameters. Required: minLat, maxLat, minLon, maxLon (numbers)'
        });
      }

      const grid = await waterDetectionService.getWaterGrid(minLat, maxLat, minLon, maxLon, gridSize);

      res.json({
        grid,
        count: grid.length,
        bounds: { minLat, maxLat, minLon, maxLon },
        gridSize
      });
    } catch (error) {
      console.error('Water grid error:', error);
      res.status(500).json({ error: 'Failed to get water grid' });
    }
  }

  /**
   * Get debug info about water detection service
   * GET /api/navigation/debug/info
   */
  async getDebugInfo(req: Request, res: Response) {
    try {
      const cacheStats = waterDetectionService.getCacheStats();
      const initialized = waterDetectionService.isInitialized();
      const hasData = waterDetectionService.hasNavigationData();

      res.json({
        initialized,
        hasData,
        cacheStats
      });
    } catch (error) {
      console.error('Debug info error:', error);
      res.status(500).json({ error: 'Failed to get debug info' });
    }
  }
}

export const navigationController = new NavigationController();
