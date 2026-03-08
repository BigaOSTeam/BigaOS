import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { radToDeg } from '../../../utils/angle';

interface HeadingItemProps {
  heading: number;
}

export const HeadingItem: React.FC<HeadingItemProps> = ({ heading }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const getCardinalDirection = (deg: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
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
        {t('dashboard_item.hdg')}
      </div>
      <div style={{
        fontSize: 'clamp(14px, 25cqmin, 120px)',
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataHeading,
        lineHeight: 1,
        marginTop: 'clamp(2px, 1cqmin, 8px)',
      }}>
        {(Math.round(radToDeg(heading)) % 360)}°
      </div>
      <div style={{ fontSize: 'clamp(9px, 9cqmin, 36px)', color: theme.colors.textMuted }}>{getCardinalDirection(radToDeg(heading))}</div>
    </div>
  );
};
