/**
 * TankService — calibrated tank readings.
 *
 * BigaOS owns tanks as a first-class concept. Resistive tank senders are
 * wired to an I²C ADC (ADS1115 on the MacArthur HAT's spare bus); the
 * MacArthur plugin publishes those as `analog_voltage` streams. This
 * service consumes those raw voltages and produces calibrated
 * `tank_<id>_level` (%) and `tank_<id>_volume` (L) streams via the
 * existing plugin sensor pipeline so they flow through SensorMappingService
 * and out to clients exactly like any other stream.
 *
 * Calibration is multi-point linear interpolation between (rawVolts → liters)
 * pairs captured by the user via the Tanks settings UI. Below the lowest
 * captured point we clamp to 0 L; above the highest we clamp to capacity.
 */

import { EventEmitter } from 'events';
import { dbWorker } from './database-worker.service';
import { FluidType, PluginSensorValueEvent } from '../types/plugin.types';
import { StandardTankData } from '../types/data.types';

const TANK_CONFIG_KEY = 'tanks.config';
// Synthetic plugin id used so the SensorMappingService's debug + mapping
// machinery treats derived tank streams as a normal source. A real plugin
// can never collide because plugin ids are validated against [a-z0-9._-].
const TANK_SOURCE_PLUGIN_ID = 'bigaos-tanks';

export interface TankCalibrationPoint {
  rawVolts: number;
  liters: number;
}

export interface TankConfig {
  id: string;
  name: string;
  fluidType: FluidType;
  capacityLiters: number;
  /** `pluginId:streamId` of the analog_voltage source. */
  sourceStreamId: string;
  calibration: {
    points: TankCalibrationPoint[];
  };
}

export class TankService extends EventEmitter {
  private tanks: Map<string, TankConfig> = new Map();
  /** Most recent raw voltage seen per `pluginId:streamId`. */
  private lastRawByStream: Map<string, number> = new Map();
  /** Most recent computed reading per tankId. */
  private readings: Map<string, StandardTankData> = new Map();

  async initialize(): Promise<void> {
    await this.load();
    console.log(`[TankService] Initialized with ${this.tanks.size} tank(s)`);
  }

  // ================================================================
  // Ingest — called by DataController for every plugin_sensor_data
  // ================================================================

  /**
   * Every time a plugin pushes a value, check whether it's an analog
   * source bound to one or more tanks and, if so, recompute their readings.
   */
  onSensorValue(event: PluginSensorValueEvent): void {
    if (event.dataType !== 'analog_voltage') return;
    if (typeof event.value !== 'number' || !Number.isFinite(event.value)) return;

    const key = `${event.pluginId}:${event.streamId}`;
    this.lastRawByStream.set(key, event.value);

    let updated = false;
    for (const tank of this.tanks.values()) {
      if (tank.sourceStreamId !== key) continue;
      const reading = this.computeReading(tank, event.value);
      this.readings.set(tank.id, reading);
      updated = true;
    }
    if (updated) {
      this.emit('readings_updated', this.getReadings());
    }
  }

  /**
   * Get the most recent reading for every configured tank.
   */
  getReadings(): Record<string, StandardTankData> {
    const out: Record<string, StandardTankData> = {};
    for (const [id, reading] of this.readings) out[id] = reading;
    return out;
  }

  /**
   * Get the latest raw voltage on a tank's source stream, or null if
   * nothing has been seen yet. Used by the calibration wizard.
   */
  getCurrentRawVolts(tankId: string): number | null {
    const tank = this.tanks.get(tankId);
    if (!tank) return null;
    const v = this.lastRawByStream.get(tank.sourceStreamId);
    return typeof v === 'number' ? v : null;
  }

  // ================================================================
  // Calibration math — piecewise-linear interpolation
  // ================================================================

  private computeReading(tank: TankConfig, rawVolts: number): StandardTankData {
    const liters = this.interpolate(tank, rawVolts);
    const capacity = tank.capacityLiters > 0 ? tank.capacityLiters : 0;
    const level = capacity > 0 ? Math.max(0, Math.min(100, (liters / capacity) * 100)) : 0;
    return {
      fluidType: tank.fluidType,
      level,
      volume: liters,
      capacity,
    };
  }

