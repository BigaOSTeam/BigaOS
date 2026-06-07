/**
 * Regional Import Controller
 *
 * The in-app "add a lake" importer. Search OSM for a lake, then generate a
 * modeled depth tile from its outline + a known max depth (lake-depth.service).
 * Generated lakes fold into the existing Depth overlay (the depth engine indexes
 * them as a `custom` source), so there is no separate layer to toggle — this
 * controller just manages the named datasets.
 *
 * Progress rides the existing `download_progress` WebSocket channel (statuses
 * converting/indexing/completed) so the Downloads-tab UI renders it unchanged.
 */
import { Request, Response } from 'express';
import { wsServerInstance } from '../websocket/websocket-server';
import { lakeDepthService, lakeId, ProgressFn } from '../services/lake-depth.service';
import { depthTileService } from '../services/depth-tile.service';
import { depthContourService } from '../services/depth-contour.service';

class RegionalImportController {
  /** GET /regional/search?q= — OSM water relations matching a name. */
  async search(req: Request, res: Response): Promise<void> {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) { res.json({ candidates: [] }); return; }
    try {
      res.json({ candidates: await lakeDepthService.searchLakes(q) });
    } catch (e) {
      res.status(502).json({ error: 'OSM lookup failed', detail: (e as Error).message });
    }
  }

  /** GET /regional/lakes — installed lake imports. */
  list(_req: Request, res: Response): void {
    res.json({ lakes: lakeDepthService.listImported() });
  }

  /**
   * POST /regional/lakes { name, relationId, maxDepth, profile? }
   * Responds 202 immediately; models the tile in the background and reports
   * progress over WebSocket (fileId = the lake id).
   */
  async create(req: Request, res: Response): Promise<void> {
    const { name, relationId, maxDepth, profile } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const rid = Number(relationId);
    const md = Number(maxDepth);
    if (!Number.isInteger(rid) || rid <= 0) {
      res.status(400).json({ error: 'a valid OSM relationId is required' });
      return;
    }
    if (!Number.isFinite(md) || md <= 0 || md > 4000) {
      res.status(400).json({ error: 'maxDepth must be between 1 and 4000 m' });
      return;
    }
    const prof = Number(profile);
    const id = lakeId(name);

    res.status(202).json({ id, status: 'started' });

    const emit: ProgressFn = (status, progress) => {
      wsServerInstance?.broadcastDownloadProgress({
        fileId: id, status, progress, bytesDownloaded: 0, totalBytes: 0,
      });
    };
    try {
      await lakeDepthService.generate(
        { name: name.trim(), relationId: rid, maxDepth: md, profile: Number.isFinite(prof) ? prof : undefined },
        emit,
      );
      await depthTileService.reload();
      depthContourService.clearCache();
      emit('completed', 100);
    } catch (e) {
      console.error('Lake import failed:', e);
      wsServerInstance?.broadcastDownloadProgress({
        fileId: id, status: 'error', progress: 0, bytesDownloaded: 0, totalBytes: 0,
        error: (e as Error).message,
      });
    }
  }

  /** DELETE /regional/lakes/:id — remove tile + manifest entry, reload depth. */
  async remove(req: Request, res: Response): Promise<void> {
    const id = String(req.params.id ?? '');
    if (!lakeDepthService.remove(id)) {
      res.status(404).json({ error: 'lake not found' });
      return;
    }
    await depthTileService.reload();
    depthContourService.clearCache();
    res.json({ success: true });
  }
}

export const regionalImportController = new RegionalImportController();
