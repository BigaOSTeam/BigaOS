/**
 * Minimal quaternion math for IMU mounting alignment.
 *
 * Convention: Hamilton quaternions {w, x, y, z}, body-to-world rotation,
 * matching the 'ahrs' package. toEuler() reproduces ahrs getEulerAngles()
 * exactly (ZYX aerospace: heading about z, pitch about y, roll about x).
 */

function qMultiply(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

function qConjugate(q) {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

function qNormalize(q) {
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}

function qFromEuler(roll, pitch, yaw) {
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

function qToEuler(q) {
  const ww = q.w * q.w, xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
  return {
    heading: Math.atan2(2 * (q.x * q.y + q.z * q.w), xx - yy - zz + ww),
    pitch: -Math.asin(Math.max(-1, Math.min(1, 2 * (q.x * q.z - q.y * q.w)))),
    roll: Math.atan2(2 * (q.y * q.z + q.x * q.w), -xx - yy + zz + ww),
  };
}

/**
 * Average a set of nearby quaternions (component mean with sign alignment
 * to the first sample, then normalize). Valid for tightly clustered
 * orientations, which is all the tare needs.
 */
function qAverage(quats) {
  const ref = quats[0];
  let w = 0, x = 0, y = 0, z = 0;
  for (const q of quats) {
    const dot = q.w * ref.w + q.x * ref.x + q.y * ref.y + q.z * ref.z;
    const s = dot < 0 ? -1 : 1;
    w += s * q.w; x += s * q.x; y += s * q.y; z += s * q.z;
  }
  return qNormalize({ w, x, y, z });
}

module.exports = { qMultiply, qConjugate, qNormalize, qFromEuler, qToEuler, qAverage };
