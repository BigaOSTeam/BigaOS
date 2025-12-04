import React from 'react';
import { GeoPosition } from '../../../types';

interface PositionItemProps {
  position: GeoPosition;
}

export const PositionItem: React.FC<PositionItemProps> = ({ position }) => {
  const formatCoord = (value: number, isLat: boolean): string => {
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(3);
    return `${deg}°${min}'${dir}`;
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '1rem',
    }}>
      <div style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Position
      </div>
      <div style={{
        marginTop: '0.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1rem', color: '#4fc3f7', fontFamily: 'monospace' }}>
          {formatCoord(position.latitude, true)}
        </div>
        <div style={{ fontSize: '1rem', color: '#4fc3f7', fontFamily: 'monospace', marginTop: '0.25rem' }}>
          {formatCoord(position.longitude, false)}
        </div>
      </div>
    </div>
  );
};
