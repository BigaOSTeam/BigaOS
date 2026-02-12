import React from 'react';
import { theme } from '../../../styles/theme';
import { useLanguage } from '../../../i18n/LanguageContext';
import { radToDeg } from '../../../utils/angle';

interface HeadingItemProps {
  heading: number;
}

export const HeadingItem: React.FC<HeadingItemProps> = ({ heading }) => {
  const { t } = useLanguage();
  const getCardinalDirection = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

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
        {t('dashboard_item.hdg')}
      </div>
      <div style={{
        fontSize: theme.fontSize['3xl'],
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataHeading,
        lineHeight: 1,
        marginTop: theme.space.xs,
      }}>
        {radToDeg(heading).toFixed(0)}°
      </div>
      <div style={{ fontSize: theme.fontSize.md, color: theme.colors.textMuted }}>{getCardinalDirection(radToDeg(heading))}</div>
    </div>
  );
};
