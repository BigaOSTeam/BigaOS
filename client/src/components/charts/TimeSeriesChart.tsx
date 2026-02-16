import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';

export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  timeframeMs: number;
  // Y-axis configuration
  yInterval: number;      // e.g., 3 for 3m steps, 2 for 2kt steps
  yHeadroom: number;      // e.g., 2 for 2m headroom above max
  yUnit?: string;         // e.g., 'm', 'kt', '°' - displayed on axis
  yMinValue?: number;     // Minimum Y value (default: 0)
  yMaxValue?: number;     // Fixed maximum (if not provided, auto-calculated)
  // Styling
  lineColor?: string;     // Line color (default: #4fc3f7)
  fillGradient?: boolean; // Show gradient fill under line (default: true)
  // Optional alarm threshold
  alarmThreshold?: number | null;
  alarmColor?: string;
}

// Calculate nice Y-axis maximum with fixed intervals and headroom
const calculateNiceMax = (maxValue: number, interval: number, headroom: number): number => {
  const minRequired = maxValue + headroom;
  const niceMax = Math.ceil(minRequired / interval) * interval;
  return Math.max(niceMax, interval);
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  timeframeMs,
  yInterval,
  yHeadroom,
  yUnit = '',
  yMinValue = 0,
  yMaxValue,
  lineColor = '#4fc3f7',
  fillGradient = true,
  alarmThreshold,
  alarmColor = '#ef5350',
}) => {
  const { timeFormat } = useSettings();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 300, height: 150 });

  // Measure container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setChartSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Generate unique gradient ID to avoid conflicts when multiple charts are on the page
  const gradientId = useMemo(() => `chartGradient-${Math.random().toString(36).substr(2, 9)}`, []);

  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}
      >
        No data available
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const width = chartSize.width;
  const height = chartSize.height;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (chartWidth <= 0 || chartHeight <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  // Time bounds - use current time as right edge
  const now = Date.now();
  const timeStart = now - timeframeMs;

  // Filter data to only include points within the timeframe
  const filteredData = data.filter(d => d.timestamp >= timeStart && d.timestamp <= now);

  // If no data in timeframe after filtering, show message
  if (filteredData.length < 2) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}
      >
        No data in timeframe
      </div>
    );
  }

  // Calculate bounds using filtered data
  const values = filteredData.map(d => d.value);
  const minVal = yMinValue;
  const dataMax = Math.max(...values) || yInterval;
  const maxVal = yMaxValue !== undefined ? yMaxValue : calculateNiceMax(dataMax, yInterval, yHeadroom);

  // Generate Y ticks at fixed intervals
  const yTickCount = Math.round((maxVal - minVal) / yInterval) + 1;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => minVal + i * yInterval);

  // Generate X ticks
  const xTickCount = 4;
  const xStep = timeframeMs / (xTickCount - 1);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => timeStart + i * xStep);

  // Map filtered data to coordinates
  const points = filteredData.map(d => {
    const x = padding.left + ((d.timestamp - timeStart) / timeframeMs) * chartWidth;
    const y = padding.top + chartHeight - ((d.value - minVal) / (maxVal - minVal)) * chartHeight;
    return { x, y };
  });

  // Create path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = fillGradient
    ? `${linePath} L${points[points.length - 1].x},${padding.top + chartHeight} L${points[0].x},${padding.top + chartHeight} Z`
    : '';

  // Alarm line Y position
  const alarmY = alarmThreshold !== null && alarmThreshold !== undefined
    ? padding.top + chartHeight - ((alarmThreshold - minVal) / (maxVal - minVal)) * chartHeight
    : null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {fillGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
            </linearGradient>
          </defs>
        )}

        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - ((tick - minVal) / (maxVal - minVal)) * chartHeight;
          return (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={theme.colors.border}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fill={theme.colors.textMuted}
                fontSize="11"
                textAnchor="end"
              >
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}{yUnit}
              </text>
            </g>
          );
        })}

        {/* X axis labels */}
        {xTicks.map((tick, i) => {
          const x = padding.left + ((tick - timeStart) / timeframeMs) * chartWidth;
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={height - 8}
              fill={theme.colors.textMuted}
              fontSize="11"
              textAnchor="middle"
            >
              {formatTime(tick)}
            </text>
          );
        })}

        {/* Alarm threshold line */}
        {alarmY !== null && alarmY >= padding.top && alarmY <= padding.top + chartHeight && (
          <line
            x1={padding.left}
            y1={alarmY}
            x2={width - padding.right}
            y2={alarmY}
            stroke={alarmColor}
            strokeWidth="2"
            strokeDasharray="6,4"
          />
        )}

        {/* Area fill */}
        {fillGradient && areaPath && (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        )}

        {/* Data line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current value dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="5"
            fill={lineColor}
            stroke={theme.colors.bgPrimary}
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
};
