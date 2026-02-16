import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { TriggeredAlert, AlertSeverity } from '../../types/alerts';

interface AlertBannerProps {
  alert: TriggeredAlert;
  severity: AlertSeverity;
  onDismiss: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alert,
  severity,
  onDismiss,
}) => {
  const { theme } = useTheme();
  const isCritical = severity === 'critical';

  // Background colors with transparency
  const getBgColor = () => {
    switch (severity) {
      case 'info':
        return 'rgba(52, 152, 219, 0.95)'; // Blue
      case 'warning':
        return 'rgba(243, 156, 18, 0.95)'; // Orange
      case 'critical':
        return 'rgba(231, 76, 60, 0.95)'; // Red
    }
  };

  return (
    <div
      onClick={onDismiss}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.md,
        padding: `${theme.space.md} ${theme.space.lg}`,
        background: getBgColor(),
        borderRadius: '8px',
        boxShadow: theme.shadow.lg,
        cursor: 'pointer',
        animation: isCritical ? 'alertPulse 1s ease-in-out infinite' : 'slideDown 0.3s ease-out',
        transition: `transform ${theme.transition.fast}`,
        minWidth: '240px',
        maxWidth: '440px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {/* Content */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontWeight: theme.fontWeight.medium,
          color: '#fff',
          fontSize: '0.9rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {alert.message}
      </div>

      {/* Dismiss hint */}
      <div
        style={{
          color: theme.colors.textSecondary,
          fontSize: '0.8rem',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    </div>
  );
};
