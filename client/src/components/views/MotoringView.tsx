import React from 'react';
import { SensorData } from '../../types';
import { SpeedLog } from '../widgets/SpeedLog';
import { Compass } from '../widgets/Compass';
import { BatteryStatus } from '../widgets/BatteryStatus';

interface MotoringViewProps {
  sensorData: SensorData;
}

export const MotoringView: React.FC<MotoringViewProps> = ({ sensorData }) => {
  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem', background: 'rgba(255, 167, 38, 0.1)' }}>
        <h2 style={{ marginBottom: '1rem', color: '#ffa726' }}>Motor Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Throttle</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {sensorData.propulsion.motor.throttle}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Motor Temp</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {sensorData.propulsion.motor.temperature.toFixed(0)}°C
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Status</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#66bb6a' }}>
              {sensorData.propulsion.motor.state === 'running' ? '✓ Running' : 'Stopped'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <SpeedLog speed={sensorData.navigation.speedOverGround} />
        <Compass heading={sensorData.navigation.headingMagnetic} />
        <BatteryStatus
          voltage={sensorData.electrical.battery.voltage}
          current={sensorData.electrical.battery.current}
          stateOfCharge={sensorData.electrical.battery.stateOfCharge}
        />
      </div>
    </div>
  );
};
