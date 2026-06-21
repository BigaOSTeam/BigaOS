/**
 * Boat performance model (parametric polar) for weather routing.
 *
 * Pure functions, no I/O. Given a true wind angle (TWA), true wind speed (TWS)
 * and sea state, returns the boat's speed through the water, whether it's under
 * engine, and its point of sail. The optimizer calls this in its hot loop.
 *
 * This is an ADVISORY model, not a measured polar. Defaults are derived from
 * the boat's waterline length (hull speed) and a small set of preset curve
 * shapes; the user can override the close-hauled angle and top speed.
 *
 * Angles are radians throughout (matches WindData.direction); speeds are knots.
 */

export type PointOfSail =
  | 'no-go'
  | 'close-hauled'
  | 'close-reach'
  | 'beam-reach'
  | 'broad-reach'
  | 'run'
  | 'motoring';

export type PolarPreset = 'cruisingMonohull' | 'performance' | 'catamaran' | 'custom';

/** Raw boat performance inputs as carried in the route request (from vessel settings). */
export interface VesselPerformance {
  propulsion: 'sail' | 'motor' | 'motorsail';
  polarPreset: PolarPreset;
  pointingAngleDeg: number; // closest angle to the true wind (close-hauled)
  maxSpeedKn: number; // 0 → derive hull speed from waterlineLength
  cruisingSpeedKn: number; // speed under engine
  waterlineLengthM: number; // for the hull-speed default
}

/** Resolved, concrete polar used by the optimizer. */
export interface PolarParams {
  maxSpeedKn: number;
  noGoAngleRad: number; // below this TWA the boat can't make way under sail
  peakAngleRad: number; // TWA of best sailing efficiency
  upwindEff: number; // efficiency at the no-go angle (0..1)
  runEff: number; // efficiency dead downwind (0..1)
  windK: number; // wind-response shape (knots); larger = needs more wind
  waveDragCoef: number; // fractional speed loss per metre of wave height
  motorSpeedKn: number;
  lightWindThresholdKn: number; // sail speed below which a motorsailer motors
  allowSail: boolean;
  allowMotor: boolean;
}

export interface BoatSpeedResult {
  speedKn: number;
  motoring: boolean;
  pointOfSail: PointOfSail;
}

const DEG = Math.PI / 180;

/** Theoretical hull speed (knots) for a displacement hull: 1.34 * sqrt(LWL_ft). */
export function hullSpeedKn(waterlineLengthM: number): number {
  if (!(waterlineLengthM > 0)) return 0;
  const lwlFt = waterlineLengthM / 0.3048;
  return 1.34 * Math.sqrt(lwlFt);
}

interface PresetShape {
  peakAngleDeg: number;
  upwindEff: number;
  runEff: number;
  windK: number;
  waveDragCoef: number;
  /** Multiplier on hull speed when deriving a default top speed (cats/planing exceed it). */
  speedFactor: number;
  /** Sensible default close-hauled angle for the preset. */
  defaultPointingDeg: number;
}

const PRESET_SHAPES: Record<Exclude<PolarPreset, 'custom'>, PresetShape> = {
  cruisingMonohull: { peakAngleDeg: 110, upwindEff: 0.5, runEff: 0.62, windK: 7, waveDragCoef: 0.06, speedFactor: 1.0, defaultPointingDeg: 45 },
  performance: { peakAngleDeg: 115, upwindEff: 0.6, runEff: 0.72, windK: 6, waveDragCoef: 0.045, speedFactor: 1.15, defaultPointingDeg: 38 },
  catamaran: { peakAngleDeg: 105, upwindEff: 0.5, runEff: 0.48, windK: 6, waveDragCoef: 0.05, speedFactor: 1.35, defaultPointingDeg: 50 },
};

/** Whole-boat preset bundles for the optimizer's default and tests. */
export const POLAR_PRESETS: Record<Exclude<PolarPreset, 'custom'>, PolarParams> = {
  cruisingMonohull: resolvePolar({ propulsion: 'motorsail', polarPreset: 'cruisingMonohull', pointingAngleDeg: 45, maxSpeedKn: 0, cruisingSpeedKn: 5.5, waterlineLengthM: 10 }),
  performance: resolvePolar({ propulsion: 'sail', polarPreset: 'performance', pointingAngleDeg: 38, maxSpeedKn: 0, cruisingSpeedKn: 6, waterlineLengthM: 11 }),
  catamaran: resolvePolar({ propulsion: 'motorsail', polarPreset: 'catamaran', pointingAngleDeg: 50, maxSpeedKn: 0, cruisingSpeedKn: 7, waterlineLengthM: 12 }),
};

