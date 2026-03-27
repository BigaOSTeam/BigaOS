import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useSwitches } from '../../../context/SwitchContext';
import { getSwitchIconSvg } from '../../settings/switchIcons';

interface SwitchItemProps {
  switchId?: string;
  activeColor?: string;
}

export const SwitchItem: React.FC<SwitchItemProps> = ({ switchId, activeColor }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { getSwitchById, isClientOnline } = useSwitches();

  const sw = switchId ? getSwitchById(switchId) : undefined;
  const offline = sw ? !isClientOnline(sw.targetClientId) : false;

  if (!sw) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09" />
        </svg>
        <span style={{
          fontSize: '10px',
          color: theme.colors.textMuted,
          textAlign: 'center',
          opacity: 0.7,
        }}>
          {t('switches.configure')}
        </span>
      </div>
    );
  }

  const color = offline ? theme.colors.textMuted : sw.state ? (activeColor || theme.colors.success) : theme.colors.textMuted;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4cqmin',
      padding: '8cqmin',
      position: 'relative',
      background: offline ? 'transparent' : sw.state
        ? `${activeColor || theme.colors.success}15`
        : 'transparent',
      opacity: offline ? 0.4 : 1,
      transition: 'background 0.2s ease, opacity 0.2s ease',
      borderRadius: 'inherit',
    }}>
      {/* Icon */}
      <div
        style={{
          color,
          transition: 'color 0.2s ease, opacity 0.2s ease',
          opacity: sw.locked ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        dangerouslySetInnerHTML={{
          __html: getSwitchIconSvg(sw.icon).replace(
            /width="20" height="20"/,
            'width="28cqmin" height="28cqmin"'
          ),
        }}
      />

      {/* Name */}
      <span style={{
        fontSize: '10cqmin',
        fontWeight: 600,
        color: sw.state ? theme.colors.textPrimary : theme.colors.textMuted,
        textAlign: 'center',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '90%',
        transition: 'color 0.2s ease',
      }}>
        {sw.name}
      </span>

      {/* State label */}
      <span style={{
        fontSize: '7cqmin',
        fontWeight: 700,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        transition: 'color 0.2s ease',
      }}>
        {offline ? t('switches.offline') : sw.state ? t('switches.state_on') : t('switches.state_off')}
      </span>

      {/* Locked overlay with spinner */}
      {sw.locked && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${theme.colors.bgCard}80`,
          borderRadius: 'inherit',
        }}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.colors.textMuted}
            strokeWidth="2"
            style={{ animation: 'spin 1s linear infinite' }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      )}
    </div>
  );
};
