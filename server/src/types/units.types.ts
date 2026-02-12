/**
 * Unit conversion constants and functions for NMEA2000 standard units
 *
 * Internal standard units (NMEA2000):
 * - Speed: m/s (meters per second)
 * - Temperature: Kelvin
 * - Pressure: Pascal
 * - Depth: meters
 * - Angles: radians (0-2π)
 * - Position: decimal degrees
 */

// ============================================================================
// Rounding Helper
// ============================================================================

/**
 * Round to specified decimal places (default 2) to avoid floating point errors
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Conversion Constants
// ============================================================================

export const CONVERSIONS = {
  // Speed conversions
  KNOTS_TO_MS: 0.514444,
  MS_TO_KNOTS: 1.94384,
  KMH_TO_MS: 0.277778,
  MS_TO_KMH: 3.6,
  MPH_TO_MS: 0.44704,
  MS_TO_MPH: 2.23694,

  // Temperature conversions
  CELSIUS_TO_KELVIN: 273.15,
  KELVIN_TO_CELSIUS: -273.15, // Add to Kelvin to get Celsius
  FAHRENHEIT_TO_CELSIUS: (f: number) => (f - 32) * (5 / 9),
  CELSIUS_TO_FAHRENHEIT: (c: number) => c * (9 / 5) + 32,

  // Pressure conversions
  HPA_TO_PA: 100,
  PA_TO_HPA: 0.01,
  MBAR_TO_PA: 100, // mbar = hPa
  PA_TO_MBAR: 0.01,

  // Depth conversions
  FEET_TO_METERS: 0.3048,
  METERS_TO_FEET: 3.28084,
  FATHOMS_TO_METERS: 1.8288,
  METERS_TO_FATHOMS: 0.546807,
} as const;

// ============================================================================
// Unit Types
// ============================================================================

export type SpeedUnit = 'kt' | 'km/h' | 'mph' | 'm/s';
export type DepthUnit = 'm' | 'ft' | 'fathoms';
export type TemperatureUnit = '°C' | '°F' | 'K';
export type PressureUnit = 'hPa' | 'mbar' | 'Pa';

export interface UserUnitPreferences {
  speedUnit: SpeedUnit;
  windUnit: SpeedUnit;
  depthUnit: DepthUnit;
  temperatureUnit: TemperatureUnit;
  pressureUnit: PressureUnit;
}

export const DEFAULT_USER_UNITS: UserUnitPreferences = {
  speedUnit: 'kt',
  windUnit: 'kt',
  depthUnit: 'm',
  temperatureUnit: '°C',
  pressureUnit: 'hPa',
};

// ============================================================================
// Speed Conversion Functions (base: m/s)
// ============================================================================

/**
 * Convert from user's speed unit to standard (m/s)
 */
export function speedToStandard(value: number, fromUnit: SpeedUnit): number {
  switch (fromUnit) {
    case 'kt':
      return value * CONVERSIONS.KNOTS_TO_MS;
    case 'km/h':
      return value * CONVERSIONS.KMH_TO_MS;
    case 'mph':
      return value * CONVERSIONS.MPH_TO_MS;
    case 'm/s':
      return value;
    default:
      return value;
  }
}

/**
 * Convert from standard (m/s) to user's speed unit
 * Rounded to 2 decimal places for display
 */
export function speedFromStandard(value: number, toUnit: SpeedUnit): number {
  let result: number;
  switch (toUnit) {
    case 'kt':
      result = value * CONVERSIONS.MS_TO_KNOTS;
      break;
    case 'km/h':
      result = value * CONVERSIONS.MS_TO_KMH;
      break;
    case 'mph':
      result = value * CONVERSIONS.MS_TO_MPH;
      break;
    case 'm/s':
      return round(value, 2);
    default:
      return round(value, 2);
  }
  return round(result, 2);
}

// ============================================================================
// Temperature Conversion Functions (base: Kelvin)
// ============================================================================

/**
 * Convert from user's temperature unit to standard (Kelvin)
 */
export function temperatureToStandard(value: number, fromUnit: TemperatureUnit): number {
  switch (fromUnit) {
    case '°C':
      return value + CONVERSIONS.CELSIUS_TO_KELVIN;
    case '°F':
      return CONVERSIONS.FAHRENHEIT_TO_CELSIUS(value) + CONVERSIONS.CELSIUS_TO_KELVIN;
    case 'K':
      return value;
    default:
      return value;
  }
}

/**
 * Convert from standard (Kelvin) to user's temperature unit
 * Rounded to 1 decimal place for display (temperatures don't need 2)
 */
export function temperatureFromStandard(value: number, toUnit: TemperatureUnit): number {
  let result: number;
  switch (toUnit) {
    case '°C':
      result = value + CONVERSIONS.KELVIN_TO_CELSIUS;
      break;
    case '°F':
      result = CONVERSIONS.CELSIUS_TO_FAHRENHEIT(value + CONVERSIONS.KELVIN_TO_CELSIUS);
      break;
    case 'K':
      return round(value, 1);
    default:
      return round(value, 1);
  }
  return round(result, 1);
}