/** Turn raw vessel-settings performance fields into a concrete PolarParams. */
export function resolvePolar(v: VesselPerformance): PolarParams {
  const shape = PRESET_SHAPES[(v.polarPreset === 'custom' ? 'cruisingMonohull' : v.polarPreset) as Exclude<PolarPreset, 'custom'>];

  const derivedMax = hullSpeedKn(v.waterlineLengthM) * shape.speedFactor;
  const maxSpeedKn = v.maxSpeedKn > 0 ? v.maxSpeedKn : derivedMax > 0 ? derivedMax : 6;

  const pointingDeg = v.pointingAngleDeg > 0 ? v.pointingAngleDeg : shape.defaultPointingDeg;
  // Keep the peak strictly above the no-go angle.
  const peakDeg = Math.max(pointingDeg + 15, shape.peakAngleDeg);

  const motorSpeedKn = v.cruisingSpeedKn > 0 ? v.cruisingSpeedKn : 5;

  return {
    maxSpeedKn,
    noGoAngleRad: pointingDeg * DEG,
    peakAngleRad: peakDeg * DEG,
    upwindEff: shape.upwindEff,
    runEff: shape.runEff,
    windK: shape.windK,
    waveDragCoef: shape.waveDragCoef,
    motorSpeedKn,
    lightWindThresholdKn: Math.min(2.5, motorSpeedKn * 0.6),
    allowSail: v.propulsion !== 'motor',
    allowMotor: v.propulsion !== 'sail',
  };
}

// Smoothstep 0..1.
function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Sailing efficiency (0..1) as a function of TWA in [0, π]. */
function angleEfficiency(twa: number, p: PolarParams): number {
  if (twa < p.noGoAngleRad) return 0;
  if (twa <= p.peakAngleRad) {
    const t = (twa - p.noGoAngleRad) / Math.max(1e-6, p.peakAngleRad - p.noGoAngleRad);
    return p.upwindEff + (1 - p.upwindEff) * smooth(t);
  }
  const t = (twa - p.peakAngleRad) / Math.max(1e-6, Math.PI - p.peakAngleRad);
  return 1 - (1 - p.runEff) * smooth(t);
}

/**
 * Boat speed (knots) for a given true wind angle, true wind speed and wave
 * height, plus whether the boat is motoring and its point of sail.
 */
export function boatSpeedKn(p: PolarParams, twaRad: number, twsKn: number, waveHeightM: number): BoatSpeedResult {
  // Normalize TWA to [0, π] — only the magnitude off the wind matters for speed.
  let twa = Math.abs(twaRad) % (2 * Math.PI);
  if (twa > Math.PI) twa = 2 * Math.PI - twa;

  const waveFactor = Math.max(0.4, 1 - p.waveDragCoef * Math.max(0, waveHeightM));

  // Sail speed (0 in the no-go zone or when sailing isn't allowed).
  let sailKn = 0;
  if (p.allowSail) {
    const eff = angleEfficiency(twa, p);
    if (eff > 0) {
      const windResp = 1 - Math.exp(-Math.max(0, twsKn) / p.windK);
      sailKn = Math.min(p.maxSpeedKn, p.maxSpeedKn * eff * windResp * waveFactor);
    }
  }

  const pos = pointOfSail(twa, p);

  if (!p.allowMotor) {
    // Pure sailboat — no engine. In the no-go zone speed is 0 (the optimizer
    // reaches upwind destinations by tacking, never by choosing this heading).
    return { speedKn: sailKn, motoring: false, pointOfSail: pos };
  }

  const motorKn = p.motorSpeedKn * waveFactor;

  if (!p.allowSail) {
    // Motorboat — always under engine.
    return { speedKn: motorKn, motoring: true, pointOfSail: 'motoring' };
  }

  // Motorsailer — take whichever is faster.
  if (sailKn >= motorKn) {
    return { speedKn: sailKn, motoring: false, pointOfSail: pos };
  }
  return { speedKn: motorKn, motoring: true, pointOfSail: sailKn <= p.lightWindThresholdKn ? 'motoring' : pos };
}

function pointOfSail(twa: number, p: PolarParams): PointOfSail {
  const deg = twa / DEG;
  if (twa < p.noGoAngleRad) return 'no-go';
  if (deg < 60) return 'close-hauled';
  if (deg < 80) return 'close-reach';
  if (deg < 100) return 'beam-reach';
  if (deg < 150) return 'broad-reach';
  return 'run';
}
