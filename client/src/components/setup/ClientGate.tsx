import React, { useState, useEffect, useCallback } from 'react';
import { ClientProvider } from '../../context/ClientContext';
import { ClientSettingsProvider } from '../../context/ClientSettingsContext';
import { BoatSettingsProvider } from '../../context/BoatSettingsContext';
import { TileSourcesProvider } from '../../context/TileSourcesContext';
import { SetupWizard } from './SetupWizard';
import App from '../../App';
import { applyThemeToDOM, StandaloneThemeProvider } from '../../context/ThemeContext';
import { themes, type ThemeMode } from '../../styles/themes';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';
import { clearStoredServerUrl, isNativeApp } from '../../utils/serverConfig';

// Paint the last-used theme before any render. Theme is per-client and arrives
// from the server once ClientSettings load; until then we repaint this screen's
// remembered choice (written to localStorage by ThemeProvider) so a light-themed
// sunlit display doesn't flash dark on every boot. Falls back to dark.
const storedThemeMode = localStorage.getItem('bigaos-theme-mode') as ThemeMode | null;
const bootThemeMode: ThemeMode = storedThemeMode && themes[storedThemeMode] ? storedThemeMode : 'dark';
applyThemeToDOM(themes[bootThemeMode], bootThemeMode);

const SERVER_PROBE_TIMEOUT_MS = 5000;
const HEALTH_POLL_INTERVAL_MS = 1500;
// A booting server gets plenty of time before we degrade; a hung subsystem
// shouldn't leave a display on the starting screen forever.
const STARTING_WAIT_MAX_MS = 180000;
// Consecutive network errors before a web client stops waiting (dev servers,
// transient LAN issues). Native shows the unreachable screen immediately.
const NETWORK_ERROR_GRACE = 8;

// /health lives at the server root, not under /api
const HEALTH_URL = `${API_BASE_URL.replace(/\/api$/, '')}/health`;

