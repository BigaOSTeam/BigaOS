import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings, windConversions } from '../../../context/SettingsContext';
import { radToDeg } from '../../../utils/angle';

interface WindRoseItemProps {
  speedApparent: number;
  angleApparent: number;
  angleTrue: number;
}

export const WindRoseItem = React.memo<WindRoseItemProps>(({
  speedApparent,
  angleApparent,
  angleTrue,
}) => {
  const { theme } = useTheme();
  const { windUnit, convertWind } = useSettings();

  const apparentDeg = radToDeg(angleApparent);
  const trueDeg = radToDeg(angleTrue);
  const convertedApparent = convertWind(speedApparent);
  const unitLabel = windConversions[windUnit].label;
  const displayValue = windUnit === 'bft' ? convertedApparent.toFixed(0) : convertedApparent.toFixed(1);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      padding: 'clamp(2px, 2cqmin, 12px)',
      position: 'relative',
    }}>
      <svg
        viewBox="0 0 350 350"
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* Background circle */}
        <circle cx="175" cy="175" r="170" fill={theme.colors.bgCard} stroke={theme.colors.border} strokeWidth="2" />

        {/* Degree marks */}
        {Array.from({ length: 72 }).map((_, i) => {
          const angle = (i * 5 - 90) * (Math.PI / 180);
          const isMajor = i % 6 === 0;
          const innerR = isMajor ? 140 : 155;
          const outerR = 165;
          return (
            <line
              key={i}
              x1={175 + innerR * Math.cos(angle)}
              y1={175 + innerR * Math.sin(angle)}
              x2={175 + outerR * Math.cos(angle)}
              y2={175 + outerR * Math.sin(angle)}
              stroke={isMajor ? theme.colors.textSecondary : theme.colors.borderHover}
              strokeWidth={isMajor ? 2 : 1}
            />
          );
        })}

        {/* Cardinal labels */}
        {[
          { label: '0°', angle: -90 },
          { label: '90', angle: 0 },
          { label: '180', angle: 90 },
          { label: '270', angle: 180 },
        ].map(({ label, angle }) => {
          const rad = angle * (Math.PI / 180);
          const x = 175 + 125 * Math.cos(rad);
          const y = 175 + 125 * Math.sin(rad);
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={theme.colors.textSecondary}
              fontSize="18"
              fontWeight="bold"
            >
              {label}
            </text>
          );
        })}

        {/* Boat shape in center */}
        <path
          d="M175 140 L165 180 L175 175 L185 180 Z"
          fill={theme.colors.textDisabled}
          stroke={theme.colors.textSecondary}
          strokeWidth="1"
        />

        {/* Apparent wind arrow (solid, orange) */}
        <g
          transform={`rotate(${apparentDeg} 175 175)`}
          style={{ transition: `transform ${theme.transition.slow}` }}
        >
          <line
            x1="175"
            y1="175"
            x2="175"
            y2="30"
            stroke={theme.colors.dataWind}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <polygon
            points="175,18 163,48 187,48"
            fill={theme.colors.dataWind}
          />
        </g>

        {/* True wind arrow (dashed, blue) */}
        <g
          transform={`rotate(${trueDeg} 175 175)`}
          style={{ transition: `transform ${theme.transition.slow}` }}
        >
          <line
            x1="175"
            y1="175"
            x2="175"
            y2="50"
            stroke={theme.colors.dataSpeed}
            strokeWidth="3"
            strokeDasharray="8 4"
            strokeLinecap="round"
          />
          <polygon
            points="175,40 166,58 184,58"
            fill={theme.colors.dataSpeed}
          />
        </g>

        {/* Center speed overlay */}
        <text
          x="175"
          y="210"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={theme.colors.dataWind}
          fontSize="32"
          fontWeight="bold"
        >
          {displayValue}
        </text>
        <text
          x="175"
          y="235"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={theme.colors.textMuted}
          fontSize="18"
        >
          {unitLabel}
        </text>
      </svg>
    </div>
  );
});
