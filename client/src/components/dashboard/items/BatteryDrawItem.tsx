import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface BatteryDrawItemProps {
  current: number;
  power: number;
  temperature: number;
  timeRemaining: number;
}

const formatTimeRemaining = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 99) return `${h}h`;
  return `${h}:${m.toString().padStart(2, '0')}`;
};

export const BatteryDrawItem: React.FC<BatteryDrawItemProps> = ({
  current,
  power,
  temperature,
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
        {t('dashboard_item.battery_draw')}
      </div>
      <div style={{
        fontSize: 'clamp(12px, 20cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataSpeed,
        lineHeight: 1,
      }}>
        {Math.abs(current) < 0.05 ? '' : current > 0 ? '+' : ''}{Math.abs(current) < 0.05 ? '0.0' : current.toFixed(1)}A
      </div>
      <div style={{
        display: 'flex',
        gap: 'clamp(4px, 3cqmin, 16px)',
        fontSize: 'clamp(9px, 9cqmin, 36px)',
        color: theme.colors.textMuted,
      }}>
        <span style={{ color: theme.colors.dataWind }}>{Math.abs(power).toFixed(0)}W</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span style={{ color: theme.colors.dataHeading }}>{formatTimeRemaining(timeRemaining)}</span>
        <span style={{ opacity: 0.4 }}>|</span>
        <span style={{ color: '#ff7043' }}>{temperature < -200 ? '--' : `${temperature.toFixed(0)}°C`}</span>
      </div>
    </div>
  );
};
