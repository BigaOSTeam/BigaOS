import { Request, Response } from 'express';
import { updateService } from '../services/update.service';

class SystemController {
  async checkForUpdate(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true';
      const info = await updateService.getUpdateInfo(force);
      res.json(info);
    } catch (error: any) {
      console.error('[SystemController] Check update error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async installUpdate(_req: Request, res: Response) {
    try {
      const info = await updateService.getUpdateInfo();
      if (!info.available) {
        res.status(400).json({ error: 'No update available' });
        return;
      }

      // Respond before the update starts (server will restart)
      res.json({ status: 'updating', version: info.latestVersion });

      // Trigger update after response is sent
      setImmediate(() => {
        updateService.installUpdate().catch(err => {
          console.error('[SystemController] Update failed:', err);
        });
      });
    } catch (error: any) {
      console.error('[SystemController] Install update error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export const systemController = new SystemController();
