/**
 * NMEA 0183 Parser
 *
 * Stateless helpers to validate and decode the NMEA 0183 sentences that
 * marine USB instruments emit. Covers the common instrument set so that
 * whatever you plug in — GPS, wind, depth, log, heading — is understood:
 *
 *   Navigation:  RMC, GGA, GLL, VTG
 *   Heading:     HDT, HDG, HDM, VHW
 *   Speed (log): VHW
 *   Wind:        MWV, VWR, MWD
 *   Depth:       DBT, DPT
 *   Water temp:  MTW
 *   Rudder:      RSA
 *
 * All output is converted to BigaOS internal / NMEA2000 standard units at
 * this boundary:
 *   - Position:    decimal degrees (latitude/longitude)
 *   - Speed:       m/s
 *   - Angles:      radians (0..2π)
 *   - Depth:       meters
 *   - Temperature: Kelvin
 *
 * Talker IDs are ignored: modern multi-constellation receivers emit "GN"
 * (GPGGA vs GNGGA decode identically), and a combined instrument might use
 * "II"/"IN"/"SD" etc. Sentences are keyed on the last three characters of
 * the address field.
 */

const KNOTS_TO_MS = 0.514444;
const KMH_TO_MS = 1000 / 3600;
const FEET_TO_M = 0.3048;
const FATHOM_TO_M = 1.8288;
const DEG_TO_RAD = Math.PI / 180;
const KELVIN_OFFSET = 273.15;

/**
 * Validate an NMEA checksum (XOR of chars between "$"/"!" and "*").
 * Returns true when no checksum is present (some cheap devices omit it),
 * but false on an explicit mismatch.
 */
function validateChecksum(sentence) {
  const star = sentence.lastIndexOf('*');
  if (star === -1) return true;

  const expected = sentence.slice(star + 1).trim().toUpperCase();
  if (!/^[0-9A-F]{2}$/.test(expected)) return false;

  let cs = 0;
  for (let i = 1; i < star; i++) cs ^= sentence.charCodeAt(i);
  const actual = cs.toString(16).toUpperCase().padStart(2, '0');
  return actual === expected;
}

/** ddmm.mmmm / dddmm.mmmm + hemisphere -> signed decimal degrees, or null. */
function parseCoordinate(value, hemisphere) {
  if (!value) return null;
  const v = parseFloat(value);
  if (!isFinite(v)) return null;
  const degrees = Math.floor(v / 100);
  const minutes = v - degrees * 100;
  let decimal = degrees + minutes / 60;
  if (hemisphere === 'S' || hemisphere === 'W') decimal = -decimal;
  return decimal;
}

function num(field) {
  if (field === undefined || field === '') return null;
  const v = parseFloat(field);
  return isFinite(v) ? v : null;
}

/** Normalize an angle in radians into [0, 2π). */
function normalizeRad(rad) {
  const twoPi = Math.PI * 2;
  let r = rad % twoPi;
  if (r < 0) r += twoPi;
  return r;
}

/** Wind/speed value + NMEA unit letter -> m/s (null if unparseable). */
function speedToMs(value, unit) {
  const v = num(value);
  if (v === null) return null;
  switch ((unit || '').toUpperCase()) {
    case 'N': return v * KNOTS_TO_MS;  // knots
    case 'K': return v * KMH_TO_MS;    // km/h
    case 'M': return v;                // m/s
    default:  return null;
  }
}

/**
 * Parse a single NMEA line.
 *
 * Returns null for non-NMEA lines, or an object carrying whatever the
 * sentence provided. `valid` is false on a checksum failure — ignore those.
 * Possible fields: position, sog, cog, headingTrue, headingMagnetic, stw,
 * depth, waterTemp, windSpeedApparent, windAngleApparent, windSpeedTrue,
 * windAngleTrue, rudder, fixQuality, satellites, status.
 */
