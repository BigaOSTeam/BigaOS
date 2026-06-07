/**
 * Self-contained sun & moon calculations — no network, no dependencies.
 *
 * Sun event times use the standard "sunrise equation" (NOAA-style low-precision
 * solar position), accurate to ~1 minute, which is plenty for planning a
 * daylight departure/arrival. Moon phase is an approximation from the mean
 * synodic month. All times are returned as JS Date objects (UTC instants);
 * format them with the user's locale/time-format at the display boundary.
 */

const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const OBLIQUITY = 23.4397; // mean obliquity of the ecliptic, degrees

function toJulian(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function fromJulian(j: number): Date {
  return new Date((j - 2440587.5) * 86400000);
}

export interface SunTimes {
  dawn: Date | null; // civil twilight begin (sun at -6°)
  sunrise: Date | null; // sun at -0.833° (refraction + radius)
  sunset: Date | null;
  dusk: Date | null; // civil twilight end
  /** Sun stays above the rise/set altitude all day (polar day). */
  alwaysUp: boolean;
  /** Sun stays below the rise/set altitude all day (polar night). */
  alwaysDown: boolean;
}

/**
 * Sunrise/sunset and civil twilight for a date and position.
 * @param date any instant on the desired day
 * @param lat  latitude in decimal degrees
 * @param lon  longitude in decimal degrees (east positive)
 */
export function getSunTimes(date: Date, lat: number, lon: number): SunTimes {
  const lw = -lon; // algorithm uses west-positive longitude
  const phi = lat * RAD;

  const jDate = toJulian(date);
  const n = Math.round(jDate - J2000 - 0.0009 - lw / 360);
  const jStar = J2000 + 0.0009 + lw / 360 + n; // approximate mean solar noon

  const M = (357.5291 + 0.98560028 * (jStar - J2000)) % 360;
  const Mr = M * RAD;
  const C =
    1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = (M + 102.9372 + C + 180) % 360;
  const lambdaR = lambda * RAD;

  const jTransit = jStar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lambdaR);
  const sinDec = Math.sin(lambdaR) * Math.sin(OBLIQUITY * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));

  // Returns rise/set Dates for the sun reaching a given altitude (degrees),
  // or flags when it never happens at this latitude/date.
  const eventTimes = (
    altitude: number
  ): { rise: Date | null; set: Date | null; up: boolean; down: boolean } => {
    const cosOmega =
      (Math.sin(altitude * RAD) - Math.sin(phi) * sinDec) /
      (Math.cos(phi) * cosDec);
    if (cosOmega > 1) return { rise: null, set: null, up: false, down: true };
    if (cosOmega < -1) return { rise: null, set: null, up: true, down: false };
    const omega = Math.acos(cosOmega) / RAD; // hour angle, degrees
    return {
      rise: fromJulian(jTransit - omega / 360),
      set: fromJulian(jTransit + omega / 360),
      up: false,
      down: false,
    };
  };

  const sun = eventTimes(-0.833);
  const civil = eventTimes(-6);

  return {
    dawn: civil.rise,
    sunrise: sun.rise,
    sunset: sun.set,
    dusk: civil.set,
    alwaysUp: sun.up,
    alwaysDown: sun.down,
  };
}

export interface MoonInfo {
  /** Position in the synodic cycle: 0 = new, 0.5 = full, →1 back to new. */
  phaseFraction: number;
  /** Illuminated fraction of the disc, 0..1. */
  illumination: number;
  /** Phase bucket 0..7 (new, waxing crescent, first quarter, ... waning crescent). */
  phaseIndex: number;
}

const SYNODIC_MONTH = 29.530588853; // days
// A known new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86400000;

export function getMoonPhase(date: Date): MoonInfo {
  const days = date.getTime() / 86400000 - KNOWN_NEW_MOON;
  let phaseFraction = (days % SYNODIC_MONTH) / SYNODIC_MONTH;
  if (phaseFraction < 0) phaseFraction += 1;
  const illumination = (1 - Math.cos(2 * Math.PI * phaseFraction)) / 2;
  const phaseIndex = Math.round(phaseFraction * 8) % 8;
  return { phaseFraction, illumination, phaseIndex };
}
