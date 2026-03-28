import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSwitches } from '../../context/SwitchContext';
import { getSwitchIconSvg } from '../settings/switchIcons';
import { ViewLayout } from './shared';

interface SwitchesViewProps {
  onClose: () => void;
}

export const SwitchesView: React.FC<SwitchesViewProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { switches, toggleSwitch, isClientOnline } = useSwitches();

  return (
    <ViewLayout title={t('switches.title')} onClose={onClose}>
      <div style={{
        padding: theme.space.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.space.sm,
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
      }}>
        {switches.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: theme.space.xl,
            color: theme.colors.textMuted,
          }}>
            {t('switches.no_switches')}
          </div>
        )}

        {switches.map((sw) => {
          const online = isClientOnline(sw.targetClientId);
          const canToggle = online && !sw.locked;

          return (
            <button
              key={sw.id}
              onClick={() => canToggle && toggleSwitch(sw.id)}
              disabled={!canToggle}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.space.md,
                padding: `${theme.space.md} ${theme.space.lg}`,
                background: sw.state
                  ? `${theme.colors.success}15`
                  : theme.colors.bgCard,
                border: `1px solid ${sw.state ? theme.colors.success + '40' : theme.colors.border}`,
                borderRadius: theme.radius.lg,
                color: theme.colors.textPrimary,
                cursor: canToggle ? 'pointer' : 'default',
                opacity: online ? 1 : 0.4,
                transition: 'background 0.2s, border-color 0.2s, opacity 0.2s',
                width: '100%',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  color: online
                    ? sw.state ? theme.colors.success : theme.colors.textMuted
                    : theme.colors.textDisabled,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                dangerouslySetInnerHTML={{
                  __html: getSwitchIconSvg(sw.icon).replace(
                    /width="20" height="20"/,
                    'width="28" height="28"'
                  ),
                }}
              />

              {/* Name + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: theme.fontSize.base,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {sw.name}
                </div>
                <div style={{
                  fontSize: theme.fontSize.sm,
                  color: !online
                    ? theme.colors.textDisabled
                    : sw.state ? theme.colors.success : theme.colors.textMuted,
                  fontWeight: 600,
                  marginTop: 2,
                }}>
                  {!online
                    ? t('switches.offline')
                    : sw.state ? t('switches.state_on') : t('switches.state_off')}
                </div>
              </div>

              {/* Toggle indicator */}
              <div style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: sw.state && online
                  ? theme.colors.success
                  : theme.colors.bgCardActive,
                flexShrink: 0,
                position: 'relative',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: sw.state && online ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </div>

              {/* Locked spinner */}
              {sw.locked && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${theme.colors.bgCard}80`,
                  borderRadius: theme.radius.lg,
                }}>
                  <svg
                    width="24" height="24" viewBox="0 0 24 24"
                    fill="none" stroke={theme.colors.textMuted} strokeWidth="2"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ViewLayout>
  );
};
