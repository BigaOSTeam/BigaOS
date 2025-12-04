import React from 'react';
import { SensorData } from '../../types';

interface WindViewProps {
  sensorData: SensorData;
  onClose: () => void;
}

export const WindView: React.FC<WindViewProps> = ({ sensorData, onClose }) => {
  const { wind } = sensorData.environment;

  const getWindSector = (angle: number): string => {
    if (angle < 30 || angle > 330) return 'Dead Ahead';
    if (angle >= 30 && angle < 60) return 'Close Reach (Stbd)';
    if (angle >= 60 && angle < 90) return 'Beam Reach (Stbd)';
    if (angle >= 90 && angle < 135) return 'Broad Reach (Stbd)';
    if (angle >= 135 && angle < 180) return 'Running (Stbd)';
    if (angle >= 180 && angle < 225) return 'Running (Port)';
    if (angle >= 225 && angle < 270) return 'Broad Reach (Port)';
    if (angle >= 270 && angle < 300) return 'Beam Reach (Port)';
    return 'Close Reach (Port)';
  };

  const beaufortScale = (knots: number): { force: number; description: string } => {
    if (knots < 1) return { force: 0, description: 'Calm' };
    if (knots < 4) return { force: 1, description: 'Light Air' };
    if (knots < 7) return { force: 2, description: 'Light Breeze' };
    if (knots < 11) return { force: 3, description: 'Gentle Breeze' };
    if (knots < 17) return { force: 4, description: 'Moderate Breeze' };
    if (knots < 22) return { force: 5, description: 'Fresh Breeze' };
    if (knots < 28) return { force: 6, description: 'Strong Breeze' };
    if (knots < 34) return { force: 7, description: 'Near Gale' };
    if (knots < 41) return { force: 8, description: 'Gale' };
    if (knots < 48) return { force: 9, description: 'Strong Gale' };
    if (knots < 56) return { force: 10, description: 'Storm' };
    if (knots < 64) return { force: 11, description: 'Violent Storm' };
    return { force: 12, description: 'Hurricane' };
  };

  const beaufort = beaufortScale(wind.speedApparent);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0a1929',
      color: '#e0e0e0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#e0e0e0',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1rem',
          }}
        >
          ← Back
        </button>
        <h1 style={{ marginLeft: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
          Wind Instrument
        </h1>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        {/* Wind Rose */}
        <div style={{
          position: 'relative',
          width: '350px',
          height: '350px',
        }}>
          {/* Outer ring */}
          <svg
            width="350"
            height="350"
            viewBox="0 0 350 350"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {/* Background circle */}
            <circle cx="175" cy="175" r="170" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="2" />

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
                  stroke={isMajor ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.2)'}
                  strokeWidth={isMajor ? 2 : 1}
                />
              );
            })}

            {/* Cardinal directions */}
            {[
              { label: '0°', angle: -90 },
              { label: '30', angle: -60 },
              { label: '60', angle: -30 },
              { label: '90', angle: 0 },
              { label: '120', angle: 30 },
              { label: '150', angle: 60 },
              { label: '180', angle: 90 },
              { label: '210', angle: 120 },
              { label: '240', angle: 150 },
              { label: '270', angle: 180 },
              { label: '300', angle: 210 },
              { label: '330', angle: 240 },
            ].map(({ label, angle }) => {
              const rad = angle * (Math.PI / 180);
              const x = 175 + 120 * Math.cos(rad);
              const y = 175 + 120 * Math.sin(rad);
              return (
                <text
                  key={label}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255, 255, 255, 0.6)"
                  fontSize="14"
                >
                  {label}
                </text>
              );
            })}

            {/* Boat shape in center */}
            <path
              d="M175 140 L165 180 L175 175 L185 180 Z"
              fill="rgba(255, 255, 255, 0.3)"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth="1"
            />

            {/* Apparent wind arrow */}
            <g transform={`rotate(${wind.angleApparent} 175 175)`}>
              <line
                x1="175"
                y1="175"
                x2="175"
                y2="30"
                stroke="#ffa726"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <polygon
                points="175,20 165,45 185,45"
                fill="#ffa726"
              />
            </g>

            {/* True wind arrow (if different) */}
            <g transform={`rotate(${wind.angleTrue} 175 175)`}>
              <line
                x1="175"
                y1="175"
                x2="175"
                y2="50"
                stroke="#4fc3f7"
                strokeWidth="2"
                strokeDasharray="8 4"
                strokeLinecap="round"
              />
              <polygon
                points="175,40 168,55 182,55"
                fill="#4fc3f7"
              />
            </g>
          </svg>
        </div>

        {/* Wind data display */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          marginTop: '2rem',
          width: '100%',
          maxWidth: '600px',
        }}>
          {/* Apparent Wind */}
          <div style={{
            background: 'rgba(255, 167, 38, 0.1)',
            border: '1px solid rgba(255, 167, 38, 0.3)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.6, marginBottom: '0.5rem' }}>
              APPARENT WIND
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#ffa726' }}>
              {wind.speedApparent.toFixed(1)}
            </div>
            <div style={{ fontSize: '1rem', opacity: 0.6 }}>knots</div>
            <div style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#ffa726' }}>
              {wind.angleApparent.toFixed(0)}°
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
              {getWindSector(wind.angleApparent)}
            </div>
          </div>

          {/* True Wind */}
          <div style={{
            background: 'rgba(79, 195, 247, 0.1)',
            border: '1px solid rgba(79, 195, 247, 0.3)',
            borderRadius: '12px',
            padding: '1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.6, marginBottom: '0.5rem' }}>
              TRUE WIND
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#4fc3f7' }}>
              {wind.speedTrue.toFixed(1)}
            </div>
            <div style={{ fontSize: '1rem', opacity: 0.6 }}>knots</div>
            <div style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#4fc3f7' }}>
              {wind.angleTrue.toFixed(0)}°
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
              {getWindSector(wind.angleTrue)}
            </div>
          </div>
        </div>

        {/* Beaufort Scale */}
        <div style={{
          marginTop: '2rem',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '1rem 2rem',
          textAlign: 'center',
        }}>
          <span style={{ opacity: 0.6 }}>Beaufort: </span>
          <span style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>
            Force {beaufort.force}
          </span>
          <span style={{ opacity: 0.6 }}> - {beaufort.description}</span>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          gap: '2rem',
          marginTop: '1.5rem',
          fontSize: '0.875rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '4px', background: '#ffa726', borderRadius: '2px' }} />
            <span style={{ opacity: 0.6 }}>Apparent</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '4px', background: '#4fc3f7', borderRadius: '2px', borderStyle: 'dashed' }} />
            <span style={{ opacity: 0.6 }}>True</span>
          </div>
        </div>
      </div>
    </div>
  );
};
