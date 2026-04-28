import { App } from '@capacitor/app';
import { isNativeApp } from './serverConfig';
import { API_BASE_URL } from './urls';

export interface ApkInfo {
  available: boolean;
  version: string;
  filename: string;
  size: number;
  modifiedAt: string;
}

export interface ApkUpdateState {
  installedVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  downloadUrl: string;
  size: number;
}

/**
 * Strip a leading `v` so version strings from different sources (git tag,
 * gradle versionName, package.json) can be compared.
 */
function normalize(version: string): string {
  return version.replace(/^v/i, '');
}

/**
 * Compare two semver-shaped strings. Returns true when `latest > installed`.
 * Anything that can't be parsed as a number is treated as 0.
 */
function isNewer(latest: string, installed: string): boolean {
  const parse = (v: string) =>
    normalize(v).split('.').map((n) => parseInt(n, 10) || 0);
  const l = parse(latest);
  const i = parse(installed);
  for (let k = 0; k < 3; k++) {
    if ((l[k] || 0) > (i[k] || 0)) return true;
    if ((l[k] || 0) < (i[k] || 0)) return false;
  }
  return false;
}

/**
 * Check whether a newer APK is available on the server. Resolves to null on
 * web clients or if the check fails — callers should treat both the same.
 */
export async function checkApkUpdate(): Promise<ApkUpdateState | null> {
  if (!isNativeApp()) return null;

  let installedVersion = '';
  try {
    const info = await App.getInfo();
    installedVersion = info.version || '';
  } catch (err) {
    console.warn('[apkUpdate] App.getInfo failed:', err);
    return null;
  }

  let latest: ApkInfo;
  try {
    const res = await fetch(`${API_BASE_URL}/apk/info`);
    if (res.status === 404) return null; // No APK cached yet — nothing to offer.
    if (!res.ok) throw new Error(`status ${res.status}`);
    latest = await res.json();
  } catch (err) {
    console.warn('[apkUpdate] APK info fetch failed:', err);
    return null;
  }

  if (!latest.available || !latest.version) return null;

  return {
    installedVersion,
    latestVersion: latest.version,
    available: isNewer(latest.version, installedVersion),
    downloadUrl: `${API_BASE_URL}/apk/download`,
    size: latest.size,
  };
}

/**
 * Open the APK download URL in the system browser. Capacitor recognises the
 * `_system` target and routes it to the OS's default browser, which then
 * downloads the file and prompts the user to install it (the same sideload
 * flow they used for the original install).
 */
export function openApkDownload(url: string): void {
  window.open(url, '_system');
}
