import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { radToDeg } from '../../../utils/angle';

interface RollItemProps {
  roll: number; // radians
}

const getRollColor = (deg: number): string => {
  const abs = Math.abs(deg);
  if (abs < 5) return '#81C784';
  if (abs < 15) return '#FFB74D';
  return '#EF5350';
};

export const RollItem = React.memo<RollItemProps>(({ roll }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const deg = radToDeg(roll);
  const color = getRollColor(deg);
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
        {t('dashboard_item.roll')}
      </div>

      {/* Boat hull on water - front cross-section */}
      <div style={{ width: 'clamp(60px, 55cqmin, 220px)', height: 'clamp(42px, 36cqmin, 120px)' }}>
        <svg viewBox="0 0 120 65" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Water surface - wavy */}
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30" stroke="#4FC3F7" strokeWidth="1" opacity="0.4" fill="none" />
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30 L140 65 L-20 65 Z" fill="#4FC3F7" opacity="0.08" />

          {/* Boat group - rotates around waterline center */}
          <g transform={`rotate(${deg}, 60, 30) scale(0.9) translate(6.67, 6)`}>
            {/* Hull - simple stern view */}
            <path
              d="M30 12 C30 19 32 30 48 38 Q54 41 55 45 Q55 48 57 48 L63 48 Q65 48 65 45 Q66 41 72 38 C88 30 90 19 90 12 Z"
              fill="#e8e8e8"
              stroke="#888"
              strokeWidth="1.2"
            />
            {/* Transom (spiegel) inset */}
            <path
              d="M40 13 C40 17 42 25 55 31 L60 34 L65 31 C78 25 80 17 80 13 Z"
              fill="#d0d0d0"
              stroke="#bbb"
              strokeWidth="0.6"
            />
          </g>
        </svg>
      </div>

      <div style={{
        fontSize: 'clamp(12px, 20cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color,
        lineHeight: 1,
      }}>
        {Math.abs(deg).toFixed(1)}°
      </div>
    </div>
  );
});
