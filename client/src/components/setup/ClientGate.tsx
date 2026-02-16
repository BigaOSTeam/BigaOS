import React, { useState, useEffect } from 'react';
import { ClientProvider } from '../../context/ClientContext';
import { SetupWizard } from './SetupWizard';
import App from '../../App';
import { applyThemeToDOM, StandaloneThemeProvider } from '../../context/ThemeContext';
import { themes, type ThemeMode } from '../../styles/themes';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';

// Apply saved theme immediately before any render (avoids flash)
const savedTheme = (localStorage.getItem('bigaos-theme-mode') || 'dark') as ThemeMode;
applyThemeToDOM(themes[savedTheme] || themes.dark);

export const ClientGate: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem('bigaos-client-id');
    const storedName = localStorage.getItem('bigaos-client-name');

    if (!storedId) {
      setChecking(false);
      return;
    }

    // Validate the client still exists on the server
    fetch(`${API_BASE_URL}/clients/${storedId}`)
      .then((res) => {
        if (res.ok) {
          return res.json().then((data) => {
            setClientId(storedId);
            // Refresh localStorage with server-side name
            const name = data.client?.name || storedName || 'Unknown';
            localStorage.setItem('bigaos-client-id', storedId);
            localStorage.setItem('bigaos-client-name', name);
          });
        } else {
          // Client was deleted, clear localStorage
          localStorage.removeItem('bigaos-client-id');
          localStorage.removeItem('bigaos-client-name');
        }
      })
      .catch(() => {
        // Server unreachable - trust localStorage and proceed
        setClientId(storedId);
      })
      .finally(() => setChecking(false));
  }, []);

  // Listen for remote deletion of this client
  useEffect(() => {
    if (!clientId) return;

    const handleDeleted = () => {
      localStorage.removeItem('bigaos-client-id');
      localStorage.removeItem('bigaos-client-name');
      localStorage.removeItem('bigaos-active-view');
      localStorage.removeItem('bigaos-nav-params');
      setClientId(null);
    };

    wsService.on('client_deleted', handleDeleted);
    return () => { wsService.off('client_deleted', handleDeleted); };
  }, [clientId]);

  const handleWizardComplete = (id: string, name: string) => {
    const isRemote = new URLSearchParams(window.location.search).has('remote');
    localStorage.setItem('bigaos-client-id', id);
    localStorage.setItem('bigaos-client-name', name);
    localStorage.setItem('bigaos-client-type', isRemote ? 'remote' : 'display');
    setClientId(id);
  };

  if (checking) {
    return (
      <div style={{
        width: '100vw',
        height: '100dvh',
        background: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-primary)',
        fontSize: '1.25rem',
      }}>
        Loading...
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
      <App />
    </ClientProvider>
  );
};
