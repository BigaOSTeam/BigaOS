import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useSettings, windConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { radToDeg } from '../../utils/angle';
import { ViewLayout, ResponsiveTimeframePicker } from './shared';

interface WindViewProps {
  speedApparent: number;
  angleApparent: number;
  speedTrue: number;
  angleTrue: number;
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h' | '24h' | '3d' | '7d' | '14d' | '30d';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
  '24h': { label: '24h', ms: 24 * 60 * 60 * 1000, minutes: 1440 },
  '3d': { label: '3d', ms: 3 * 24 * 60 * 60 * 1000, minutes: 4320 },
  '7d': { label: '7d', ms: 7 * 24 * 60 * 60 * 1000, minutes: 10080 },
  '14d': { label: '14d', ms: 14 * 24 * 60 * 60 * 1000, minutes: 20160 },
  '30d': { label: '30d', ms: 30 * 24 * 60 * 60 * 1000, minutes: 43200 },
};

interface ChartConfig {
  key: string;
  label: string;
  sensorKey: string;
  yInterval: number;
  yHeadroom: number;
  yUnit: string;
  yMinValue?: number;
  yMaxValue?: number;
  lineColor: string;
  fillGradient: boolean;
  currentValue: number;
  formatValue: (v: number) => string;
}

export const WindView: React.FC<WindViewProps> = ({
  speedApparent,
  angleApparent,
  speedTrue,
  angleTrue,
  onClose,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { windUnit, convertWind } = useSettings();
  const [timeframe, setTimeframe] = useState<TimeframeOption>('15m');
  const [isLoading, setIsLoading] = useState(true);
  const [histories, setHistories] = useState<Record<string, TimeSeriesDataPoint[]>>({
    apparentSpeed: [],
    trueSpeed: [],
    apparentAngle: [],
    trueAngle: [],
  });

  const unitLabel = windConversions[windUnit].label;

  const getWindSector = (angle: number): string => {
    if (angle < 30 || angle > 330) return t('wind.dead_ahead');
    if (angle >= 30 && angle < 60) return t('wind.close_reach_stbd');
    if (angle >= 60 && angle < 90) return t('wind.beam_reach_stbd');
    if (angle >= 90 && angle < 135) return t('wind.broad_reach_stbd');
    if (angle >= 135 && angle < 180) return t('wind.running_stbd');
    if (angle >= 180 && angle < 225) return t('wind.running_port');
    if (angle >= 225 && angle < 270) return t('wind.broad_reach_port');
    if (angle >= 270 && angle < 300) return t('wind.beam_reach_port');
    return t('wind.close_reach_port');
  };

  const beaufortScale = (knots: number): { force: number; description: string } => {
    if (knots < 1) return { force: 0, description: t('beaufort.0') };
    if (knots < 4) return { force: 1, description: t('beaufort.1') };
    if (knots < 7) return { force: 2, description: t('beaufort.2') };
    if (knots < 11) return { force: 3, description: t('beaufort.3') };
    if (knots < 17) return { force: 4, description: t('beaufort.4') };
    if (knots < 22) return { force: 5, description: t('beaufort.5') };
    if (knots < 28) return { force: 6, description: t('beaufort.6') };
    if (knots < 34) return { force: 7, description: t('beaufort.7') };
    if (knots < 41) return { force: 8, description: t('beaufort.8') };
    if (knots < 48) return { force: 9, description: t('beaufort.9') };
    if (knots < 56) return { force: 10, description: t('beaufort.10') };
    if (knots < 64) return { force: 11, description: t('beaufort.11') };
    return { force: 12, description: t('beaufort.12') };
  };

  const beaufort = beaufortScale(speedApparent);

  const convertedApparent = convertWind(speedApparent);
  const convertedTrue = convertWind(speedTrue);

  const formatWindValue = (value: number) => {
    if (windUnit === 'bft') return value.toFixed(0);
    return value.toFixed(1);
  };

  const apparentAngleDeg = radToDeg(angleApparent);
  const trueAngleDeg = radToDeg(angleTrue);

  // Colors for each chart/stat
  const colors = {
    apparentSpeed: theme.colors.dataWind,      // orange
    trueSpeed: theme.colors.dataSpeed,          // light blue
    apparentAngle: theme.colors.dataHeading,    // purple
    trueAngle: theme.colors.dataDepth,          // green
  };

  // Static fetch keys — never changes, so fetchHistory stays stable
  const FETCH_KEYS = useMemo(() => [
    { key: 'apparentSpeed', sensorKey: 'windSpeed' },
    { key: 'trueSpeed', sensorKey: 'windSpeedTrue' },
    { key: 'apparentAngle', sensorKey: 'windDirection' },
    { key: 'trueAngle', sensorKey: 'windDirectionTrue' },
  ], []);

  // Display config — can change freely without triggering fetches
  const charts: ChartConfig[] = [
    {
      key: 'apparentSpeed',
      label: t('wind.apparent_speed_history'),
      sensorKey: 'windSpeed',
      yInterval: 5,
      yHeadroom: 2,
      yUnit: unitLabel,
      yMinValue: 0,
      lineColor: colors.apparentSpeed,
      fillGradient: true,
      currentValue: convertedApparent,
      formatValue: (v: number) => `${formatWindValue(v)} ${unitLabel}`,
    },
    {
      key: 'trueSpeed',
      label: t('wind.true_speed_history'),
      sensorKey: 'windSpeedTrue',
      yInterval: 5,
      yHeadroom: 2,
      yUnit: unitLabel,
      yMinValue: 0,
      lineColor: colors.trueSpeed,
      fillGradient: true,
      currentValue: convertedTrue,
      formatValue: (v: number) => `${formatWindValue(v)} ${unitLabel}`,
    },
    {
      key: 'apparentAngle',
      label: t('wind.apparent_angle_history'),
      sensorKey: 'windDirection',
      yInterval: 45,
      yHeadroom: 10,
      yUnit: '°',
      yMinValue: 0,
      yMaxValue: 360,
      lineColor: colors.apparentAngle,
      fillGradient: false,
      currentValue: apparentAngleDeg,
      formatValue: (v: number) => `${v.toFixed(0)}°`,
    },
    {
      key: 'trueAngle',
      label: t('wind.true_angle_history'),
      sensorKey: 'windDirectionTrue',
      yInterval: 45,
      yHeadroom: 10,
      yUnit: '°',
      yMinValue: 0,
      yMaxValue: 360,
      lineColor: colors.trueAngle,
      fillGradient: false,
      currentValue: trueAngleDeg,
      formatValue: (v: number) => `${v.toFixed(0)}°`,
    },
  ];

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const sensorKeys = FETCH_KEYS.map(fk => fk.sensorKey);
      const response = await sensorAPI.getHistoryBatch('environment', sensorKeys, TIMEFRAMES[timeframe].minutes);
      const batch = response.data;

      const newHistories: Record<string, TimeSeriesDataPoint[]> = {};
      FETCH_KEYS.forEach((fk) => {
        const isSpeed = fk.key === 'apparentSpeed' || fk.key === 'trueSpeed';
        const isAngle = fk.key === 'apparentAngle' || fk.key === 'trueAngle';
        newHistories[fk.key] = (batch[fk.sensorKey] || []).map((item: any) => ({
          timestamp: new Date(item.timestamp + 'Z').getTime(),
          value: isAngle
            ? radToDeg(item.value)
            : (isSpeed && windUnit !== 'kt')
              ? convertWind(item.value)
              : item.value,
        }));
      });
      setHistories(newHistories);
    } catch (error) {
      console.error('Failed to fetch wind history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, FETCH_KEYS, windUnit, convertWind]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    (key) => ({ key, label: TIMEFRAMES[key].label })
  );

  const handleTimeframeChange = (key: string) => {
    if (timeframe === key) return;
    setHistories({
      apparentSpeed: [],
      trueSpeed: [],
      apparentAngle: [],
      trueAngle: [],
    });
    setTimeframe(key as TimeframeOption);
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: 'clamp(0.65rem, 2vw, 0.85rem)',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0.2rem',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 'clamp(1.2rem, 4.5vw, 1.8rem)',
    fontWeight: theme.fontWeight.bold,
  };

  const renderWindRose = () => {
    return (
      <svg
        viewBox="0 0 350 350"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Background circle */}
        <circle cx="175" cy="175" r="170" fill={theme.colors.bgCard} stroke={theme.colors.border} strokeWidth="2" />

        {/* Degree marks */}
        {Array.from({ length: 72 }).map((_, i) => {
          const angle = (i * 5 - 90) * (Math.PI / 180);
          const isMajor = i % 6 === 0;
          const innerR = isMajor ? 140 : 155;
          const outerR = 165;
          return (
            <line
              key={i}
              x1={175 + innerR * Math.cos(angle)}
              y1={175 + innerR * Math.sin(angle)}
              x2={175 + outerR * Math.cos(angle)}
              y2={175 + outerR * Math.sin(angle)}
              stroke={isMajor ? theme.colors.textSecondary : theme.colors.borderHover}
              strokeWidth={isMajor ? 2 : 1}
            />
          );
        })}

        {/* Cardinal directions */}
        {[
          { label: '0°', angle: -90 },
          { label: '30', angle: -60 },
          { label: '60', angle: -30 },
          { label: '90', angle: 0 },
          { label: '120', angle: 30 },
          { label: '150', angle: 60 },
          { label: '180', angle: 90 },
          { label: '210', angle: 120 },
          { label: '240', angle: 150 },
          { label: '270', angle: 180 },
          { label: '300', angle: 210 },
          { label: '330', angle: 240 },
        ].map(({ label, angle }) => {
          const rad = angle * (Math.PI / 180);
          const x = 175 + 120 * Math.cos(rad);
          const y = 175 + 120 * Math.sin(rad);
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={theme.colors.textSecondary}
              fontSize="14"
            >
              {label}
            </text>
          );
        })}

        {/* Boat shape in center */}
        <path
          d="M175 140 L165 180 L175 175 L185 180 Z"
          fill={theme.colors.textDisabled}
          stroke={theme.colors.textSecondary}
          strokeWidth="1"
        />

        {/* Apparent wind arrow */}
        <g transform={`rotate(${apparentAngleDeg} 175 175)`}>
          <line
            x1="175"
            y1="175"
            x2="175"
            y2="30"
            stroke={colors.apparentSpeed}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <polygon
            points="175,20 165,45 185,45"
            fill={colors.apparentSpeed}
          />
        </g>

        {/* True wind arrow */}
        <g transform={`rotate(${trueAngleDeg} 175 175)`}>
          <line
            x1="175"
            y1="175"
            x2="175"
            y2="50"
            stroke={colors.trueSpeed}
            strokeWidth="2"
            strokeDasharray="8 4"
            strokeLinecap="round"
          />
          <polygon
            points="175,40 168,55 182,55"
            fill={colors.trueSpeed}
          />
        </g>
      </svg>
    );
  };

  return (
    <ViewLayout title={t('wind.instrument')} onClose={onClose}>
      {/* Header: wind rose + stats — stacks on mobile */}
      <div style={{
        flex: '0 0 auto',
        padding: 'clamp(0.5rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.5rem)',
        display: 'flex',
        flexDirection: window.innerWidth <= 600 ? 'column' : 'row',
        alignItems: 'center',
        gap: 'clamp(0.5rem, 1.5vw, 1rem)',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {/* Wind rose */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            width: window.innerWidth <= 600 ? 'min(40vw, 160px)' : 'min(35vw, 200px)',
            aspectRatio: '1',
          }}>
            {renderWindRose()}
          </div>
          <div style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.9rem)',
            color: theme.colors.textSecondary,
            marginTop: '0.25rem',
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            <span style={{ fontWeight: theme.fontWeight.bold }}>
              {t('wind.force')} {beaufort.force}
            </span>
            {' — '}
            <span style={{ opacity: 0.7 }}>
              {beaufort.description}
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(0.3rem, 1vw, 0.6rem)',
          flex: 1,
          minWidth: 0,
          width: window.innerWidth <= 600 ? '100%' : undefined,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.apparent')} {t('wind.speed')}</div>
            <div style={{ ...statValueStyle, color: colors.apparentSpeed }}>
              {formatWindValue(convertedApparent)}
              <span style={{ fontSize: '0.6em', opacity: 0.7 }}> {unitLabel}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.true')} {t('wind.speed')}</div>
            <div style={{ ...statValueStyle, color: colors.trueSpeed }}>
              {formatWindValue(convertedTrue)}
              <span style={{ fontSize: '0.6em', opacity: 0.7 }}> {unitLabel}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.sector')}</div>
            <div style={{
              ...statValueStyle,
              color: theme.colors.textSecondary,
              fontSize: 'clamp(0.85rem, 3vw, 1.2rem)',
            }}>
              {getWindSector(apparentAngleDeg)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.apparent')} {t('wind.angle')}</div>
            <div style={{ ...statValueStyle, color: colors.apparentAngle }}>
              {apparentAngleDeg.toFixed(0)}°
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.true')} {t('wind.angle')}</div>
            <div style={{ ...statValueStyle, color: colors.trueAngle }}>
              {trueAngleDeg.toFixed(0)}°
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('wind.beaufort')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.textPrimary }}>
              {beaufort.force}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: 'clamp(1rem, 3vw, 2rem)',
        padding: 'clamp(0.4rem, 1vw, 0.6rem) clamp(0.75rem, 2vw, 1.5rem)',
        fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
        justifyContent: 'center',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '16px', height: '3px', background: colors.apparentSpeed, borderRadius: '2px' }} />
          <span style={{ opacity: 0.6 }}>{t('wind.apparent')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '16px', height: '3px', background: colors.trueSpeed, borderRadius: '2px', borderStyle: 'dashed' }} />
          <span style={{ opacity: 0.6 }}>{t('wind.true')}</span>
        </div>
      </div>

      {/* Charts area with shared timeframe */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(0.3rem, 1vw, 0.5rem)',
      }}>
        <ResponsiveTimeframePicker
          title={t('wind.history')}
          options={timeframeOptions}
          selected={timeframe}
          onSelect={handleTimeframeChange}
        />

        {/* 2x2 Chart Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: 'clamp(0.25rem, 0.6vw, 0.5rem)',
          minHeight: '500px',
          marginBottom: 'clamp(0.3rem, 1vw, 0.5rem)',
        }}>
          {charts.map((chart) => (
            <div
              key={chart.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '220px',
                overflow: 'hidden',
              }}
            >
              {/* Chart label + current value */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '0 0.25rem',
                marginBottom: '0.15rem',
                flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 'clamp(0.55rem, 1.5vw, 0.7rem)',
                  color: theme.colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {chart.label}
                </div>
                <div style={{
                  fontSize: 'clamp(0.65rem, 1.8vw, 0.85rem)',
                  fontWeight: theme.fontWeight.bold,
                  color: chart.lineColor,
                  flexShrink: 0,
                  marginLeft: '0.25rem',
                }}>
                  {chart.formatValue(chart.currentValue)}
                </div>
              </div>
              {/* Chart */}
              <div style={{
                flex: 1,
                background: theme.colors.bgCard,
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative',
                minHeight: 0,
              }}>
                {isLoading && (!histories[chart.key] || histories[chart.key].length === 0) && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.5,
                    fontSize: '0.75rem',
                    zIndex: 1,
                    color: theme.colors.textMuted,
                  }}>
                    {t('common.loading')}
                  </div>
                )}
                <TimeSeriesChart
                  data={histories[chart.key] || []}
                  timeframeMs={TIMEFRAMES[timeframe].ms}
                  yInterval={chart.yInterval}
                  yHeadroom={chart.yHeadroom}
                  yUnit={chart.yUnit}
                  yMinValue={chart.yMinValue}
                  yMaxValue={chart.yMaxValue}
                  lineColor={chart.lineColor}
                  fillGradient={chart.fillGradient}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ViewLayout>
  );
};
