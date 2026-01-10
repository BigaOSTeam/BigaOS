import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSettings, speedConversions } from '../../context/SettingsContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import {
  ViewLayout,
  MainValueDisplay,
  StatsRow,
  TimeframeSelector,
  ChartContainer,
} from './shared';

interface SpeedViewProps {
  speed: number; // Current speed in knots
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
};

const getSpeedColor = (speedInKnots: number): string => {
  if (speedInKnots < 1) return '#64b5f6'; // Light blue - very slow
  if (speedInKnots < 5) return '#4fc3f7'; // Cyan - cruising
  if (speedInKnots < 10) return '#66bb6a'; // Green - good speed
  if (speedInKnots < 15) return '#ffa726'; // Orange - fast
  return '#ef5350'; // Red - very fast
};

export const SpeedView: React.FC<SpeedViewProps> = ({ speed, onClose }) => {
  const { speedUnit, convertSpeed } = useSettings();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const convertedSpeed = convertSpeed(speed);

  // Fetch history data from server
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'navigation',
        'speedOverGround',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: convertSpeed(item.value),
      }));
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch speed history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, convertSpeed]);

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
    <ViewLayout title="Speed" onClose={onClose}>
      <MainValueDisplay
        value={convertedSpeed.toFixed(1)}
        unit={speedConversions[speedUnit].label}
        color={getSpeedColor(speed)}
      />

      <StatsRow
        stats={[
          { label: 'Avg', value: stats.avg.toFixed(1), color: '#64b5f6' },
          { label: 'Max', value: stats.max.toFixed(1), color: '#66bb6a' },
          { label: 'Min', value: stats.min.toFixed(1), color: '#ffa726' },
        ]}
      />

      <ChartContainer isLoading={isLoading} hasData={historyData.length > 0}>
        <div style={{ marginBottom: '0.5rem', padding: '0 1rem' }}>
          <TimeframeSelector
            options={timeframeOptions}
            selected={timeframe}
            onSelect={(key) => setTimeframe(key as TimeframeOption)}
            title="Speed History"
          />
        </div>
        <div style={{ flex: 1 }}>
          <TimeSeriesChart
            data={historyData}
            timeframeMs={TIMEFRAMES[timeframe].ms}
            yInterval={2}
            yHeadroom={1}
            yUnit={speedConversions[speedUnit].label}
            lineColor="#66bb6a"
          />
        </div>
      </ChartContainer>
    </ViewLayout>
  );
};
