import React from 'react';
import { useSettings, speedConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface SpeedItemProps {
  speed: number; // Speed in knots
}

export const SpeedItem: React.FC<SpeedItemProps> = ({ speed }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { speedUnit, convertSpeed } = useSettings();
  const convertedSpeed = convertSpeed(speed);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: theme.space.lg,
    }}>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {t('dashboard.speed')}
      </div>
      <div style={{
        fontSize: theme.fontSize['3xl'],
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataSpeed,
        lineHeight: 1,
        marginTop: theme.space.xs,
      }}>
        {convertedSpeed.toFixed(1)}
      </div>
      <div style={{ fontSize: theme.fontSize.md, color: theme.colors.textMuted }}>
        {speedConversions[speedUnit].label}
      </div>
    </div>
  );
};
