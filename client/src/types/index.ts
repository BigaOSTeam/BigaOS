export enum BoatState {
  ANCHORED = 'ANCHORED',
  IN_MARINA = 'IN_MARINA',
  MOTORING = 'MOTORING',
  SAILING = 'SAILING',
  DRIFTING = 'DRIFTING'
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface SensorData {
  navigation: NavigationData;
  environment: EnvironmentData;
  electrical: ElectricalData;
  propulsion: PropulsionData;
}

export interface NavigationData {
  position: GeoPosition;
  courseOverGround: number;
  speedOverGround: number;
  headingMagnetic: number;
  headingTrue: number;
  attitude: AttitudeData;
}

export interface AttitudeData {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface EnvironmentData {
  depth: {
    belowTransducer: number;
  };
  wind: {
    speedApparent: number;
    angleApparent: number;
    speedTrue: number;
    angleTrue: number;
  };
  temperature: {
    engineRoom: number;
    cabin: number;
    batteryCompartment: number;
    outside: number;
  };
}

export interface ElectricalData {
  battery: {
    voltage: number;
    current: number;
    temperature: number;
    stateOfCharge: number;
  };
}

export interface PropulsionData {
  motor: {
    state: 'running' | 'stopped';
    temperature: number;
    throttle: number;
  };
}

export interface BoatStateData {
  currentState: BoatState;
  previousState: BoatState | null;
  lastTransition: Date;
  manualOverride: any;
  inputs: any;
}

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  humidity: number;
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  enabled: boolean;
  status: string;
}