function parseSentence(line) {
  const trimmed = line.trim();
  if (!trimmed || (trimmed[0] !== '$' && trimmed[0] !== '!')) return null;

  if (!validateChecksum(trimmed)) return { type: 'INVALID', valid: false };

  const star = trimmed.lastIndexOf('*');
  const body = star === -1 ? trimmed.slice(1) : trimmed.slice(1, star);
  const f = body.split(',');
  const address = f[0] || '';
  if (address.length < 3) return null;
  const type = address.slice(-3).toUpperCase();

  const r = { type, valid: true };

  switch (type) {
    // ── Navigation ──────────────────────────────────────────
    case 'RMC': {
      // time, status, lat, N/S, lon, E/W, sogKn, cogDeg, date, magvar...
      r.status = f[2] || '';
      const lat = parseCoordinate(f[3], f[4]);
      const lon = parseCoordinate(f[5], f[6]);
      if (r.status === 'A' && lat !== null && lon !== null) {
        r.position = { latitude: lat, longitude: lon };
      }
      const sogKn = num(f[7]);
      if (r.status === 'A' && sogKn !== null) r.sog = sogKn * KNOTS_TO_MS;
      const cogDeg = num(f[8]);
      if (r.status === 'A' && cogDeg !== null) r.cog = normalizeRad(cogDeg * DEG_TO_RAD);
      break;
    }
    case 'GGA': {
      // time, lat, N/S, lon, E/W, quality, numSats, hdop, alt...
      r.fixQuality = num(f[6]) ?? 0;
      r.satellites = num(f[7]);
      const lat = parseCoordinate(f[2], f[3]);
      const lon = parseCoordinate(f[4], f[5]);
      if (r.fixQuality > 0 && lat !== null && lon !== null) {
        r.position = { latitude: lat, longitude: lon };
      }
      break;
    }
    case 'GLL': {
      // lat, N/S, lon, E/W, time, status, mode
      r.status = f[6] || '';
      const lat = parseCoordinate(f[1], f[2]);
      const lon = parseCoordinate(f[3], f[4]);
      if (r.status === 'A' && lat !== null && lon !== null) {
        r.position = { latitude: lat, longitude: lon };
      }
      break;
    }
    case 'VTG': {
      // cogTrue, T, cogMag, M, sogKn, N, sogKmh, K, mode
      if (f[9] !== 'N') {
        const cogDeg = num(f[1]);
        if (cogDeg !== null) r.cog = normalizeRad(cogDeg * DEG_TO_RAD);
        const sogKn = num(f[5]);
        if (sogKn !== null) r.sog = sogKn * KNOTS_TO_MS;
      }
      break;
    }

    // ── Heading ─────────────────────────────────────────────
    case 'HDT': {
      // heading, T (true)
      const d = num(f[1]);
      if (d !== null) r.headingTrue = normalizeRad(d * DEG_TO_RAD);
      break;
    }
    case 'HDM': {
      // heading, M (magnetic)
      const d = num(f[1]);
      if (d !== null) r.headingMagnetic = normalizeRad(d * DEG_TO_RAD);
      break;
    }
    case 'HDG': {
      // magHeading, deviation, E/W, variation, E/W
      const d = num(f[1]);
      if (d !== null) r.headingMagnetic = normalizeRad(d * DEG_TO_RAD);
      break;
    }
    case 'VHW': {
      // headingTrue, T, headingMag, M, speedKn, N, speedKmh, K
      const t = num(f[1]);
      if (t !== null) r.headingTrue = normalizeRad(t * DEG_TO_RAD);
      const m = num(f[3]);
      if (m !== null) r.headingMagnetic = normalizeRad(m * DEG_TO_RAD);
      const spdKn = num(f[5]);
      if (spdKn !== null) r.stw = spdKn * KNOTS_TO_MS;
      else {
        const spdKmh = num(f[7]);
        if (spdKmh !== null) r.stw = spdKmh * KMH_TO_MS;
      }
      break;
    }

    // ── Wind ────────────────────────────────────────────────
    case 'MWV': {
      // windAngle, reference(R/T), windSpeed, unit(K/M/N), status(A/V)
      if ((f[5] || '') === 'A') {
        const angleDeg = num(f[1]);
        const speed = speedToMs(f[3], f[4]);
        const ref = (f[2] || '').toUpperCase();
        if (ref === 'R') {
          if (angleDeg !== null) r.windAngleApparent = normalizeRad(angleDeg * DEG_TO_RAD);
          if (speed !== null) r.windSpeedApparent = speed;
        } else if (ref === 'T') {
          if (angleDeg !== null) r.windAngleTrue = normalizeRad(angleDeg * DEG_TO_RAD);
          if (speed !== null) r.windSpeedTrue = speed;
        }
      }
      break;
    }
    case 'VWR': {
      // windAngle, L/R, speedKn, N, speedMs, M, speedKmh, K  (apparent)
      const angleDeg = num(f[1]);
      if (angleDeg !== null) {
        // L = port -> mirror to 360-angle so 0..360 clockwise from bow.
        const signed = (f[2] || '').toUpperCase() === 'L' ? 360 - angleDeg : angleDeg;
        r.windAngleApparent = normalizeRad(signed * DEG_TO_RAD);
      }
      const spd = speedToMs(f[3], 'N') ?? speedToMs(f[5], 'M') ?? speedToMs(f[7], 'K');
      if (spd !== null) r.windSpeedApparent = spd;
      break;
    }
    case 'MWD': {
      // windDirTrue, T, windDirMag, M, speedKn, N, speedMs, M  (true wind speed only)
      const spd = speedToMs(f[5], 'N') ?? speedToMs(f[7], 'M');
      if (spd !== null) r.windSpeedTrue = spd;
      break;
    }

    // ── Depth ───────────────────────────────────────────────
    case 'DBT': {
      // depthFeet, f, depthMeters, M, depthFathoms, F  (below transducer)
      const m = num(f[3]);
      if (m !== null) r.depth = m;
      else {
        const ft = num(f[1]);
        if (ft !== null) r.depth = ft * FEET_TO_M;
        else {
          const fa = num(f[5]);
          if (fa !== null) r.depth = fa * FATHOM_TO_M;
        }
      }
      break;
    }
    case 'DPT': {
      // depthMeters (below transducer), offset, maxRange
      const m = num(f[1]);
      if (m !== null) r.depth = m;
      break;
    }

    // ── Water temperature ───────────────────────────────────
    case 'MTW': {
      // tempCelsius, C
      const c = num(f[1]);
      if (c !== null) r.waterTemp = c + KELVIN_OFFSET;
      break;
    }

    // ── Rudder ──────────────────────────────────────────────
    case 'RSA': {
      // starboard/single angle, status, port angle, status
      if ((f[2] || '') === 'A') {
        const d = num(f[1]);
        if (d !== null) r.rudder = d * DEG_TO_RAD; // signed: + = starboard
      }
      break;
    }

    default:
      break; // valid but unhandled (GSA, GSV, ZDA, AIS VDM, proprietary...)
  }

  return r;
}

module.exports = {
  parseSentence,
  validateChecksum,
  parseCoordinate,
  speedToMs,
  normalizeRad,
  KNOTS_TO_MS,
  DEG_TO_RAD,
};
