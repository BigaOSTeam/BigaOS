import React from 'react';

interface HeelIndicatorProps {
  heel: number;
}

export const HeelIndicator: React.FC<HeelIndicatorProps> = ({ heel }) => {
  const getColor = (heel: number) => {
    if (Math.abs(heel) < 10) return '#66bb6a';
    if (Math.abs(heel) < 20) return '#ffa726';
    return '#ef5350';
  };

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>HEEL</h3>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: getColor(heel) }}>
        {heel.toFixed(1)}°
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
        {heel > 0 ? 'starboard' : 'port'}
      </div>
    </div>
  );
};
