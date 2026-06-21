import React, { useMemo } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useSettings, speedConversions, windConversions, distanceConversions } from '../../../context/SettingsContext';
import { SButton } from '../../ui/SettingsUI';
import { radToDeg } from '../../../utils/angle';
import { interpolateTimeline, timelineDistanceRemainingNm, formatETA } from './navigation-utils';
import { BestWindowList } from './BestWindowList';
import type { WeatherRouteResult, RankedDeparture, PointOfSail } from './weather-route.types';

interface RoutePreviewPanelProps {
  result: WeatherRouteResult;
  scrubMs: number;
  onScrub: (ms: number) => void;
  onStartNavigation: () => void;
  onAdjust: () => void;
  onCancel: () => void;
  onSelectDeparture: (d: RankedDeparture) => void;
  sidebarWidth: number;
  sidebarPosition: 'left' | 'right';
}

const POS_KEY: Record<PointOfSail, string> = {
  'no-go': 'nav.pos_no_go',
  'close-hauled': 'nav.pos_close_hauled',
  'close-reach': 'nav.pos_close_reach',
  'beam-reach': 'nav.pos_beam_reach',
  'broad-reach': 'nav.pos_broad_reach',
  run: 'nav.pos_run',
  motoring: 'nav.motoring',
};

const WARNING_KEY: Record<string, string> = {
  GEOMETRY_FALLBACK: 'nav.warn_geometry_fallback',
  PARTIAL_COVERAGE: 'nav.warn_partial_coverage',
  NO_COVERAGE: 'nav.warn_no_coverage',
  WINDOW_BEYOND_FORECAST: 'nav.warn_beyond_forecast',
  GALE: 'nav.warn_gale',
  STRONG_WIND: 'nav.warn_strong_wind',
  VERY_HIGH_SEAS: 'nav.warn_very_high_seas',
  HIGH_SEAS: 'nav.warn_high_seas',
  MOSTLY_MOTORING: 'nav.warn_mostly_motoring',
};

