import React from 'react';

interface WindItemProps {
  speedApparent: number;
  angleApparent: number;
}

export const WindItem: React.FC<WindItemProps> = ({ speedApparent, angleApparent }) => {
  const getWindDirection = (angle: number): string => {
    if (angle < 45 || angle > 315) return 'HEAD';
    if (angle >= 45 && angle <= 135) return 'STBD';
    if (angle > 135 && angle < 225) return 'STERN';
    return 'PORT';
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '1rem',
      position: 'relative',
    }}>
      <div style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Wind
      </div>
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        color: '#ffa726',
        lineHeight: 1,
        marginTop: '0.25rem',
      }}>
        {speedApparent.toFixed(0)}
      </div>
      <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>kts AWA</div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginTop: '0.5rem',
      }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          style={{
            transform: `rotate(${angleApparent}deg)`,
            transition: 'transform 0.3s ease',
          }}
        >
          <path
            d="M12 2L8 12h3v10l5-14h-3L12 2z"
            fill="#ffa726"
          />
        </svg>
        <span style={{ fontSize: '0.875rem', color: '#ffa726' }}>
          {angleApparent.toFixed(0)}° {getWindDirection(angleApparent)}
        </span>
      </div>
    </div>
  );
};
