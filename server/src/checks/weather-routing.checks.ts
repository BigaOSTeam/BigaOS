/**
 * Weather-routing self-checks (no test runner in this project).
 *
 * Run with:  npx ts-node src/checks/weather-routing.checks.ts
 *
 * Pure-function assertions for the polar model, the weather-field sampler, the
 * isochrone optimizer (synthetic field + stub water), and the extracted geo
 * helpers. Exits non-zero on the first failed assertion.
 */

import assert from 'assert';
import { calculateDistance, fastDistance, getIntKey, PriorityQueue } from '../workers/lib/geo';
import { resolvePolar, boatSpeedKn, hullSpeedKn } from '../services/polar';
import { sampleField, WeatherField } from '../workers/lib/weather-sample';
import { optimizeOnce, timelineAlongPath } from '../workers/lib/isochrone';

const D = Math.PI / 180;
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('geo:');
check('lat degree ≈ 60 NM', () => assert.ok(Math.abs(calculateDistance(0, 0, 1, 0) - 60) < 0.5));
check('fastDistance grid step', () => assert.ok(Math.abs(fastDistance(54, 12, 54.0008, 12) - 0.048) < 0.02));
check('getIntKey stable & distinct', () => {
  assert.strictEqual(getIntKey(54, 12, 1250), getIntKey(54, 12, 1250));
  assert.notStrictEqual(getIntKey(54, 12, 1250), getIntKey(54.001, 12, 1250));
});
check('priority queue pops ascending', () => {
  const pq = new PriorityQueue<number>((a, b) => a - b);
  [5, 1, 3, 2, 4].forEach((n) => pq.push(n));
  const out: number[] = [];
  while (!pq.isEmpty()) out.push(pq.pop()!);
  assert.deepStrictEqual(out, [1, 2, 3, 4, 5]);
});

console.log('polar:');
const sail = resolvePolar({ propulsion: 'sail', polarPreset: 'cruisingMonohull', pointingAngleDeg: 45, maxSpeedKn: 7, cruisingSpeedKn: 5, waterlineLengthM: 10 });
check('no-go zone → 0 under sail', () => assert.strictEqual(boatSpeedKn(sail, 30 * D, 15, 0).speedKn, 0));
check('beam reach faster than close-hauled', () => assert.ok(boatSpeedKn(sail, 95 * D, 15, 0).speedKn > boatSpeedKn(sail, 50 * D, 15, 0).speedKn));
check('top speed capped', () => assert.ok(boatSpeedKn(sail, 100 * D, 60, 0).speedKn <= 7 + 1e-9));
check('more wind → faster', () => assert.ok(boatSpeedKn(sail, 100 * D, 20, 0).speedKn > boatSpeedKn(sail, 100 * D, 8, 0).speedKn));
check('wave drag reduces speed', () => assert.ok(boatSpeedKn(sail, 100 * D, 15, 4).speedKn < boatSpeedKn(sail, 100 * D, 15, 0).speedKn));
check('pure sail never motors', () => assert.strictEqual(boatSpeedKn(sail, 30 * D, 2, 0).motoring, false));
const ms = resolvePolar({ propulsion: 'motorsail', polarPreset: 'cruisingMonohull', pointingAngleDeg: 45, maxSpeedKn: 7, cruisingSpeedKn: 5.5, waterlineLengthM: 10 });
check('motorsailer motors in light/no-go', () => {
  const r = boatSpeedKn(ms, 30 * D, 3, 0);
  assert.ok(r.motoring && r.speedKn > 4);
});
const mo = resolvePolar({ propulsion: 'motor', polarPreset: 'custom', pointingAngleDeg: 0, maxSpeedKn: 0, cruisingSpeedKn: 8, waterlineLengthM: 9 });
check('motorboat always cruises', () => {
  const r = boatSpeedKn(mo, 120 * D, 18, 0);
  assert.ok(r.motoring && Math.abs(r.speedKn - 8) < 1e-6);
});
check('hull speed 1 ft → 1.34 kn', () => assert.ok(Math.abs(hullSpeedKn(0.3048) - 1.34) < 0.01));

