import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface BatteryItemProps {
  voltage: number;
  temperature: number;
  stateOfCharge: number;
  timeRemaining: number;
}

const formatTimeRemaining = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const BatteryItem = React.memo<BatteryItemProps>(({
  voltage,
  temperature,
  stateOfCharge,
  timeRemaining,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 'clamp(4px, 4cqmin, 24px)',
      gap: 'clamp(1px, 1cqmin, 6px)',
    }}>
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {t('dashboard_item.battery')}
      </div>
      <div style={{
        fontSize: 'clamp(12px, 20cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataBattery,
        lineHeight: 1,
      }}>
        {stateOfCharge.toFixed(0)}%
      </div>
      <div style={{
        display: 'flex',
        gap: 'clamp(4px, 3cqmin, 16px)',
        fontSize: 'clamp(9px, 9cqmin, 36px)',
        color: theme.colors.textMuted,
      }}>
        <span style={{ color: theme.colors.dataWind }}>{voltage.toFixed(1)}V</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span style={{ color: theme.colors.dataHeading }}>{formatTimeRemaining(timeRemaining)}</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span style={{ color: '#ff7043' }}>{temperature < -200 ? '--' : `${temperature.toFixed(0)}°C`}</span>
      </div>
    </div>
  );
});
