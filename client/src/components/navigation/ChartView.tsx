import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';

interface ChartViewProps {
  position: GeoPosition;
  heading: number;
  speed: number;
  depth: number;
}

// Custom boat icon that rotates with heading
const createBoatIcon = (heading: number) => {
  const svgIcon = `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(20, 20) rotate(${heading})">
        <!-- Boat hull -->
        <path d="M 0,-15 L 5,5 L -5,5 Z" fill="#1976d2" stroke="#fff" stroke-width="2"/>
        <!-- Heading indicator (front point) -->
        <circle cx="0" cy="-15" r="3" fill="#ff6b6b"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'boat-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

// Component to update map center when position changes (only if auto-center enabled)
const MapController: React.FC<{
  position: GeoPosition;
  autoCenter: boolean;
  onDrag: () => void;
}> = ({ position, autoCenter, onDrag }) => {
  const map = useMap();

  useEffect(() => {
    if (autoCenter) {
      map.setView([position.latitude, position.longitude], map.getZoom());
    }
  }, [position.latitude, position.longitude, map, autoCenter]);

  useEffect(() => {
    // Disable auto-center when user drags the map
    map.on('dragstart', onDrag);
    return () => {
      map.off('dragstart', onDrag);
    };
  }, [map, onDrag]);

  return null;
};

export const ChartView: React.FC<ChartViewProps> = ({ position, heading, speed, depth }) => {
  const [autoCenter, setAutoCenter] = useState(true);
  const mapRef = useRef<L.Map>(null);

  const getDepthColor = (depth: number) => {
    if (depth < 2) return '#ef5350'; // Red - very shallow
    if (depth < 5) return '#ffa726'; // Orange - shallow
    if (depth < 10) return '#66bb6a'; // Green - safe
    return '#4fc3f7'; // Blue - deep
  };

  const handleRecenter = () => {
    setAutoCenter(true);
    if (mapRef.current) {
      mapRef.current.setView([position.latitude, position.longitude], mapRef.current.getZoom());
    }
  };

  const handleMapDrag = () => {
    // Disable auto-center when user manually pans the map
    setAutoCenter(false);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={[position.latitude, position.longitude]}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
      >
        {/* Base map layer - OpenStreetMap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* OpenSeaMap overlay - nautical charts */}
        <TileLayer
          attribution='Map data: &copy; <a href="http://www.openseamap.org">OpenSeaMap</a> contributors'
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
        />

        {/* Boat position marker with heading */}
        <Marker
          position={[position.latitude, position.longitude]}
          icon={createBoatIcon(heading)}
        >
          <Popup>
            <div style={{ padding: '0.5rem' }}>
              <strong>Your Boat</strong>
              <br />
              <strong>Position:</strong> {position.latitude.toFixed(5)}°, {position.longitude.toFixed(5)}°
              <br />
              <strong>Heading:</strong> {heading.toFixed(0)}°
              <br />
              <strong>Speed:</strong> {speed.toFixed(1)} kt
              <br />
              <strong>Depth:</strong> <span style={{ color: getDepthColor(depth) }}>{depth.toFixed(1)}m</span>
            </div>
          </Popup>
        </Marker>

        {/* Component to keep map centered on boat */}
        <MapController position={position} autoCenter={autoCenter} onDrag={handleMapDrag} />
      </MapContainer>

      {/* Recenter button (like Google Maps) */}
      <button
        onClick={handleRecenter}
        style={{
          position: 'absolute',
          bottom: '5rem',
          right: '1rem',
          width: '48px',
          height: '48px',
          background: autoCenter ? 'rgba(25, 118, 210, 0.9)' : 'rgba(10, 25, 41, 0.9)',
          border: `2px solid ${autoCenter ? '#1976d2' : 'rgba(255, 255, 255, 0.2)'}`,
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          zIndex: 1000,
          transition: 'all 0.2s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title={autoCenter ? 'Auto-centering ON' : 'Click to recenter on boat'}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill={autoCenter ? '#1976d2' : 'currentColor'} />
        </svg>
      </button>

      {/* Info overlay */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          background: 'rgba(10, 25, 41, 0.9)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          zIndex: 1000,
          minWidth: '200px'
        }}
      >
        <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', opacity: 0.7 }}>
          Navigation Info
        </div>
        <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
          <div>
            <strong>HDG:</strong> {heading.toFixed(0)}°
          </div>
          <div>
            <strong>SPD:</strong> {speed.toFixed(1)} kt
          </div>
          <div>
            <strong>DEPTH:</strong> <span style={{ color: getDepthColor(depth), fontWeight: 'bold' }}>{depth.toFixed(1)}m</span>
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.5rem' }}>
            📍 {position.latitude.toFixed(4)}°, {position.longitude.toFixed(4)}°
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '1rem',
          left: '1rem',
          background: 'rgba(10, 25, 41, 0.9)',
          padding: '0.75rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          zIndex: 1000,
          fontSize: '0.75rem'
        }}
      >
        <div style={{ marginBottom: '0.25rem', opacity: 0.7 }}>Map Layers:</div>
        <div>✓ OpenStreetMap (Base)</div>
        <div>✓ OpenSeaMap (Nautical)</div>
      </div>
    </div>
  );
};
