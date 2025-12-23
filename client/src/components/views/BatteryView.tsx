import React, { useState, useEffect, useRef } from 'react';

interface BatteryHistoryPoint {
  timestamp: number;
  voltage: number;
  current: number;
  stateOfCharge: number;
}

interface BatteryViewProps {
  voltage: number;
  current: number;
  temperature: number;
  stateOfCharge: number;
  onClose: () => void;
}

const BATTERY_HISTORY_MAX_POINTS = 300;

export const BatteryView: React.FC<BatteryViewProps> = ({
  voltage,
  current,
  temperature,
  stateOfCharge,
  onClose,
}) => {
  const [batteryHistory, setBatteryHistory] = useState<BatteryHistoryPoint[]>([]);
  const lastReadingTime = useRef<number>(0);

  // Add battery reading to history
  useEffect(() => {
    const now = Date.now();
    if (now - lastReadingTime.current >= 1000) {
      lastReadingTime.current = now;
      setBatteryHistory(prev => {
        const newHistory = [...prev, { timestamp: now, voltage, current, stateOfCharge }];
        if (newHistory.length > BATTERY_HISTORY_MAX_POINTS) {
          return newHistory.slice(-BATTERY_HISTORY_MAX_POINTS);
        }
        return newHistory;
      });
    }
  }, [voltage, current, stateOfCharge]);

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

  // Render battery icon
  const renderBatteryIcon = () => {
    const fillWidth = Math.max(0, Math.min(100, stateOfCharge));
    const color = getBatteryColor(stateOfCharge);

    return (
      <svg width="120" height="60" viewBox="0 0 120 60">
        {/* Battery outline */}
        <rect x="5" y="10" width="100" height="40" rx="4" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
        {/* Battery terminal */}
        <rect x="105" y="20" width="10" height="20" rx="2" fill="rgba(255,255,255,0.3)" />
        {/* Battery fill */}
        <rect x="9" y="14" width={fillWidth * 0.92} height="32" rx="2" fill={color} />
        {/* Percentage text */}
        <text x="55" y="35" fill="#fff" fontSize="18" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
          {Math.round(stateOfCharge)}%
        </text>
      </svg>
    );
  };

  // Render voltage/current history graph
  const renderGraph = (dataKey: 'voltage' | 'stateOfCharge') => {
    if (batteryHistory.length < 2) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}>
          Collecting data...
        </div>
      );
    }

    const graphHeight = 80;
    const data = batteryHistory.map(p => p[dataKey]);
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = (maxVal - minVal) || 1;

    const points = batteryHistory.map((point, index) => {
      const x = (index / (batteryHistory.length - 1)) * 100;
      const y = graphHeight - ((point[dataKey] - minVal) / range) * graphHeight;
      return `${x},${y}`;
    });

    const color = dataKey === 'voltage' ? '#ffa726' : '#66bb6a';

    return (
      <svg
        viewBox={`0 0 100 ${graphHeight}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: `${graphHeight}px` }}
      >
        {/* Grid lines */}
        {[0, 0.5, 1].map((ratio, i) => (
          <line
            key={i}
            x1="0"
            y1={ratio * graphHeight}
            x2="100"
            y2={ratio * graphHeight}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.3"
          />
        ))}

        {/* Data line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Battery</h1>
      </div>

      {/* Main battery display */}
      <div style={{
        flex: '0 0 auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {renderBatteryIcon()}
        <div style={{
          marginTop: '1rem',
          fontSize: '0.9rem',
          opacity: 0.6,
        }}>
          State of Charge
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Voltage
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ffa726' }}>
            {voltage.toFixed(1)}V
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Current
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: current >= 0 ? '#66bb6a' : '#ef5350' }}>
            {current >= 0 ? '+' : ''}{current.toFixed(1)}A
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Temperature
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: getTemperatureColor(temperature) }}>
            {temperature.toFixed(0)}°C
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
            Status
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: current > 0.5 ? '#66bb6a' : current < -0.5 ? '#ff7043' : '#64b5f6' }}>
            {current > 0.5 ? 'Charging' : current < -0.5 ? 'Discharging' : 'Idle'}
          </div>
        </div>
      </div>

      {/* Graphs */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        minHeight: '200px',
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Voltage History
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            padding: '0.5rem',
          }}>
            {renderGraph('voltage')}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Charge History
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            padding: '0.5rem',
          }}>
            {renderGraph('stateOfCharge')}
          </div>
        </div>
      </div>
    </div>
  );
};
