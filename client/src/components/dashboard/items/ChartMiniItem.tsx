import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GeoPosition } from '../../../types';

interface ChartMiniItemProps {
  position: GeoPosition;
  heading: number;
}

// Same boat icon as ChartView
const createBoatIcon = (heading: number) => {
  const svgIcon = `
    <svg width="40" height="40" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(25, 25) rotate(${heading})">
        <path d="M 0,-15 L 6,8 L 0,3 L -6,8 Z" fill="#000" stroke="#fff" stroke-width="2"/>
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

export const ChartMiniItem: React.FC<ChartMiniItemProps> = ({ position, heading }) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      center: [position.latitude, position.longitude],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      opacity: 0.8,
    }).addTo(mapRef.current);

    markerRef.current = L.marker(
      [position.latitude, position.longitude],
      { icon: createBoatIcon(heading) }
    ).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update position and heading
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([position.latitude, position.longitude], mapRef.current.getZoom());
      markerRef.current.setIcon(createBoatIcon(heading));
      markerRef.current.setLatLng([position.latitude, position.longitude]);
    }
  }, [position, heading]);

  // Handle container resize - invalidate map size
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        // Small delay to ensure the container has finished resizing
        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 100);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        zIndex: 50,
      }}>
        Chart
      </div>
    </div>
  );
};
