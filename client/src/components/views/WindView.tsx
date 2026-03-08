import React from 'react';
import { SensorData } from '../../types';
import { useSettings, windConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { radToDeg } from '../../utils/angle';
import { ViewLayout } from './shared';

interface WindViewProps {
  sensorData: SensorData;
  onClose: () => void;
}

export const WindView: React.FC<WindViewProps> = ({ sensorData, onClose }) => {
  const { wind } = sensorData.environment;
  const { windUnit, convertWind } = useSettings();
  const { theme } = useTheme();
  const { t } = useLanguage();

  const getWindSector = (angle: number): string => {
    if (angle < 30 || angle > 330) return t('wind.dead_ahead');
    if (angle >= 30 && angle < 60) return t('wind.close_reach_stbd');
    if (angle >= 60 && angle < 90) return t('wind.beam_reach_stbd');
    if (angle >= 90 && angle < 135) return t('wind.broad_reach_stbd');
    if (angle >= 135 && angle < 180) return t('wind.running_stbd');
    if (angle >= 180 && angle < 225) return t('wind.running_port');
    if (angle >= 225 && angle < 270) return t('wind.broad_reach_port');
    if (angle >= 270 && angle < 300) return t('wind.beam_reach_port');
    return t('wind.close_reach_port');
  };

  const beaufortScale = (knots: number): { force: number; description: string } => {
    if (knots < 1) return { force: 0, description: t('beaufort.0') };
    if (knots < 4) return { force: 1, description: t('beaufort.1') };
    if (knots < 7) return { force: 2, description: t('beaufort.2') };
    if (knots < 11) return { force: 3, description: t('beaufort.3') };
    if (knots < 17) return { force: 4, description: t('beaufort.4') };
    if (knots < 22) return { force: 5, description: t('beaufort.5') };
    if (knots < 28) return { force: 6, description: t('beaufort.6') };
    if (knots < 34) return { force: 7, description: t('beaufort.7') };
    if (knots < 41) return { force: 8, description: t('beaufort.8') };
    if (knots < 48) return { force: 9, description: t('beaufort.9') };
    if (knots < 56) return { force: 10, description: t('beaufort.10') };
    if (knots < 64) return { force: 11, description: t('beaufort.11') };
    return { force: 12, description: t('beaufort.12') };
  };

  const beaufort = beaufortScale(wind.speedApparent);

  const convertedApparent = convertWind(wind.speedApparent);
  const convertedTrue = convertWind(wind.speedTrue);

  const formatWindValue = (value: number) => {
    if (windUnit === 'bft') return value.toFixed(0);
    return value.toFixed(1);
  };

  const unitLabel = windConversions[windUnit].label;

  return (
    <ViewLayout title={t('wind.instrument')} onClose={onClose}>
      {/* Main Content - scrollable */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'clamp(1rem, 3vw, 2rem)',
        overflowY: 'auto',
      }}>
        {/* Wind Rose */}
        <div style={{
          position: 'relative',
          width: 'min(70vw, 50vh, 350px)',
          aspectRatio: '1',
          flexShrink: 0,
        }}>
          <svg
            viewBox="0 0 350 350"
            style={{ width: '100%', height: '100%' }}
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
                  fill={theme.colors.textSecondary}
                  fontSize="14"
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

            {/* Apparent wind arrow */}
            <g transform={`rotate(${radToDeg(wind.angleApparent)} 175 175)`}>
              <line
                x1="175"
                y1="175"
                x2="175"
                y2="30"
                stroke={theme.colors.dataWind}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <polygon
                points="175,20 165,45 185,45"
                fill={theme.colors.dataWind}
              />
            </g>

            {/* True wind arrow (if different) */}
            <g transform={`rotate(${radToDeg(wind.angleTrue)} 175 175)`}>
              <line
                x1="175"
                y1="175"
                x2="175"
                y2="50"
                stroke={theme.colors.dataDepth}
                strokeWidth="2"
                strokeDasharray="8 4"
                strokeLinecap="round"
              />
              <polygon
                points="175,40 168,55 182,55"
                fill={theme.colors.dataDepth}
              />
            </g>
          </svg>
        </div>

        {/* Wind data display */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(0.75rem, 2vw, 2rem)',
          marginTop: 'clamp(1rem, 2vw, 2rem)',
          width: '100%',
          maxWidth: '600px',
          justifyContent: 'center',
        }}>
          {/* Apparent Wind */}
          <div style={{
            flex: '1 1 200px',
            minWidth: '160px',
            background: 'rgba(255, 167, 38, 0.1)',
            border: '1px solid rgba(255, 167, 38, 0.3)',
            borderRadius: '12px',
            padding: 'clamp(1rem, 2vw, 1.5rem)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', opacity: 0.6, marginBottom: '0.5rem' }}>
              {t('wind.apparent_wind')}
            </div>
            <div style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 'bold', color: theme.colors.dataWind }}>
              {formatWindValue(convertedApparent)}
            </div>
            <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1rem)', opacity: 0.6 }}>{unitLabel}</div>
            <div style={{ marginTop: '0.75rem', fontSize: 'clamp(1rem, 3vw, 1.5rem)', color: theme.colors.dataWind }}>
              {radToDeg(wind.angleApparent).toFixed(0)}°
            </div>
            <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', opacity: 0.6 }}>
              {getWindSector(radToDeg(wind.angleApparent))}
            </div>
          </div>

          {/* True Wind */}
          <div style={{
            flex: '1 1 200px',
            minWidth: '160px',
            background: 'rgba(79, 195, 247, 0.1)',
            border: '1px solid rgba(79, 195, 247, 0.3)',
            borderRadius: '12px',
            padding: 'clamp(1rem, 2vw, 1.5rem)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', opacity: 0.6, marginBottom: '0.5rem' }}>
              {t('wind.true_wind')}
            </div>
            <div style={{ fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 'bold', color: theme.colors.dataDepth }}>
              {formatWindValue(convertedTrue)}
            </div>
            <div style={{ fontSize: 'clamp(0.85rem, 2vw, 1rem)', opacity: 0.6 }}>{unitLabel}</div>
            <div style={{ marginTop: '0.75rem', fontSize: 'clamp(1rem, 3vw, 1.5rem)', color: theme.colors.dataDepth }}>
              {radToDeg(wind.angleTrue).toFixed(0)}°
            </div>
            <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', opacity: 0.6 }}>
              {getWindSector(radToDeg(wind.angleTrue))}
            </div>
          </div>
        </div>

        {/* Beaufort Scale */}
        <div style={{
          marginTop: 'clamp(1rem, 2vw, 2rem)',
          background: theme.colors.bgCard,
          borderRadius: '12px',
          padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 2rem)',
          textAlign: 'center',
          fontSize: 'clamp(0.85rem, 2vw, 1rem)',
        }}>
          <span style={{ opacity: 0.6 }}>{t('wind.beaufort')} </span>
          <span style={{ fontWeight: 'bold', fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>
            {t('wind.force')} {beaufort.force}
          </span>
          <span style={{ opacity: 0.6 }}> - {beaufort.description}</span>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(1rem, 3vw, 2rem)',
          marginTop: 'clamp(0.75rem, 2vw, 1.5rem)',
          fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
          justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '4px', background: theme.colors.dataWind, borderRadius: '2px' }} />
            <span style={{ opacity: 0.6 }}>{t('wind.apparent')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '20px', height: '4px', background: theme.colors.dataDepth, borderRadius: '2px', borderStyle: 'dashed' }} />
            <span style={{ opacity: 0.6 }}>{t('wind.true')}</span>
          </div>
        </div>
      </div>
    </ViewLayout>
  );
};
