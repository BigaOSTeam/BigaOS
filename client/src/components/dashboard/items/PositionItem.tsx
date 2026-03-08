import React from 'react';
import { GeoPosition } from '../../../types';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface PositionItemProps {
  position: GeoPosition;
}

export const PositionItem: React.FC<PositionItemProps> = ({ position }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const formatCoord = (value: number, isLat: boolean): string => {
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(3);
    return `${deg}°${min}'${dir}`;
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
        {t('dashboard.position')}
      </div>
      <div style={{
        marginTop: 'clamp(4px, 2cqmin, 12px)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 'clamp(10px, 12cqmin, 48px)', color: theme.colors.dataPosition, fontFamily: 'monospace' }}>
          {formatCoord(position.latitude, true)}
        </div>
        <div style={{ fontSize: 'clamp(10px, 12cqmin, 48px)', color: theme.colors.dataPosition, fontFamily: 'monospace', marginTop: 'clamp(2px, 1cqmin, 8px)' }}>
          {formatCoord(position.longitude, false)}
        </div>
      </div>
    </div>
  );
};
