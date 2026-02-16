import React from 'react';
import { useSettings, depthConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface DepthItemProps {
  depth: number;
}

export const DepthItem: React.FC<DepthItemProps> = ({ depth }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { depthUnit, depthAlarm, isDepthAlarmTriggered, convertDepth } = useSettings();

  const convertedDepth = convertDepth(depth);

  const getDepthColor = (d: number): string => {
    if (isDepthAlarmTriggered) return theme.colors.error;
    if (d < 3) return theme.colors.error;
    if (d < 5) return theme.colors.warning;
    return theme.colors.dataDepth;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: theme.space.lg,
      background: isDepthAlarmTriggered ? theme.colors.errorLight : 'transparent',
      transition: `background ${theme.transition.slow}`,
    }}>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}>
        {t('dashboard.depth')}
        {depthAlarm !== null && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDepthAlarmTriggered ? theme.colors.error : theme.colors.dataDepth} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
      </div>
      <div style={{
        fontSize: theme.fontSize['3xl'],
        fontWeight: theme.fontWeight.bold,
        color: getDepthColor(depth),
        lineHeight: 1,
        marginTop: theme.space.xs,
        animation: isDepthAlarmTriggered ? 'pulse 1s infinite' : 'none',
      }}>
        {convertedDepth.toFixed(1)}
      </div>
      <div style={{ fontSize: theme.fontSize.md, color: theme.colors.textMuted }}>{depthConversions[depthUnit].label}</div>
    </div>
  );
};
