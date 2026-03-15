import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSettings, depthConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ViewLayout,
  MainValueDisplay,
  StatsRow,
  ChartContainer,
} from './shared';

interface DepthViewProps {
  depth: number; // Current depth in meters
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
};

export const DepthView: React.FC<DepthViewProps> = ({ depth, onClose }) => {
  const {
    depthUnit,
    depthAlarm,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    convertDepth,
  } = useSettings();
  const { theme } = useTheme();
  const { t } = useLanguage();

  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const convertedDepth = convertDepth(depth);

  const getDepthColor = (depthInMeters: number) => {
    if (isDepthAlarmTriggered) return '#ef5350';
    if (depthInMeters < 2) return '#ef5350';
    if (depthInMeters < 5) return '#ffa726';
    if (depthInMeters < 10) return '#66bb6a';
    return '#4fc3f7';
  };

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'environment',
        'depth',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: convertDepth(item.value),
      }));
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch depth history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, convertDepth]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const chartData = React.useMemo(() => {
    return historyData;
  }, [historyData]);

  const stats = useMemo(() => {
    if (historyData.length === 0) {
      return { avg: 0, max: 0, min: 0 };
    }
    const values = historyData.map((p) => p.value);
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
    };
  }, [historyData]);

  const chartConfig = depthUnit === 'm'
    ? { interval: 3, headroom: 2, unit: 'm' }
    : { interval: 10, headroom: 5, unit: 'ft' };

  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    (key) => ({ key, label: TIMEFRAMES[key].label })
  );

  return (
    <ViewLayout title={t('depth.depth')} onClose={onClose}>
      {/* Main depth display */}
      <div style={{
        background: isDepthAlarmTriggered ? 'rgba(239, 83, 80, 0.2)' : 'transparent',
        animation: isDepthAlarmTriggered ? 'depth-alarm-pulse 1.5s ease-in-out infinite' : 'none',
      }}>
        <MainValueDisplay
          value={convertedDepth.toFixed(1)}
          unit={depthConversions[depthUnit].label}
          color={getDepthColor(depth)}
        />
      </div>

      <StatsRow
        stats={[
          { label: t('speed.avg'), value: stats.avg.toFixed(1), color: '#64b5f6' },
          { label: t('speed.max'), value: stats.max.toFixed(1), color: theme.colors.success },
          { label: t('speed.min'), value: stats.min.toFixed(1), color: theme.colors.dataWind },
        ]}
      />

      {/* Depth history graph */}
      <ChartContainer
        isLoading={isLoading}
        hasData={chartData.length > 0}
        title={t('depth.depth_history')}
        timeframeOptions={timeframeOptions}
        selectedTimeframe={timeframe}
        onTimeframeSelect={(key) => { setHistoryData([]); setTimeframe(key as TimeframeOption); }}
      >
        <TimeSeriesChart
          data={chartData}
          timeframeMs={TIMEFRAMES[timeframe].ms}
          yInterval={chartConfig.interval}
          yHeadroom={chartConfig.headroom}
          yUnit={chartConfig.unit}
          lineColor={theme.colors.dataDepth}
          alarmThreshold={depthAlarm}
        />
      </ChartContainer>

      {/* Alarm settings */}
      <div style={{
        flex: '0 0 auto',
        padding: '1rem',
        borderTop: `1px solid ${theme.colors.border}`,
      }}>
        <div style={{
          fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '0.5rem',
        }}>
          {t('depth.depth_alarm')}
        </div>

        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setDepthAlarm(null)}
            className="touch-btn"
            style={{
              flex: '1 1 auto',
              minWidth: '60px',
              padding: 'clamp(0.5rem, 2vw, 1rem) 0.5rem',
              background: depthAlarm === null ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
              border: depthAlarm === null ? '2px solid rgba(25, 118, 210, 0.8)' : '2px solid transparent',
              borderRadius: '8px',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              fontWeight: depthAlarm === null ? 'bold' : 'normal',
            }}
          >
            {t('common.off')}
          </button>
          {alarmOptions.map((alarmDepth) => (
            <button
              key={alarmDepth}
              onClick={() => setDepthAlarm(alarmDepth)}
              className="touch-btn"
              style={{
                flex: '1 1 auto',
                minWidth: '60px',
                padding: 'clamp(0.5rem, 2vw, 1rem) 0.5rem',
                background: depthAlarm === alarmDepth ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                border: depthAlarm === alarmDepth ? '2px solid rgba(25, 118, 210, 0.8)' : '2px solid transparent',
                borderRadius: '8px',
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                fontWeight: depthAlarm === alarmDepth ? 'bold' : 'normal',
              }}
            >
              &lt; {alarmDepth} {depthUnit}
            </button>
          ))}
        </div>

        {/* Sound toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '1rem',
          background: theme.colors.bgCard,
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {soundAlarmEnabled && (
                <>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            <span style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1rem)' }}>{t('depth.sound_alarm')}</span>
          </div>
          <button
            onClick={() => setSoundAlarmEnabled(!soundAlarmEnabled)}
            className="touch-btn"
            style={{
              width: '3.2rem',
              height: '1.8rem',
              borderRadius: '0.9rem',
              background: soundAlarmEnabled ? 'rgba(25, 118, 210, 0.8)' : theme.colors.borderHover,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: '1.4rem',
              height: '1.4rem',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '0.2rem',
              left: soundAlarmEnabled ? '1.6rem' : '0.2rem',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          @keyframes depth-alarm-pulse {
            0%, 100% { background: rgba(239, 83, 80, 0.15); }
            50% { background: rgba(239, 83, 80, 0.35); }
          }
        `}
      </style>
    </ViewLayout>
  );
};
