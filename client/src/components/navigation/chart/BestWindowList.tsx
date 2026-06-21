import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useSettings, windConversions } from '../../../context/SettingsContext';
import { formatETA } from './navigation-utils';
import type { RankedDeparture } from './weather-route.types';

interface BestWindowListProps {
  departures: RankedDeparture[];
  selectedDepartureMs: number;
  onSelect: (departure: RankedDeparture) => void;
  timeFormat24h?: boolean;
}

/** Ranked departure-window options from a best-window scan. */
export const BestWindowList: React.FC<BestWindowListProps> = ({ departures, selectedDepartureMs, onSelect }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { windUnit } = useSettings();
  const windConv = windConversions[windUnit] ?? windConversions['kt'];

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    const day = d.toLocaleDateString(undefined, { weekday: 'short' });
    const hm = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${day} ${hm}`;
  };

  return (
    <div style={{ marginTop: theme.space.sm }}>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: theme.space.xs }}>
        {t('nav.best_windows')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
        {departures.map((d) => {
          const selected = Math.abs(d.departureMs - selectedDepartureMs) < 1000;
          return (
            <button
              key={d.departureMs}
              onClick={() => onSelect(d)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1fr 0.9fr',
                gap: theme.space.xs,
                alignItems: 'center',
                padding: '0.45rem 0.6rem',
                background: selected ? theme.colors.primaryMedium : theme.colors.bgCard,
                color: theme.colors.textPrimary,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: theme.fontSize.xs,
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: theme.fontWeight.medium }}>{fmtTime(d.departureMs)}</span>
              <span>{formatETA(d.durationMs / 3_600_000)}</span>
              <span>{(d.maxWindKn * windConv.factor).toFixed(0)} {windConv.label}</span>
              <span>{Math.round(d.upwindPct * 100)}% ⤒</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
