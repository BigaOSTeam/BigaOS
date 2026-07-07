/**
 * IMU Calibration Module
 *
 * Handles gyroscope bias, magnetometer hard-iron/soft-iron, and
 * mounting alignment calibration for the ICM-20948 IMU.
 *
 * Mounting alignment is a full quaternion tare: the device can be
 * installed in any orientation (sideways in a cabinet, rotated away
 * from the bow) — the tare maps the device attitude onto the boat
 * frame, so heading, roll and pitch all come out on boat axes.
 *
 * Calibration data is persisted via plugin settings and loaded on startup.
 * If no calibration exists on first run, gyro bias and mounting alignment
 * are auto-calibrated (magnetometer requires user-initiated rotation).
 */

const { qMultiply, qConjugate, qNormalize, qFromEuler, qToEuler, qAverage } = require('./quaternion');

// Number of samples for gyro bias calibration (~2s at 50Hz)
const GYRO_CAL_SAMPLES = 100;

// Number of samples for mounting alignment (~1s at 50Hz)
const MOUNT_CAL_SAMPLES = 50;

// Max accelerometer variance (g²) to accept gyro calibration (must be stationary)
const MOTION_THRESHOLD = 0.01;

// Max heading wander (rad) across the alignment window before rejecting the tare
const ALIGN_STABILITY_RAD = 3 * Math.PI / 180;

// Corrected mag magnitude outside this factor of the calibrated field
// strength is treated as a disturbance (alternator burst, DC wiring, ...)
const MAG_TOLERANCE = 0.3;

// Slow EMA so the expected field strength tracks the geomagnetic environment
const MAG_EMA_ALPHA = 0.001;

const TWO_PI = 2 * Math.PI;

class IMUCalibration {
  constructor() {
    this.gyroBias = { x: 0, y: 0, z: 0 };
    this.magHardIron = { x: 0, y: 0, z: 0 };
    this.magSoftIron = { x: 1, y: 1, z: 1 };
    this.mountingOffset = { roll: 0, pitch: 0, heading: 0 }; // legacy (pre-quaternion) offsets
    this.mountQuat = null; // quaternion tare — supersedes mountingOffset when set
    this.magFieldMagnitude = null; // expected corrected |mag| in µT (from compass cal)
    this.magRejectCount = 0;
    this.lastMagRejectTime = 0;
    this.calibrated = false;
    this.status = 'idle'; // idle | calibrating_gyro | calibrating_mount | calibrating_mag | complete
    this.progress = 0;
    this.magSamples = 0;
  }

