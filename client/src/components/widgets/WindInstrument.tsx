import React from 'react';

interface WindInstrumentProps {
  speedApparent: number;
  angleApparent: number;
}

export const WindInstrument: React.FC<WindInstrumentProps> = ({ speedApparent, angleApparent }) => {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>WIND</h3>
      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffa726' }}>
        {speedApparent.toFixed(1)} kt
      </div>
      <div style={{ fontSize: '1.25rem', marginTop: '0.5rem' }}>
        {angleApparent.toFixed(0)}°
      </div>
      <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>apparent</div>
    </div>
  );
};
