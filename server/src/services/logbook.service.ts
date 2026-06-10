/**
 * LogbookService — passive GPS recording with auto-segmented "underway"
 * stretches and per-day grouping.
 *
 * Subscribes to StandardSensorData (m/s, radians, decimal degrees), runs a
 * hysteresis state machine on SOG to decide when the boat is underway, and
 * persists trackpoints + segment summaries + day rows to SQLite via dbWorker.
 *
 * All persisted values are in STANDARD units. Display conversion happens at
 * the controller / client edge.
 */

import { EventEmitter } from 'events';
import { dbWorker } from './database-worker.service';
import { StandardSensorData } from '../types/data.types';

// Underway detection thresholds (m/s; 0.5 kn and 0.3 kn respectively).
const UNDERWAY_SOG_MPS = 0.2572;
const STOPPED_SOG_MPS = 0.1543;

// Hysteresis — how long the SOG condition must hold before we transition.
const UNDERWAY_HOLD_MS = 2 * 60 * 1000;   // 2 min above threshold to start a segment
const STOPPED_HOLD_MS  = 5 * 60 * 1000;   // 5 min below threshold to close one

// Sampling cadence.
const SAMPLE_UNDERWAY_MS = 5_000;
const SAMPLE_IDLE_MS     = 60_000;

// On reboot, if the last point of an open segment is older than this, the
// segment is closed (the boat was clearly stopped while the server was down).
const RESUME_STALE_MS = 10 * 60 * 1000;

interface Trackpoint {
  ts: number;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
}

interface ActiveSegment {
  id: number;
  dayDate: string;
  startedAt: number;
  startLat: number;
  startLon: number;
  // In-memory aggregates updated on every recorded point.
  lastPoint: Trackpoint | null;
  distanceM: number;
  sogSum: number;      // for avg
  sogCount: number;    // for avg
  maxSog: number;
  pointCount: number;
}

export class LogbookService extends EventEmitter {
  private enabled: boolean = true;
  private initialized: boolean = false;

  // State
  private active: ActiveSegment | null = null;
  private lastRecordedTs: number = 0;
  private underwayCandidateSince: number | null = null;
  private stoppedCandidateSince: number | null = null;

  /**
   * Resume any open segment from a previous run, or finalize it if it's
   * gone stale.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const open = await dbWorker.logbookGetOpenSegment();
      if (!open) return;

      const points = await dbWorker.logbookGetSegmentTrackpoints(open.id);
      const last = points.length > 0 ? points[points.length - 1] : null;
      const now = Date.now();

      if (!last || now - last.ts > RESUME_STALE_MS) {
        // Stale — close it using whatever we have.
        const summary = summarize(points, open.start_lat, open.start_lon);
        const endedAt = last ? last.ts : open.started_at;
        await dbWorker.logbookCloseSegment(
          open.id,
          endedAt,
          summary.distanceM,
          summary.avgSog,
          summary.maxSog,
          summary.endLat,
          summary.endLon,
          summary.pointCount,
        );
        await dbWorker.logbookTouchDay(open.day_date, endedAt);
        console.log(`[Logbook] Closed stale segment ${open.id} on resume`);
        this.emit('segment_closed', { id: open.id, dayDate: open.day_date });
        return;
      }

      // Fresh enough — resume in-memory state from stored points.
      const summary = summarize(points, open.start_lat, open.start_lon);
      this.active = {
        id: open.id,
        dayDate: open.day_date,
        startedAt: open.started_at,
        startLat: open.start_lat,
        startLon: open.start_lon,
        lastPoint: last,
        distanceM: summary.distanceM,
        sogSum: summary.sogSum,
        sogCount: summary.sogCount,
        maxSog: summary.maxSog,
        pointCount: points.length,
      };
      this.lastRecordedTs = last.ts;
      console.log(`[Logbook] Resumed open segment ${open.id} (${points.length} pts)`);
    } catch (err) {
      console.error('[Logbook] initialize failed:', err);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    console.log(`[Logbook] Recording ${enabled ? 'enabled' : 'disabled'}`);
    if (!enabled && this.active) {
      // Close the open segment immediately so we don't leave it dangling.
      this.closeActive(Date.now()).catch((err) =>
        console.error('[Logbook] Failed to close segment on disable:', err)
      );
    }
    // Reset candidates either way; we don't want stale timers from before.
    this.underwayCandidateSince = null;
    this.stoppedCandidateSince = null;
  }

  /**
   * Called by DataController on every standard sensor update.
   */
  onSensorData(data: StandardSensorData): void {
    if (!this.enabled) return;
    const pos = data.navigation.position;
    if (!pos) return;
    const lat = pos.latitude;
    const lon = pos.longitude;
    if (!isFinite(lat) || !isFinite(lon)) return;
    // 0,0 is the "no fix" placeholder used by several plugins. We'd rather
    // miss a sample off Africa than record the boat in the Gulf of Guinea
    // every time the GPS drops.
    if (lat === 0 && lon === 0) return;

    const ts = Date.now();
    const rawSog = data.navigation.speedOverGround;
    const rawCog = data.navigation.courseOverGround;
    const sog = typeof rawSog === 'number' && isFinite(rawSog) ? rawSog : null;
    const cog = typeof rawCog === 'number' && isFinite(rawCog) ? rawCog : null;

    this.evaluateState(ts, sog, cog, lat, lon).catch((err) =>
      console.error('[Logbook] evaluateState failed:', err)
    );
  }

