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
      padding: 'clamp(4px, 4cqmin, 24px)',
      background: isDepthAlarmTriggered ? theme.colors.errorLight : 'transparent',
      animation: isDepthAlarmTriggered ? 'depth-item-pulse 1.5s ease-in-out infinite' : 'none',
    }}>
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'clamp(2px, 1.5cqmin, 8px)',
        width: '100%',
      }}>
        {t('dashboard.depth')}
        {depthAlarm !== null && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={isDepthAlarmTriggered ? theme.colors.error : theme.colors.dataDepth}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 'clamp(8px, 5cqmin, 24px)', height: 'clamp(8px, 5cqmin, 24px)' }}
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
      </div>
      <div style={{
        fontSize: 'clamp(14px, 25cqmin, 120px)',
        fontWeight: theme.fontWeight.bold,
        color: getDepthColor(depth),
        lineHeight: 1,
        marginTop: 'clamp(2px, 1cqmin, 8px)',
      }}>
        {convertedDepth.toFixed(1)}
      </div>
      <div style={{ fontSize: 'clamp(9px, 9cqmin, 36px)', color: theme.colors.textMuted }}>{depthConversions[depthUnit].label}</div>
    </div>
  );
};
