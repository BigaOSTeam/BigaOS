import React, { useState, useEffect, useCallback } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { radToDeg } from '../../utils/angle';

interface HeadingViewProps {
  heading: number; // Current heading in radians
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
};

export const HeadingView: React.FC<HeadingViewProps> = ({ heading, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const getCardinalDirection = (degrees: number): string => {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return dirs[index];
  };

  // Fetch history data from server
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'navigation',
        'heading',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        // Database stores UTC timestamps without 'Z' suffix, so append it for correct parsing
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: item.value,
      }));
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch heading history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe]);

  // Fetch history on mount and when timeframe changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Periodically refresh history data
  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const chartData = historyData;

  // Render compass rose
  const renderCompass = () => {
    const size = 280;
    const center = size / 2;
    const outerRadius = center - 20;
    const innerRadius = center - 50;
    const tickRadius = center - 15;

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer circle */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius}
          fill="none"
          stroke={theme.colors.borderHover}
          strokeWidth="2"
        />

        {/* Inner circle */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill={theme.colors.bgCard}
          stroke={theme.colors.border}
          strokeWidth="1"
        />

        {/* Tick marks and labels */}
        {Array.from({ length: 36 }, (_, i) => {
          const angle = (i * 10 - 90) * (Math.PI / 180);
          const isMajor = i % 9 === 0;
          const isMinor = i % 3 === 0;
          const tickLength = isMajor ? 15 : isMinor ? 10 : 5;
          const x1 = center + Math.cos(angle) * (tickRadius - tickLength);
          const y1 = center + Math.sin(angle) * (tickRadius - tickLength);
          const x2 = center + Math.cos(angle) * tickRadius;
          const y2 = center + Math.sin(angle) * tickRadius;

          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isMajor ? theme.colors.textPrimary : theme.colors.textMuted}
                strokeWidth={isMajor ? 2 : 1}
              />
              {isMajor && (
                <text
                  x={center + Math.cos(angle) * (innerRadius - 20)}
                  y={center + Math.sin(angle) * (innerRadius - 20)}
                  fill={theme.colors.textPrimary}
                  fontSize="16"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {['N', 'E', 'S', 'W'][i / 9]}
                </text>
              )}
            </g>
          );
        })}

        {/* Heading pointer */}
        <g transform={`rotate(${radToDeg(heading)}, ${center}, ${center})`}>
          {/* North pointer (red) */}
          <polygon
            points={`${center},${center - outerRadius + 5} ${center - 12},${center} ${center + 12},${center}`}
            fill="#ef5350"
          />
          {/* South pointer (white) */}
          <polygon
            points={`${center},${center + outerRadius - 5} ${center - 12},${center} ${center + 12},${center}`}
            fill={theme.colors.textMuted}
          />
          {/* Center dot */}
          <circle cx={center} cy={center} r="8" fill="#fff" />
        </g>

        {/* Current heading indicator at top */}
        <polygon
          points={`${center - 10},20 ${center + 10},20 ${center},35`}
          fill="#ffa726"
        />
      </svg>
    );
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: theme.colors.bgPrimary,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{t('heading.heading')}</h1>
      </div>

      {/* Main heading display with compass */}
      <div style={{
        flex: '0 0 auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {renderCompass()}
        <div style={{
          marginTop: '1rem',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '4rem',
            fontWeight: 'bold',
            color: '#ffa726',
            lineHeight: 1,
          }}>
            {Math.round(radToDeg(heading)) % 360}°
          </div>
          <div style={{
            fontSize: '1.5rem',
            opacity: 0.6,
            marginTop: '0.25rem',
          }}>
            {getCardinalDirection(radToDeg(heading))}
          </div>
        </div>
      </div>

      {/* Heading history graph */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '150px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <div style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('heading.heading_history')}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(Object.keys(TIMEFRAMES) as TimeframeOption[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: timeframe === tf ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                  border: timeframe === tf ? '1px solid rgba(25, 118, 210, 0.8)' : '1px solid transparent',
                  borderRadius: '4px',
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: timeframe === tf ? 'bold' : 'normal',
                }}
              >
                {TIMEFRAMES[tf].label}
              </button>
            ))}
          </div>
        </div>
        <div style={{
          flex: 1,
          background: theme.colors.bgCard,
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {isLoading && chartData.length === 0 && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.5,
              fontSize: '0.9rem',
            }}>
              {t('common.loading_history')}
            </div>
          )}
          <TimeSeriesChart
            data={chartData}
            timeframeMs={TIMEFRAMES[timeframe].ms}
            yInterval={90}
            yHeadroom={0}
            yUnit="°"
            yMinValue={0}
            yMaxValue={359}
            lineColor="#ffa726"
            fillGradient={false}
          />
        </div>
      </div>
    </div>
  );
};
