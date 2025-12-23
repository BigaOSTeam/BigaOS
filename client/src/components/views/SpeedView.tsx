import React, { useState, useEffect, useRef } from 'react';
import { useSettings, speedConversions } from '../../context/SettingsContext';

interface SpeedHistoryPoint {
  timestamp: number;
  speed: number; // Always stored in knots
}

interface SpeedViewProps {
  speed: number; // Current speed in knots
  onClose: () => void;
}

const SPEED_HISTORY_MAX_POINTS = 300; // 5 minutes at 1 reading/second

export const SpeedView: React.FC<SpeedViewProps> = ({ speed, onClose }) => {
  const { speedUnit, convertSpeed } = useSettings();
  const [speedHistory, setSpeedHistory] = useState<SpeedHistoryPoint[]>([]);
  const lastReadingTime = useRef<number>(0);

  const convertedSpeed = convertSpeed(speed);

  // Add speed reading to history
  useEffect(() => {
    const now = Date.now();
    if (now - lastReadingTime.current >= 1000) {
      lastReadingTime.current = now;
      setSpeedHistory(prev => {
        const newHistory = [...prev, { timestamp: now, speed }];
        if (newHistory.length > SPEED_HISTORY_MAX_POINTS) {
          return newHistory.slice(-SPEED_HISTORY_MAX_POINTS);
        }
        return newHistory;
      });
    }
  }, [speed]);

  const getSpeedColor = (speedInKnots: number) => {
    if (speedInKnots < 1) return '#64b5f6'; // Light blue - very slow
    if (speedInKnots < 5) return '#4fc3f7'; // Cyan - cruising
    if (speedInKnots < 10) return '#66bb6a'; // Green - good speed
    if (speedInKnots < 15) return '#ffa726'; // Orange - fast
    return '#ef5350'; // Red - very fast
  };

  // Calculate stats
  const stats = React.useMemo(() => {
    if (speedHistory.length === 0) {
      return { avg: 0, max: 0, min: 0 };
    }
    const speeds = speedHistory.map(p => p.speed);
    return {
      avg: speeds.reduce((a, b) => a + b, 0) / speeds.length,
      max: Math.max(...speeds),
      min: Math.min(...speeds),
    };
  }, [speedHistory]);

  // Render speed history graph
  const renderGraph = () => {
    if (speedHistory.length < 2) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}>
          Collecting speed data...
        </div>
      );
    }

    const graphHeight = 200;

    // Find max for scaling
    const speeds = speedHistory.map(p => p.speed);
    const maxSpeed = Math.max(...speeds, 5) * 1.2;

    // Create path
    const points = speedHistory.map((point, index) => {
      const x = (index / (speedHistory.length - 1)) * 100;
      const y = graphHeight - (point.speed / maxSpeed) * graphHeight;
      return `${x},${y}`;
    });

    return (
      <svg
        viewBox={`0 0 100 ${graphHeight}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: `${graphHeight}px` }}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
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

        {/* Area fill */}
        <path
          d={`M0,${graphHeight} L${points.join(' L')} L100,${graphHeight} Z`}
          fill="url(#speedGradient)"
          opacity="0.3"
        />

        {/* Speed line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#66bb6a"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#66bb6a" />
            <stop offset="100%" stopColor="#0a1929" />
          </linearGradient>
        </defs>
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
            {convertSpeed(stats.avg).toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Max</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#66bb6a' }}>
            {convertSpeed(stats.max).toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Min</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffa726' }}>
            {convertSpeed(stats.min).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Speed history graph */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '200px',
      }}>
        <div style={{
          fontSize: '0.75rem',
          opacity: 0.6,
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Recent Speed
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          padding: '1rem',
          height: 'calc(100% - 2rem)',
        }}>
          {renderGraph()}
        </div>
      </div>
    </div>
  );
};
