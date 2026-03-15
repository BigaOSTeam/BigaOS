import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

export interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  timeframeMs: number;
  yInterval: number;
  yHeadroom: number;
  yUnit?: string;
  yMinValue?: number;
  yMaxValue?: number;
  lineColor?: string;
  fillGradient?: boolean;
  alarmThreshold?: number | null;
  alarmColor?: string;
  yLabelFormatter?: (value: number) => string;
}

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
  yMinValue,
  yMaxValue,
  lineColor = '#4fc3f7',
  fillGradient = true,
  alarmThreshold,
  alarmColor = '#ef5350',
  yLabelFormatter,
}) => {
  const { timeFormat } = useSettings();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const [transitioning, setTransitioning] = useState(false);
  const prevTimeframeRef = useRef(timeframeMs);

  // Fade out on timeframe change
  useEffect(() => {
    if (prevTimeframeRef.current !== timeframeMs) {
      prevTimeframeRef.current = timeframeMs;
      setTransitioning(true);
      const timer = setTimeout(() => setTransitioning(false), 300);
      return () => clearTimeout(timer);
    }
  }, [timeframeMs]);

  // Use ResizeObserver for reliable container measurement
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setChartSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    observer.observe(el);

    // Initial measurement
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setChartSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    }

    return () => observer.disconnect();
  }, []);

  const gradientId = useMemo(() => `chartGradient-${Math.random().toString(36).substr(2, 9)}`, []);

  const formatTime = useCallback((ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  }, [timeFormat]);

  const { width, height } = chartSize;

  // Responsive font size and padding based on chart dimensions
  const fontSize = Math.max(10, Math.min(13, Math.floor(Math.min(width, height) * 0.06)));

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
          fontSize: '0.85rem',
          color: theme.colors.textMuted,
        }}
      >
        {data.length > 0 ? t('chart.no_data') : ''}
      </div>
    );
  }

  // Not yet measured
  if (width <= 0 || height <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  // Time bounds
  const now = Date.now();
  const timeStart = now - timeframeMs;

  const filteredData = data.filter(d => d.timestamp >= timeStart && d.timestamp <= now);

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
          fontSize: '0.85rem',
          color: theme.colors.textMuted,
        }}
      >
        {t('chart.no_data_timeframe')}
      </div>
    );
  }

  // Y-axis bounds (computed before padding so we can measure label width)
  const values = filteredData.map(d => d.value);
  const dataMin = Math.min(...values);
  const minVal = yMinValue !== undefined ? yMinValue : Math.floor(Math.min(0, dataMin - yHeadroom) / yInterval) * yInterval;
  const dataMax = Math.max(...values) || yInterval;
  const maxVal = yMaxValue !== undefined ? yMaxValue : calculateNiceMax(dataMax, yInterval, yHeadroom);
  const yRange = maxVal - minVal || 1;

  // Estimate left padding from widest Y label
  const extremeLabels = [minVal, maxVal].map(v =>
    yLabelFormatter ? yLabelFormatter(v) : `${Number.isInteger(v) ? v : v.toFixed(1)}${yUnit}`
  );
  const maxLabelChars = Math.max(...extremeLabels.map(l => l.length));
  const estimatedLabelWidth = maxLabelChars * fontSize * 0.65 + 8;

  const padding = {
    top: 22,
    right: 20,
    bottom: fontSize + 12,
    left: Math.max(fontSize * 3, estimatedLabelWidth),
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (chartWidth <= 0 || chartHeight <= 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }

  // Y ticks - limit count to avoid crowding in small charts
  const maxYTicks = Math.max(2, Math.floor(chartHeight / 30));
  const yTickStep = Math.max(yInterval, Math.ceil((maxVal - minVal) / maxYTicks / yInterval) * yInterval);
  const yTicks: number[] = [];
  for (let v = minVal; v <= maxVal; v += yTickStep) {
    yTicks.push(v);
  }

  // X ticks - adaptive count based on width
  const maxXTicks = Math.max(2, Math.floor(chartWidth / 60));
  const xTickCount = Math.min(maxXTicks, 6);
  const xStep = timeframeMs / (xTickCount - 1);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => timeStart + i * xStep);

  // Map data to coordinates
  const points = filteredData.map(d => {
    const x = padding.left + ((d.timestamp - timeStart) / timeframeMs) * chartWidth;
    const y = padding.top + chartHeight - ((d.value - minVal) / yRange) * chartHeight;
    return { x, y };
  });

  // Paths
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = fillGradient
    ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padding.top + chartHeight).toFixed(1)} L${points[0].x.toFixed(1)},${(padding.top + chartHeight).toFixed(1)} Z`
    : '';

  // Alarm line
  const alarmY = alarmThreshold !== null && alarmThreshold !== undefined
    ? padding.top + chartHeight - ((alarmThreshold - minVal) / yRange) * chartHeight
    : null;

  const lastPoint = points[points.length - 1];
  const dotRadius = Math.max(3, Math.min(5, Math.floor(Math.min(width, height) * 0.025)));

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={width} height={height} style={{
        display: 'block',
        opacity: transitioning ? 0 : 1,
        transition: 'opacity 0.25s ease',
      }}>
        {fillGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
            </linearGradient>
          </defs>
        )}

        {/* Y grid lines + labels */}
        {yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - ((tick - minVal) / yRange) * chartHeight;
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
                x={padding.left - 6}
                y={y + fontSize * 0.35}
                fill={theme.colors.textMuted}
                fontSize={fontSize}
                textAnchor="end"
              >
                {yLabelFormatter ? yLabelFormatter(tick) : `${Number.isInteger(tick) ? tick : tick.toFixed(1)}${yUnit}`}
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
              y={height - Math.max(4, padding.bottom * 0.2)}
              fill={theme.colors.textMuted}
              fontSize={fontSize}
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
        {lastPoint && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={dotRadius}
            fill={lineColor}
            stroke={theme.colors.bgPrimary}
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
};
