import React from 'react';

interface SpeedItemProps {
  speed: number;
}

export const SpeedItem: React.FC<SpeedItemProps> = ({ speed }) => {
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
        Speed
      </div>
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        color: '#66bb6a',
        lineHeight: 1,
        marginTop: '0.25rem',
      }}>
        {speed.toFixed(1)}
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.5 }}>kts</div>
    </div>
  );
};
