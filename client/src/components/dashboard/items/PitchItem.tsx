import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { radToDeg } from '../../../utils/angle';

interface PitchItemProps {
  pitch: number; // radians
}

const getPitchColor = (deg: number): string => {
  const abs = Math.abs(deg);
  if (abs < 5) return '#81C784';
  if (abs < 15) return '#FFB74D';
  return '#EF5350';
};

export const PitchItem: React.FC<PitchItemProps> = ({ pitch }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const deg = radToDeg(pitch);
  const color = getPitchColor(deg);
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
        {t('dashboard_item.pitch')}
      </div>

      {/* Boat hull on water - side profile */}
      <div style={{ width: 'clamp(60px, 55cqmin, 220px)', height: 'clamp(42px, 36cqmin, 120px)' }}>
        <svg viewBox="0 0 120 65" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Water surface - wavy */}
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30" stroke="#4FC3F7" strokeWidth="1" opacity="0.4" fill="none" />
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30 L140 65 L-20 65 Z" fill="#4FC3F7" opacity="0.08" />

          {/* Boat group - rotates around waterline center */}
          <g transform={`rotate(${-deg}, 60, 30)`}>
            {/* Rudder - rendered first so hull covers overlap */}
            <path
              d="M100 28 L104 42 L111 42 L108 28"
              fill="#d0d0d0"
              stroke="#bbb"
              strokeWidth="0.5"
            />
            {/* Keel */}
            <path
              d="M50 38 L56 48 L70 48 L68 38"
              fill="#d0d0d0"
              stroke="#bbb"
              strokeWidth="0.5"
            />
            {/* Hull - side profile, bow on left */}
            <path
              d="M6 18 Q8 36 25 38 L85 38 Q112 36 112 24 L112 18 L85 18 L85 10 L48 10 L42 18 Z"
              fill="#e8e8e8"
              stroke="#ccc"
              strokeWidth="1"
            />
            {/* Cabin windows */}
            <rect x="52" y="12" width="6" height="4" rx="1" fill="#8bb8d0" opacity="0.6" />
            <rect x="62" y="12" width="6" height="4" rx="1" fill="#8bb8d0" opacity="0.6" />
            <rect x="72" y="12" width="6" height="4" rx="1" fill="#8bb8d0" opacity="0.6" />
            {/* Deck line */}
            <line x1="6" y1="18" x2="42" y2="18" stroke="#ccc" strokeWidth="0.5" />
            <line x1="85" y1="18" x2="112" y2="18" stroke="#ccc" strokeWidth="0.5" />
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
};
