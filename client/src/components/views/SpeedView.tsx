import React, { useState, useEffect, useCallback } from 'react';
import { useSettings, speedConversions } from '../../context/SettingsContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';

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
  const { speedUnit, convertSpeed } = useSettings();
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('5m');
  const [isLoading, setIsLoading] = useState(true);

  const convertedSpeed = convertSpeed(speed);

  const getSpeedColor = (speedInKnots: number) => {
    if (speedInKnots < 1) return '#64b5f6'; // Light blue - very slow
    if (speedInKnots < 5) return '#4fc3f7'; // Cyan - cruising
    if (speedInKnots < 10) return '#66bb6a'; // Green - good speed
    if (speedInKnots < 15) return '#ffa726'; // Orange - fast
    return '#ef5350'; // Red - very fast
  };

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
        // Database stores UTC timestamps without 'Z' suffix, so append it for correct parsing
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

  // Fetch history on mount and when timeframe changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Periodically refresh history data
  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // Chart data from server
  const chartData = React.useMemo(() => {
    return historyData;
  }, [historyData]);

  // Calculate stats
  const stats = React.useMemo(() => {
    if (chartData.length === 0) {
      return { avg: 0, max: 0, min: 0 };
    }
    const values = chartData.map(p => p.value);
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
    };
  }, [chartData]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0a1929',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Speed</h1>
      </div>

      {/* Main speed display */}
      <div style={{
        flex: '0 0 auto',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '6rem',
          fontWeight: 'bold',
          color: getSpeedColor(speed),
          lineHeight: 1,
        }}>
          {convertedSpeed.toFixed(1)}
        </div>
        <div style={{
          fontSize: '1.5rem',
          opacity: 0.6,
          marginTop: '0.5rem',
        }}>
          {speedConversions[speedUnit].label}
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#64b5f6' }}>
            {stats.avg.toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Max</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#66bb6a' }}>
            {stats.max.toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Min</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffa726' }}>
            {stats.min.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Speed history graph */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '200px',
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
            Speed History
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(Object.keys(TIMEFRAMES) as TimeframeOption[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: timeframe === tf ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  border: timeframe === tf ? '1px solid rgba(25, 118, 210, 0.8)' : '1px solid transparent',
                  borderRadius: '4px',
                  color: '#fff',
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
          background: 'rgba(255,255,255,0.03)',
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
              Loading history...
            </div>
          )}
          <TimeSeriesChart
            data={chartData}
            timeframeMs={TIMEFRAMES[timeframe].ms}
            yInterval={2}
            yHeadroom={1}
            yUnit={speedConversions[speedUnit].label}
            lineColor="#66bb6a"
          />
        </div>
      </div>
    </div>
  );
};
