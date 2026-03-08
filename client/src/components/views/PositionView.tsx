import React, { useState, useEffect, useRef } from 'react';
import { GeoPosition } from '../../types';
import { useSettings, distanceConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { ViewLayout } from './shared';

interface PositionHistoryPoint {
  timestamp: number;
  position: GeoPosition;
}

interface PositionViewProps {
  position: GeoPosition;
  onClose: () => void;
}

const POSITION_HISTORY_MAX_POINTS = 300;

export const PositionView: React.FC<PositionViewProps> = ({ position, onClose }) => {
  const { distanceUnit, convertDistance } = useSettings();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [positionHistory, setPositionHistory] = useState<PositionHistoryPoint[]>([]);
  const lastReadingTime = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastReadingTime.current >= 1000) {
      lastReadingTime.current = now;
      setPositionHistory(prev => {
        const newHistory = [...prev, { timestamp: now, position: { ...position } }];
        if (newHistory.length > POSITION_HISTORY_MAX_POINTS) {
          return newHistory.slice(-POSITION_HISTORY_MAX_POINTS);
        }
        return newHistory;
      });
    }
  }, [position]);

  const formatCoordinate = (value: number, isLatitude: boolean): string => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    const direction = isLatitude
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');
    return `${degrees}° ${minutes.toFixed(3)}' ${direction}`;
  };

  const calculateDistance = (p1: GeoPosition, p2: GeoPosition): number => {
    const R = 3440.065;
    const lat1 = p1.latitude * Math.PI / 180;
    const lat2 = p2.latitude * Math.PI / 180;
    const dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
    const dLon = (p2.longitude - p1.longitude) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const totalDistance = React.useMemo(() => {
    if (positionHistory.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < positionHistory.length; i++) {
      total += calculateDistance(positionHistory[i - 1].position, positionHistory[i].position);
    }
    return total;
  }, [positionHistory]);

  const renderTrackPlot = () => {
    if (positionHistory.length < 2) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          aspectRatio: '1',
          opacity: 0.5,
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          background: theme.colors.bgCard,
          borderRadius: '8px',
        }}>
          {t('position.collecting_data')}
        </div>
      );
    }

    const plotSize = 200;

    const lats = positionHistory.map(p => p.position.latitude);
    const lons = positionHistory.map(p => p.position.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latRange = (maxLat - minLat) || 0.001;
    const lonRange = (maxLon - minLon) || 0.001;
    const padding = 0.1;

    const points = positionHistory.map((point) => {
      const x = ((point.position.longitude - minLon) / lonRange) * (1 - 2 * padding) + padding;
      const y = 1 - (((point.position.latitude - minLat) / latRange) * (1 - 2 * padding) + padding);
      return `${x * plotSize},${y * plotSize}`;
    });

    const lastPoint = positionHistory[positionHistory.length - 1];
    const lastX = ((lastPoint.position.longitude - minLon) / lonRange) * (1 - 2 * padding) + padding;
    const lastY = 1 - (((lastPoint.position.latitude - minLat) / latRange) * (1 - 2 * padding) + padding);

    return (
      <svg
        viewBox={`0 0 ${plotSize} ${plotSize}`}
        style={{ width: '100%', height: 'auto' }}
      >
        <rect x="0" y="0" width={plotSize} height={plotSize} fill={theme.colors.bgCard} rx="8" />

        {[0.25, 0.5, 0.75].map((ratio, i) => (
          <g key={i}>
            <line
              x1={ratio * plotSize}
              y1="0"
              x2={ratio * plotSize}
              y2={plotSize}
              stroke={theme.colors.border}
              strokeWidth="1"
            />
            <line
              x1="0"
              y1={ratio * plotSize}
              x2={plotSize}
              y2={ratio * plotSize}
              stroke={theme.colors.border}
              strokeWidth="1"
            />
          </g>
        ))}

        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={theme.colors.dataPosition}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={lastX * plotSize}
          cy={lastY * plotSize}
          r="6"
          fill={theme.colors.critical}
        />
        <circle
          cx={lastX * plotSize}
          cy={lastY * plotSize}
          r="10"
          fill="none"
          stroke={theme.colors.critical}
          strokeWidth="2"
          opacity="0.5"
        />
      </svg>
    );
  };

  return (
    <ViewLayout title={t('position.position')} onClose={onClose}>
      {/* Main position display */}
      <div style={{
        flex: '0 0 auto',
        padding: 'clamp(1rem, 3vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
          fontWeight: 'bold',
          color: theme.colors.dataPosition,
          marginBottom: '0.5rem',
          fontFamily: 'monospace',
        }}>
          {formatCoordinate(position.latitude, true)}
        </div>
        <div style={{
          fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
          fontWeight: 'bold',
          color: theme.colors.dataPosition,
          fontFamily: 'monospace',
        }}>
          {formatCoordinate(position.longitude, false)}
        </div>
      </div>

      {/* Track plot and stats */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        padding: '1rem',
        gap: '1rem',
        borderTop: `1px solid ${theme.colors.border}`,
      }}>
        {/* Track plot */}
        <div style={{
          flex: '1 1 180px',
          minWidth: '150px',
          maxWidth: 'min(50vw, 50vh, 250px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
            opacity: 0.6,
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {t('position.recent_track')}
          </div>
          {renderTrackPlot()}
        </div>

        {/* Stats */}
        <div style={{
          flex: '1 1 180px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1rem',
        }}>
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: '8px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
              {t('position.distance_traveled')}
            </div>
            <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 'bold', color: theme.colors.dataSpeed }}>
              {convertDistance(totalDistance).toFixed(2)} {distanceConversions[distanceUnit].label}
            </div>
          </div>

          <div style={{
            background: theme.colors.bgCard,
            borderRadius: '8px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>
              {t('position.track_points')}
            </div>
            <div style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 'bold', color: '#64b5f6' }}>
              {positionHistory.length}
            </div>
          </div>
        </div>
      </div>

      {/* Decimal coordinates */}
      <div style={{
        padding: '1rem',
        borderTop: `1px solid ${theme.colors.border}`,
        marginTop: 'auto',
      }}>
        <div style={{
          fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
          opacity: 0.6,
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {t('position.decimal_coordinates')}
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(1rem, 3vw, 2rem)',
          fontFamily: 'monospace',
          fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
          opacity: 0.7,
        }}>
          <span>Lat: {position.latitude.toFixed(6)}</span>
          <span>Lon: {position.longitude.toFixed(6)}</span>
        </div>
      </div>
    </ViewLayout>
  );
};
