/**
 * IMU Sensor Fusion
 *
 * Wraps the AHRS (Madgwick) filter to produce stable roll, pitch,
 * and magnetic heading from raw ICM-20948 sensor data.
 *
 * Features:
 * - Beta warmup: starts with high beta (2.5) for fast convergence,
 *   then reduces to steady-state (0.1) after warmup period. The low
 *   steady beta makes heading inert against magnetometer disturbances —
 *   turns still track instantly via the gyro.
 * - Accepts pre-corrected data (gyro bias and mag calibration
 *   applied externally by IMUCalibration). A zero mag vector {0,0,0}
 *   makes the filter run gyro+accel only for that sample (used for
 *   magnetic disturbance rejection).
 *
 * Input:  accel (g), gyro (rad/s), mag (µT)
 * Output: roll, pitch, heading (all in radians)
 */

const AHRS = require('ahrs');

const WARMUP_BETA = 2.5;
const STEADY_BETA = 0.1;
const WARMUP_SAMPLES = 200; // ~4 seconds at 50Hz

class IMUFusion {
  constructor(options = {}) {
    const sampleInterval = options.sampleInterval || 20; // ms
    this.sampleInterval = sampleInterval;
    this.steadyBeta = options.beta || STEADY_BETA;
    this.warmupSamples = options.warmupSamples || WARMUP_SAMPLES;
    this.sampleCount = 0;
    this.lastTimestamp = null;

    this.ahrs = new AHRS({
      sampleInterval,
      algorithm: 'Madgwick',
      beta: WARMUP_BETA,
    });
  }

  /**
   * Update the filter with new sensor readings.
   *
   * @param {object} data - { accel: {x,y,z}, gyro: {x,y,z}, mag: {x,y,z}, timestamp }
   *   accel in g-force, gyro in rad/s (bias-corrected), mag in µT (hard/soft-iron corrected)
   * @returns {{ roll: number, pitch: number, heading: number }} radians
   */
  update(data) {
    const { accel, gyro, mag } = data;

    // Compute dt for the filter (seconds)
    let dt;
    if (this.lastTimestamp) {
      dt = (data.timestamp - this.lastTimestamp) / 1000;
      // Clamp dt to prevent instability on first samples or stalls
      if (dt <= 0 || dt > 0.5) dt = 0.02;
    } else {
      dt = 0.02;
    }
    this.lastTimestamp = data.timestamp;

    // Beta warmup: transition from high beta to steady beta
    this.sampleCount++;
    if (this.sampleCount === this.warmupSamples) {
      this.ahrs.beta = this.steadyBeta;
    }

    // Update Madgwick filter
    this.ahrs.update(
      gyro.x, gyro.y, gyro.z,
      accel.x, accel.y, accel.z,
      mag.x, mag.y, mag.z,
      dt,
    );

    // Get Euler angles (radians)
    const euler = this.ahrs.getEulerAngles();

    // Normalize heading to [0, 2π]
    let heading = euler.heading;
    if (heading < 0) heading += 2 * Math.PI;

    return {
      roll: euler.roll,       // radians, ±π
      pitch: euler.pitch,     // radians, ±π/2
      heading,                // radians, [0, 2π] (magnetic)
    };
  }

  /**
   * Current orientation quaternion {w,x,y,z} (device frame -> world).
   */
  getQuaternion() {
    return this.ahrs.getQuaternion();
  }

  reset() {
    this.lastTimestamp = null;
    this.sampleCount = 0;
    this.ahrs = new AHRS({
      sampleInterval: this.sampleInterval,
      algorithm: 'Madgwick',
      beta: WARMUP_BETA,
    });
  }
}

module.exports = { IMUFusion };
