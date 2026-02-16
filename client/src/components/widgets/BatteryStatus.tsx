import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface BatteryStatusProps {
  voltage: number;
  current: number;
  stateOfCharge: number;
}

export const BatteryStatus: React.FC<BatteryStatusProps> = ({ voltage, current, stateOfCharge }) => {
  const { theme } = useTheme();
  const getVoltageColor = (v: number) => {
    if (v >= 12.4) return '#66bb6a';
    if (v >= 11.8) return '#ffa726';
    return '#ef5350';
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>BATTERY</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: getVoltageColor(voltage) }}>
            {voltage.toFixed(2)}V
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>voltage</div>
        </div>
        <div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#4fc3f7' }}>
            {current.toFixed(1)}A
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>current</div>
        </div>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
          <span>State of Charge</span>
          <span>{stateOfCharge.toFixed(0)}%</span>
        </div>
        <div style={{ height: '8px', background: theme.colors.bgCardActive, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${stateOfCharge}%`,
            background: getVoltageColor(voltage),
            transition: 'width 0.3s'
          }} />
        </div>
      </div>
    </div>
  );
};
