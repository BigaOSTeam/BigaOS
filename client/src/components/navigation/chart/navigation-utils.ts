// Navigation utility functions for distance, bearing, and ETA calculations
import { TWO_PI } from '../../../utils/angle';
import type { WeatherRouteStep } from './weather-route.types';

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in nautical miles
 */
export const calculateDistanceNm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Format ETA time duration into human-readable string
 * @param hours Time in hours
 * @returns Formatted string like "2h 30m", "< 1m", "3d 5h"
 */
export const formatETA = (hours: number): string => {
  if (!isFinite(hours) || hours < 0) return '--';
  if (hours < 1 / 60) return '< 1m'; // Less than 1 minute
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return h > 0 ? `${days}d ${h}h` : `${days}d`;
};

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in meters
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate bearing from one point to another
 * Note: lat/lon inputs are still in decimal degrees (geographic coordinates)
 * @returns Bearing in radians [0, 2π)
 */
export const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = Math.atan2(y, x);
  return (bearing + TWO_PI) % TWO_PI;
};

/**
 * Interpolate a boat position/heading along a weather-route timeline at an
 * absolute time. Used by the preview to move the boat as the slider scrubs.
 * Clamps to the timeline ends.
 */
export interface TimelineInterp {
  lat: number;
  lon: number;
  headingRad: number;
  step: WeatherRouteStep; // the active (segment-end) step at this time
  segFrac: number; // 0..1 within the bracketing segment
  index: number; // index of the bracketing-end step
}

export const interpolateTimeline = (
  timeline: WeatherRouteStep[],
  atMs: number
): TimelineInterp | null => {
  if (!timeline || timeline.length === 0) return null;
  if (timeline.length === 1) {
    const s = timeline[0];
    return { lat: s.lat, lon: s.lon, headingRad: s.headingRad, step: s, segFrac: 0, index: 0 };
  }

  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  if (atMs <= first.etaMs) {
    return { lat: first.lat, lon: first.lon, headingRad: timeline[1].headingRad, step: timeline[1], segFrac: 0, index: 1 };
  }
  if (atMs >= last.etaMs) {
    return { lat: last.lat, lon: last.lon, headingRad: last.headingRad, step: last, segFrac: 1, index: timeline.length - 1 };
  }

  // Find the bracketing segment [i-1, i].
  let i = 1;
  while (i < timeline.length && timeline[i].etaMs < atMs) i++;
  const a = timeline[i - 1];
  const b = timeline[i];
  const span = b.etaMs - a.etaMs;
  const frac = span > 0 ? (atMs - a.etaMs) / span : 0;
  return {
    lat: a.lat + (b.lat - a.lat) * frac,
    lon: a.lon + (b.lon - a.lon) * frac,
    headingRad: b.headingRad, // the leg being sailed into b
    step: b,
    segFrac: frac,
    index: i,
  };
};

/**
 * Distance remaining (NM) along the timeline from the interpolated position at
 * a given time to the destination.
 */
export const timelineDistanceRemainingNm = (
  timeline: WeatherRouteStep[],
  interp: { lat: number; lon: number; index: number }
): number => {
  if (!timeline || timeline.length < 2) return 0;
  let total = 0;
  // From interpolated position to the next node...
  const next = timeline[interp.index];
  if (next) total += calculateDistanceNm(interp.lat, interp.lon, next.lat, next.lon);
  // ...then the remaining full legs.
  for (let k = interp.index; k < timeline.length - 1; k++) {
    total += calculateDistanceNm(timeline[k].lat, timeline[k].lon, timeline[k + 1].lat, timeline[k + 1].lon);
  }
  return total;
};

/**
 * Calculate total route distance from an array of waypoints
 * @param waypoints Array of {lat, lon} points
 * @returns Total distance in nautical miles
 */
export const calculateRouteDistanceNm = (
  waypoints: Array<{ lat: number; lon: number }>
): number => {
  if (waypoints.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistance += calculateDistanceNm(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon
    );
  }
  return totalDistance;
};
