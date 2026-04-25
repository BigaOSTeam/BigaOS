// Resolve API/WS base URLs.
// In dev, VITE_API_URL / VITE_WS_URL point to localhost:3000, which only works
// when the browser is also on localhost. When accessed from another device (e.g.
// phone on the LAN), fall back to relative URLs so the Vite proxy handles routing.
// In the native APK, there is no server hosting the client — the user picks a
// server URL on first launch (stored in localStorage via serverConfig).

import { getStoredServerUrl, isNativeApp } from './serverConfig';

function isLocalhost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

const browserIsLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

function resolveUrl(envVar: string | undefined, fallback: string): string {
  if (!envVar) return fallback;
  if (isLocalhost(envVar) && !browserIsLocal) return fallback;
  return envVar;
}

function resolveApiBase(): string {
  if (isNativeApp()) {
    const stored = getStoredServerUrl();
    if (stored) return `${stored}/api`;
  }
  return resolveUrl(import.meta.env.VITE_API_URL, '/api');
}

function resolveWsUrl(): string {
  if (isNativeApp()) {
    const stored = getStoredServerUrl();
    if (stored) return stored;
  }
  return resolveUrl(import.meta.env.VITE_WS_URL, '');
}

export const API_BASE_URL = resolveApiBase();
export const WS_URL = resolveWsUrl();
