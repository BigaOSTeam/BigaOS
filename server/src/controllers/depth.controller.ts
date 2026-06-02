/**
 * Depth Controller
 *
 * Serves vector depth contours (isobaths) from the EMODnet DTM. See
 * depth-contour.service.ts. Online only; out-of-coverage bboxes return an
 * empty FeatureCollection.
 */

import { Request, Response } from 'express';
import { depthContourService } from '../services/depth-contour.service';

class DepthController {
  /**
   * GET /depth/contours?west&south&east&north[&depths=2,5,10,...]
   * Returns a GeoJSON FeatureCollection of LineString isobaths (depth in m).
   */
  async getContours(req: Request, res: Response): Promise<void> {
    const west = parseFloat(String(req.query.west));
    const south = parseFloat(String(req.query.south));
    const east = parseFloat(String(req.query.east));
    const north = parseFloat(String(req.query.north));

    if (![west, south, east, north].every((n) => Number.isFinite(n))) {
      res.status(400).json({ error: 'west, south, east, north query params are required' });
      return;
    }

    let depths: number[] | undefined;
    if (typeof req.query.depths === 'string' && req.query.depths.trim()) {
      const parsed = req.query.depths
        .split(',')
        .map((s) => parseFloat(s))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (parsed.length) depths = parsed;
    }

    const data = await depthContourService.getContours({ west, south, east, north }, depths);
    // Contour data is static; allow the browser to cache briefly.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(data);
  }
}

export const depthController = new DepthController();
