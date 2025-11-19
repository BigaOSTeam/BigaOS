import React from 'react';

interface DepthGaugeProps {
  depth: number;
}

export const DepthGauge: React.FC<DepthGaugeProps> = ({ depth }) => {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>DEPTH</h3>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#4fc3f7' }}>
        {depth.toFixed(1)}
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>meters</div>
    </div>
  );
};
