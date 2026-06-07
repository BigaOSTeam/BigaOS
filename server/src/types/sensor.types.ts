export interface SensorData {
  navigation: NavigationData;
  environment: EnvironmentData;
  electrical: ElectricalData;
  propulsion: PropulsionData;
}

export interface NavigationData {
  position: GeoPosition;
  courseOverGround: number;      // Radians
  speedOverGround: number;        // Knots
  speedThroughWater: number;      // Knots — 0 if no log/paddlewheel sensor
  heading: number;                // Radians — true if GPS available, else magnetic
  attitude: AttitudeData;
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface AttitudeData {
  roll: number;   // Heel angle in radians
  pitch: number;  // Pitch in radians
  yaw: number;    // Yaw in radians
}

export interface EnvironmentData {
  depth: {
    belowTransducer: number;      // Meters
  };
  wind: {
    speedApparent: number;        // Knots
    angleApparent: number;        // Radians
    speedTrue: number;            // Knots
    angleTrue: number;            // Radians
  };
  temperature: {
    engineRoom: number;           // Celsius
    cabin: number;                // Celsius
    batteryCompartment: number;   // Celsius
    outside: number;              // Celsius
  };
}

export interface ElectricalData {
  battery: {
    voltage: number;              // Volts
    current: number;              // Amps
    temperature: number;          // Celsius
    stateOfCharge: number;        // Percentage
  };
}

export interface PropulsionData {
  motor: {
    state: 'running' | 'stopped';
    temperature: number;          // Celsius
    throttle: number;             // Percentage
  };
}

export interface SensorUpdateEvent {
  type: 'sensor_update';
  sensor: string;
  path: string;
  value: any;
  timestamp: Date;
}
