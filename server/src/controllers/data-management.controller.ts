/**
 * Data Management Controller
 *
 * Handles checking status of data files, downloading, and extraction.
 * URLs are configurable and stored in a JSON config file.
 */

import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

// Try to import unzipper, fall back gracefully if not available
let unzipper: typeof import('unzipper') | null = null;
try {
  unzipper = require('unzipper');
} catch {
  console.warn('unzipper not installed - ZIP extraction will not be available');
}

interface DataFileConfig {
  id: string;
  name: string;
  description: string;
  category: 'navigation' | 'other';
  defaultUrl: string;
  localPath: string;
  extractTo?: string;
}

interface DataFileInfo extends DataFileConfig {
  url: string;
  exists: boolean;
  localDate?: string;
  remoteDate?: string;
  size?: number;
  remoteSize?: number;
}

interface UrlConfig {
  [fileId: string]: string;
}

interface FileMetadata {
  [fileId: string]: string; // The remote Last-Modified date at time of download
}

interface DownloadProgress {
  fileId: string;
  status: 'downloading' | 'extracting' | 'completed' | 'error';
  progress: number; // 0-100
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  startTime: number;
}

interface ActiveDownload {
  progress: DownloadProgress;
  abortController: AbortController;
  tempFilePath?: string;
  targetDir?: string;
}

// Default file configurations
// Each download gets its own folder based on the id (e.g., oceans-seas/, lakes-rivers/)
const DEFAULT_FILES: DataFileConfig[] = [
  {
    id: 'oceans-seas',
    name: 'Oceans & Seas',
    description: '',
    category: 'navigation',
    defaultUrl: 'https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip',
    localPath: 'oceans-seas',
    extractTo: 'oceans-seas'
  },
  {
    id: 'lakes-rivers',
    name: 'Lakes & Rivers',
    description: '',
    category: 'navigation',
    defaultUrl: 'https://hydro.iis.u-tokyo.ac.jp/~yamadai/OSM_water/v2.0_2021Feb/OSM_WaterLayer.pbf',
    localPath: 'lakes-rivers'
  }
];

