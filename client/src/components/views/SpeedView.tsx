import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSettings, speedConversions } from '../../context/SettingsContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
  ViewLayout,
  MainValueDisplay,
  StatsRow,
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

export const SpeedView: React.FC<SpeedViewProps> = ({ speed, onClose }) => {
  const { theme } = useTheme();
  const { speedUnit, convertSpeed } = useSettings();
  const { t } = useLanguage();
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
    <ViewLayout title={t('speed.speed')} onClose={onClose}>
      <MainValueDisplay
        value={convertedSpeed.toFixed(1)}
        unit={speedConversions[speedUnit].label}
        color={theme.colors.dataSpeed}
      />

      <StatsRow
        stats={[
          { label: t('speed.avg'), value: stats.avg.toFixed(1), color: '#64b5f6' },
          { label: t('speed.max'), value: stats.max.toFixed(1), color: theme.colors.dataSpeed },
          { label: t('speed.min'), value: stats.min.toFixed(1), color: theme.colors.dataWind },
        ]}
      />

      <ChartContainer
        isLoading={isLoading}
        hasData={historyData.length > 0}
        title={t('speed.speed_history')}
        timeframeOptions={timeframeOptions}
        selectedTimeframe={timeframe}
        onTimeframeSelect={(key) => { setHistoryData([]); setTimeframe(key as TimeframeOption); }}
      >
        <TimeSeriesChart
          data={historyData}
          timeframeMs={TIMEFRAMES[timeframe].ms}
          yInterval={2}
          yHeadroom={1}
          yUnit={speedConversions[speedUnit].label}
          lineColor={theme.colors.dataSpeed}
        />
      </ChartContainer>
    </ViewLayout>
  );
};
