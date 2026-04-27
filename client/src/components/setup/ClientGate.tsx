import React, { useState, useEffect } from 'react';
import { ClientProvider } from '../../context/ClientContext';
import { ClientSettingsProvider } from '../../context/ClientSettingsContext';
import { BoatSettingsProvider } from '../../context/BoatSettingsContext';
import { SetupWizard } from './SetupWizard';
import App from '../../App';
import { applyThemeToDOM, StandaloneThemeProvider } from '../../context/ThemeContext';
import { themes } from '../../styles/themes';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';

// Apply default dark theme before any render. The real theme arrives once
// SettingsContext loads it from the server; until then we paint dark to
// avoid a flash of unstyled content on the loading screen.
applyThemeToDOM(themes.dark, 'dark');

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

  useEffect(() => {
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
    // from the authoritative source (the clients table) for display.
    fetch(`${API_BASE_URL}/clients/${candidateId}`)
      .then((res) => {
        if (res.ok) {
          return res.json().then((data) => {
            setClientId(candidateId);
            setClientName(data.client?.name || 'Unknown');
            if (data.client?.clientType) setClientType(data.client.clientType);
            // Persist clientId on devices where LS is writable. Pi kiosks use
            // the URL form so the LS write is irrelevant there.
            try {
              localStorage.setItem('bigaos-client-id', candidateId);
            } catch { /* read-only filesystem — ignore */ }
          });
        } else if (!urlClientId) {
          // Client was deleted — only clear localStorage if we weren't URL-based
          localStorage.removeItem('bigaos-client-id');
        }
        // URL client that doesn't exist: fall through to wizard
      })
      .catch(() => {
        // Server unreachable — trust the ID we have and proceed.
        setClientId(candidateId);
      })
      .finally(() => setChecking(false));
  }, []);

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
