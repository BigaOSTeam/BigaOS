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

// All readings are `number | null`: null = sensor absent or stale ("no data"),
// surfaced as — on the UI rather than a fabricated value.
export interface AttitudeData {
  roll: number | null; // radians (heel angle, positive = starboard down)
  pitch: number | null; // radians (positive = bow up)
  yaw: number | null; // radians
}

// ============================================================================
// Standard Sensor Data (NMEA2000 units)
// ============================================================================

export interface StandardNavigationData {
  position: GeoPosition;
  // True when the position is a held last-good fix older than the GNSS-lost
  // threshold (signal gone, boat frozen on chart). Absent/false = fix is live.
  gnssLost?: boolean;
  courseOverGround: number | null; // radians (0-2π)
  speedOverGround: number | null; // m/s (standard unit)
  speedThroughWater: number | null; // m/s (standard unit)
  heading: number | null; // radians (0-2π) — true heading if GPS available, else magnetic
  attitude: AttitudeData;
}

export interface StandardEnvironmentData {
  depth: {
    belowTransducer: number | null; // meters
  };
  wind: {
    speedApparent: number | null; // m/s (standard unit)
    angleApparent: number | null; // radians (0-2π, relative to bow)
    speedTrue: number | null; // m/s (standard unit)
    angleTrue: number | null; // radians (0-2π, relative to bow)
  };
  temperature: {
    engineRoom: number | null; // Kelvin
    cabin: number | null; // Kelvin
    batteryCompartment: number | null; // Kelvin
    outside: number | null; // Kelvin
  };
}

export interface StandardElectricalData {
  battery: {
    voltage: number | null; // Volts (no conversion needed)
    current: number | null; // Amps (no conversion needed)
    temperature: number | null; // Kelvin
    stateOfCharge: number | null; // Percentage (0-100)
    timeRemaining: number | null; // Seconds (null = unknown)
    power: number | null; // Watts (positive = charging, negative = discharging)
  };
}

export interface StandardPropulsionData {
  motor: {
    state: 'running' | 'stopped' | null;
    temperature: number | null; // Kelvin
    throttle: number | null; // Percentage (0-100)
  };
}

/**
 * Per-tank reading (NMEA2000 PGN 127505 shape).
 * `level` is 0-100 %, `volume` and `capacity` are liters.
 */
export interface StandardTankData {
  fluidType: string;       // FluidType, kept as string here to avoid a circular import
  level: number;           // Percentage (0-100)
  volume: number;          // Liters
  capacity: number;        // Liters
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
  /** Map of tankId -> tank reading (only populated when tanks are configured). */
  tanks?: Record<string, StandardTankData>;
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
    gnssLost?: boolean;
    courseOverGround: number | null; // radians
    speedOverGround: number | null; // user's speed unit (kt, km/h, etc.)
    speedThroughWater: number | null; // user's speed unit
    heading: number | null; // radians
    attitude: AttitudeData;
  };
  environment: {
    depth: {
      belowTransducer: number | null; // user's depth unit (m, ft, etc.)
    };
    wind: {
      speedApparent: number | null; // user's wind unit
      angleApparent: number | null; // radians
      speedTrue: number | null; // user's wind unit
      angleTrue: number | null; // radians
    };
    temperature: {
      engineRoom: number | null; // user's temperature unit
      cabin: number | null;
      batteryCompartment: number | null;
      outside: number | null;
    };
  };
  electrical: {
    battery: {
      voltage: number | null; // Volts
      current: number | null; // Amps
      temperature: number | null; // user's temperature unit
      stateOfCharge: number | null; // Percentage
      timeRemaining: number | null; // Seconds (null = unknown)
      power: number | null; // Watts
    };
  };
  propulsion: {
    motor: {
      state: 'running' | 'stopped' | null;
      temperature: number | null; // user's temperature unit
      throttle: number | null; // Percentage
    };
  };
  /** Map of tankId -> tank reading (level/volume/capacity). */
  tanks?: Record<string, StandardTankData>;
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
