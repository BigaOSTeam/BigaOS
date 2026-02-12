/**
 * Angle utility functions for BigaOS
 *
 * BigaOS uses radians internally for all angle values (matching NMEA2000).
 * These utilities handle conversion to degrees for display and
 * normalization for angle arithmetic.
 */

export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = Math.PI / 180;
export const TWO_PI = 2 * Math.PI;

/** Convert radians to degrees */
export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

/** Convert degrees to radians */
export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

/** Normalize an angle in radians to [0, 2π) */
export function normalizeRad(rad: number): number {
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI;
}

/** Format an angle in radians as a degree string, e.g. "045°" */
export function formatAngle(rad: number): string {
  return `${Math.round(radToDeg(rad))}°`;
}

/** Get cardinal direction from angle in radians */
export function getCardinalDirection(rad: number): string {
  const deg = ((radToDeg(rad) % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}
