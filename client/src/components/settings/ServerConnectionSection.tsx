import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { SButton, SLabel } from '../ui/SettingsUI';
import {
  clearStoredServerUrl,
  getStoredServerUrl,
  isNativeApp,
} from '../../utils/serverConfig';

/**
 * Settings entry for the BigaOS server URL stored on this device.
 * Only renders when running as the native APK (Capacitor) — on the web client,
 * the server URL is determined by the page origin and isn't user-configurable.
 */
export const ServerConnectionSection: React.FC = () => {
  const { theme } = useTheme();

  if (!isNativeApp()) return null;

  const stored = getStoredServerUrl();

  const handleChange = () => {
    clearStoredServerUrl();
    window.location.reload();
  };

  return (
    <div style={{ marginBottom: theme.space.xl }}>
      <SLabel>Server connection</SLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: '0.5rem 0.75rem',
          minHeight: '42px',
          background: theme.colors.bgCard,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          marginBottom: theme.space.sm,
        }}
      >
        <ConnectedIcon color={stored ? theme.colors.success : theme.colors.textMuted} />
        <span
          style={{
            flex: 1,
            fontSize: theme.fontSize.md,
            color: theme.colors.textPrimary,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          {stored ?? 'Not connected'}
        </span>
      </div>
      <SButton variant="outline" fullWidth onClick={handleChange}>
        Change server URL
      </SButton>
    </div>
  );
};

const ConnectedIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </svg>
);
