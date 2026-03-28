import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import { BufferedTileLayer } from '../navigation/chart/BufferedTileLayer';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { API_BASE_URL } from '../../utils/urls';
import { ViewLayout } from './shared';

const TILE_URLS = {
  street: `${API_BASE_URL}/tiles/street/{z}/{x}/{y}`,
  satellite: `${API_BASE_URL}/tiles/satellite/{z}/{x}/{y}`,
  nautical: `${API_BASE_URL}/tiles/nautical/{z}/{x}/{y}`,
};

interface PositionViewProps {
  position: GeoPosition;
  onClose: () => void;
}

/** Keeps map centered on the current position */
const MapFollower: React.FC<{ lat: number; lon: number }> = ({ lat, lon }) => {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
};

/** Radar-style pulsing marker using HTML overlay — immune to zoom distortion */
const PulsingMarker: React.FC<{ lat: number; lon: number; color: string }> = ({ lat, lon, color }) => {
  const map = useMap();

  useEffect(() => {
    // Create a CSS animation style once
    const styleId = 'pulsing-marker-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes radar-pulse {
          0% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
          100% { transform: translate(-50%,-50%) scale(5); opacity: 0; }
        }
        .radar-ring {
          position: absolute; top: 50%; left: 50%;
          width: 14px; height: 14px; border-radius: 50%;
          transform: translate(-50%,-50%);
          animation: radar-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
        .radar-dot {
          position: absolute; top: 50%; left: 50%;
          width: 14px; height: 14px; border-radius: 50%;
          transform: translate(-50%,-50%);
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }

    const container = document.createElement('div');
    container.style.cssText = 'position:relative;width:0;height:0;';

    const ring = document.createElement('div');
    ring.className = 'radar-ring';
    ring.style.border = `2px solid ${color}`;
    ring.style.background = color;

    const dot = document.createElement('div');
    dot.className = 'radar-dot';
    dot.style.background = color;
    dot.style.border = '2px solid #000';

    container.appendChild(ring);
    container.appendChild(dot);

    const icon = L.divIcon({
      html: container.outerHTML,
      className: '',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const marker = L.marker([lat, lon], { icon, interactive: false }).addTo(map);

    return () => {
      map.removeLayer(marker);
    };
  }, [map, lat, lon, color]);

  return null;
};

export const PositionView: React.FC<PositionViewProps> = ({ position, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [isWide, setIsWide] = useState(window.innerWidth > window.innerHeight);

  // Use same map type preference as ChartView
  const [useSatellite] = useState(() => {
    const saved = localStorage.getItem('chartUseSatellite');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const formatCoordinate = useCallback((value: number, isLatitude: boolean): string => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    const direction = isLatitude
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');
    return `${degrees}° ${minutes.toFixed(3)}' ${direction}`;
  }, []);

  return (
    <ViewLayout title={t('position.position')} onClose={onClose}>
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: isWide ? 'row' : 'column',
        minHeight: 0,
        overflow: 'auto',
      }}>
        {/* Coordinates panel */}
        <div style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(1rem, 3vw, 2rem)',
          gap: 'clamp(0.3rem, 0.8vw, 0.5rem)',
          ...(isWide
            ? { borderRight: `1px solid ${theme.colors.border}`, minWidth: '280px' }
            : { borderBottom: `1px solid ${theme.colors.border}` }
          ),
        }}>
          <div style={{
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: theme.fontWeight.bold,
            color: theme.colors.dataPosition,
            fontFamily: 'monospace',
          }}>
            {formatCoordinate(position.latitude, true)}
          </div>
          <div style={{
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: theme.fontWeight.bold,
            color: theme.colors.dataPosition,
            fontFamily: 'monospace',
          }}>
            {formatCoordinate(position.longitude, false)}
          </div>
        </div>

        {/* Map */}
        <div style={{
          flex: 1,
          minHeight: isWide ? 0 : 'min(80vw, 500px)',
          position: 'relative',
        }}>
          <MapContainer
            center={[position.latitude, position.longitude]}
            zoom={14}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
            attributionControl={false}
            preferCanvas={true}
          >
            {useSatellite ? (
              <BufferedTileLayer url={TILE_URLS.satellite} updateWhenZooming={false} keepBuffer={4} loadBuffer={0.5} />
            ) : (
              <BufferedTileLayer url={TILE_URLS.street} updateWhenZooming={false} keepBuffer={4} loadBuffer={0.5} />
            )}
            <BufferedTileLayer url={TILE_URLS.nautical} zIndex={10} updateWhenZooming={false} keepBuffer={4} loadBuffer={0.5} />
            <MapFollower lat={position.latitude} lon={position.longitude} />
            <PulsingMarker lat={position.latitude} lon={position.longitude} color={'#d32f2f'} />
          </MapContainer>
        </div>
      </div>
    </ViewLayout>
  );
};
