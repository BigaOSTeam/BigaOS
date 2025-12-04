import React from 'react';

interface BatteryItemProps {
  voltage: number;
  stateOfCharge: number;
}

export const BatteryItem: React.FC<BatteryItemProps> = ({ voltage, stateOfCharge }) => {
  const getBatteryColor = (soc: number): string => {
    if (soc < 20) return '#ef5350';
    if (soc < 50) return '#ffa726';
    return '#66bb6a';
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
        Battery
      </div>
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        color: getBatteryColor(stateOfCharge),
        lineHeight: 1,
        marginTop: '0.25rem',
      }}>
        {stateOfCharge.toFixed(0)}%
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.5 }}>{voltage.toFixed(1)}V</div>
    </div>
  );
};
