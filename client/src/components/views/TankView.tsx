import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTanks } from '../../context/TankContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import {
  ViewLayout,
  StatsRow,
  ChartContainer,
} from './shared';
import { fluidColor, fluidLabelKey, tankWarnDirection, FluidType } from '../../types/tanks';

interface TankViewProps {
  tankId?: string;
  onClose: () => void;
}

type TimeframeOption = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h':  { label: '1h',  ms: 60 * 60 * 1000, minutes: 60 },
  '6h':  { label: '6h',  ms: 6 * 60 * 60 * 1000, minutes: 360 },
  '24h': { label: '24h', ms: 24 * 60 * 60 * 1000, minutes: 1440 },
  '7d':  { label: '7d',  ms: 7 * 24 * 60 * 60 * 1000, minutes: 10080 },
  '30d': { label: '30d', ms: 30 * 24 * 60 * 60 * 1000, minutes: 43200 },
};

export const TankView: React.FC<TankViewProps> = ({ tankId, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tanks, readings } = useTanks();

  const tank = (tankId && tanks.find(x => x.id === tankId)) || tanks[0] || null;
  const reading = tank ? readings[tank.id] : null;

  const [timeframe, setTimeframe] = useState<TimeframeOption>('1h');
  const [history, setHistory] = useState<TimeSeriesDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!tank) return;
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'tanks',
        `${tank.id}_level`,
        TIMEFRAMES[timeframe].minutes,
      );
      const data = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: item.value,
      }));
      setHistory(data);
    } catch (err) {
      console.error('Failed to fetch tank history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tank, timeframe]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => {
    const id = setInterval(fetchHistory, 10000);
    return () => clearInterval(id);
  }, [fetchHistory]);

  const stats = useMemo(() => {
    if (history.length === 0) return { avg: 0, max: 0, min: 0 };
    const values = history.map(p => p.value);
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
    };
  }, [history]);

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    key => ({ key, label: TIMEFRAMES[key].label })
  );

  if (!tank) {
    return (
      <ViewLayout title={t('tanks.detail_title_fallback')} onClose={onClose}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.colors.textMuted,
          padding: '2rem',
          textAlign: 'center',
        }}>
          {t('tanks.widget_no_tank')}
        </div>
      </ViewLayout>
    );
  }

  const accent = fluidColor(tank.fluidType as FluidType);
  const direction = tankWarnDirection(tank.fluidType as FluidType);
  const level = reading?.level ?? null;
  const volume = reading?.volume ?? null;
  const capacity = reading?.capacity ?? tank.capacityLiters;
  const free = volume !== null ? Math.max(0, capacity - volume) : null;

  const stateColor = (() => {
    if (level === null) return theme.colors.textMuted;
    if (direction === 'low') {
      if (level < 10) return theme.colors.error;
      if (level < 20) return theme.colors.warning;
    } else {
      if (level > 90) return theme.colors.error;
      if (level > 80) return theme.colors.warning;
    }
    return accent;
  })();

  return (
    <ViewLayout title={tank.name} onClose={onClose}>
      {/* Tank diagram + readings, side-by-side on wide screens, stacked on narrow */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex',
        gap: '1rem',
        padding: '1.5rem 1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <TankDiagram
          level={level}
          accent={accent}
        />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '0.5rem',
          flex: '1 1 auto',
          minWidth: '200px',
          maxWidth: '320px',
        }}>
          <div style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.9rem)',
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 'bold',
          }}>
            {t(fluidLabelKey(tank.fluidType as FluidType))}
          </div>

          <div style={{
            fontSize: 'clamp(2.5rem, 10vw, 5rem)',
            fontWeight: 'bold',
            color: stateColor,
            lineHeight: 1,
          }}>
            {level === null ? '--' : `${level.toFixed(0)}%`}
          </div>

          <div style={{
            fontSize: 'clamp(1rem, 3vw, 1.3rem)',
            color: theme.colors.textPrimary,
          }}>
            {volume !== null
              ? `${volume.toFixed(1)} / ${capacity.toFixed(0)} L`
              : `--- / ${capacity.toFixed(0)} L`}
          </div>

          {direction === 'high' && free !== null && (
            <div style={{
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              color: theme.colors.textMuted,
            }}>
              {t('tanks.detail_free', { liters: free.toFixed(1) })}
            </div>
          )}
          {direction === 'low' && volume !== null && (
            <div style={{
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              color: theme.colors.textMuted,
            }}>
              {t('tanks.detail_remaining', { liters: volume.toFixed(1) })}
            </div>
          )}
        </div>
      </div>

      <StatsRow
        stats={[
          { label: t('speed.avg'), value: `${stats.avg.toFixed(0)}%`, color: '#64b5f6' },
          { label: t('speed.max'), value: `${stats.max.toFixed(0)}%`, color: theme.colors.success },
          { label: t('speed.min'), value: `${stats.min.toFixed(0)}%`, color: theme.colors.dataWind },
        ]}
      />

      <ChartContainer
        isLoading={isLoading}
        hasData={history.length > 0}
        title={t('tanks.detail_history')}
        timeframeOptions={timeframeOptions}
        selectedTimeframe={timeframe}
        onTimeframeSelect={(key) => { setHistory([]); setTimeframe(key as TimeframeOption); }}
      >
        <TimeSeriesChart
          data={history}
          timeframeMs={TIMEFRAMES[timeframe].ms}
          yInterval={20}
          yHeadroom={5}
          yUnit="%"
          yMinValue={0}
          yMaxValue={100}
          lineColor={accent}
        />
      </ChartContainer>
    </ViewLayout>
  );
};

