import React, { useEffect, useState, useCallback } from 'react';
import { useSettings, depthConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';

interface DepthViewProps {
  depth: number; // Current depth in meters
  onClose: () => void;
}

type TimeframeOption = '15m' | '1h' | '6h' | '24h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
  '24h': { label: '24h', ms: 24 * 60 * 60 * 1000, minutes: 1440 },
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

  const [timeframe, setTimeframe] = useState<TimeframeOption>('15m');
  const [historyData, setHistoryData] = useState<TimeSeriesDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const convertedDepth = convertDepth(depth);

  // Sound is handled by AlertContainer via unified notification system

  const getDepthColor = (depthInMeters: number) => {
    if (isDepthAlarmTriggered) return '#ef5350';
    if (depthInMeters < 2) return '#ef5350';
    if (depthInMeters < 5) return '#ffa726';
    if (depthInMeters < 10) return '#66bb6a';
    return '#4fc3f7';
  };

  // Fetch history data from server
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await sensorAPI.getSpecificSensorHistory(
        'environment',
        'depth',
        TIMEFRAMES[timeframe].minutes
      );
      const data = response.data.map((item: any) => ({
        // Database stores UTC timestamps without 'Z' suffix, so append it for correct parsing
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

  // Fetch history on mount and when timeframe changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Periodically refresh history data
  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // Convert server data for chart display
  const chartData = React.useMemo(() => {
    return historyData;
  }, [historyData]);

  // Chart configuration based on unit
  const chartConfig = depthUnit === 'm'
    ? { interval: 3, headroom: 2, unit: 'm' }
    : { interval: 10, headroom: 5, unit: 'ft' };

  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{t('depth.depth')}</h1>
      </div>

      {/* Main depth display */}
      <div style={{
        flex: '0 0 auto',
        padding: '2rem',
        textAlign: 'center',
        background: isDepthAlarmTriggered ? 'rgba(239, 83, 80, 0.2)' : 'transparent',
        transition: 'background 0.3s',
      }}>
        <div style={{
          fontSize: '6rem',
          fontWeight: 'bold',
          color: getDepthColor(depth),
          lineHeight: 1,
          animation: isDepthAlarmTriggered ? 'pulse 1s infinite' : 'none',
        }}>
          {convertedDepth.toFixed(1)}
        </div>
        <div style={{
          fontSize: '1.5rem',
          opacity: 0.6,
          marginTop: '0.5rem',
        }}>
          {depthConversions[depthUnit].label}
        </div>
      </div>

      {/* Depth history graph */}
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
            {t('depth.depth_history')}
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
            yInterval={chartConfig.interval}
            yHeadroom={chartConfig.headroom}
            yUnit={chartConfig.unit}
            lineColor="#4fc3f7"
            alarmThreshold={depthAlarm}
          />
        </div>
      </div>

      {/* Alarm settings */}
      <div style={{
        flex: '0 0 auto',
        padding: '1rem',
        borderTop: `1px solid ${theme.colors.border}`,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}>
          <div style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('depth.depth_alarm')}
          </div>
          {depthAlarm !== null && (
            <button
              onClick={() => setDepthAlarm(null)}
              style={{
                background: 'rgba(239, 83, 80, 0.2)',
                border: '1px solid rgba(239, 83, 80, 0.5)',
                borderRadius: '4px',
                color: '#ef5350',
                padding: '0.25rem 0.75rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {t('depth.clear_alarm')}
            </button>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          {alarmOptions.map((alarmDepth) => (
            <button
              key={alarmDepth}
              onClick={() => setDepthAlarm(alarmDepth)}
              style={{
                flex: '1 1 auto',
                minWidth: '60px',
                padding: '1rem 0.5rem',
                background: depthAlarm === alarmDepth ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                border: depthAlarm === alarmDepth ? '2px solid rgba(25, 118, 210, 0.8)' : '2px solid transparent',
                borderRadius: '8px',
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                fontSize: '1rem',
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
            <span>{t('depth.sound_alarm')}</span>
          </div>
          <button
            onClick={() => setSoundAlarmEnabled(!soundAlarmEnabled)}
            style={{
              width: '50px',
              height: '28px',
              borderRadius: '14px',
              background: soundAlarmEnabled ? 'rgba(25, 118, 210, 0.8)' : theme.colors.borderHover,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: soundAlarmEnabled ? '25px' : '3px',
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
        `}
      </style>
    </div>
  );
};
