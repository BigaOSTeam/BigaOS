import fs from 'fs';
import path from 'path';

/**
 * Locates the cached Android APK that install.sh dropped into the install
 * directory. install.sh keeps exactly one `bigaos-*.apk` in `apk/` (any
 * older one is removed before the new download), so this service just has
 * to find that file and report its metadata.
 */

const APK_DIR = path.join(__dirname, '../../../apk');

export interface ApkInfo {
  available: boolean;
  version: string;
  filename: string;
  size: number;
  modifiedAt: string;
}

class ApkService {
  /**
   * Find the cached APK on disk, if any. Returns null when the directory
   * doesn't exist or contains no matching file.
   */
  private findApkFile(): { path: string; filename: string } | null {
    let entries: string[];
    try {
      entries = fs.readdirSync(APK_DIR);
    } catch {
      return null;
    }
    const apk = entries.find((f) => /^bigaos-.*\.apk$/i.test(f));
    if (!apk) return null;
    return { path: path.join(APK_DIR, apk), filename: apk };
  }

  /**
   * Extract the version string from a filename of the form
   * `bigaos-<version>.apk` (the leading `v` is stripped if present).
   */
  private versionFromFilename(filename: string): string {
    const match = filename.match(/^bigaos-v?(.+)\.apk$/i);
    return match ? match[1] : '';
  }

  getInfo(): ApkInfo | null {
    const found = this.findApkFile();
    if (!found) return null;
    let stat;
    try {
      stat = fs.statSync(found.path);
    } catch {
      return null;
    }
    return {
      available: true,
      version: this.versionFromFilename(found.filename),
      filename: found.filename,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Path to the cached APK file. Caller is responsible for streaming it.
   */
  getApkPath(): { path: string; filename: string } | null {
    return this.findApkFile();
  }
}

export const apkService = new ApkService();
