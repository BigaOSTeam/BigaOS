/**
 * Depth Controller
 *
 * Serves vector depth contours (isobaths), offline-first: downloaded tiles, then
 * a live EMODnet WCS fallback. See depth-contour.service.ts. The response's
 * `source` ('local' | 'online' | 'none') lets the client nudge a download for
 * offline + faster loading.
 */

import { Request, Response } from 'express';
import { depthContourService } from '../services/depth-contour.service';

class DepthController {
  /**
   * GET /depth/contours?west&south&east&north[&depths=2,5,10,...]
   * Returns a GeoJSON FeatureCollection of LineString isobaths (depth in m),
   * plus `source` ('local' | 'online' | 'none') so the client can show an
   * "online — download for offline" note where appropriate.
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

    const { collection, source } = await depthContourService.getContours(
      { west, south, east, north },
      depths
    );
    // Cache local/online (static-ish) contours briefly; never cache 'none' so
    // the chart picks up a freshly-downloaded pack on the next pan.
    res.setHeader('Cache-Control', source === 'none' ? 'no-store' : 'public, max-age=3600');
    res.json({ ...collection, source });
  }

  /**
   * GET /depth/coverage?west&south&east&north
   * Fast { local: boolean } — whether downloaded tiles cover the bbox. The
   * client calls this before /depth/contours so it can immediately show a
   * "fetching online (slow)" note for un-downloaded areas. No contouring/network.
   */
  async getCoverage(req: Request, res: Response): Promise<void> {
    const west = parseFloat(String(req.query.west));
    const south = parseFloat(String(req.query.south));
    const east = parseFloat(String(req.query.east));
    const north = parseFloat(String(req.query.north));
    if (![west, south, east, north].every((n) => Number.isFinite(n))) {
      res.status(400).json({ error: 'west, south, east, north query params are required' });
      return;
    }
    // Coverage flips when a pack is downloaded/deleted — don't cache it.
    res.setHeader('Cache-Control', 'no-store');
    res.json({ local: depthContourService.hasLocal({ west, south, east, north }) });
  }
}

export const depthController = new DepthController();
