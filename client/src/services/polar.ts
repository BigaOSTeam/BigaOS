/**
 * Client mirror of the boat performance model.
 *
 * The full polar (boat speed vs wind angle/speed) lives on the server and is
 * the single source of truth for weather routing. The client only needs the
 * hull-speed default (to show the derived top speed in settings/dialog) and a
 * helper to package the vessel's performance fields into the route request.
 */

import type { VesselSettings } from '../context/SettingsContext';

/** Default top-speed multiplier per preset (cats/planing exceed hull speed). */
const PRESET_SPEED_FACTOR: Record<string, number> = {
  cruisingMonohull: 1.0,
  performance: 1.15,
  catamaran: 1.35,
  custom: 1.0,
};

/** Theoretical hull speed (knots) for a displacement hull: 1.34 * sqrt(LWL_ft). */
export function hullSpeedKn(waterlineLengthM: number): number {
  if (!(waterlineLengthM > 0)) return 0;
  const lwlFt = waterlineLengthM / 0.3048;
  return 1.34 * Math.sqrt(lwlFt);
}

/** The top speed the optimizer will use: explicit override, else derived from LWL. */
export function effectiveMaxSpeedKn(v: VesselSettings): number {
  if (v.maxSpeedKn > 0) return v.maxSpeedKn;
  const derived = hullSpeedKn(v.waterlineLength) * (PRESET_SPEED_FACTOR[v.polarPreset] ?? 1);
  return derived > 0 ? derived : 6;
}

/** Performance payload sent to the weather-route endpoint. */
export interface VesselPerformancePayload {
  propulsion: VesselSettings['propulsion'];
  polarPreset: VesselSettings['polarPreset'];
  pointingAngleDeg: number;
  maxSpeedKn: number;
  cruisingSpeedKn: number;
  waterlineLengthM: number;
}

export function buildVesselPerformance(v: VesselSettings): VesselPerformancePayload {
  return {
    propulsion: v.propulsion,
    polarPreset: v.polarPreset,
    pointingAngleDeg: v.pointingAngleDeg,
    maxSpeedKn: v.maxSpeedKn,
    cruisingSpeedKn: v.cruisingSpeedKn,
    waterlineLengthM: v.waterlineLength,
  };
}
