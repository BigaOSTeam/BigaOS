import React from 'react';
import { BoatState, SensorData } from '../../types';
import { AnchoredView } from './AnchoredView';
import { SailingView } from './SailingView';
import { MotoringView } from './MotoringView';
import { DepthGauge } from '../widgets/DepthGauge';
import { SpeedLog } from '../widgets/SpeedLog';
import { Compass } from '../widgets/Compass';
import { BatteryStatus } from '../widgets/BatteryStatus';

interface DashboardViewProps {
  state: BoatState;
  sensorData: SensorData;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ state, sensorData }) => {
  // Render state-specific view
  if (state === BoatState.ANCHORED) {
    return <AnchoredView sensorData={sensorData} />;
  }

  if (state === BoatState.SAILING) {
    return <SailingView sensorData={sensorData} />;
  }

  if (state === BoatState.MOTORING) {
    return <MotoringView sensorData={sensorData} />;
  }

  // Default view for IN_MARINA and DRIFTING
  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>
          {state === BoatState.IN_MARINA ? 'Marina Status' : 'Drifting'}
        </h2>
        <p style={{ opacity: 0.7 }}>
          {state === BoatState.IN_MARINA
            ? 'Boat is securely moored in marina'
            : 'Boat is drifting - consider anchoring or starting motor'}
        </p>
      </div>

      <div className="grid grid-4">
        <DepthGauge depth={sensorData.environment.depth.belowTransducer} />
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