  private interpolate(tank: TankConfig, rawVolts: number): number {
    const points = [...tank.calibration.points].sort((a, b) => a.rawVolts - b.rawVolts);
    if (points.length === 0) return 0;
    if (points.length === 1) {
      // Only one point — clamp to its liters value.
      return Math.max(0, Math.min(tank.capacityLiters, points[0].liters));
    }
    // Below first point: clamp to 0.
    if (rawVolts <= points[0].rawVolts) return Math.max(0, points[0].liters);
    // Above last point: clamp to capacity (or last point's liters, whichever).
    if (rawVolts >= points[points.length - 1].rawVolts) {
      return Math.min(tank.capacityLiters, points[points.length - 1].liters);
    }
    // Between two points: linear interpolation.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (rawVolts >= a.rawVolts && rawVolts <= b.rawVolts) {
        const span = b.rawVolts - a.rawVolts;
        if (span === 0) return a.liters;
        const t = (rawVolts - a.rawVolts) / span;
        return a.liters + t * (b.liters - a.liters);
      }
    }
    return 0;
  }

  // ================================================================
  // CRUD — used by WebSocket handlers
  // ================================================================

  list(): TankConfig[] {
    return Array.from(this.tanks.values());
  }

  get(tankId: string): TankConfig | null {
    return this.tanks.get(tankId) ?? null;
  }

  async save(tank: TankConfig): Promise<void> {
    if (!tank.id) tank.id = generateTankId();
    if (!tank.calibration) tank.calibration = { points: [] };
    if (!Array.isArray(tank.calibration.points)) tank.calibration.points = [];
    this.tanks.set(tank.id, tank);
    await this.persist();

    // Recompute reading immediately if we already have a raw value.
    const rawV = this.lastRawByStream.get(tank.sourceStreamId);
    if (typeof rawV === 'number') {
      this.readings.set(tank.id, this.computeReading(tank, rawV));
    } else {
      // Wipe stale reading so clients don't see old data tied to a different tank.
      this.readings.delete(tank.id);
    }
    this.emit('tanks_updated', this.list());
  }

  async delete(tankId: string): Promise<void> {
    if (!this.tanks.delete(tankId)) return;
    this.readings.delete(tankId);
    await this.persist();
    this.emit('tanks_updated', this.list());
  }

  /**
   * Capture the current raw voltage on this tank's source stream as a
   * calibration point at the given liter value. Removes any existing point
   * at that liter level so the user can re-capture.
   */
  async captureCalibrationPoint(tankId: string, liters: number): Promise<TankConfig | null> {
    const tank = this.tanks.get(tankId);
    if (!tank) return null;
    const rawV = this.lastRawByStream.get(tank.sourceStreamId);
    if (typeof rawV !== 'number') return tank; // No raw signal available.

    // Replace any existing point with the same liters value.
    tank.calibration.points = tank.calibration.points.filter(p => p.liters !== liters);
    tank.calibration.points.push({ rawVolts: rawV, liters });
    tank.calibration.points.sort((a, b) => a.liters - b.liters);
    await this.save(tank);
    return tank;
  }

  async clearCalibration(tankId: string): Promise<void> {
    const tank = this.tanks.get(tankId);
    if (!tank) return;
    tank.calibration.points = [];
    await this.save(tank);
  }

  // ================================================================
  // Persistence (single JSON setting — keeps migrations trivial)
  // ================================================================

  private async load(): Promise<void> {
    try {
      const raw = await dbWorker.getSetting(TANK_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TankConfig[];
      for (const t of parsed) {
        if (t && typeof t.id === 'string') {
          // Defensive defaults for older saved shapes.
          if (!t.calibration) t.calibration = { points: [] };
          if (!Array.isArray(t.calibration.points)) t.calibration.points = [];
          this.tanks.set(t.id, t);
        }
      }
    } catch (err) {
      console.error('[TankService] Failed to load tanks config:', err);
    }
  }

  private async persist(): Promise<void> {
    const arr = this.list();
    await dbWorker.setSetting(TANK_CONFIG_KEY, JSON.stringify(arr));
  }
}

// ================================================================
// Helpers
// ================================================================

function generateTankId(): string {
  return `tank_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const TANK_SOURCE_PLUGIN = TANK_SOURCE_PLUGIN_ID;