class DataManagementController {
  private dataDir: string;
  private configPath: string;
  private metadataPath: string;
  private activeDownloads: Map<string, ActiveDownload> = new Map();

  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.configPath = path.join(this.dataDir, 'urls.json');
    this.metadataPath = path.join(this.dataDir, 'metadata.json');
  }

  /**
   * Load custom URL configuration
   */
  private loadUrlConfig(): UrlConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading URL config:', error);
    }
    return {};
  }

  /**
   * Save custom URL configuration
   */
  private saveUrlConfig(config: UrlConfig): void {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error saving URL config:', error);
      throw error;
    }
  }

  /**
   * Load file metadata (release dates)
   */
  private loadMetadata(): FileMetadata {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const content = fs.readFileSync(this.metadataPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
    return {};
  }

  /**
   * Save file metadata
   */
  private saveMetadata(metadata: FileMetadata): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  }

  /**
   * Get the URL for a file (custom or default)
   */
  private getFileUrl(fileId: string, urlConfig: UrlConfig): string {
    if (urlConfig[fileId]) {
      return urlConfig[fileId];
    }
    const fileConfig = DEFAULT_FILES.find(f => f.id === fileId);
    return fileConfig?.defaultUrl || '';
  }

  /**
   * Get status of all data files
   */
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const urlConfig = this.loadUrlConfig();
      const metadata = this.loadMetadata();

      const files: (DataFileInfo & { downloadStatus?: DownloadProgress })[] = await Promise.all(
        DEFAULT_FILES.map(async (file) => {
          const fullPath = path.join(this.dataDir, file.localPath);
          const exists = fs.existsSync(fullPath);
          const url = this.getFileUrl(file.id, urlConfig);
          let localDate: string | undefined;
          let size: number | undefined;

          if (exists) {
            const stats = fs.statSync(fullPath);
            // Use stored release date if available, otherwise fall back to mtime
            localDate = metadata[file.id] || stats.mtime.toISOString();
            size = stats.isDirectory()
              ? this.getDirectorySize(fullPath)
              : stats.size;
          }

          // Try to get remote file info (date and size)
          let remoteDate: string | undefined;
          let remoteSize: number | undefined;
          try {
            const remoteInfo = await this.getRemoteFileInfo(url);
            remoteDate = remoteInfo.date;
            remoteSize = remoteInfo.size;
          } catch {
            // Ignore errors fetching remote info
          }

          // Include active download status if any
          const activeDownload = this.activeDownloads.get(file.id);

          return {
            ...file,
            url,
            exists,
            localDate,
            remoteDate,
            size,
            remoteSize,
            downloadStatus: activeDownload?.progress
          };
        })
      );

      res.json({ files });
    } catch (error) {
      console.error('Error getting data status:', error);
      res.status(500).json({ error: 'Failed to get data status' });
    }
  }

  /**
   * Get download progress for a specific file
   */
  async getDownloadProgress(req: Request, res: Response): Promise<void> {
    const { fileId } = req.params;

    const activeDownload = this.activeDownloads.get(fileId);
    if (activeDownload) {
      res.json(activeDownload.progress);
    } else {
      res.json({ status: 'idle' });
    }
  }

  /**
   * Update URL for a data file
   */
  async updateUrl(req: Request, res: Response): Promise<void> {
    const { fileId } = req.params;
    const { url } = req.body;

    const fileConfig = DEFAULT_FILES.find(f => f.id === fileId);
    if (!fileConfig) {
      res.status(404).json({ error: 'Unknown file ID' });
      return;
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    try {
      const config = this.loadUrlConfig();

      // If URL matches default, remove from config
      if (url === fileConfig.defaultUrl) {
        delete config[fileId];
      } else {
        config[fileId] = url;
      }

      this.saveUrlConfig(config);
      res.json({ success: true, url });
    } catch (error) {
      console.error('Error updating URL:', error);
      res.status(500).json({ error: 'Failed to update URL' });
    }
  }

  /**
   * Get remote file's info (date and size) via HEAD request
   */
  private getRemoteFileInfo(url: string): Promise<{ date?: string; size?: number }> {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.request(url, { method: 'HEAD' }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.getRemoteFileInfo(redirectUrl).then(resolve);
            return;
          }
        }

        const lastModified = response.headers['last-modified'];
        const contentLength = response.headers['content-length'];

        resolve({
          date: lastModified ? new Date(lastModified).toISOString() : undefined,
          size: contentLength ? parseInt(contentLength, 10) : undefined
        });
      });

      req.on('error', () => resolve({}));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({});
      });
      req.end();
    });
  }

  /**
   * Get total size of a directory
   */
  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch {
      // Ignore errors
    }

    return totalSize;
  }

  /**
   * Start downloading a data file (server-side)
   */
  async downloadFile(req: Request, res: Response): Promise<void> {
    const { fileId } = req.params;

    const fileConfig = DEFAULT_FILES.find(f => f.id === fileId);
    if (!fileConfig) {
      res.status(404).json({ error: 'Unknown file ID' });
      return;
    }

    // Check if already downloading
    const existingDownload = this.activeDownloads.get(fileId);
    if (existingDownload && (existingDownload.progress.status === 'downloading' || existingDownload.progress.status === 'extracting')) {
      res.json({
        message: 'Download already in progress',
        progress: existingDownload.progress
      });
      return;
    }

    const urlConfig = this.loadUrlConfig();
    const url = this.getFileUrl(fileId, urlConfig);

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Initialize progress and abort controller
    const progress: DownloadProgress = {
      fileId,
      status: 'downloading',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      startTime: Date.now()
    };
    const abortController = new AbortController();
    const activeDownload: ActiveDownload = { progress, abortController };
    this.activeDownloads.set(fileId, activeDownload);

    // Start download in background
    this.performDownload(fileId, url, fileConfig).catch(error => {
      console.error(`Download failed for ${fileId}:`, error);
      const download = this.activeDownloads.get(fileId);
      if (download) {
        download.progress.status = 'error';
        download.progress.error = error.message || 'Download failed';
      }
    });

    res.json({
      message: 'Download started',
      progress
    });
  }

  /**
   * Determine file type from URL
   */
  private getFileType(url: string): 'zip' | 'gzip' | 'raw' {
    if (url.endsWith('.zip')) return 'zip';
    if (url.endsWith('.gz')) return 'gzip';
    return 'raw';
  }

  /**
   * Get temp file path for download
   */
  private getTempFilePath(fileId: string, fileType: 'zip' | 'gzip' | 'raw', url: string): string {
    const ext = fileType === 'zip' ? '.zip' : fileType === 'gzip' ? '.gz' : '';
    const fileName = ext ? `${fileId}${ext}` : path.basename(url);
    return path.join(this.dataDir, fileName);
  }

  /**
   * Prepare target directory (clear and recreate)
   */
  private prepareTargetDir(targetDir: string): void {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });
  }

  /**
   * Clean up temp file safely
   */
  private cleanupTempFile(tempFilePath: string): void {
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Process downloaded file (extract or move to target)
   */
  private async processDownloadedFile(
    tempFilePath: string,
    targetDir: string,
    fileType: 'zip' | 'gzip' | 'raw',
    url: string,
    progress: DownloadProgress
  ): Promise<void> {
    switch (fileType) {
      case 'zip':
        progress.status = 'extracting';
        progress.progress = 0;
        await this.extractZip(tempFilePath, targetDir);
        this.cleanupTempFile(tempFilePath);
        break;

      case 'gzip':
        progress.status = 'extracting';
        const extractedFileName = path.basename(url, '.gz');
        await this.extractGzip(tempFilePath, path.join(targetDir, extractedFileName));
        this.cleanupTempFile(tempFilePath);
        break;

      case 'raw':
        const finalFileName = path.basename(url);
        fs.renameSync(tempFilePath, path.join(targetDir, finalFileName));
        break;
    }
  }

  /**
   * Perform the actual download with progress tracking
   */
  private async performDownload(fileId: string, url: string, fileConfig: DataFileConfig): Promise<void> {
    const activeDownload = this.activeDownloads.get(fileId);
    if (!activeDownload) return;

    const { progress } = activeDownload;
    const fileType = this.getFileType(url);
    const targetDir = path.join(this.dataDir, fileConfig.localPath);
    const tempFilePath = this.getTempFilePath(fileId, fileType, url);

    // Store paths for cleanup on cancel
    activeDownload.tempFilePath = tempFilePath;
    activeDownload.targetDir = targetDir;

    // Get remote release date before downloading
    const remoteInfo = await this.getRemoteFileInfo(url).catch(() => ({ date: undefined, size: undefined }));
    const remoteReleaseDate = remoteInfo.date;

    try {
      this.prepareTargetDir(targetDir);
      await this.downloadToFile(url, tempFilePath, progress, activeDownload.abortController.signal);

      // Check if cancelled during download
      if (activeDownload.abortController.signal.aborted) {
        throw new Error('Cancelled by user');
      }

      await this.processDownloadedFile(tempFilePath, targetDir, fileType, url, progress);

      progress.status = 'completed';
      progress.progress = 100;

      // Save release date to metadata
      if (remoteReleaseDate) {
        const metadata = this.loadMetadata();
        metadata[fileId] = remoteReleaseDate;
        this.saveMetadata(metadata);
      }

      console.log(`Download completed: ${fileId}`);

      // Clean up progress after delay
      setTimeout(() => this.activeDownloads.delete(fileId), 30000);

    } catch (error) {
      progress.status = 'error';
      progress.error = error instanceof Error ? error.message : 'Download failed';
      this.cleanupTempFile(tempFilePath);
      // Also clean up target directory on error/cancel
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true });
      }
      throw error;
    }
  }

  /**
   * Download a file from URL to local path with progress tracking
   */
  private downloadToFile(url: string, filePath: string, progress: DownloadProgress, abortSignal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentReq: http.ClientRequest | null = null;
      let fileStream: fs.WriteStream | null = null;

      // Handle abort signal
      const abortHandler = () => {
        if (currentReq) {
          currentReq.destroy();
        }
        if (fileStream) {
          fileStream.destroy();
        }
        fs.unlink(filePath, () => {}); // Clean up partial file
        reject(new Error('Cancelled by user'));
      };

      if (abortSignal.aborted) {
        reject(new Error('Cancelled by user'));
        return;
      }

      abortSignal.addEventListener('abort', abortHandler, { once: true });

      const performRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          abortSignal.removeEventListener('abort', abortHandler);
          reject(new Error('Too many redirects'));
          return;
        }

        const protocol = requestUrl.startsWith('https') ? https : http;

        currentReq = protocol.get(requestUrl, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              // Handle relative redirects
              const newUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, requestUrl).toString();
              performRequest(newUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            abortSignal.removeEventListener('abort', abortHandler);
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          progress.totalBytes = totalBytes;

          fileStream = createWriteStream(filePath);
          let bytesDownloaded = 0;

          response.on('data', (chunk: Buffer) => {
            bytesDownloaded += chunk.length;
            progress.bytesDownloaded = bytesDownloaded;
            if (totalBytes > 0) {
              progress.progress = Math.round((bytesDownloaded / totalBytes) * 100);
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream?.close();
            abortSignal.removeEventListener('abort', abortHandler);
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlink(filePath, () => {}); // Clean up partial file
            abortSignal.removeEventListener('abort', abortHandler);
            reject(err);
          });
        });

        currentReq.on('error', (err) => {
          abortSignal.removeEventListener('abort', abortHandler);
          reject(err);
        });
        currentReq.setTimeout(300000, () => { // 5 minute timeout
          currentReq?.destroy();
          abortSignal.removeEventListener('abort', abortHandler);
          reject(new Error('Download timeout'));
        });
      };

      performRequest(url);
    });
  }

  /**
   * Extract a ZIP file (assumes target directory already exists and is empty)
   */
  private async extractZip(zipPath: string, extractTo: string): Promise<void> {
    if (!unzipper) {
      throw new Error('ZIP extraction not available - unzipper package not installed');
    }

    await pipeline(
      fs.createReadStream(zipPath),
      unzipper.Extract({ path: extractTo })
    );

    // Flatten nested directory structure (common in ZIP files)
    this.flattenSingleNestedDir(extractTo);
  }

  /**
   * If a directory contains only a single subdirectory, move its contents up one level
   */
  private flattenSingleNestedDir(dirPath: string): void {
    const entries = fs.readdirSync(dirPath);
    if (entries.length !== 1) return;

    const singleEntry = path.join(dirPath, entries[0]);
    if (!fs.statSync(singleEntry).isDirectory()) return;

    const nestedEntries = fs.readdirSync(singleEntry);
    for (const entry of nestedEntries) {
      fs.renameSync(path.join(singleEntry, entry), path.join(dirPath, entry));
    }
    fs.rmdirSync(singleEntry);
  }

  /**
   * Extract a GZIP file
   */
  private async extractGzip(gzPath: string, extractTo: string): Promise<void> {
    await pipeline(
      fs.createReadStream(gzPath),
      createGunzip(),
      createWriteStream(extractTo)
    );
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(req: Request, res: Response): Promise<void> {
    const { fileId } = req.params;

    const activeDownload = this.activeDownloads.get(fileId);
    if (activeDownload && (activeDownload.progress.status === 'downloading' || activeDownload.progress.status === 'extracting')) {
      // Abort the download request
      activeDownload.abortController.abort();

      // Update status
      activeDownload.progress.status = 'error';
      activeDownload.progress.error = 'Cancelled by user';

      // Clean up temp file
      if (activeDownload.tempFilePath) {
        this.cleanupTempFile(activeDownload.tempFilePath);
      }

      // Clean up target directory
      if (activeDownload.targetDir && fs.existsSync(activeDownload.targetDir)) {
        fs.rmSync(activeDownload.targetDir, { recursive: true });
      }

      this.activeDownloads.delete(fileId);

      res.json({ success: true, message: 'Download cancelled' });
    } else {
      res.json({ success: false, message: 'No active download to cancel' });
    }
  }

  /**
   * Delete a data file
   */
  async deleteFile(req: Request, res: Response): Promise<void> {
    const { fileId } = req.params;

    const fileConfig = DEFAULT_FILES.find(f => f.id === fileId);
    if (!fileConfig) {
      res.status(404).json({ error: 'Unknown file ID' });
      return;
    }

    const fullPath = path.join(this.dataDir, fileConfig.localPath);

    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }

        // Clear metadata entry
        const metadata = this.loadMetadata();
        if (metadata[fileId]) {
          delete metadata[fileId];
          this.saveMetadata(metadata);
        }

        res.json({ success: true, message: 'File deleted' });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
}

export const dataManagementController = new DataManagementController();
