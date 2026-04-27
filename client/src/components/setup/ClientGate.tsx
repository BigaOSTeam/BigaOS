import React, { useState, useEffect } from 'react';
import { ClientProvider } from '../../context/ClientContext';
import { ClientSettingsProvider } from '../../context/ClientSettingsContext';
import { SetupWizard } from './SetupWizard';
import App from '../../App';
import { applyThemeToDOM, StandaloneThemeProvider } from '../../context/ThemeContext';
import { themes, type ThemeMode } from '../../styles/themes';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';

// Apply saved theme immediately before any render (avoids flash)
const savedTheme = (localStorage.getItem('bigaos-theme-mode') || 'dark') as ThemeMode;
applyThemeToDOM(themes[savedTheme] || themes.dark, savedTheme);

/** Extract client ID from URL path: /c/:clientId */
function getClientIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/c\/([a-f0-9-]{36})$/i);
  return match ? match[1] : null;
}

export const ClientGate: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Priority 1: client ID from URL path (/c/:clientId) — works without localStorage
    const urlClientId = getClientIdFromUrl();
    // Priority 2: client ID from localStorage (normal flow)
    const storedId = localStorage.getItem('bigaos-client-id');
    const candidateId = urlClientId || storedId;
    const storedName = localStorage.getItem('bigaos-client-name');

    if (!candidateId) {
      setChecking(false);
      return;
    }

    // Validate the client still exists on the server
    fetch(`${API_BASE_URL}/clients/${candidateId}`)
      .then((res) => {
        if (res.ok) {
          return res.json().then((data) => {
            setClientId(candidateId);
            // Refresh localStorage from server (best-effort for non-readonly systems)
            try {
              const name = data.client?.name || storedName || 'Unknown';
              localStorage.setItem('bigaos-client-id', candidateId);
              localStorage.setItem('bigaos-client-name', name);
              if (data.client?.clientType) {
                localStorage.setItem('bigaos-client-type', data.client.clientType);
              }
            } catch { /* read-only filesystem — ignore */ }
          });
        } else if (!urlClientId) {
          // Client was deleted — only clear localStorage if we weren't URL-based
          localStorage.removeItem('bigaos-client-id');
          localStorage.removeItem('bigaos-client-name');
        }
        // URL client that doesn't exist: fall through to wizard
      })
      .catch(() => {
        // Server unreachable — trust the ID we have and proceed
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
        localStorage.removeItem('bigaos-client-name');
        localStorage.removeItem('bigaos-active-view');
        localStorage.removeItem('bigaos-nav-params');
      } catch { /* read-only */ }
      setClientId(null);
    };

    wsService.on('client_deleted', handleDeleted);
    return () => { wsService.off('client_deleted', handleDeleted); };
  }, [clientId]);

  const handleWizardComplete = (id: string, name: string, clientType: string) => {
    try {
      localStorage.setItem('bigaos-client-id', id);
      localStorage.setItem('bigaos-client-name', name);
      localStorage.setItem('bigaos-client-type', clientType);
    } catch { /* read-only */ }
    setClientId(id);
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
    <ClientProvider clientId={clientId}>
      <ClientSettingsProvider>
        <App />
      </ClientSettingsProvider>
    </ClientProvider>
  );
};