  /**
   * Load calibration data from plugin settings.
   * Returns true if valid calibration was found.
   */
  async load(api) {
    try {
      const data = await api.getSetting('imuCalibration');
      if (!data || data.version !== 1) return false;

      if (data.gyroBias) this.gyroBias = data.gyroBias;
      if (data.magHardIron) this.magHardIron = data.magHardIron;
      if (data.magSoftIron) this.magSoftIron = data.magSoftIron;
      if (data.mountingOffset) this.mountingOffset = data.mountingOffset;
      if (data.mountQuat) this.mountQuat = data.mountQuat;
      if (typeof data.magFieldMagnitude === 'number') this.magFieldMagnitude = data.magFieldMagnitude;
      this.calibrated = true;
      this.status = 'complete';
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save calibration data to plugin settings.
   */
  async save(api) {
    await api.setSetting('imuCalibration', {
      version: 1,
      timestamp: new Date().toISOString(),
      gyroBias: this.gyroBias,
      magHardIron: this.magHardIron,
      magSoftIron: this.magSoftIron,
      mountingOffset: this.mountingOffset,
      mountQuat: this.mountQuat,
      magFieldMagnitude: this.magFieldMagnitude,
    });
  }

  /**
   * Calibrate gyroscope bias. Device must be stationary.
   * Collects samples and averages the gyro readings.
   */
  calibrateGyro(imuConnection) {
    return new Promise((resolve, reject) => {
      this.status = 'calibrating_gyro';
      this.progress = 0;

      const samples = [];
      const accelSamples = [];

      const onData = (data) => {
        samples.push({ x: data.gyro.x, y: data.gyro.y, z: data.gyro.z });
        accelSamples.push({ x: data.accel.x, y: data.accel.y, z: data.accel.z });
        this.progress = Math.round((samples.length / GYRO_CAL_SAMPLES) * 100);

        if (samples.length >= GYRO_CAL_SAMPLES) {
          imuConnection.removeListener('data', onData);

          // Check if device was stationary (low accel variance)
          const accelVariance = this._computeVariance(accelSamples);
          if (accelVariance > MOTION_THRESHOLD) {
            this.status = 'idle';
            reject(new Error('Motion detected during gyro calibration — keep the device still'));
            return;
          }

          // Average gyro readings = bias
          this.gyroBias = this._average(samples);
          resolve(this.gyroBias);
        }
      };

      imuConnection.on('data', onData);
    });
  }

  /**
   * Calibrate mounting alignment (quaternion tare) using the current AHRS state.
   *
   * Assumes the boat is level. Samples the converged device attitude and
   * computes the fixed rotation that maps it onto the boat frame:
   *   mountQuat = conj(Q_ref) ⊗ fromEuler(0, 0, targetHeading)
   *
   * @param {number|null} targetHeading - the boat's actual current magnetic
   *   heading (radians). Pass null to keep the current boat heading unchanged
   *   (pure re-level, e.g. auto-calibration on first run).
   * @returns {Promise<{ heading: number }>} the heading the attitude was mapped to
   */
  alignMounting(imuConnection, fusion, targetHeading = null) {
    return new Promise((resolve, reject) => {
      this.status = 'calibrating_mount';
      this.progress = 0;

      const samples = [];

      // Guard the awaited RPC path against a stalled sensor
      const timeout = setTimeout(() => {
        imuConnection.removeListener('data', onData);
        this.status = this.calibrated ? 'complete' : 'idle';
        reject(new Error('No IMU data received — is the sensor connected?'));
      }, 10000);

      const onData = (data) => {
        const correctedMag = this.applyMag(data.mag);
        const corrected = {
          accel: data.accel,
          gyro: this.applyGyro(data.gyro),
          mag: this.checkMagField(correctedMag) ? correctedMag : { x: 0, y: 0, z: 0 },
          timestamp: data.timestamp,
        };
        fusion.update(corrected);
        samples.push(fusion.getQuaternion());
        this.progress = Math.round((samples.length / MOUNT_CAL_SAMPLES) * 100);

        if (samples.length >= MOUNT_CAL_SAMPLES) {
          clearTimeout(timeout);
          imuConnection.removeListener('data', onData);

          // Reject the tare if heading was still moving during the window
          const headings = samples.map(q => qToEuler(q).heading);
          if (this._circularSpread(headings) > ALIGN_STABILITY_RAD) {
            this.status = this.calibrated ? 'complete' : 'idle';
            reject(new Error('Heading not stable — wait for the compass to settle, then try again'));
            return;
          }

          const qRef = qAverage(samples);

          // null target = keep the boat heading where it is today (pure re-level)
          let target = targetHeading;
          if (target === null) {
            const current = this.mountQuat
              ? qToEuler(qMultiply(qRef, this.mountQuat)).heading
              : qToEuler(qRef).heading;
            target = current;
          }

          this.mountQuat = qNormalize(qMultiply(qConjugate(qRef), qFromEuler(0, 0, target)));
          // Quaternion tare supersedes the legacy euler offsets
          this.mountingOffset = { roll: 0, pitch: 0, heading: 0 };
          resolve({ heading: ((target % TWO_PI) + TWO_PI) % TWO_PI });
        }
      };

      imuConnection.on('data', onData);
    });
  }

  /**
   * Start magnetometer calibration. Collects samples while user rotates the device.
   * Call stopMagCalibration() when done.
   */
  startMagCalibration(imuConnection) {
    this.status = 'calibrating_mag';
    this.progress = 0;
    this.magSamples = 0;
    this._magMin = { x: Infinity, y: Infinity, z: Infinity };
    this._magMax = { x: -Infinity, y: -Infinity, z: -Infinity };

    this._magListener = (data) => {
      const { x, y, z } = data.mag;
      this._magMin.x = Math.min(this._magMin.x, x);
      this._magMin.y = Math.min(this._magMin.y, y);
      this._magMin.z = Math.min(this._magMin.z, z);
      this._magMax.x = Math.max(this._magMax.x, x);
      this._magMax.y = Math.max(this._magMax.y, y);
      this._magMax.z = Math.max(this._magMax.z, z);
      this.magSamples++;
    };

    imuConnection.on('data', this._magListener);
  }

  /**
   * Finish magnetometer calibration. Computes hard-iron and soft-iron from collected samples.
   * Returns null if insufficient data.
   */
  stopMagCalibration(imuConnection) {
    if (this._magListener) {
      imuConnection.removeListener('data', this._magListener);
      this._magListener = null;
    }

    if (this.magSamples < 50) {
      this.status = 'idle';
      return null;
    }

    // Hard-iron offset = center of bounding box
    this.magHardIron = {
      x: (this._magMax.x + this._magMin.x) / 2,
      y: (this._magMax.y + this._magMin.y) / 2,
      z: (this._magMax.z + this._magMin.z) / 2,
    };

    // Soft-iron scale = normalize axes to equal range
    const rangeX = (this._magMax.x - this._magMin.x) / 2 || 1;
    const rangeY = (this._magMax.y - this._magMin.y) / 2 || 1;
    const rangeZ = (this._magMax.z - this._magMin.z) / 2 || 1;
    const avgRange = (rangeX + rangeY + rangeZ) / 3;

    this.magSoftIron = {
      x: avgRange / rangeX,
      y: avgRange / rangeY,
      z: avgRange / rangeZ,
    };

    // After correction the field magnitude is ~avgRange — remember it so
    // magnetic disturbances (electrical bursts) can be detected and rejected
    this.magFieldMagnitude = avgRange;
    this.magRejectCount = 0;

    this.status = 'complete';
    this.calibrated = true;
    return { hardIron: this.magHardIron, softIron: this.magSoftIron, samples: this.magSamples };
  }

  /**
   * Apply gyro bias correction.
   */
  applyGyro(gyro) {
    return {
      x: gyro.x - this.gyroBias.x,
      y: gyro.y - this.gyroBias.y,
      z: gyro.z - this.gyroBias.z,
    };
  }

  /**
   * Apply magnetometer hard-iron and soft-iron correction.
   */
  applyMag(mag) {
    return {
      x: (mag.x - this.magHardIron.x) * this.magSoftIron.x,
      y: (mag.y - this.magHardIron.y) * this.magSoftIron.y,
      z: (mag.z - this.magHardIron.z) * this.magSoftIron.z,
    };
  }

  /**
   * Check whether a corrected mag reading is plausible against the
   * calibrated field strength. Implausible readings (electrical bursts,
   * a drill next to the cabinet, ...) should not be fed to the filter —
   * the gyro carries the heading through the disturbance.
   *
   * Always true until a compass calibration has stored a field magnitude.
   */
  checkMagField(correctedMag) {
    if (!this.magFieldMagnitude) return true;

    const m = Math.hypot(correctedMag.x, correctedMag.y, correctedMag.z);
    const expected = this.magFieldMagnitude;

    if (m < expected * (1 - MAG_TOLERANCE) || m > expected * (1 + MAG_TOLERANCE)) {
      this.magRejectCount++;
      this.lastMagRejectTime = Date.now();
      return false;
    }

    // Track slow changes in the ambient field (sailing to other latitudes)
    this.magFieldMagnitude = expected * (1 - MAG_EMA_ALPHA) + m * MAG_EMA_ALPHA;
    return true;
  }

  /**
   * Map the device attitude onto the boat frame.
   *
   * Uses the quaternion tare when available; falls back to the legacy
   * euler roll/pitch subtraction for calibrations saved by older versions.
   */
  applyMounting(attitude, quat) {
    if (this.mountQuat && quat) {
      const e = qToEuler(qMultiply(quat, this.mountQuat));
      let heading = e.heading;
      if (heading < 0) heading += TWO_PI;
      return { roll: e.roll, pitch: e.pitch, heading };
    }
    return {
      roll: attitude.roll - this.mountingOffset.roll,
      pitch: attitude.pitch - this.mountingOffset.pitch,
      heading: attitude.heading,
    };
  }

  /**
   * Get current calibration state for UI.
   */
  getState() {
    return {
      status: this.status,
      progress: this.progress,
      calibrated: this.calibrated,
      gyroBias: this.gyroBias,
      magHardIron: this.magHardIron,
      magSoftIron: this.magSoftIron,
      mountingOffset: this.mountingOffset,
      magSamples: this.magSamples,
      headingAligned: this.mountQuat !== null,
      magDisturbance: this.lastMagRejectTime > 0 && (Date.now() - this.lastMagRejectTime) < 2000,
      magRejectCount: this.magRejectCount,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Max angular deviation (rad) of a set of headings from their circular mean.
   */
  _circularSpread(headings) {
    let sinSum = 0, cosSum = 0;
    for (const h of headings) {
      sinSum += Math.sin(h);
      cosSum += Math.cos(h);
    }
    const mean = Math.atan2(sinSum, cosSum);
    let max = 0;
    for (const h of headings) {
      let d = Math.abs(h - mean) % TWO_PI;
      if (d > Math.PI) d = TWO_PI - d;
      if (d > max) max = d;
    }
    return max;
  }

  _average(samples) {
    const n = samples.length;
    return {
      x: samples.reduce((s, v) => s + v.x, 0) / n,
      y: samples.reduce((s, v) => s + v.y, 0) / n,
      z: samples.reduce((s, v) => s + v.z, 0) / n,
    };
  }

  _computeVariance(samples) {
    const avg = this._average(samples);
    const n = samples.length;
    let variance = 0;
    for (const s of samples) {
      variance += (s.x - avg.x) ** 2 + (s.y - avg.y) ** 2 + (s.z - avg.z) ** 2;
    }
    return variance / n;
  }
}

module.exports = { IMUCalibration };
