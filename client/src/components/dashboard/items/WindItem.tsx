import React from 'react';
import { useSettings, windConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface WindItemProps {
  speedApparent: number; // Speed in knots
  angleApparent: number;
}

export const WindItem: React.FC<WindItemProps> = ({ speedApparent, angleApparent }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { windUnit, convertWind } = useSettings();
  const convertedSpeed = convertWind(speedApparent);

  const getWindDirection = (angle: number): string => {
    if (angle < 45 || angle > 315) return t('dashboard_item.head');
    if (angle >= 45 && angle <= 135) return t('dashboard_item.stbd');
    if (angle > 135 && angle < 225) return t('dashboard_item.stern');
    return t('dashboard_item.port');
  };

  // For Beaufort, show as integer; for others show one decimal
  const displayValue = windUnit === 'bft'
    ? convertedSpeed.toFixed(0)
    : convertedSpeed.toFixed(1);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: theme.space.lg,
      position: 'relative',
    }}>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {t('dashboard.wind')}
      </div>
      <div style={{
        fontSize: theme.fontSize['2xl'],
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataWind,
        lineHeight: 1,
        marginTop: theme.space.xs,
      }}>
        {displayValue}
      </div>
      <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
        {windConversions[windUnit].label} {t('dashboard_item.awa')}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        marginTop: theme.space.sm,
      }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style={{
            transform: `rotate(${angleApparent}deg)`,
            transition: `transform ${theme.transition.slow}`,
          }}
        >
          <path
            d="M12 2L8 12h3v10l5-14h-3L12 2z"
            fill={theme.colors.dataWind}
          />
        </svg>
        <span style={{ fontSize: theme.fontSize.md, color: theme.colors.dataWind }}>
          {angleApparent.toFixed(0)}° {getWindDirection(angleApparent)}
        </span>
      </div>
    </div>
  );
};
