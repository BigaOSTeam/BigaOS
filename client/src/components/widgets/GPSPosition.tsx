import React from 'react';
import { GeoPosition } from '../../types';

interface GPSPositionProps {
  position: GeoPosition;
}

export const GPSPosition: React.FC<GPSPositionProps> = ({ position }) => {
  const formatCoordinate = (value: number, isLatitude: boolean) => {
    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutes = (abs - degrees) * 60;
    const direction = isLatitude
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');
    return `${degrees}° ${minutes.toFixed(3)}' ${direction}`;
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>GPS POSITION</h3>
      <div style={{ fontSize: '1rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
        {formatCoordinate(position.latitude, true)}
      </div>
      <div style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
        {formatCoordinate(position.longitude, false)}
      </div>
    </div>
  );
};