// ============================================================================
// Tank diagram — vertical SVG showing fill level with tick marks
// ============================================================================

interface TankDiagramProps {
  level: number | null;
  /** Fluid colour — what the water/fuel/etc visually looks like. */
  accent: string;
}

/**
 * Plain rectangular tank with a gently wavy fluid surface.
 *
 * The surface is two sine peaks across the width, animated horizontally
 * via a CSS transform so it looks alive without being distracting. The
 * fluid colour matches the fluid type (water = blue, fuel = amber, etc.) —
 * warning state is conveyed by the big number, not the diagram colour.
 */
const TankDiagram: React.FC<TankDiagramProps> = ({ level, accent }) => {
  const { theme } = useTheme();
  const w = 140;
  const h = 220;
  const innerPad = 8;

  // Tank body coordinates — plain rounded rectangle, no filler neck.
  const bodyX = innerPad;
  const bodyY = innerPad;
  const bodyW = w - innerPad * 2;
  const bodyH = h - innerPad * 2;

  const fillFrac = level === null ? 0 : Math.max(0, Math.min(1, level / 100));
  // The wavy surface oscillates ±waveAmp. Offset the visible fill height
  // down by waveAmp so the wave's peaks always sit inside the tank body
  // even at 100 % full.
  const waveAmp = 4;
  const usableH = bodyH - waveAmp;
  const fillH = usableH * fillFrac;
  const fillY = bodyY + bodyH - fillH;

  // Build a wave path that's wider than the tank and clipped to the body —
  // animating its X translation gives the illusion of motion without the
  // edges ever revealing. Two full sine cycles across 2 × bodyW, so a
  // -bodyW translation animation loops seamlessly.
  const wavePath = (() => {
    const startX = bodyX - bodyW;
    const endX = bodyX + bodyW * 2;
    const cycles = 4; // total peaks across the path
    const cycleW = (endX - startX) / cycles;
    let d = `M ${startX} ${fillY + waveAmp}`;
    for (let i = 0; i < cycles; i++) {
      const x0 = startX + i * cycleW;
      const cp1x = x0 + cycleW * 0.25;
      const cp1y = fillY - waveAmp;
      const midX = x0 + cycleW * 0.5;
      const midY = fillY + waveAmp;
      const cp2x = x0 + cycleW * 0.75;
      const cp2y = fillY + waveAmp * 3;
      const endXSeg = x0 + cycleW;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${midX} ${midY}`;
      d += ` C ${cp1x + cycleW * 0.5} ${cp2y}, ${cp2x + cycleW * 0.5} ${cp1y}, ${endXSeg} ${fillY + waveAmp}`;
    }
    // Close the path down to the bottom of the body.
    d += ` L ${endX} ${bodyY + bodyH} L ${startX} ${bodyY + bodyH} Z`;
    return d;
  })();

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id="tank-body-clip">
          <rect
            x={bodyX}
            y={bodyY}
            width={bodyW}
            height={bodyH}
            rx={6}
          />
        </clipPath>
        <linearGradient id="tank-fluid-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.75} />
          <stop offset="100%" stopColor={accent} stopOpacity={1} />
        </linearGradient>
        <style>{`
          @keyframes tank-wave-drift {
            0% { transform: translateX(0); }
            100% { transform: translateX(${(bodyW).toFixed(2)}px); }
          }
          .tank-wave {
            animation: tank-wave-drift 6s linear infinite;
            transform-box: fill-box;
          }
        `}</style>
      </defs>

      {/* Tank body — plain rounded rectangle */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={6}
        fill={theme.colors.bgCard}
        stroke={theme.colors.border}
        strokeWidth={1.5}
      />

      {/* Fluid (clipped to tank body so the wave doesn't spill out) */}
      {level !== null && fillH > 0 && (
        <g clipPath="url(#tank-body-clip)">
          <path
            d={wavePath}
            fill="url(#tank-fluid-grad)"
            className="tank-wave"
          />
          {/* Subtle surface highlight — also wavy, follows the same path. */}
          <path
            d={wavePath}
            fill="none"
            stroke="#fff"
            strokeWidth={1}
            strokeOpacity={0.4}
            className="tank-wave"
          />
        </g>
      )}

      {/* Tick marks at 25/50/75 % */}
      {[0.25, 0.5, 0.75].map((f) => {
        const y = bodyY + usableH * (1 - f);
        return (
          <g key={f}>
            <line
              x1={bodyX}
              y1={y}
              x2={bodyX + 6}
              y2={y}
              stroke={theme.colors.textMuted}
              strokeWidth={1}
            />
            <line
              x1={bodyX + bodyW - 6}
              y1={y}
              x2={bodyX + bodyW}
              y2={y}
              stroke={theme.colors.textMuted}
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Center percent label */}
      <text
        x={w / 2}
        y={h / 2 + 6}
        textAnchor="middle"
        fontSize={22}
        fontWeight="bold"
        fill={theme.colors.textPrimary}
        style={{ textShadow: '0 0 6px rgba(0,0,0,0.5)' }}
      >
        {level === null ? '--' : `${Math.round(level)}%`}
      </text>
    </svg>
  );
};

