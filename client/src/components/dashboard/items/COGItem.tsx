import React from 'react';

interface COGItemProps {
  cog: number;
}

export const COGItem: React.FC<COGItemProps> = ({ cog }) => {
  const getCardinalDirection = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
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
        COG
      </div>
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        color: '#29b6f6',
        lineHeight: 1,
        marginTop: '0.25rem',
      }}>
        {cog.toFixed(0)}°
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.5 }}>{getCardinalDirection(cog)}</div>
    </div>
  );
};
