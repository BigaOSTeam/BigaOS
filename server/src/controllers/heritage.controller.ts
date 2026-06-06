/**
 * Heritage Controller
 *
 * Serves "Worth a Look" points of interest (EMODnet shipwrecks + UNESCO coastal
 * World Heritage sites) as GeoJSON Points, offline-first: a downloaded pack, then
 * a live EMODnet WFS fallback. See heritage.service.ts. The response's `source`
 * ('local' | 'online' | 'none') lets the client nudge a download for offline.
 */

import { Request, Response } from 'express';
import { heritageService } from '../services/heritage.service';

class HeritageController {
  /**
   * GET /heritage/features?west&south&east&north
   * GeoJSON Point FeatureCollection (wrecks + sites) for the bbox, plus `source`.
   */
  async getFeatures(req: Request, res: Response): Promise<void> {
    const west = parseFloat(String(req.query.west));
    const south = parseFloat(String(req.query.south));
    const east = parseFloat(String(req.query.east));
    const north = parseFloat(String(req.query.north));

    if (![west, south, east, north].every((n) => Number.isFinite(n))) {
      res.status(400).json({ error: 'west, south, east, north query params are required' });
      return;
    }

    const { collection, source } = await heritageService.getFeatures({ west, south, east, north });
    // Cache local/online briefly; never cache 'none' so a freshly-downloaded
    // pack (or a transient WFS outage) is picked up on the next pan.
    res.setHeader('Cache-Control', source === 'none' ? 'no-store' : 'public, max-age=3600');
    res.json({ ...collection, source });
  }
}

export const heritageController = new HeritageController();
