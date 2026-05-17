import { Request, Response } from 'express';
import { exportConfig, importConfig } from '../services/config-backup.service';

class ConfigController {
  /**
   * GET /api/config/export
   * Returns a JSON config bundle. Client triggers a file download from the
   * Settings UI.
   */
  async export(_req: Request, res: Response): Promise<void> {
    try {
      const bundle = await exportConfig();
      const date = bundle.exportedAt.slice(0, 10);
      const filename = `bigaos-config-${date}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (error: any) {
      console.error('[ConfigController] Export error:', error);
      res.status(500).json({ error: error.message || 'Export failed' });
    }
  }

  /**
   * POST /api/config/import
   * Body: a previously exported config bundle. Wipes and restores the
   * settings, switches, and buttons tables.
   */
  async import(req: Request, res: Response): Promise<void> {
    try {
      const summary = await importConfig(req.body);
      res.json({ status: 'ok', ...summary });
    } catch (error: any) {
      console.error('[ConfigController] Import error:', error);
      res.status(400).json({ error: error.message || 'Import failed' });
    }
  }
}

export const configController = new ConfigController();
