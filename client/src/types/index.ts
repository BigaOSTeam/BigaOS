export interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp?: Date;
}

export interface SensorData {
  navigation: NavigationData;
  environment: EnvironmentData;
  electrical: ElectricalData;
  propulsion: PropulsionData;
  weather?: WeatherSensorData;
}

export interface WeatherSensorData {
  current: WeatherPoint;
  forecast: WeatherPoint[];
  lastUpdated: string;
}

export interface NavigationData {
  position: GeoPosition;
  courseOverGround: number;
  speedOverGround: number;
  heading: number;
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
    timeRemaining: number;
    power: number;
  };
}

export interface PropulsionData {
  motor: {
    state: 'running' | 'stopped';
    temperature: number;
    throttle: number;
  };
}

// Legacy WeatherData - kept for backwards compatibility
export interface WeatherData {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  humidity: number;
}

// New weather types for Open-Meteo integration
export interface WindData {
  speed: number; // knots
  direction: number; // degrees (direction wind is coming FROM, 0 = North)
  gusts: number; // knots
}

export interface WaveData {
  height: number; // meters
  direction: number; // degrees
  period: number; // seconds
}

export interface CurrentData {
  velocity: number; // m/s
  direction: number; // degrees (direction current is flowing TO)
}

export interface WeatherPoint {
  timestamp: string; // ISO date
  location: { lat: number; lon: number };
  wind: WindData;
  waves?: WaveData;
  swell?: WaveData;
  current?: CurrentData; // ocean current
  pressure?: number; // hPa
  seaTemperature?: number; // celsius
  airTemperature?: number; // celsius
}

export interface WeatherForecast {
  location: { lat: number; lon: number };
  current: WeatherPoint;
  hourly: WeatherPoint[];
  fetchedAt: string;
  expiresAt: string;
}

export interface WeatherGridBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface WeatherGridPoint extends WeatherPoint {
  // No additional fields - just a typed alias for grid points
}

export interface WeatherGrid {
  bounds: WeatherGridBounds;
  resolution: number;
  forecastHour: number;
  points: WeatherGridPoint[];
  fetchedAt: string;
}

export interface WeatherSettings {
  enabled: boolean;
  provider: 'open-meteo' | 'custom';
  weatherApiUrl: string;
  marineApiUrl: string;
  refreshIntervalMinutes: number;
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  enabled: boolean;
  status: string;
}

// Alert types
export * from './alerts';