/**
 * Convert Celsius to Kelvin (for internal use when receiving Celsius data)
 */
export function celsiusToKelvin(celsius: number): number {
  return celsius + CONVERSIONS.CELSIUS_TO_KELVIN;
}

/**
 * Convert Kelvin to Celsius (for internal use)
 */
export function kelvinToCelsius(kelvin: number): number {
  return kelvin + CONVERSIONS.KELVIN_TO_CELSIUS;
}

// ============================================================================
// Pressure Conversion Functions (base: Pascal)
// ============================================================================

/**
 * Convert from user's pressure unit to standard (Pascal)
 */
export function pressureToStandard(value: number, fromUnit: PressureUnit): number {
  switch (fromUnit) {
    case 'hPa':
    case 'mbar':
      return value * CONVERSIONS.HPA_TO_PA;
    case 'Pa':
      return value;
    default:
      return value;
  }
}

/**
 * Convert from standard (Pascal) to user's pressure unit
 * Rounded to 1 decimal place for display (pressure is typically shown with 1)
 */
export function pressureFromStandard(value: number, toUnit: PressureUnit): number {
  let result: number;
  switch (toUnit) {
    case 'hPa':
    case 'mbar':
      result = value * CONVERSIONS.PA_TO_HPA;
      break;
    case 'Pa':
      return round(value, 0);
    default:
      return round(value, 1);
  }
  return round(result, 1);
}

// ============================================================================
// Depth Conversion Functions (base: meters)
// ============================================================================

/**
 * Convert from user's depth unit to standard (meters)
 */
export function depthToStandard(value: number, fromUnit: DepthUnit): number {
  switch (fromUnit) {
    case 'm':
      return value;
    case 'ft':
      return value * CONVERSIONS.FEET_TO_METERS;
    case 'fathoms':
      return value * CONVERSIONS.FATHOMS_TO_METERS;
    default:
      return value;
  }
}

/**
 * Convert from standard (meters) to user's depth unit
 * Rounded to 2 decimal places for display
 */
export function depthFromStandard(value: number, toUnit: DepthUnit): number {
  let result: number;
  switch (toUnit) {
    case 'm':
      return round(value, 2);
    case 'ft':
      result = value * CONVERSIONS.METERS_TO_FEET;
      break;
    case 'fathoms':
      result = value * CONVERSIONS.METERS_TO_FATHOMS;
      break;
    default:
      return round(value, 2);
  }
  return round(result, 2);
}

// ============================================================================
// Knots to m/s helpers (common conversion for existing code)
// ============================================================================

/**
 * Convert knots to m/s (for converting existing data to standard units)
 */
export function knotsToMs(knots: number): number {
  return knots * CONVERSIONS.KNOTS_TO_MS;
}

/**
 * Convert m/s to knots (rounded to 2 decimal places)
 */
export function msToKnots(ms: number): number {
  return round(ms * CONVERSIONS.MS_TO_KNOTS, 2);
}

// ============================================================================
// Generic Unit Converter
// ============================================================================

export type UnitCategory = 'speed' | 'wind' | 'depth' | 'temperature' | 'pressure' | 'fixed';

/**
 * Convert a value from standard units to user units based on category
 * Results are rounded to 2 decimal places to avoid floating point errors
 */
export function convertFromStandard(
  value: number,
  category: UnitCategory,
  userUnits: UserUnitPreferences
): number {
  let result: number;
  switch (category) {
    case 'speed':
      result = speedFromStandard(value, userUnits.speedUnit);
      break;
    case 'wind':
      result = speedFromStandard(value, userUnits.windUnit);
      break;
    case 'depth':
      result = depthFromStandard(value, userUnits.depthUnit);
      break;
    case 'temperature':
      result = temperatureFromStandard(value, userUnits.temperatureUnit);
      break;
    case 'pressure':
      result = pressureFromStandard(value, userUnits.pressureUnit);
      break;
    case 'fixed':
    default:
      return value;
  }
  return round(result, 2);
}

/**
 * Convert a value from user units to standard units based on category
 */
export function convertToStandard(
  value: number,
  category: UnitCategory,
  userUnits: UserUnitPreferences
): number {
  switch (category) {
    case 'speed':
      return speedToStandard(value, userUnits.speedUnit);
    case 'wind':
      return speedToStandard(value, userUnits.windUnit);
    case 'depth':
      return depthToStandard(value, userUnits.depthUnit);
    case 'temperature':
      return temperatureToStandard(value, userUnits.temperatureUnit);
    case 'pressure':
      return pressureToStandard(value, userUnits.pressureUnit);
    case 'fixed':
    default:
      return value;
  }
}

/**
 * Get the unit label for a category based on user preferences
 */
export function getUnitLabel(category: UnitCategory, userUnits: UserUnitPreferences): string {
  switch (category) {
    case 'speed':
      return userUnits.speedUnit;
    case 'wind':
      return userUnits.windUnit;
    case 'depth':
      return userUnits.depthUnit;
    case 'temperature':
      return userUnits.temperatureUnit;
    case 'pressure':
      return userUnits.pressureUnit;
    case 'fixed':
    default:
      return '';
  }
}
