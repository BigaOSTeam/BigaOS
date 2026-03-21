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

interface RollViewProps {
  roll: number; // radians
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

const getRollColor = (deg: number): string => {
  const abs = Math.abs(deg);
  if (abs < 5) return '#81C784';
  if (abs < 15) return '#FFB74D';
  return '#EF5350';
};

export const RollView: React.FC<RollViewProps> = ({ roll, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const deg = radToDeg(roll);
  const color = getRollColor(deg);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'navigation',
        'roll',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: radToDeg(item.value),
      }));
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch roll history:', error);
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
    <ViewLayout title={t('dashboard_item.roll')} onClose={onClose}>
      {/* Boat visualization */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 'clamp(0.5rem, 2vw, 1.5rem)',
      }}>
        <svg viewBox="0 0 120 65" style={{ width: 'min(50vw, 250px)', height: 'auto', overflow: 'visible' }}>
          {/* Water */}
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30" stroke="#4FC3F7" strokeWidth="1" opacity="0.4" fill="none" />
          <path d="M-20 30 Q-10 28 0 30 T20 30 T40 30 T60 30 T80 30 T100 30 T120 30 T140 30 L140 65 L-20 65 Z" fill="#4FC3F7" opacity="0.08" />
          <g transform={`rotate(${deg}, 60, 30) scale(0.9) translate(6.67, 6)`}>
            <path
              d="M30 12 C30 19 32 30 48 38 Q54 41 55 45 Q55 48 57 48 L63 48 Q65 48 65 45 Q66 41 72 38 C88 30 90 19 90 12 Z"
              fill="#e8e8e8"
              stroke="#888"
              strokeWidth="1.2"
            />
            <path
              d="M40 13 C40 17 42 25 55 31 L60 34 L65 31 C78 25 80 17 80 13 Z"
              fill="#d0d0d0"
              stroke="#bbb"
              strokeWidth="0.6"
            />
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
        title={t('roll.roll_history')}
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
          yMinValue={-20}
          yMaxValue={20}
        />
      </ChartContainer>
    </ViewLayout>
  );
};