console.log('sampler:');
const series = (v: number) => Array.from({ length: 48 }, () => v);
function uniformField(windDirRad: number, tws: number): WeatherField {
  const pt = (lat: number, lon: number) => ({ lat, lon, windSpeedKn: series(tws), windDirRad: series(windDirRad), waveHeightM: series(NaN), waveDirRad: series(NaN) });
  return { bbox: { north: 54.2, south: 53.9, east: 12.2, west: 11.8 }, t0Ms: 0, stepMs: 3600000, hours: 48, points: [pt(53.9, 11.8), pt(53.9, 12.2), pt(54.2, 11.8), pt(54.2, 12.2)], coverage: 'full', requestedPoints: 4, sampledPoints: 4 };
}
check('exact point returns its wind', () => {
  const s = sampleField(uniformField(0, 12), 53.9, 11.8, 0)!;
  assert.ok(Math.abs(s.windSpeedKn - 12) < 1e-3);
});
check('temporal lerp half hour', () => {
  const tf: WeatherField = { bbox: { north: 1, south: 0, east: 1, west: 0 }, t0Ms: 0, stepMs: 3600000, hours: 2, points: [{ lat: 0, lon: 0, windSpeedKn: [10, 20], windDirRad: [0, 0], waveHeightM: [NaN, NaN], waveDirRad: [NaN, NaN] }], coverage: 'partial', requestedPoints: 1, sampledPoints: 1 };
  assert.ok(Math.abs(sampleField(tf, 0, 0, 1800000)!.windSpeedKn - 15) < 1e-3);
});
check('direction wrap 350/10 → ~0', () => {
  const wf: WeatherField = { bbox: { north: 1, south: 0, east: 1, west: 0 }, t0Ms: 0, stepMs: 3600000, hours: 2, points: [
    { lat: 0, lon: 0, windSpeedKn: [10, 10], windDirRad: [350 * D, 350 * D], waveHeightM: [NaN, NaN], waveDirRad: [NaN, NaN] },
    { lat: 0, lon: 1, windSpeedKn: [10, 10], windDirRad: [10 * D, 10 * D], waveHeightM: [NaN, NaN], waveDirRad: [NaN, NaN] },
  ], coverage: 'partial', requestedPoints: 2, sampledPoints: 2 };
  const deg = sampleField(wf, 0, 0.5, 0)!.windDirRad / D;
  assert.ok(deg < 5 || deg > 355);
});
check('empty field → null', () => assert.strictEqual(sampleField({ bbox: { north: 1, south: 0, east: 1, west: 0 }, t0Ms: 0, stepMs: 3600000, hours: 0, points: [], coverage: 'none', requestedPoints: 0, sampledPoints: 0 }, 0, 0, 0), null));

console.log('optimizer:');
const deps = { isWater: () => true };
const polar = resolvePolar({ propulsion: 'sail', polarPreset: 'cruisingMonohull', pointingAngleDeg: 45, maxSpeedKn: 7, cruisingSpeedKn: 5, waterlineLengthM: 10 });
const start = { lat: 54.0, lon: 12.0 };
const end = { lat: 54.1, lon: 12.0 }; // ~6 NM due north
const down = optimizeOnce(start, end, 0, uniformField(Math.PI, 15), polar, {}, deps);
const up = optimizeOnce(start, end, 0, uniformField(0, 15), polar, {}, deps);
check('downwind succeeds & reaches the destination', () => {
  assert.ok(down.success);
  assert.ok(Math.abs(down.waypoints[down.waypoints.length - 1].lat - 54.1) < 0.02);
});
check('upwind succeeds, tacks, and reaches the destination', () => {
  assert.ok(up.success);
  // Upwind must beat to windward — the path swings off the rhumb line.
  assert.ok(Math.max(...up.waypoints.map((w) => Math.abs(w.lon - 12.0))) > 0.01);
  assert.ok(Math.abs(up.waypoints[up.waypoints.length - 1].lat - 54.1) < 0.02);
});
check('upwind passage is slower than downwind (worse VMG)', () => {
  assert.ok(up.durationMs > down.durationMs);
});

console.log('fallback (timeline along path):');
const path = [
  { lat: 54.0, lon: 12.0 },
  { lat: 54.05, lon: 12.1 },
  { lat: 54.1, lon: 12.0 },
];
check('times the forecast along a fixed path & arrives', () => {
  const r = timelineAlongPath(path, 0, uniformField(0, 15), polar, deps);
  assert.ok(r.success);
  assert.strictEqual(r.waypoints.length, path.length); // displayed path preserved
  assert.ok(r.timeline.length > path.length); // densified
  assert.ok(r.durationMs > 0 && Number.isFinite(r.durationMs));
});
check('upwind leg on the fixed path tacks (finite ETA, not stuck)', () => {
  // Straight north leg into a northerly → below no-go; VMG must stay positive.
  const r = timelineAlongPath([{ lat: 54.0, lon: 12.0 }, { lat: 54.1, lon: 12.0 }], 0, uniformField(0, 15), polar, deps);
  assert.ok(r.success && Number.isFinite(r.durationMs) && r.durationMs > 0);
});

console.log(`\nAll ${passed} weather-routing checks passed.`);
