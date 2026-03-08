import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface BatteryItemProps {
  voltage: number;
  stateOfCharge: number;
}

export const BatteryItem: React.FC<BatteryItemProps> = ({ voltage, stateOfCharge }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const getBatteryColor = (soc: number): string => {
    if (soc < 20) return theme.colors.error;
    if (soc < 50) return theme.colors.warning;
    return theme.colors.success;
  };

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
        {t('dashboard_item.battery')}
      </div>
      <div style={{
        fontSize: 'clamp(12px, 20cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color: getBatteryColor(stateOfCharge),
        lineHeight: 1,
        marginTop: 'clamp(2px, 1cqmin, 8px)',
      }}>
        {stateOfCharge.toFixed(0)}%
      </div>
      <div style={{ fontSize: 'clamp(9px, 9cqmin, 36px)', color: theme.colors.textMuted }}>{voltage.toFixed(1)}V</div>
    </div>
  );
};
