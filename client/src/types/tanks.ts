/**
 * Client-side tank types — mirrors server/src/types/plugin.types.ts (FluidType)
 * and server/src/services/tank.service.ts (TankConfig).
 */

export type FluidType =
  | 'fuel'
  | 'fresh_water'
  | 'gray_water'
  | 'black_water'
  | 'gasoline';

export const FLUID_TYPES: FluidType[] = [
  'fresh_water',
  'fuel',
  'black_water',
  'gray_water',
  'gasoline',
];

export interface TankCalibrationPoint {
  rawVolts: number;
  liters: number;
}

export interface TankConfig {
  id: string;
  name: string;
  fluidType: FluidType;
  capacityLiters: number;
  /** `pluginId:streamId` of the analog_voltage source. */
  sourceStreamId: string;
  calibration: {
    points: TankCalibrationPoint[];
  };
}

export interface TankReading {
  fluidType: string;
  level: number;   // %
  volume: number;  // L
  capacity: number; // L
}

/** Default colour per fluid type. Aligned with the existing theme palette. */
export function fluidColor(type: FluidType): string {
  switch (type) {
    case 'fresh_water': return '#4fc3f7';
    case 'fuel':        return '#ffa726';
    case 'gasoline':    return '#ef5350';
    case 'black_water': return '#6d4c41';
    case 'gray_water':  return '#90a4ae';
  }
}

export function fluidLabelKey(type: FluidType): string {
  return `tanks.fluid_${type}`;
}

/**
 * For "low is bad" tanks (fuel, fresh water, oil, gasoline) — warn when low.
 * For "high is bad" tanks (waste/sewage/gray water) — warn when full.
 * Returns the threshold-friendly direction: 'low' or 'high'.
 */
export function tankWarnDirection(type: FluidType): 'low' | 'high' {
  switch (type) {
    case 'black_water':
    case 'gray_water':
      return 'high';
    default:
      return 'low';
  }
}
