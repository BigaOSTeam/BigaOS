import React from 'react';
import { radToDeg } from '../../utils/angle';

interface CompassProps {
  heading: number;
}

export const Compass: React.FC<CompassProps> = ({ heading }) => {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>HEADING</h3>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ab47bc' }}>
        {radToDeg(heading).toFixed(0)}°
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>magnetic</div>
    </div>
  );
};
