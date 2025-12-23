import React, { useState, useEffect, useRef } from 'react';

interface COGHistoryPoint {
  timestamp: number;
  cog: number; // In degrees
}

interface COGViewProps {
  cog: number; // Current course over ground in degrees
  onClose: () => void;
}

const COG_HISTORY_MAX_POINTS = 300;

export const COGView: React.FC<COGViewProps> = ({ cog, onClose }) => {
  const [cogHistory, setCogHistory] = useState<COGHistoryPoint[]>([]);
  const lastReadingTime = useRef<number>(0);

  // Add COG reading to history
  useEffect(() => {
    const now = Date.now();
    if (now - lastReadingTime.current >= 1000) {
      lastReadingTime.current = now;
      setCogHistory(prev => {
        const newHistory = [...prev, { timestamp: now, cog }];
        if (newHistory.length > COG_HISTORY_MAX_POINTS) {
          return newHistory.slice(-COG_HISTORY_MAX_POINTS);
        }
        return newHistory;
      });
    }
  }, [cog]);

  const getCardinalDirection = (degrees: number): string => {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return dirs[index];
  };

  // Render compass rose for COG
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
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="2"
        />

        {/* Inner circle */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(255,255,255,0.1)"
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
                stroke={isMajor ? '#fff' : 'rgba(255,255,255,0.4)'}
                strokeWidth={isMajor ? 2 : 1}
              />
              {isMajor && (
                <text
                  x={center + Math.cos(angle) * (innerRadius - 20)}
                  y={center + Math.sin(angle) * (innerRadius - 20)}
                  fill="#fff"
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

        {/* COG pointer - arrow style */}
        <g transform={`rotate(${cog}, ${center}, ${center})`}>
          {/* Arrow pointer */}
          <polygon
            points={`${center},${center - outerRadius + 10} ${center - 15},${center + 20} ${center},${center} ${center + 15},${center + 20}`}
            fill="#42a5f5"
          />
          {/* Center dot */}
          <circle cx={center} cy={center} r="8" fill="#fff" />
        </g>

        {/* Current COG indicator at top */}
        <polygon
          points={`${center - 10},20 ${center + 10},20 ${center},35`}
          fill="#42a5f5"
        />
      </svg>
    );
  };

  // Render COG history graph
  const renderGraph = () => {
    if (cogHistory.length < 2) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}>
          Collecting COG data...
        </div>
      );
    }

    const graphHeight = 120;

    // Create path
    const points = cogHistory.map((point, index) => {
      const x = (index / (cogHistory.length - 1)) * 100;
      const y = graphHeight - (point.cog / 360) * graphHeight;
      return `${x},${y}`;
    });

    return (
      <svg
        viewBox={`0 0 100 ${graphHeight}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: `${graphHeight}px` }}
      >
        {/* Grid lines at cardinal directions */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <g key={i}>
            <line
              x1="0"
              y1={ratio * graphHeight}
              x2="100"
              y2={ratio * graphHeight}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.3"
            />
            <text
              x="2"
              y={ratio * graphHeight + 3}
              fill="rgba(255,255,255,0.3)"
              fontSize="3"
            >
              {['360°', '270°', '180°', '90°', '0°'][i]}
            </text>
          </g>
        ))}

        {/* COG line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#42a5f5"
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
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Course Over Ground</h1>
      </div>

      {/* Main COG display with compass */}
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
            color: '#42a5f5',
            lineHeight: 1,
          }}>
            {Math.round(cog)}°
          </div>
          <div style={{
            fontSize: '1.5rem',
            opacity: 0.6,
            marginTop: '0.25rem',
          }}>
            {getCardinalDirection(cog)}
          </div>
        </div>
      </div>

      {/* COG history graph */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '150px',
      }}>
        <div style={{
          fontSize: '0.75rem',
          opacity: 0.6,
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Recent Course
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