/** Extract client ID from URL path: /c/:clientId */
function getClientIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/c\/([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_PROBE_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const ClientGate: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>('Unknown');
  const [clientType, setClientType] = useState<string>('display');
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const runProbe = useCallback(async () => {
    setChecking(true);
    setStarting(false);
    setUnreachable(false);

    // Priority 1: client ID from URL path (/c/:clientId) — kiosk install
    // Priority 2: client ID from localStorage (mobile / dev fallback)
    const urlClientId = getClientIdFromUrl();
    const storedId = localStorage.getItem('bigaos-client-id');
    const candidateId = urlClientId || storedId;

    // ── Phase 1: wait until the server is ready to answer authoritatively.
    // During boot the HTTP server is up long before the database and plugin
    // system (/health reports ready:false, /api answers 503). The client-ID
    // check must not run in that window — a 503 read as "client deleted"
    // would wipe the stored ID and dump a configured display into the wizard.
    const waitStart = Date.now();
    let sawStarting = false;
    let netErrors = 0;
    while (Date.now() - waitStart < STARTING_WAIT_MAX_MS) {
      try {
        const res = await fetchWithTimeout(HEALTH_URL);
        const health = res.ok ? await res.json().catch(() => null) : null;
        if (health && health.ready === false) {
          // Definite "booting" signal — show the starting screen and wait.
          sawStarting = true;
          netErrors = 0;
          setStarting(true);
        } else if (res.ok) {
          break; // ready (or a pre-0.3.0 server without the ready flag)
        } else {
          netErrors++;
        }
      } catch {
        netErrors++;
      }
      if (netErrors > 0 && !sawStarting) {
        // Never saw a booting BigaOS — the server may be genuinely down.
        // Native users need the change-server-URL screen to recover;
        // web falls through to the probe below (old trust-the-ID behavior).
        if (isNativeApp()) {
          setStarting(false);
          setUnreachable(true);
          setChecking(false);
          return;
        }
        if (netErrors >= NETWORK_ERROR_GRACE) break;
      }
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    setStarting(false);

    // ── Phase 2: authoritative client check against the ready server.
    if (!candidateId) {
      setChecking(false); // → setup wizard
      return;
    }

    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/clients/${candidateId}`);
      if (res.ok) {
        const data = await res.json();
        setClientId(candidateId);
        setClientName(data.client?.name || 'Unknown');
        if (data.client?.clientType) setClientType(data.client.clientType);
        try {
          localStorage.setItem('bigaos-client-id', candidateId);
        } catch { /* read-only filesystem — ignore */ }
      } else if (res.status === 404) {
        // Definitive: the server checked its database and this client is
        // gone. Only a 404 may clear the stored ID — and only when the ID
        // didn't come from the kiosk URL.
        if (!urlClientId) {
          localStorage.removeItem('bigaos-client-id');
        }
      } else {
        // Transient failure (5xx, rate limit, …) — never treat as deletion.
        if (isNativeApp()) {
          setUnreachable(true);
        } else {
          setClientId(candidateId);
        }
      }
    } catch {
      // Server unreachable. On native (Capacitor) the user is the only one
      // who can recover — they need a button to change the server URL.
      // Pi kiosks have no other server to point at, so just trust the ID
      // and let the in-app status banners take over once it returns.
      if (isNativeApp()) {
        setUnreachable(true);
      } else {
        setClientId(candidateId);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void runProbe();
  }, [runProbe]);

  // Listen for remote deletion of this client
  useEffect(() => {
    if (!clientId) return;

    const handleDeleted = () => {
      // If running via URL, stay — the kiosk can't navigate away meaningfully.
      // Only reset state when not URL-pinned.
      if (getClientIdFromUrl()) return;
      try {
        localStorage.removeItem('bigaos-client-id');
      } catch { /* read-only */ }
      setClientId(null);
    };

    wsService.on('client_deleted', handleDeleted);
    return () => { wsService.off('client_deleted', handleDeleted); };
  }, [clientId]);

  const handleWizardComplete = (id: string, name: string, type: string) => {
    try {
      localStorage.setItem('bigaos-client-id', id);
    } catch { /* read-only */ }
    setClientId(id);
    setClientName(name);
    setClientType(type);
  };

  const handleChangeServer = () => {
    clearStoredServerUrl();
    window.location.reload();
  };

  if (checking) {
    // Doubles as the boot screen: while the server reports it's still
    // starting (database, plugins), this is all a display shows — the
    // client-ID check and the app only come after the server is ready.
    return (
      <div style={{
        width: '100vw',
        height: '100dvh',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-primary)',
        gap: '24px',
      }}>
        <span style={{ fontSize: '2rem', fontWeight: 700 }}>BigaOS</span>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        {starting && (
          <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)' }}>
            Starting…
          </span>
        )}
      </div>
    );
  }

  if (unreachable) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100dvh',
          background: 'var(--color-bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-primary)',
          gap: '20px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '2rem', fontWeight: 700 }}>BigaOS</span>
        <div style={{ fontSize: '1.1rem', maxWidth: '420px', lineHeight: 1.4 }}>
          Can't reach the server at
          <div
            style={{
              fontFamily: 'monospace',
              marginTop: 8,
              padding: '6px 10px',
              background: 'var(--color-bg-card)',
              borderRadius: 6,
              wordBreak: 'break-all',
              display: 'inline-block',
              maxWidth: '100%',
            }}
          >
            {API_BASE_URL}
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: '420px' }}>
          Check that the boat's server is running and that you're connected
          to it (e.g. via Tailscale).
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => void runProbe()}
            style={{
              padding: '10px 20px',
              fontSize: '1rem',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <button
            onClick={handleChangeServer}
            style={{
              padding: '10px 20px',
              fontSize: '1rem',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Change server URL
          </button>
        </div>
      </div>
    );
  }

  if (!clientId) {
    return (
      <StandaloneThemeProvider>
        <SetupWizard onComplete={handleWizardComplete} />
      </StandaloneThemeProvider>
    );
  }

  return (
    <ClientProvider clientId={clientId} initialClientName={clientName} initialClientType={clientType}>
      <ClientSettingsProvider>
        <BoatSettingsProvider>
          <TileSourcesProvider>
            <App />
          </TileSourcesProvider>
        </BoatSettingsProvider>
      </ClientSettingsProvider>
    </ClientProvider>
  );
};
