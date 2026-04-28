import React, { useState, useEffect, useCallback } from 'react';
import { ClientProvider } from '../../context/ClientContext';
import { ClientSettingsProvider } from '../../context/ClientSettingsContext';
import { BoatSettingsProvider } from '../../context/BoatSettingsContext';
import { SetupWizard } from './SetupWizard';
import App from '../../App';
import { applyThemeToDOM, StandaloneThemeProvider } from '../../context/ThemeContext';
import { themes } from '../../styles/themes';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';
import { clearStoredServerUrl, isNativeApp } from '../../utils/serverConfig';

// Apply default dark theme before any render. The real theme arrives once
// SettingsContext loads it from the server; until then we paint dark to
// avoid a flash of unstyled content on the loading screen.
applyThemeToDOM(themes.dark, 'dark');

const SERVER_PROBE_TIMEOUT_MS = 5000;

/** Extract client ID from URL path: /c/:clientId */
function getClientIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/c\/([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}

export const ClientGate: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>('Unknown');
  const [clientType, setClientType] = useState<string>('display');
  const [checking, setChecking] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const runProbe = useCallback(async () => {
    setChecking(true);
    setUnreachable(false);

    // Priority 1: client ID from URL path (/c/:clientId) — kiosk install
    // Priority 2: client ID from localStorage (mobile / dev fallback)
    const urlClientId = getClientIdFromUrl();
    const storedId = localStorage.getItem('bigaos-client-id');
    const candidateId = urlClientId || storedId;

    if (!candidateId) {
      setChecking(false);
      return;
    }

    // Validate the client still exists on the server, and pull its name
    // from the authoritative source for display. Hard-bound by a short
    // timeout so the loading screen can't hang forever on a bad URL.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SERVER_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE_URL}/clients/${candidateId}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setClientId(candidateId);
        setClientName(data.client?.name || 'Unknown');
        if (data.client?.clientType) setClientType(data.client.clientType);
        try {
          localStorage.setItem('bigaos-client-id', candidateId);
        } catch { /* read-only filesystem — ignore */ }
      } else if (!urlClientId) {
        // Client was deleted — only clear localStorage if we weren't URL-based
        localStorage.removeItem('bigaos-client-id');
      }
    } catch {
      clearTimeout(timer);
      // Server unreachable. On native (Capacitor) the user is the only one
      // who can recover — they need a button to change the server URL.
      // Pi kiosks have no other server to point at, so just trust the ID
      // and let them stare at the loading state until the server returns.
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
          <App />
        </BoatSettingsProvider>
      </ClientSettingsProvider>
    </ClientProvider>
  );
};
