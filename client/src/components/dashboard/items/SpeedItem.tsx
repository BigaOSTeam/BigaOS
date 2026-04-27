import React from 'react';
import { useSettings, speedConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface SpeedItemProps {
  speed: number; // Speed in knots
}

export const SpeedItem = React.memo<SpeedItemProps>(({ speed }) => {
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
      padding: 'clamp(4px, 4cqmin, 24px)',
    }}>
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {t('dashboard.speed')}
      </div>
      <div style={{
        fontSize: 'clamp(14px, 25cqmin, 120px)',
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataSpeed,
        lineHeight: 1,
        marginTop: 'clamp(2px, 1cqmin, 8px)',
      }}>
        {convertedSpeed.toFixed(1)}
      </div>
      <div style={{ fontSize: 'clamp(9px, 9cqmin, 36px)', color: theme.colors.textMuted }}>
        {speedConversions[speedUnit].label}
      </div>
    </div>
  );
});
