/**
 * Seamark Controller
 *
 * Serves offline vector seamarks (buoys, lights, beacons…) as a bbox- and
 * zoom-filtered GeoJSON FeatureCollection from a downloaded pack. See
 * seamark.service.ts. The response's `source` ('local' | 'none') lets the
 * client fall back to the online `nautical` raster overlay where no pack exists.
 */

import { Request, Response } from 'express';
import { seamarkService } from '../services/seamark.service';

class SeamarkController {
  /** GET /seamarks/features?bbox=w,s,e,n&zoom=z (or west&south&east&north). */
  getFeatures(req: Request, res: Response): void {
    let west: number, south: number, east: number, north: number;

    if (typeof req.query.bbox === 'string') {
      const parts = req.query.bbox.split(',').map((p) => parseFloat(p));
      [west, south, east, north] = parts as [number, number, number, number];
    } else {
      west = parseFloat(String(req.query.west));
      south = parseFloat(String(req.query.south));
      east = parseFloat(String(req.query.east));
      north = parseFloat(String(req.query.north));
    }
    const zoom = parseFloat(String(req.query.zoom));

    if (![west, south, east, north].every((n) => Number.isFinite(n))) {
      res.status(400).json({ error: 'bbox=w,s,e,n (or west,south,east,north) is required' });
      return;
    }

    const { collection, source } = seamarkService.getFeatures({ west, south, east, north }, zoom);
    // Pack data only changes on re-download; never cache 'none' so a freshly
    // downloaded pack is picked up on the next pan.
    res.setHeader('Cache-Control', source === 'none' ? 'no-store' : 'public, max-age=86400');
    res.json({ ...collection, source });
  }
}

export const seamarkController = new SeamarkController();