export const RoutePreviewPanel: React.FC<RoutePreviewPanelProps> = ({
  result,
  scrubMs,
  onScrub,
  onStartNavigation,
  onAdjust,
  onCancel,
  onSelectDeparture,
  sidebarWidth,
  sidebarPosition,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { speedUnit, windUnit, distanceUnit } = useSettings();

  const spdConv = speedConversions[speedUnit] ?? speedConversions['kt'];
  const windConv = windConversions[windUnit] ?? windConversions['kt'];
  const distConv = distanceConversions[distanceUnit] ?? distanceConversions['nm'];

  const { timeline, weather } = result;
  const departureMs = weather.departureMs;
  const totalH = weather.totalDurationMs / 3_600_000;
  const arrivalMs = departureMs + weather.totalDurationMs;

  const interp = useMemo(() => interpolateTimeline(timeline, scrubMs), [timeline, scrubMs]);
  const step = interp?.step;
  const distRemainNm = useMemo(
    () => (interp ? timelineDistanceRemainingNm(timeline, interp) : 0),
    [timeline, interp]
  );
  const remainingH = Math.max(0, (arrivalMs - scrubMs) / 3_600_000);

  // Warning ticks: timeline points exceeding wind/wave thresholds.
  const ticks = useMemo(() => {
    if (timeline.length < 2 || totalH <= 0) return [];
    return timeline
      .map((s) => ({ frac: (s.etaMs - departureMs) / (totalH * 3_600_000), danger: s.twsKn >= 25 || s.waveHM >= 2.5 }))
      .filter((x) => x.danger && x.frac >= 0 && x.frac <= 1);
  }, [timeline, departureMs, totalH]);

  const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const scrubH = Math.max(0, Math.min(totalH, (scrubMs - departureMs) / 3_600_000));

  const tel = (label: string, value: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '0.65rem', color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );

  const posLabel = step ? t(POS_KEY[step.pointOfSail] || 'nav.pos_beam_reach') : '—';
  const tackLabel = step && !step.motoring ? (step.tack === 'port' ? t('nav.tack_port') : t('nav.tack_starboard')) : '';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12px',
        left: sidebarPosition === 'left' ? `${sidebarWidth + 12}px` : '12px',
        right: sidebarPosition === 'right' ? `${sidebarWidth + 12}px` : '12px',
        maxWidth: '720px',
        margin: '0 auto',
        background: 'rgba(28, 28, 30, 0.96)',
        borderRadius: '12px',
        padding: '0.8rem 1rem',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
        border: `1px solid ${theme.colors.border}`,
        color: theme.colors.textPrimary,
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <span style={{ fontWeight: theme.fontWeight.bold }}>{t('nav.preview_title')}</span>
        <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
          {fmtClock(scrubMs)} · {t('nav.eta')} {fmtClock(arrivalMs)} ({formatETA(totalH)})
        </span>
      </div>

      {/* Time slider */}
      <input
        type="range"
        min={0}
        max={Math.max(0.1, totalH)}
        step={Math.max(0.05, totalH / 200)}
        value={scrubH}
        onChange={(e) => onScrub(departureMs + parseFloat(e.target.value) * 3_600_000)}
        style={{ width: '100%', accentColor: '#26c6da', cursor: 'pointer' }}
      />
      {ticks.length > 0 && (
        <div style={{ position: 'relative', height: '10px', marginTop: '-4px', marginBottom: '2px' }}>
          {ticks.map((tk, i) => (
            <span
              key={i}
              title={t('nav.warn_strong_wind')}
              style={{ position: 'absolute', left: `${tk.frac * 100}%`, transform: 'translateX(-50%)', color: '#ff9800', fontSize: '0.7rem' }}
            >
              ▲
            </span>
          ))}
        </div>
      )}

      {/* Telemetry */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.5rem',
        }}
      >
        {tel(t('nav.boat_speed'), step ? `${(step.speedKn * spdConv.factor).toFixed(1)} ${spdConv.label}` : '—')}
        {tel(t('nav.point_of_sail'), step?.motoring ? t('nav.motoring') : `${posLabel}${tackLabel ? ` · ${tackLabel}` : ''}`)}
        {tel(t('nav.tws'), step ? `${(step.twsKn * windConv.factor).toFixed(0)} ${windConv.label}` : '—')}
        {tel(t('nav.twd'), step ? `${Math.round(radToDeg(step.twdRad))}°` : '—')}
        {tel(t('nav.wave_height'), step && step.waveHM > 0 ? `${step.waveHM.toFixed(1)} m` : '—')}
        {tel(t('nav.distance_remaining'), `${(distRemainNm * distConv.factor).toFixed(1)} ${distConv.label}`)}
        {tel(t('nav.eta'), formatETA(remainingH))}
      </div>

      {/* Warnings */}
      {weather.warnings.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.5rem' }}>
          {weather.warnings.map((w) => (
            <span
              key={w}
              style={{
                fontSize: '0.65rem',
                padding: '2px 7px',
                borderRadius: '10px',
                background: theme.colors.warningLight ?? 'rgba(255,152,0,0.2)',
                color: theme.colors.warning ?? '#ff9800',
              }}
            >
              {t(WARNING_KEY[w] || 'nav.warn_generic')}
            </span>
          ))}
        </div>
      )}

      {/* Best-window list */}
      {result.departures && result.departures.length > 1 && (
        <BestWindowList departures={result.departures} selectedDepartureMs={departureMs} onSelect={onSelectDeparture} />
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: theme.space.sm, justifyContent: 'flex-end', marginTop: '0.7rem' }}>
        <SButton variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </SButton>
        <SButton variant="secondary" onClick={onAdjust}>
          {t('nav.adjust')}
        </SButton>
        <SButton variant="primary" onClick={onStartNavigation}>
          {t('nav.start_navigation')}
        </SButton>
      </div>
    </div>
  );
};
