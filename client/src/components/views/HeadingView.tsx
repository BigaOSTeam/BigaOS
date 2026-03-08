import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { radToDeg } from '../../utils/angle';
import {
  ViewLayout,
  ChartContainer,
} from './shared';

/**
 * Unwrap heading angles so the line chart doesn't jump at the 0°/360° boundary.
 * E.g., [350, 355, 5, 10] becomes [350, 355, 365, 370].
 */
function unwrapHeadingData(data: TimeSeriesDataPoint[]): TimeSeriesDataPoint[] {
  if (data.length === 0) return data;
  const result: TimeSeriesDataPoint[] = [data[0]];
  let offset = 0;
  for (let i = 1; i < data.length; i++) {
    let diff = data[i].value - data[i - 1].value;
    if (diff > 180) offset -= 360;
    else if (diff < -180) offset += 360;
    result.push({ timestamp: data[i].timestamp, value: data[i].value + offset });
  }
  return result;
}

interface HeadingViewProps {
  heading: number; // Current heading in radians
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
};

export const HeadingView: React.FC<HeadingViewProps> = ({ heading, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'navigation',
        'heading',
        TIMEFRAMES[timeframe].minutes
      );
      const rawData = response.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: radToDeg(item.value),
      }));
      setHistoryData(rawData);
    } catch (error) {
      console.error('Failed to fetch heading history:', error);
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

  const unwrappedData = useMemo(() => unwrapHeadingData(historyData), [historyData]);

  const headingYMin = useMemo(() => {
    if (unwrappedData.length === 0) return 0;
    const min = Math.min(...unwrappedData.map(d => d.value));
    return Math.floor(min / 90) * 90;
  }, [unwrappedData]);

  const headingLabelFormatter = useCallback((value: number) => {
    let deg = value % 360;
    if (deg < 0) deg += 360;
    return `${Math.round(deg)}°`;
  }, []);

  const headingDeg = radToDeg(heading);

  const compassPoints = [
    { deg: 0, label: 'N' },
    { deg: 45, label: 'NE' },
    { deg: 90, label: 'E' },
    { deg: 135, label: 'SE' },
    { deg: 180, label: 'S' },
    { deg: 225, label: 'SW' },
    { deg: 270, label: 'W' },
    { deg: 315, label: 'NW' },
  ];

  const stripWidth = 360;

  const getPointPosition = (pointDeg: number) => {
    let diff = pointDeg - headingDeg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff * (stripWidth / 180);
  };

  const renderCompass = () => {
    return (
      <div style={{ width: '100%', maxWidth: '100%' }}>
        {/* Center indicator triangle */}
        <div style={{
          width: '0',
          height: '0',
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: `10px solid ${theme.colors.dataHeading}`,
          margin: '0 auto 4px auto',
        }} />

        {/* Compass strip */}
        <div
          style={{
            position: 'relative',
            height: '56px',
            overflow: 'hidden',
            width: `${stripWidth}px`,
            margin: '0 auto',
            background: 'transparent',
          }}
        >
          <div style={{ position: 'relative', height: '100%' }}>
            {/* Tick marks */}
            {Array.from({ length: 72 }, (_, i) => i * 5).map((deg) => {
              const pos = getPointPosition(deg);
              const centerPos = stripWidth / 2 + pos;
              const isVisible = centerPos > -10 && centerPos < stripWidth + 10;
              const isCardinal = deg % 90 === 0;
              const isIntercardinal = deg % 45 === 0 && !isCardinal;
              const isMajor = deg % 15 === 0;

              if (!isVisible) return null;

              return (
                <div
                  key={`tick-${deg}`}
                  style={{
                    position: 'absolute',
                    left: `${centerPos}px`,
                    top: 0,
                    transform: 'translateX(-50%)',
                    width: isCardinal ? '2px' : isMajor ? '1.5px' : '1px',
                    height: isCardinal ? '22px' : isIntercardinal ? '16px' : isMajor ? '10px' : '6px',
                    background: isCardinal
                      ? theme.colors.textPrimary
                      : theme.colors.textMuted,
                    transition: 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  }}
                />
              );
            })}

            {/* Cardinal/intercardinal labels */}
            {compassPoints.map((point) => {
              const pos = getPointPosition(point.deg);
              const centerPos = stripWidth / 2 + pos;
              const isVisible = centerPos > -20 && centerPos < stripWidth + 20;
              const isNorth = point.label === 'N';

              if (!isVisible) return null;

              return (
                <div
                  key={point.label}
                  style={{
                    position: 'absolute',
                    left: `${centerPos}px`,
                    top: '28px',
                    transform: 'translateX(-50%)',
                    fontSize: 'clamp(1rem, 3vw, 1.3rem)',
                    fontWeight: 'bold',
                    color: isNorth ? '#ef5350' : theme.colors.textSecondary,
                    transition: 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {point.label}
                </div>
              );
            })}

          </div>
        </div>
      </div>
    );
  };

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    (key) => ({ key, label: TIMEFRAMES[key].label })
  );

  return (
    <ViewLayout title={t('heading.heading')} onClose={onClose}>
      {/* Main heading display */}
      <div style={{
        flex: '0 0 auto',
        padding: 'clamp(1rem, 3vw, 2rem) 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {/* Heading value */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 'clamp(3rem, 10vw, 5rem)',
            fontWeight: 'bold',
            color: theme.colors.dataHeading,
            lineHeight: 1,
          }}>
            {Math.round(headingDeg) % 360}°
          </div>
        </div>

        {/* Linear compass strip */}
        {renderCompass()}
      </div>

      {/* Heading history graph */}
      <ChartContainer
        isLoading={isLoading}
        hasData={historyData.length > 0}
        title={t('heading.heading_history')}
        timeframeOptions={timeframeOptions}
        selectedTimeframe={timeframe}
        onTimeframeSelect={(key) => { setHistoryData([]); setTimeframe(key as TimeframeOption); }}
      >
        <TimeSeriesChart
          data={unwrappedData}
          timeframeMs={TIMEFRAMES[timeframe].ms}
          yInterval={90}
          yHeadroom={10}
          yUnit="°"
          yMinValue={headingYMin}
          lineColor={theme.colors.dataHeading}
          fillGradient={false}
          yLabelFormatter={headingLabelFormatter}
        />
      </ChartContainer>
    </ViewLayout>
  );
};
