/**
 * Chart Controller
 *
 * Offline vector base-map packs (PMTiles). Exposes the installed-pack index and
 * serves each pack's raw `.pmtiles` file with HTTP Range support so the client
 * (protomaps-leaflet) can read individual tiles via byte ranges. See
 * chart-pack.service.ts. Inert until a pack is downloaded.
 */

import { Request, Response } from 'express';
import { chartPackService } from '../services/chart-pack.service';

class ChartController {
  /** GET /charts/packs → installed base-map packs (bounds, zoom range, size). */
  getPacks(_req: Request, res: Response): void {
    // Pack data only changes on download/delete; let the client cache briefly.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ packs: chartPackService.list() });
  }

  /**
   * GET /charts/:packId/tiles.pmtiles → the raw PMTiles file, Range-enabled.
   * `res.sendFile` handles Range/ETag/Last-Modified natively; we only add
   * Accept-Ranges + a long Cache-Control and validate the id against the index.
   */
  servePmtiles(req: Request, res: Response): void {
    const file = chartPackService.fileForPack(req.params.packId);
    if (!file) {
      res.status(404).json({ error: 'Unknown chart pack' });
      return;
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) {
        res.status((err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500).end();
      }
    });
  }
}

export const chartController = new ChartController();
