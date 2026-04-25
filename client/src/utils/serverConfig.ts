const STORAGE_KEY = 'bigaos-server-url';

export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export function getStoredServerUrl(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeServerUrl(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, normalizeServerUrl(url));
}

export function clearStoredServerUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* read-only */ }
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export interface ServerParts {
  host: string;
  port: number;
  protocol: 'http' | 'https';
}

export function buildServerUrl(parts: ServerParts): string {
  const { host, port, protocol } = parts;
  const defaultPort = protocol === 'https' ? 443 : 80;
  if (port === defaultPort) return `${protocol}://${host}`;
  return `${protocol}://${host}:${port}`;
}

/**
 * Parse a connection string (from QR scan or paste). Accepts:
 * - Full URL: `http://192.168.1.50:3000` or `https://example.com`
 * - host[:port] form: `192.168.1.50:3000` or `bigaos.local`
 * - JSON: `{"host":"...","port":3000,"protocol":"http"}`
 * Returns null on invalid input.
 */
export function parseConnectionString(input: string): ServerParts | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj.host === 'string') {
        return {
          host: obj.host,
          port: Number(obj.port) > 0 ? Number(obj.port) : 3000,
          protocol: obj.protocol === 'https' ? 'https' : 'http',
        };
      }
    } catch { /* fall through */ }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const protocol = u.protocol === 'https:' ? 'https' : 'http';
      const defaultPort = protocol === 'https' ? 443 : 3000;
      const port = u.port ? Number(u.port) : defaultPort;
      return { host: u.hostname, port, protocol };
    } catch { return null; }
  }

  try {
    const u = new URL(`http://${trimmed}`);
    if (!u.hostname) return null;
    const port = u.port ? Number(u.port) : 3000;
    return { host: u.hostname, port, protocol: 'http' };
  } catch {
    return null;
  }
}
