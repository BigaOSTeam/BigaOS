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

// All sensor readings are `number | null`: null = the sensor is absent or its
// data is stale ("no data"), which the UI renders as — instead of a fabricated
// value. Position is the exception (kept numeric; see server note).
export interface NavigationData {
  position: GeoPosition;
  // True when position is a held last-good fix and the GNSS signal has been
  // gone past the server's threshold (boat frozen on chart)
  gnssLost?: boolean;
  courseOverGround: number | null;
  speedOverGround: number | null;
  speedThroughWater: number | null;
  heading: number | null;
  attitude: AttitudeData;
}

export interface AttitudeData {
  roll: number | null;
  pitch: number | null;
  yaw: number | null;
}

export interface EnvironmentData {
  depth: {
    belowTransducer: number | null;
  };
  wind: {
    speedApparent: number | null;
    angleApparent: number | null;
    speedTrue: number | null;
    angleTrue: number | null;
  };
  temperature: {
    engineRoom: number | null;
    cabin: number | null;
    batteryCompartment: number | null;
    outside: number | null;
  };
}

export interface ElectricalData {
  battery: {
    voltage: number | null;
    current: number | null;
    temperature: number | null;
    stateOfCharge: number | null;
    timeRemaining: number | null;
    power: number | null;
  };
}

export interface PropulsionData {
  motor: {
    state: 'running' | 'stopped' | null;
    temperature: number | null;
    throttle: number | null;
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
  seaLevel?: number; // meters relative to MSL (tide)
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
