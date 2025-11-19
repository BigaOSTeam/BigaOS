import React from 'react';

interface SpeedLogProps {
  speed: number;
}

export const SpeedLog: React.FC<SpeedLogProps> = ({ speed }) => {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>SPEED</h3>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#66bb6a' }}>
        {speed.toFixed(1)}
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>knots</div>
    </div>
  );
};
