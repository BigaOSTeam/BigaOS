import React, { useState, useEffect, useCallback } from 'react';
import { TimeSeriesChart, TimeSeriesDataPoint } from '../charts';
import { sensorAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ViewLayout,
} from './shared';

interface BatteryViewProps {
  voltage: number;
  current: number;
  temperature: number;
  stateOfCharge: number;
  batteryId?: string;
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

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [voltageRes, chargeRes] = await Promise.all([
        sensorAPI.getSpecificSensorHistory('electrical', `${batteryId}_voltage`, TIMEFRAMES[timeframe].minutes),
        sensorAPI.getSpecificSensorHistory('electrical', `${batteryId}_stateOfCharge`, TIMEFRAMES[timeframe].minutes),
      ]);

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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const renderBatteryIcon = () => {
    const fillWidth = Math.max(0, Math.min(100, stateOfCharge));
    const color = getBatteryColor(stateOfCharge);

    return (
      <svg
        viewBox="0 0 120 60"
        style={{ width: 'min(30vw, 150px)', height: 'auto' }}
      >
        <rect x="5" y="10" width="100" height="40" rx="4" fill="none" stroke={theme.colors.textDisabled} strokeWidth="3" />
        <rect x="105" y="20" width="10" height="20" rx="2" fill={theme.colors.textDisabled} />
        <rect x="9" y="14" width={fillWidth * 0.92} height="32" rx="2" fill={color} />
        <text x="55" y="35" fill="#fff" fontSize="18" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {Math.round(stateOfCharge)}%
        </text>
      </svg>
    );
  };

  const timeframeOptions = (Object.keys(TIMEFRAMES) as TimeframeOption[]).map(
    (key) => ({ key, label: TIMEFRAMES[key].label })
  );

  const statLabelStyle: React.CSSProperties = {
    fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '0.25rem',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
    fontWeight: 'bold',
  };

  return (
    <ViewLayout title={t('battery.battery')} onClose={onClose}>
      {/* Main battery display */}
      <div style={{
        flex: '0 0 auto',
        padding: 'clamp(1rem, 2vw, 1.5rem)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {renderBatteryIcon()}
        <div style={{
          marginTop: '0.5rem',
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          opacity: 0.6,
        }}>
          {t('battery.state_of_charge')}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        padding: '0 1rem 1rem',
      }}>
        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={statLabelStyle}>
            {t('battery.voltage')}
          </div>
          <div style={{ ...statValueStyle, color: theme.colors.dataWind }}>
            {voltage.toFixed(1)}V
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={statLabelStyle}>
            {t('battery.current')}
          </div>
          <div style={{ ...statValueStyle, color: current >= 0 ? '#66bb6a' : '#ef5350' }}>
            {current >= 0 ? '+' : ''}{current.toFixed(1)}A
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={statLabelStyle}>
            {t('battery.temperature')}
          </div>
          <div style={{ ...statValueStyle, color: getTemperatureColor(temperature) }}>
            {temperature.toFixed(0)}°C
          </div>
        </div>

        <div style={{
          background: theme.colors.bgCard,
          borderRadius: '8px',
          padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={statLabelStyle}>
            {t('battery.status')}
          </div>
          <div style={{ ...statValueStyle, fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', color: current > 0.5 ? '#66bb6a' : current < -0.5 ? '#ff7043' : '#64b5f6' }}>
            {current > 0.5 ? t('battery.charging') : current < -0.5 ? t('battery.discharging') : t('battery.idle')}
          </div>
        </div>
      </div>

      {/* Graphs */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '300px',
      }}>
        <div
          style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.5rem',
          }}
        >
          {t('battery.voltage_history')}
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '0.5rem', minHeight: 0 }}>
          {/* Charts column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
            <div style={{
              flex: 1,
              background: theme.colors.bgCard,
              borderRadius: '8px',
              overflow: 'hidden',
              position: 'relative',
              minHeight: '120px',
            }}>
              {isLoading && voltageHistory.length === 0 && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.5,
                  fontSize: '0.8rem',
                  zIndex: 1,
                }}>
                  {t('common.loading')}
                </div>
              )}
              <TimeSeriesChart
                data={voltageHistory}
                timeframeMs={TIMEFRAMES[timeframe].ms}
                yInterval={1}
                yHeadroom={0.5}
                yUnit="V"
                lineColor={theme.colors.dataWind}
                fillGradient={false}
              />
            </div>

            <div style={{
              fontSize: 'clamp(0.65rem, 2vw, 0.8rem)',
              opacity: 0.6,
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
              minHeight: '120px',
            }}>
              {isLoading && chargeHistory.length === 0 && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.5,
                  fontSize: '0.8rem',
                  zIndex: 1,
                }}>
                  {t('common.loading')}
                </div>
              )}
              <TimeSeriesChart
                data={chargeHistory}
                timeframeMs={TIMEFRAMES[timeframe].ms}
                yInterval={25}
                yHeadroom={0}
                yUnit="%"
                yMinValue={0}
                yMaxValue={100}
                lineColor={theme.colors.dataSpeed}
              />
            </div>
          </div>

          {/* Timeframe sidebar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            flexShrink: 0,
          }}>
            {timeframeOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => { if (timeframe === option.key) return; setVoltageHistory([]); setChargeHistory([]); setTimeframe(option.key as TimeframeOption); }}
                className="touch-btn"
                style={{
                  flex: 1,
                  padding: '0.5rem 1.25rem',
                  background:
                    timeframe === option.key
                      ? theme.colors.primaryMedium
                      : theme.colors.bgCard,
                  border:
                    timeframe === option.key
                      ? `1px solid ${theme.colors.primarySolid}`
                      : `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: 'clamp(1rem, 3vw, 1.25rem)',
                  fontWeight: timeframe === option.key ? 'bold' : 'normal',
                  minWidth: '3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ViewLayout>
  );
};
