import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ViewLayout,
} from './shared';

interface BatteryViewProps {
  voltage: number;
  current: number;
  temperature: number;
  stateOfCharge: number;
  timeRemaining: number;
  power: number;
  batteryId?: string;
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

const formatTimeRemaining = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 99) return `${h}h`;
  return `${h}:${m.toString().padStart(2, '0')}`;
};

export const BatteryView: React.FC<BatteryViewProps> = ({
  voltage,
  current,
  temperature,
  stateOfCharge,
  timeRemaining,
  power,
  batteryId = 'house',
  onClose,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [timeframe, setTimeframe] = useState<TimeframeOption>('15m');
  const [isLoading, setIsLoading] = useState(true);
  const [histories, setHistories] = useState<Record<string, TimeSeriesDataPoint[]>>({
    power: [],
    temperature: [],
    stateOfCharge: [],
    current: [],
    timeRemaining: [],
    voltage: [],
  });

  const getBatteryColor = (soc: number) => {
    if (soc > 70) return '#66bb6a';   // green
    if (soc > 50) return '#a5c83a';   // yellow-green
    if (soc > 35) return '#ffc107';   // yellow
    if (soc > 20) return '#ff9800';   // orange
    return '#ef5350';                  // red
  };

  const charts: ChartConfig[] = useMemo(() => [
    {
      key: 'power',
      label: t('battery.power_history'),
      sensorKey: `${batteryId}_power`,
      yInterval: 50,
      yHeadroom: 25,
      yUnit: 'W',
      yMinValue: undefined,
      lineColor: theme.colors.dataWind,
      fillGradient: false,
      currentValue: power,
      formatValue: (v: number) => `${Math.abs(v).toFixed(0)}W`,
    },
    {
      key: 'temperature',
      label: t('battery.temperature_history'),
      sensorKey: `${batteryId}_temperature`,
      yInterval: 10,
      yHeadroom: 5,
      yUnit: '°C',
      lineColor: '#ff7043',
      fillGradient: false,
      currentValue: temperature,
      formatValue: (v: number) => `${v.toFixed(0)}°C`,
    },
    {
      key: 'stateOfCharge',
      label: t('battery.soc_history'),
      sensorKey: `${batteryId}_stateOfCharge`,
      yInterval: 25,
      yHeadroom: 0,
      yUnit: '%',
      yMinValue: 0,
      yMaxValue: 100,
      lineColor: theme.colors.dataBattery,
      fillGradient: true,
      currentValue: stateOfCharge,
      formatValue: (v: number) => `${v.toFixed(0)}%`,
    },
    {
      key: 'current',
      label: t('battery.current_history'),
      sensorKey: `${batteryId}_current`,
      yInterval: 10,
      yHeadroom: 5,
      yUnit: 'A',
      yMinValue: undefined,
      lineColor: theme.colors.dataSpeed,
      fillGradient: false,
      currentValue: current,
      formatValue: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}A`,
    },
    {
      key: 'timeRemaining',
      label: t('battery.time_remaining_history'),
      sensorKey: `${batteryId}_timeRemaining`,
      yInterval: 3600,
      yHeadroom: 1800,
      yUnit: '',
      yMinValue: 0,
      lineColor: theme.colors.dataHeading,
      fillGradient: false,
      currentValue: timeRemaining,
      formatValue: (v: number) => formatTimeRemaining(v),
    },
    {
      key: 'voltage',
      label: t('battery.voltage_history'),
      sensorKey: `${batteryId}_voltage`,
      yInterval: 1,
      yHeadroom: 0.5,
      yUnit: 'V',
      lineColor: theme.colors.dataWind,
      fillGradient: false,
      currentValue: voltage,
      formatValue: (v: number) => `${v.toFixed(2)}V`,
    },
  ], [t, batteryId, power, temperature, stateOfCharge, current, timeRemaining, voltage, theme.colors]);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await Promise.all(
        charts.map((chart) =>
          sensorAPI.getSpecificSensorHistory('electrical', chart.sensorKey, TIMEFRAMES[timeframe].minutes)
        )
      );

      const newHistories: Record<string, TimeSeriesDataPoint[]> = {};
      charts.forEach((chart, i) => {
        newHistories[chart.key] = results[i].data.map((item: any) => ({
          timestamp: new Date(item.timestamp + 'Z').getTime(),
          value: item.value,
        }));
      });
      setHistories(newHistories);
    } catch (error) {
      console.error('Failed to fetch battery history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, charts]);

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
      power: [],
      temperature: [],
      stateOfCharge: [],
      current: [],
      timeRemaining: [],
      voltage: [],
    });
    setTimeframe(key as TimeframeOption);
  };

  const batteryColor = getBatteryColor(stateOfCharge);
  const statusColor = current > 0.5 ? theme.colors.success : current < -0.5 ? theme.colors.warning : theme.colors.textMuted;
  const statusText = current > 0.5 ? t('battery.charging') : current < -0.5 ? t('battery.discharging') : t('battery.idle');

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

  const renderBatteryIcon = () => {
    const fillHeight = Math.max(0, Math.min(100, stateOfCharge));
    const bodyTop = 18;
    const bodyHeight = 62;
    const fillH = (fillHeight / 100) * (bodyHeight - 8);
    const fillY = bodyTop + bodyHeight - 4 - fillH;

    return (
      <svg
        viewBox="0 0 80 90"
        style={{ width: 'min(18vw, 90px)', height: 'auto' }}
      >
        {/* Clip path to cut body outline behind terminal posts */}
        <defs>
          <clipPath id="battery-body-clip">
            <rect x="0" y="0" width="18" height="90" />
            <rect x="36" y="0" width="8" height="90" />
            <rect x="62" y="0" width="18" height="90" />
            <rect x="0" y="20" width="80" height="70" />
          </clipPath>
        </defs>
        {/* Main battery body — clipped so stroke doesn't overlap posts */}
        <rect x="6" y={bodyTop} width="68" height={bodyHeight} rx="5" fill="none" stroke={theme.colors.textDisabled} strokeWidth="3" clipPath="url(#battery-body-clip)" />
        {/* Terminal posts — short stubs flush on the lid */}
        <rect x="20" y="12" width="14" height="8" rx="3" fill={theme.colors.textDisabled} />
        <rect x="46" y="12" width="14" height="8" rx="3" fill={theme.colors.textDisabled} />
        {/* Fill level */}
        <rect x="10" y={fillY} width="60" height={fillH} rx="3" fill={batteryColor} opacity="0.85" />
        {/* Percentage text */}
        <text x="40" y="52" fill="#fff" fontSize="16" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {Math.round(stateOfCharge)}%
        </text>
      </svg>
    );
  };

  return (
    <ViewLayout title={t('battery.battery')} onClose={onClose}>
      {/* Header: battery icon + status + key stats */}
      <div style={{
        flex: '0 0 auto',
        padding: 'clamp(0.5rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.5rem)',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(0.75rem, 2vw, 1.5rem)',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {/* Battery icon */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          {renderBatteryIcon()}
          <div style={{
            fontSize: 'clamp(0.8rem, 2.5vw, 1.1rem)',
            color: statusColor,
            fontWeight: theme.fontWeight.semibold,
            marginTop: '0.25rem',
          }}>
            {statusText}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(0.3rem, 1vw, 0.6rem)',
          flex: 1,
          minWidth: 0,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.power')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.dataWind }}>
              {Math.abs(power).toFixed(0)}W
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.voltage')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.dataWind }}>
              {voltage.toFixed(2)}V
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.current')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.dataSpeed }}>
              {current >= 0 ? '+' : ''}{current.toFixed(1)}A
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.temperature')}</div>
            <div style={{ ...statValueStyle, color: '#ff7043' }}>
              {temperature.toFixed(0)}°C
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.time_to_go')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.dataHeading }}>
              {formatTimeRemaining(timeRemaining)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={statLabelStyle}>{t('battery.state_of_charge')}</div>
            <div style={{ ...statValueStyle, color: theme.colors.dataBattery }}>
              {stateOfCharge.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Charts area with shared timeframe */}
      <div style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: 'clamp(0.3rem, 1vw, 0.5rem)',
      }}>
        {/* Title + Timeframe selector row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 0.25rem',
          marginBottom: 'clamp(0.25rem, 0.8vw, 0.5rem)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('battery.history')}
          </div>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {timeframeOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => handleTimeframeChange(option.key)}
                className="touch-btn"
                style={{
                  padding: 'clamp(0.3rem, 0.8vw, 0.5rem) clamp(0.5rem, 1.5vw, 1rem)',
                  background:
                    timeframe === option.key
                      ? theme.colors.primaryMedium
                      : theme.colors.bgCard,
                  border:
                    timeframe === option.key
                      ? `1px solid ${theme.colors.primarySolid}`
                      : `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: 'clamp(0.8rem, 2.5vw, 1.1rem)',
                  fontWeight: timeframe === option.key ? 'bold' : 'normal',
                  minWidth: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3x2 Chart Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: 'clamp(0.25rem, 0.6vw, 0.5rem)',
          minHeight: '700px',
          marginBottom: 'clamp(0.3rem, 1vw, 0.5rem)',
        }}>
          {charts.map((chart) => (
            <div
              key={chart.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: '200px',
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
                  yLabelFormatter={chart.key === 'timeRemaining'
                    ? (v: number) => {
                        const h = Math.floor(v / 3600);
                        const m = Math.floor((v % 3600) / 60);
                        return `${h}:${m.toString().padStart(2, '0')}`;
                      }
                    : undefined
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ViewLayout>
  );
};
