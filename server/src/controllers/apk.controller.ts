import { Request, Response } from 'express';
import fs from 'fs';
import { apkService } from '../services/apk.service';

export const apkController = {
  getInfo(_req: Request, res: Response): void {
    const info = apkService.getInfo();
    if (!info) {
      res.status(404).json({ available: false, error: 'No APK cached' });
      return;
    }
    res.json(info);
  },

  download(_req: Request, res: Response): void {
    const found = apkService.getApkPath();
    if (!found) {
      res.status(404).json({ error: 'No APK cached' });
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${found.filename}"`);
    // Long cache is fine — install.sh removes the old file before writing the
    // new one, so the URL effectively rotates per release.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(found.path)
      .on('error', (err) => {
        console.error('[APK] stream error:', err);
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      })
      .pipe(res);
  },
};
