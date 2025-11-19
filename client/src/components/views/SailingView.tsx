import React from 'react';
import { SensorData } from '../../types';
import { SpeedLog } from '../widgets/SpeedLog';
import { WindInstrument } from '../widgets/WindInstrument';
import { Compass } from '../widgets/Compass';
import { HeelIndicator } from '../widgets/HeelIndicator';

interface SailingViewProps {
  sensorData: SensorData;
}

export const SailingView: React.FC<SailingViewProps> = ({ sensorData }) => {
  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem', background: 'rgba(102, 187, 106, 0.1)' }}>
        <h2 style={{ marginBottom: '1rem', color: '#66bb6a' }}>Sailing Performance</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>VMG</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {(sensorData.navigation.speedOverGround * 0.9).toFixed(1)} kt
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Point of Sail</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Close Hauled</div>
          </div>
        </div>
      </div>

      <div className="grid grid-4">
        <SpeedLog speed={sensorData.navigation.speedOverGround} />
        <Compass heading={sensorData.navigation.headingMagnetic} />
        <WindInstrument
          speedApparent={sensorData.environment.wind.speedApparent}
          angleApparent={sensorData.environment.wind.angleApparent}
        />
        <HeelIndicator heel={sensorData.navigation.attitude.roll} />
      </div>
    </div>
  );
};
