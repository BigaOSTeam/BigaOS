import React, { useState } from 'react';
import {
  buildServerUrl,
  parseConnectionString,
  setStoredServerUrl,
  ServerParts,
} from '../../utils/serverConfig';
import { QRScanner } from './QRScanner';

const DEFAULT_PORT = '3000';

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting'; url: string }
  | { kind: 'connected'; url: string }
  | { kind: 'error'; message: string; url: string };

export const ServerUrlSetup: React.FC = () => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [scannerOpen, setScannerOpen] = useState(false);

  const canConnect =
    host.trim().length > 0 && status.kind !== 'connecting' && status.kind !== 'connected';

  const applyParts = (parts: ServerParts) => {
    setHost(parts.host);
    setPort(String(parts.port));
    setProtocol(parts.protocol);
    setStatus({ kind: 'idle' });
  };

  const handleScan = (text: string) => {
    setScannerOpen(false);
    const parts = parseConnectionString(text);
    if (!parts) {
      setStatus({ kind: 'error', url: '', message: `Could not read QR code content: "${text}"` });
      return;
    }
    applyParts(parts);
    void handleConnect(parts);
  };

  const currentParts = (): ServerParts => ({
    host: host.trim(),
    port: Number(port) > 0 ? Number(port) : 3000,
    protocol,
  });

  const handleConnect = async (override?: ServerParts) => {
    const parts = override ?? currentParts();
    if (!parts.host) return;
    const url = buildServerUrl(parts);
    setStatus({ kind: 'connecting', url });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${url}/api/clients`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        setStatus({
          kind: 'error',
          url,
          message: `Server responded with HTTP ${res.status}. Check that BigaOS is running at this address.`,
        });
        return;
      }
      // Server reachable — save URL and continue. Show success state briefly so the
      // reload-flash doesn't look like a blank page.
      setStoredServerUrl(url);
      setStatus({ kind: 'connected', url });
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const hint = isAbort
        ? 'Timed out after 5s. The server may be off, or a firewall on the server PC / router is blocking the connection.'
        : `Could not reach ${url}: ${msg}`;
      setStatus({ kind: 'error', url, message: hint });
    }
  };

  if (scannerOpen) {
    return <QRScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />;
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={titleStyle}>BigaOS</div>
        <div style={subtitleStyle}>Connect to your BigaOS server</div>

        <button style={qrCardStyle} onClick={() => setScannerOpen(true)}>
          <QrIcon />
          <div style={qrCardTextStyle}>
            <div style={qrCardTitleStyle}>Scan QR code</div>
            <div style={qrCardSubtitleStyle}>Fastest way to connect</div>
          </div>
          <ChevronIcon />
        </button>

        <div style={dividerRowStyle}>
          <div style={dividerLineStyle} />
          <div style={dividerLabelStyle}>or enter manually</div>
          <div style={dividerLineStyle} />
        </div>

        <label style={labelStyle}>Host or IP address</label>
        <input
          style={inputStyle}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="192.168.1.50"
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            if (status.kind !== 'idle' && status.kind !== 'connecting' && status.kind !== 'connected') setStatus({ kind: 'idle' });
          }}
        />

        <div style={rowStyle}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Port</label>
            <input
              style={inputStyle}
              type="number"
              inputMode="numeric"
              placeholder="3000"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div style={{ width: '120px' }}>
            <label style={labelStyle}>Protocol</label>
            <select
              style={inputStyle}
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'http' | 'https')}
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>
          </div>
        </div>

        {status.kind === 'connecting' && (
          <div style={infoBoxStyle}>
            <Spinner />
            <div>
              <div style={{ fontWeight: 500 }}>Testing connection…</div>
              <div style={infoBoxSubtextStyle}>{status.url}</div>
            </div>
          </div>
        )}

        {status.kind === 'connected' && (
          <div style={successBoxStyle}>
            <CheckIcon />
            <div>
              <div style={{ fontWeight: 500 }}>Connected — opening BigaOS…</div>
              <div style={infoBoxSubtextStyle}>{status.url}</div>
            </div>
          </div>
        )}

        {status.kind === 'error' && (
          <div style={errorStyle}>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>Could not connect</div>
            <div>{status.message}</div>
            <button
              style={resetButtonStyle}
              onClick={() => {
                setHost('');
                setPort(DEFAULT_PORT);
                setProtocol('http');
                setStatus({ kind: 'idle' });
              }}
            >
              Start over
            </button>
          </div>
        )}

        <button
          style={{ ...connectButtonStyle, opacity: canConnect ? 1 : 0.5 }}
          onClick={() => handleConnect()}
          disabled={!canConnect}
        >
          {status.kind === 'connecting' ? 'Testing…' : status.kind === 'connected' ? 'Connected ✓' : 'Connect'}
        </button>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  width: '100vw',
  minHeight: '100dvh',
  background: '#0a1929',
  color: '#e0e0e0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  padding: '28px 24px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.75rem',
  fontWeight: 700,
  marginBottom: '4px',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'rgba(255, 255, 255, 0.6)',
  marginBottom: '20px',
};

const qrCardStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px 18px',
  background: 'rgba(255, 255, 255, 0.06)',
  color: '#e0e0e0',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '10px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  textAlign: 'left',
  fontFamily: 'inherit',
};

const qrCardTextStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const qrCardTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  color: '#e0e0e0',
};

const qrCardSubtitleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'rgba(255, 255, 255, 0.55)',
};

const infoBoxStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px 14px',
  background: 'rgba(79, 195, 247, 0.1)',
  border: '1px solid rgba(79, 195, 247, 0.3)',
  borderRadius: '8px',
  color: '#4fc3f7',
  fontSize: '0.9rem',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const successBoxStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '12px 14px',
  background: 'rgba(102, 187, 106, 0.12)',
  border: '1px solid rgba(102, 187, 106, 0.4)',
  borderRadius: '8px',
  color: '#66bb6a',
  fontSize: '0.9rem',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const infoBoxSubtextStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  opacity: 0.75,
  marginTop: '2px',
  fontFamily: 'monospace',
};

const Spinner: React.FC = () => (
  <div style={{
    width: '20px',
    height: '20px',
    flexShrink: 0,
    border: '2.5px solid rgba(79, 195, 247, 0.25)',
    borderTopColor: '#4fc3f7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  }} />
);

const CheckIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const QrIcon: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="3" width="6" height="6" rx="1" />
    <rect x="3" y="15" width="6" height="6" rx="1" />
    <path d="M5 5h2v2H5zM17 5h2v2h-2zM5 17h2v2H5z" fill="#4fc3f7" stroke="none" />
    <path d="M13 13h2v2h-2zM17 13h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2zM15 19h2v2h-2zM19 15h2v2h-2z" fill="#4fc3f7" stroke="none" />
  </svg>
);

const ChevronIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const dividerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '20px 0 16px',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: '1px',
  background: 'rgba(255, 255, 255, 0.1)',
};

const dividerLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'rgba(255, 255, 255, 0.5)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 500,
  marginBottom: '6px',
  color: 'rgba(255, 255, 255, 0.7)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '6px',
  color: '#e0e0e0',
  fontSize: '1rem',
  padding: '10px 12px',
  boxSizing: 'border-box',
  outline: 'none',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '12px',
};

const errorStyle: React.CSSProperties = {
  marginTop: '12px',
  padding: '10px 12px',
  background: 'rgba(239, 83, 80, 0.15)',
  border: '1px solid rgba(239, 83, 80, 0.4)',
  borderRadius: '6px',
  color: '#ef5350',
  fontSize: '0.85rem',
};

const resetButtonStyle: React.CSSProperties = {
  marginTop: '10px',
  padding: '6px 12px',
  background: 'transparent',
  color: '#ef5350',
  border: '1px solid rgba(239, 83, 80, 0.5)',
  borderRadius: '4px',
  fontSize: '0.8rem',
  cursor: 'pointer',
};

const connectButtonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '20px',
  padding: '12px 16px',
  background: '#1976d2',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '1rem',
  fontWeight: 500,
  cursor: 'pointer',
};