  private async evaluateState(ts: number, sog: number | null, cog: number | null, lat: number, lon: number): Promise<void> {
    // ---- State machine ----
    const movingFast = sog !== null && sog > UNDERWAY_SOG_MPS;
    const movingSlow = sog !== null && sog < STOPPED_SOG_MPS;

    if (!this.active) {
      // NOT_UNDERWAY
      if (movingFast) {
        if (this.underwayCandidateSince === null) {
          this.underwayCandidateSince = ts;
        } else if (ts - this.underwayCandidateSince >= UNDERWAY_HOLD_MS) {
          // Transition to UNDERWAY. Backdate the segment start to when SOG
          // first crossed up so we don't lose those first two minutes.
          await this.openSegment(this.underwayCandidateSince, lat, lon);
          this.underwayCandidateSince = null;
        }
      } else {
        this.underwayCandidateSince = null;
      }
      this.stoppedCandidateSince = null;
    } else {
      // UNDERWAY
      // Midnight rollover: split segment at end-of-day if the local date changed.
      const currentDay = localDateString(ts);
      if (currentDay !== this.active.dayDate) {
        const endMs = endOfLocalDay(this.active.startedAt); // end of the day the segment was opened on
        await this.closeActive(endMs);
        // Re-open immediately for the new day, starting at midnight.
        const newStart = endMs + 1;
        await this.openSegment(newStart, lat, lon);
      }

      if (movingSlow) {
        if (this.stoppedCandidateSince === null) {
          this.stoppedCandidateSince = ts;
        } else if (ts - this.stoppedCandidateSince >= STOPPED_HOLD_MS) {
          // Transition to NOT_UNDERWAY. Backdate ended_at to when SOG first
          // dropped — the boat was actually stopped from that moment.
          await this.closeActive(this.stoppedCandidateSince);
          this.stoppedCandidateSince = null;
        }
      } else {
        this.stoppedCandidateSince = null;
      }
      this.underwayCandidateSince = null;
    }

    // ---- Sampling ----
    const interval = this.active ? SAMPLE_UNDERWAY_MS : SAMPLE_IDLE_MS;
    if (ts - this.lastRecordedTs < interval) return;
    this.lastRecordedTs = ts;

    const point: Trackpoint = { ts, lat, lon, sog, cog };
    await this.recordTrackpoint(point);
  }

  private async openSegment(startedAt: number, lat: number, lon: number): Promise<void> {
    const dayDate = localDateString(startedAt);
    const id = await dbWorker.logbookOpenSegment(dayDate, startedAt, lat, lon);
    await dbWorker.logbookTouchDay(dayDate, startedAt);
    this.active = {
      id,
      dayDate,
      startedAt,
      startLat: lat,
      startLon: lon,
      lastPoint: null,
      distanceM: 0,
      sogSum: 0,
      sogCount: 0,
      maxSog: 0,
      pointCount: 0,
    };
    console.log(`[Logbook] Opened segment ${id} on ${dayDate}`);
  }

  private async closeActive(endedAt: number): Promise<void> {
    if (!this.active) return;
    const a = this.active;
    const avgSog = a.sogCount > 0 ? a.sogSum / a.sogCount : 0;
    const endLat = a.lastPoint?.lat ?? a.startLat;
    const endLon = a.lastPoint?.lon ?? a.startLon;
    await dbWorker.logbookCloseSegment(
      a.id,
      endedAt,
      a.distanceM,
      avgSog,
      a.maxSog,
      endLat,
      endLon,
      a.pointCount,
    );
    await dbWorker.logbookTouchDay(a.dayDate, endedAt);
    console.log(`[Logbook] Closed segment ${a.id} (${(a.distanceM / 1852).toFixed(2)} nm, ${a.pointCount} pts)`);
    const closed = { id: a.id, dayDate: a.dayDate };
    this.active = null;
    this.emit('segment_closed', closed);
  }

  private async recordTrackpoint(point: Trackpoint): Promise<void> {
    const segmentId = this.active?.id ?? null;
    await dbWorker.logbookInsertTrackpoint(
      point.ts,
      point.lat,
      point.lon,
      point.sog,
      point.cog,
      segmentId,
    );

    if (this.active) {
      const prev = this.active.lastPoint;
      if (prev) {
        this.active.distanceM += haversineMeters(prev.lat, prev.lon, point.lat, point.lon);
      }
      this.active.lastPoint = point;
      if (point.sog !== null) {
        this.active.sogSum += point.sog;
        this.active.sogCount += 1;
        if (point.sog > this.active.maxSog) this.active.maxSog = point.sog;
      }
      this.active.pointCount += 1;
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function localDateString(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function endOfLocalDay(ts: number): number {
  const d = new Date(ts);
  // Midnight of the *next* local day, minus one ms.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_008.8; // mean Earth radius in meters
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface SegmentSummary {
  distanceM: number;
  sogSum: number;
  sogCount: number;
  avgSog: number;
  maxSog: number;
  endLat: number;
  endLon: number;
  pointCount: number;
}

function summarize(points: any[], fallbackLat: number, fallbackLon: number): SegmentSummary {
  let distanceM = 0;
  let sogSum = 0;
  let sogCount = 0;
  let maxSog = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      distanceM += haversineMeters(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
    }
    if (typeof p.sog === 'number') {
      sogSum += p.sog;
      sogCount += 1;
      if (p.sog > maxSog) maxSog = p.sog;
    }
  }
  const last = points[points.length - 1];
  return {
    distanceM,
    sogSum,
    sogCount,
    avgSog: sogCount > 0 ? sogSum / sogCount : 0,
    maxSog,
    endLat: last?.lat ?? fallbackLat,
    endLon: last?.lon ?? fallbackLon,
    pointCount: points.length,
  };
}

// Singleton — matches the alertService/switchService pattern.
export const logbookService = new LogbookService();
