import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { radToDeg } from '../../utils/angle';
import {
  ViewLayout,
  MainValueDisplay,
  StatsRow,
  ChartContainer,
} from './shared';

interface PitchViewProps {
  pitch: number; // radians
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h' | '24h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
  '24h': { label: '24h', ms: 24 * 60 * 60 * 1000, minutes: 1440 },
};

const getPitchColor = (deg: number): string => {
  const abs = Math.abs(deg);
  if (abs < 5) return '#81C784';
  if (abs < 15) return '#FFB74D';
  return '#EF5350';
};

export const PitchView: React.FC<PitchViewProps> = ({ pitch, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const deg = radToDeg(pitch);
  const color = getPitchColor(deg);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'navigation',
        'pitch',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: radToDeg(item.value),
      }));
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch pitch history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

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

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    (key) => ({ key, label: TIMEFRAMES[key].label })
  );

  return (
    <ViewLayout title={t('dashboard_item.pitch')} onClose={onClose}>
      {/* Boat visualization */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 'clamp(0.5rem, 2vw, 1.5rem)',
      }}>
        <svg viewBox="0 0 120 65" style={{ width: 'min(60vw, 300px)', height: 'auto', overflow: 'visible' }}>
          {/* Water */}
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30" stroke="#4FC3F7" strokeWidth="1" opacity="0.4" fill="none" />
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30 L140 65 L-20 65 Z" fill="#4FC3F7" opacity="0.08" />
          <g transform={`rotate(${-deg}, 60, 30)`}>
            {/* Rudder */}
            <path d="M100 28 L104 42 L111 42 L108 28" fill="#d0d0d0" stroke="#bbb" strokeWidth="0.5" />
            {/* Keel */}
            <path d="M50 38 L56 52 L70 52 L68 38" fill="#d0d0d0" stroke="#bbb" strokeWidth="0.5" />
            {/* Hull */}
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
            {/* Deck lines */}
            <line x1="6" y1="18" x2="42" y2="18" stroke="#ccc" strokeWidth="0.5" />
            <line x1="85" y1="18" x2="112" y2="18" stroke="#ccc" strokeWidth="0.5" />
          </g>
        </svg>
      </div>

      <MainValueDisplay
        value={`${Math.abs(deg).toFixed(1)}°`}
        unit=""
        color={color}
      />

      <StatsRow
        stats={[
          { label: t('speed.avg'), value: `${stats.avg.toFixed(1)}°`, color: '#64b5f6' },
          { label: t('speed.max'), value: `${stats.max.toFixed(1)}°`, color: theme.colors.success },
          { label: t('speed.min'), value: `${stats.min.toFixed(1)}°`, color: theme.colors.dataWind },
        ]}
      />

      <ChartContainer
        isLoading={isLoading}
        hasData={historyData.length > 0}
        title={t('pitch.pitch_history')}
        timeframeOptions={timeframeOptions}
        selectedTimeframe={timeframe}
        onTimeframeSelect={(key) => { setHistoryData([]); setTimeframe(key as TimeframeOption); }}
      >
        <TimeSeriesChart
          data={historyData}
          timeframeMs={TIMEFRAMES[timeframe].ms}
          yInterval={5}
          yHeadroom={2}
          yUnit="°"
          lineColor={color}
          yMinValue={-15}
          yMaxValue={15}
        />
      </ChartContainer>
    </ViewLayout>
  );
};
