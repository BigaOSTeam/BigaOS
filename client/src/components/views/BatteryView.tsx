import React, { useState, useEffect, useCallback } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

interface BatteryViewProps {
  voltage: number;
  current: number;
  temperature: number;
  stateOfCharge: number;
  batteryId?: string; // e.g., 'house' or 'starter'
  onClose: () => void;
}

type TimeframeOption = '5m' | '15m' | '1h' | '6h';

const TIMEFRAMES: Record<TimeframeOption, { label: string; ms: number; minutes: number }> = {
  '5m': { label: '5m', ms: 5 * 60 * 1000, minutes: 5 },
  '15m': { label: '15m', ms: 15 * 60 * 1000, minutes: 15 },
  '1h': { label: '1h', ms: 60 * 60 * 1000, minutes: 60 },
  '6h': { label: '6h', ms: 6 * 60 * 60 * 1000, minutes: 360 },
};

export const BatteryView: React.FC<BatteryViewProps> = ({
  voltage,
  current,
  temperature,
  stateOfCharge,
  batteryId = 'house',
  onClose,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [voltageHistory, setVoltageHistory] = useState<TimeSeriesDataPoint[]>([]);
  const [chargeHistory, setChargeHistory] = useState<TimeSeriesDataPoint[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeOption>('15m');
  const [isLoading, setIsLoading] = useState(true);

  const getBatteryColor = (soc: number) => {
    if (soc > 80) return '#66bb6a';
    if (soc > 50) return '#ffa726';
    if (soc > 20) return '#ff7043';
    return '#ef5350';
  };

  const getTemperatureColor = (temp: number) => {
    if (temp < 30) return '#66bb6a';
    if (temp < 40) return '#ffa726';
    if (temp < 50) return '#ff7043';
    return '#ef5350';
  };

  // Fetch history data from server
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [voltageRes, chargeRes] = await Promise.all([
        sensorAPI.getSpecificSensorHistory('electrical', `${batteryId}_voltage`, TIMEFRAMES[timeframe].minutes),
        sensorAPI.getSpecificSensorHistory('electrical', `${batteryId}_stateOfCharge`, TIMEFRAMES[timeframe].minutes),
      ]);

      // Database stores UTC timestamps without 'Z' suffix, so append it for correct parsing
      setVoltageHistory(voltageRes.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: item.value,
      })));

      setChargeHistory(chargeRes.data.map((item: any) => ({
        timestamp: new Date(item.timestamp + 'Z').getTime(),
        value: item.value,
      })));
    } catch (error) {
      console.error('Failed to fetch battery history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeframe, batteryId]);

  // Fetch history on mount and when timeframe changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Periodically refresh history data
  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const voltageChartData = voltageHistory;
  const chargeChartData = chargeHistory;

  // Render battery icon
  const renderBatteryIcon = () => {
    const fillWidth = Math.max(0, Math.min(100, stateOfCharge));
    const color = getBatteryColor(stateOfCharge);

    return (
      <svg width="120" height="60" viewBox="0 0 120 60">
        {/* Battery outline */}
        <rect x="5" y="10" width="100" height="40" rx="4" fill="none" stroke={theme.colors.textDisabled} strokeWidth="3" />
        {/* Battery terminal */}
        <rect x="105" y="20" width="10" height="20" rx="2" fill={theme.colors.textDisabled} />
        {/* Battery fill */}
        <rect x="9" y="14" width={fillWidth * 0.92} height="32" rx="2" fill={color} />
        {/* Percentage text */}
        <text x="55" y="35" fill="#fff" fontSize="18" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {Math.round(stateOfCharge)}%
        </text>
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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{t('battery.battery')}</h1>
      </div>

      {/* Main battery display */}
      <div style={{
        flex: '0 0 auto',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {renderBatteryIcon()}
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.9rem',
          opacity: 0.6,
        }}>
          {t('battery.state_of_charge')}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.75rem',
        padding: '0 1rem 1rem',
      }}>
        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            {t('battery.voltage')}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffa726' }}>
            {voltage.toFixed(1)}V
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            {t('battery.current')}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: current >= 0 ? '#66bb6a' : '#ef5350' }}>
            {current >= 0 ? '+' : ''}{current.toFixed(1)}A
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            {t('battery.temperature')}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getTemperatureColor(temperature) }}>
            {temperature.toFixed(0)}°C
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            {t('battery.status')}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: current > 0.5 ? '#66bb6a' : current < -0.5 ? '#ff7043' : '#64b5f6' }}>
            {current > 0.5 ? t('battery.charging') : current < -0.5 ? t('battery.discharging') : t('battery.idle')}
          </div>
        </div>
      </div>

      {/* Timeframe selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '0.5rem 1rem',
        gap: '0.5rem',
      }}>
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

      {/* Graphs */}
      <div style={{
        flex: '1 1 auto',
        padding: '0 1rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        minHeight: '200px',
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '80px' }}>
          <div style={{
            fontSize: '0.7rem',
            opacity: 0.6,
            marginBottom: '0.25rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('battery.voltage_history')}
          </div>
          <div style={{
            flex: 1,
            background: theme.colors.bgCard,
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {isLoading && voltageChartData.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: 0.5,
                fontSize: '0.8rem',
              }}>
                {t('common.loading')}
              </div>
            )}
            <TimeSeriesChart
              data={voltageChartData}
              timeframeMs={TIMEFRAMES[timeframe].ms}
              yInterval={1}
              yHeadroom={0.5}
              yUnit="V"
              lineColor="#ffa726"
              fillGradient={false}
            />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '80px' }}>
          <div style={{
            fontSize: '0.7rem',
            opacity: 0.6,
            marginBottom: '0.25rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('battery.charge_history')}
          </div>
          <div style={{
            flex: 1,
            background: theme.colors.bgCard,
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {isLoading && chargeChartData.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: 0.5,
                fontSize: '0.8rem',
              }}>
                {t('common.loading')}
              </div>
            )}
            <TimeSeriesChart
              data={chargeChartData}
              timeframeMs={TIMEFRAMES[timeframe].ms}
              yInterval={25}
              yHeadroom={0}
              yUnit="%"
              yMinValue={0}
              yMaxValue={100}
              lineColor="#66bb6a"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
