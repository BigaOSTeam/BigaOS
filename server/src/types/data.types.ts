/**
 * Standard data structures for BigaOS
 *
 * All data uses NMEA2000 standard units internally:
 * - Speed: m/s
 * - Temperature: Kelvin
 * - Pressure: Pascal
 * - Depth: meters
 * - Angles: radians (0-2π)
 * - Position: decimal degrees
 */

// ============================================================================
// Position & Navigation Types
// ============================================================================

export interface GeoPosition {
  latitude: number; // decimal degrees
  longitude: number; // decimal degrees
  timestamp: Date;
}

export interface AttitudeData {
  roll: number; // radians (heel angle, positive = starboard down)
  pitch: number; // radians (positive = bow up)
  yaw: number; // radians
}

// ============================================================================
// Standard Sensor Data (NMEA2000 units)
// ============================================================================

export interface StandardNavigationData {
  position: GeoPosition;
  courseOverGround: number; // radians (0-2π)
  speedOverGround: number; // m/s (standard unit)
  headingMagnetic: number; // radians (0-2π)
  headingTrue: number; // radians (0-2π)
  attitude: AttitudeData;
}

export interface StandardEnvironmentData {
  depth: {
    belowTransducer: number; // meters
  };
  wind: {
    speedApparent: number; // m/s (standard unit)
    angleApparent: number; // radians (0-2π, relative to bow)
    speedTrue: number; // m/s (standard unit)
    angleTrue: number; // radians (0-2π, relative to bow)
  };
  temperature: {
    engineRoom: number; // Kelvin
    cabin: number; // Kelvin
    batteryCompartment: number; // Kelvin
    outside: number; // Kelvin
  };
}

export interface StandardElectricalData {
  battery: {
    voltage: number; // Volts (no conversion needed)
    current: number; // Amps (no conversion needed)
    temperature: number; // Kelvin
    stateOfCharge: number; // Percentage (0-100)
  };
}

export interface StandardPropulsionData {
  motor: {
    state: 'running' | 'stopped';
    temperature: number; // Kelvin
    throttle: number; // Percentage (0-100)
  };
}

/**
 * Complete sensor data packet in standard units
 */
export interface StandardSensorData {
  timestamp: string; // ISO 8601 date string
  navigation: StandardNavigationData;
  environment: StandardEnvironmentData;
  electrical: StandardElectricalData;
  propulsion: StandardPropulsionData;
}

// ============================================================================
// Standard Weather Data (NMEA2000 units)
// ============================================================================

export interface StandardWindData {
  speed: number; // m/s (standard unit)
  direction: number; // radians (0-2π, direction wind is FROM)
  gusts: number; // m/s (standard unit)
}

export interface StandardWaveData {
  height: number; // meters
  direction: number; // radians (0-2π)
  period: number; // seconds
}

export interface StandardCurrentData {
  velocity: number; // m/s
  direction: number; // radians (0-2π, direction current is flowing TO)
}

export interface StandardWeatherPoint {
  timestamp: string; // ISO 8601 date string
  location: { lat: number; lon: number };
  wind: StandardWindData;
  waves?: StandardWaveData;
  swell?: StandardWaveData;
  current?: StandardCurrentData;
  pressure?: number; // Pascal (standard unit)
  seaTemperature?: number; // Kelvin (standard unit)
}

export interface StandardWeatherForecast {
  location: { lat: number; lon: number };
  current: StandardWeatherPoint;
  hourly: StandardWeatherPoint[];
  fetchedAt: string; // ISO 8601 date string
  expiresAt: string; // ISO 8601 date string
}

// ============================================================================
// Data Snapshot (combined view)
// ============================================================================

export interface DataSnapshot {
  timestamp: string; // ISO 8601 date string
  sensors: StandardSensorData | null;
  weather: StandardWeatherForecast | null;
}

// ============================================================================
// Display Data (converted to user's units)
// ============================================================================

/**
 * Sensor data converted to user's preferred units for display
 * Same structure as StandardSensorData but with display units
 */
export interface DisplaySensorData {
  timestamp: string;
  navigation: {
    position: GeoPosition;
    courseOverGround: number; // radians
    speedOverGround: number; // user's speed unit (kt, km/h, etc.)
    headingMagnetic: number; // radians
    headingTrue: number; // radians
    attitude: AttitudeData;
  };
  environment: {
    depth: {
      belowTransducer: number; // user's depth unit (m, ft, etc.)
    };
    wind: {
      speedApparent: number; // user's wind unit
      angleApparent: number; // radians
      speedTrue: number; // user's wind unit
      angleTrue: number; // radians
    };
    temperature: {
      engineRoom: number; // user's temperature unit
      cabin: number;
      batteryCompartment: number;
      outside: number;
    };
  };
  electrical: {
    battery: {
      voltage: number; // Volts
      current: number; // Amps
      temperature: number; // user's temperature unit
      stateOfCharge: number; // Percentage
    };
  };
  propulsion: {
    motor: {
      state: 'running' | 'stopped';
      temperature: number; // user's temperature unit
      throttle: number; // Percentage
    };
  };
}

/**
 * Weather point converted to user's preferred units for display
 */
export interface DisplayWeatherPoint {
  timestamp: string;
  location: { lat: number; lon: number };
  wind: {
    speed: number; // user's wind unit
    direction: number; // radians
    gusts: number; // user's wind unit
  };
  waves?: {
    height: number; // user's depth unit
    direction: number; // radians
    period: number; // seconds
  };
  swell?: {
    height: number; // user's depth unit
    direction: number; // radians
    period: number; // seconds
  };
  current?: {
    velocity: number; // m/s (usually not converted)
    direction: number; // radians
  };
  pressure?: number; // user's pressure unit
  seaTemperature?: number; // user's temperature unit
}

// ============================================================================
// Data Events (for EventEmitter)
// ============================================================================

export interface SensorDataEvent {
  type: 'sensor_data';
  data: StandardSensorData;
}

export interface WeatherDataEvent {
  type: 'weather_data';
  data: StandardWeatherForecast;
}

export interface DataEvent {
  type: 'sensor_data' | 'weather_data' | 'alert_triggered' | 'alert_cleared';
  data: any;
}
