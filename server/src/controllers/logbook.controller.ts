import { Request, Response } from 'express';
import { dbWorker } from '../services/database-worker.service';

// 'YYYY-MM-DD' — rejects anything else so an unsafe value can't sneak into SQL
// even though we always parameterize. Defensive consistency.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

export class LogbookController {
  /**
   * GET /api/logbook/days?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
   * Returns rolled-up day summaries, newest first.
   */
  static async listDays(req: Request, res: Response): Promise<void> {
    try {
      const from = typeof req.query.from === 'string' && isValidDate(req.query.from) ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' && isValidDate(req.query.to) ? req.query.to : undefined;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 365, 1), 3650);
      const days = await dbWorker.logbookListDays(from, to, limit);
      res.json({ days });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/logbook/days/:date — day record plus all its segments.
   */
  static async getDay(req: Request, res: Response): Promise<void> {
    try {
      const date = req.params.date;
      if (!isValidDate(date)) {
        res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' });
        return;
      }
      const result = await dbWorker.logbookGetDay(date);
      if (!result.day) {
        res.status(404).json({ error: 'Day not found' });
        return;
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/logbook/days/:date/track — all trackpoints for replay.
   */
  static async getDayTrack(req: Request, res: Response): Promise<void> {
    try {
      const date = req.params.date;
      if (!isValidDate(date)) {
        res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' });
        return;
      }
      const points = await dbWorker.logbookGetDayTrack(date);
      res.json({ date, points });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/logbook/days/:date
   * Body: { title?: string|null, note?: string|null }
   */
  static async updateDay(req: Request, res: Response): Promise<void> {
    try {
      const date = req.params.date;
      if (!isValidDate(date)) {
        res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' });
        return;
      }
      const { title, note } = req.body || {};
      const fields: { title?: string | null; note?: string | null } = {};
      if (title !== undefined) {
        if (title !== null && typeof title !== 'string') {
          res.status(400).json({ error: 'title must be a string or null' });
          return;
        }
        fields.title = title;
      }
      if (note !== undefined) {
        if (note !== null && typeof note !== 'string') {
          res.status(400).json({ error: 'note must be a string or null' });
          return;
        }
        fields.note = note;
      }
      if (Object.keys(fields).length === 0) {
        res.status(400).json({ error: 'Nothing to update' });
        return;
      }
      await dbWorker.logbookUpdateDay(date, fields);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

}
