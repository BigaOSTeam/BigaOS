import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';

const GITHUB_REPO = 'Johannes-Goetz/BigaOS';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  publishedAt: string;
  lastChecked: string;
}

class UpdateService {
  private cachedInfo: UpdateInfo | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private onSystemUpdating: (() => void) | null = null;

  /**
   * Register a callback that fires when the system starts updating.
   * The WebSocket server uses this to broadcast to all clients.
   */
  setUpdateCallback(cb: () => void) {
    this.onSystemUpdating = cb;
  }

  /**
   * Start periodic update checks
   */
  start() {
    // Check shortly after boot
    setTimeout(() => this.checkForUpdate(), 30_000);
    this.checkTimer = setInterval(() => this.checkForUpdate(), CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Get the current version from package.json
   */
  getCurrentVersion(): string {
    try {
      const pkgPath = path.join(__dirname, '../../../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Check GitHub for latest release
   */
  async checkForUpdate(): Promise<UpdateInfo> {
    const currentVersion = this.getCurrentVersion();

    try {
      const release = await this.fetchLatestRelease();
      const latestVersion = (release.tag_name || '').replace(/^v/, '');

      const info: UpdateInfo = {
        available: this.isNewer(latestVersion, currentVersion),
        currentVersion,
        latestVersion,
        releaseNotes: release.body || '',
        publishedAt: release.published_at || '',
        lastChecked: new Date().toISOString(),
      };

      this.cachedInfo = info;
      return info;
    } catch (error) {
      console.error('[UpdateService] Failed to check for updates:', error);
      // Return cached or empty info
      return this.cachedInfo || {
        available: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseNotes: '',
        publishedAt: '',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Get cached update info (or check fresh)
   */
  async getUpdateInfo(force: boolean = false): Promise<UpdateInfo> {
    if (force || !this.cachedInfo) {
      return this.checkForUpdate();
    }
    return this.cachedInfo;
  }

  /**
   * Trigger the update: runs install.sh as a detached process.
   * The script downloads the new release, installs it, and restarts the service.
   */
  async installUpdate(): Promise<void> {
    const installScript = path.join(__dirname, '../../../install.sh');

    if (!fs.existsSync(installScript)) {
      throw new Error('install.sh not found');
    }

    // Notify all clients that an update is starting
    if (this.onSystemUpdating) {
      this.onSystemUpdating();
    }

    // Give WebSocket a moment to broadcast before the process dies
    await new Promise(resolve => setTimeout(resolve, 500));

    // Spawn the install script detached so it survives server restart
    const child = exec(`bash "${installScript}"`, {
      cwd: path.join(__dirname, '../../..'),
      env: { ...process.env, HOME: process.env.HOME || '/home/pi' },
    });

    child.unref();

    // Log output for debugging
    child.stdout?.on('data', (data) => console.log('[Update]', data.toString().trim()));
    child.stderr?.on('data', (data) => console.error('[Update]', data.toString().trim()));
  }

  /**
   * Fetch latest release from GitHub API
   */
  private fetchLatestRelease(): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
      https.get(url, {
        headers: {
          'User-Agent': 'BigaOS-UpdateService',
          'Accept': 'application/vnd.github.v3+json',
        },
      }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Follow redirect
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, {
              headers: {
                'User-Agent': 'BigaOS-UpdateService',
                'Accept': 'application/vnd.github.v3+json',
              },
            }, (redirectRes) => {
              let data = '';
              redirectRes.on('data', chunk => data += chunk);
              redirectRes.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
              });
            }).on('error', reject);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  /**
   * Compare semver strings: is `latest` newer than `current`?
   */
  private isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
    const l = parse(latest);
    const c = parse(current);
    for (let i = 0; i < 3; i++) {
      if ((l[i] || 0) > (c[i] || 0)) return true;
      if ((l[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
  }
}

export const updateService = new UpdateService();
