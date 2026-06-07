/**
 * SensorMappingService - Assembles plugin data into StandardSensorData
 *
 * This service sits between plugins and the DataController:
 * - Receives individual sensor values from driver plugins
 * - Assembles them into a unified StandardSensorData at 1Hz
 * - Supports priority-based mapping (multiple sources for same slot)
 * - Auto-maps new drivers to empty sensor slots
 * - Provides debug stream of raw values per plugin+stream
 * - Tracks source liveness for the data source selection UI
 *
 * Can also pass through complete StandardSensorData packets from
 * plugins that generate all data at once (e.g., demo driver).
 */

import { EventEmitter } from 'events';
import {
  SensorSlotType,
  SensorMapping,
  SensorMappingConfig,
  DataStreamDeclaration,
  PluginSensorValueEvent,
  PluginSensorPacketEvent,
} from '../types/plugin.types';
import {
  StandardSensorData,
  StandardNavigationData,
  StandardEnvironmentData,
  StandardElectricalData,
  StandardPropulsionData,
} from '../types/data.types';
import { dbWorker } from './database-worker.service';
import { getMagneticDeclination } from '../utils/magnetic-declination';

// ============================================================================
// Source Availability Types (shared with client via WebSocket)
// ============================================================================

export interface SourceInfo {
  pluginId: string;
  streamId: string;
  pluginName: string;
  streamName: string;
  interface: string;
  alive: boolean;
  lastUpdate?: string;
  selected: boolean;
}

export interface SlotAvailability {
  slotType: string;
  sources: SourceInfo[];
}

// ============================================================================
// Stream Metadata (from plugin manifests)
// ============================================================================

interface StreamMeta {
  pluginId: string;
  pluginName: string;
  streamId: string;
  streamName: string;
  dataType: string;
  updateRate: number;
  interface: string;
}

export class SensorMappingService extends EventEmitter {
  // Current mappings: slotType -> array sorted by priority (highest first)
  private mappings: Map<string, SensorMapping[]> = new Map();

  // Latest values per slot (from the highest-priority active mapping)
  private slotValues: Map<string, { value: any; timestamp: string }> = new Map();

  // Latest packet data (from pushSensorDataPacket passthrough)
  private packetData: StandardSensorData | null = null;
  private packetPluginId: string | null = null;

  // Assembly interval
  private assembleInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ASSEMBLE_RATE_MS = 1000; // 1 Hz output

  // Track all incoming raw data for debug UI
  private debugData: Map<string, { pluginId: string; streamId: string; dataType: string; value: any; timestamp: string }> = new Map();

  // Stream metadata from plugin manifests (for liveness tracking and UI labels)
  private streamMeta: Map<string, StreamMeta> = new Map();

  // Liveness grace period: how long after expected interval before source is "dead"
  private readonly LIVENESS_GRACE_FACTOR = 3;
  private readonly LIVENESS_MIN_MS = 3000;
  // After this many ms with no data, remove source from availability entirely
  private readonly LIVENESS_REMOVE_MS = 30000;

  async initialize(): Promise<void> {
    await this.loadMappings();

    // Start assembly loop
    this.assembleInterval = setInterval(() => {
      this.assembleAndEmit();
    }, this.ASSEMBLE_RATE_MS);

    console.log('[SensorMappingService] Initialized');
  }

  // ================================================================
  // Stream Metadata Registration
  // ================================================================

  /**
   * Register stream metadata from a plugin's manifest.
   * Called when a plugin is activated.
   */
  registerStreamMeta(pluginId: string, pluginName: string, streams: DataStreamDeclaration[]): void {
    for (const stream of streams) {
      const key = `${pluginId}:${stream.id}`;
      this.streamMeta.set(key, {
        pluginId,
        pluginName,
        streamId: stream.id,
        streamName: stream.name,
        dataType: stream.dataType,
        updateRate: stream.updateRate ?? 1,
        interface: stream.interface ?? '',
      });
    }
  }

  /**
   * Clear stream metadata for a plugin (when disabled/uninstalled).
   */
  clearStreamMeta(pluginId: string): void {
    for (const [key, meta] of this.streamMeta) {
      if (meta.pluginId === pluginId) {
        this.streamMeta.delete(key);
      }
    }
  }

  // ================================================================
  // Data Input
  // ================================================================

  /**
   * Called when a plugin pushes an individual sensor value.
   */
  onSensorValue(event: PluginSensorValueEvent): void {
    const { pluginId, streamId, dataType, value, timestamp } = event;
    const debugKey = `${pluginId}:${streamId}`;

    // Track for debug UI
    this.debugData.set(debugKey, {
      pluginId,
      streamId,
      dataType,
      value,
      timestamp: timestamp.toISOString(),
    });

    // Find matching mapping
    const slotMappings = this.mappings.get(dataType);
    if (!slotMappings) return;

    const mapping = slotMappings.find(m => m.pluginId === pluginId && m.streamId === streamId && m.active);
    if (!mapping) return;

    // Update mapping's live state
    mapping.lastValue = value;
    mapping.lastUpdate = timestamp.toISOString();

    // Check if this is the highest-priority active mapping for this slot
    const winner = this.getWinnerForSlot(dataType);
    if (winner && winner.pluginId === pluginId && winner.streamId === streamId) {
      this.slotValues.set(dataType, { value, timestamp: timestamp.toISOString() });
    }
  }

  /**
   * Called when a plugin pushes a complete StandardSensorData packet.
   * This bypasses individual slot mapping and directly provides full data.
   */
  onSensorPacket(event: PluginSensorPacketEvent): void {
    this.packetData = event.data;
    this.packetPluginId = event.pluginId;
  }

  // ================================================================
  // Data Assembly
  // ================================================================

  /**
   * Assemble current values into StandardSensorData and emit.
   * Runs at 1Hz.
   */
  private assembleAndEmit(): void {
    // If we have a complete packet from a plugin, use it directly
    // (this is the path used by the demo driver)
    if (this.packetData) {
      this.emit('sensor_data', this.packetData);
      return;
    }

    // Otherwise, assemble from individual slot values
    if (this.slotValues.size === 0) return;

    const assembled = this.buildStandardSensorData();
    this.emit('sensor_data', assembled);
  }

  /**
   * Build StandardSensorData from current slot values.
   * Supports both combined slots (attitude, wind_apparent) and
   * individual component slots (roll, pitch, yaw, wind_speed_apparent, etc.).
   */
  private buildStandardSensorData(): StandardSensorData {
    const get = (slot: string) => this.slotValues.get(slot)?.value;

    const position = get('position') || { latitude: 0, longitude: 0, timestamp: new Date() };
    const sog = get('speed_over_ground') ?? 0;
    const cog = get('course_over_ground') ?? 0;

    // Heading: single slot, auto-convert magnetic→true via GPS declination
    let heading = get('heading') ?? 0;
    const headingSourceIsMagnetic = this.isHeadingSourceMagnetic();
    if (headingSourceIsMagnetic && position.latitude !== 0 && position.longitude !== 0) {
      const declination = getMagneticDeclination(position.latitude, position.longitude);
      heading = heading + declination;
      // Normalize to [0, 2π]
      while (heading < 0) heading += 2 * Math.PI;
      while (heading >= 2 * Math.PI) heading -= 2 * Math.PI;
    }

    // Attitude: try combined slot first, fall back to individual components
    const attitude = get('attitude') || {
      roll: get('roll') ?? 0,
      pitch: get('pitch') ?? 0,
      yaw: get('yaw') ?? 0,
    };

    const depth = get('depth') ?? 10;

    // Wind: try combined slots first, fall back to individual components
    const windApparent = get('wind_apparent') || {
      speed: get('wind_speed_apparent') ?? 0,
      angle: get('wind_angle_apparent') ?? 0,
    };
    const windTrue = get('wind_true') || {
      speed: get('wind_speed_true') ?? 0,
      angle: get('wind_angle_true') ?? 0,
    };

    const navigation: StandardNavigationData = {
      position: { ...position, timestamp: position.timestamp || new Date() },
      courseOverGround: cog,
      speedOverGround: sog,
      speedThroughWater: get('speed_through_water') ?? 0,
      heading,
      attitude,
    };

    const environment: StandardEnvironmentData = {
      depth: {
        belowTransducer: depth,
      },
      wind: {
        speedApparent: typeof windApparent === 'object' ? windApparent.speed ?? 0 : windApparent,
        angleApparent: typeof windApparent === 'object' ? windApparent.angle ?? 0 : 0,
        speedTrue: typeof windTrue === 'object' ? windTrue.speed ?? 0 : windTrue,
        angleTrue: typeof windTrue === 'object' ? windTrue.angle ?? 0 : 0,
      },
      temperature: {
        engineRoom: get('temperature_engine') ?? 301,
        cabin: get('temperature_cabin') ?? 295,
        batteryCompartment: get('temperature_battery') ?? 297,
        outside: get('temperature_outside') ?? 291,
      },
    };

    const electrical: StandardElectricalData = {
      battery: {
        voltage: get('battery_voltage') ?? get('voltage') ?? 12,
        current: get('battery_current') ?? get('current') ?? 0,
        temperature: get('battery_temperature') ?? get('temperature') ?? 297,
        stateOfCharge: get('battery_soc') ?? get('soc') ?? 75,
        timeRemaining: get('battery_time_remaining') ?? 0,
        power: get('battery_power') ?? 0,
      },
    };

    const propulsion: StandardPropulsionData = {
      motor: {
        state: get('motor_state') ?? 'stopped',
        temperature: get('motor_temperature') ?? 298,
        throttle: get('motor_throttle') ?? 0,
      },
    };

    return {
      timestamp: new Date().toISOString(),
      navigation,
      environment,
      electrical,
      propulsion,
    };
  }

  /**
   * Get the highest-priority active mapping with data for a slot.
   */
  private getWinnerForSlot(slotType: string): SensorMapping | null {
    const slotMappings = this.mappings.get(slotType);
    if (!slotMappings || slotMappings.length === 0) return null;

    for (const mapping of slotMappings) {
      if (mapping.active && mapping.lastValue !== undefined) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Check if the current heading source is magnetic (needs declination correction).
   * Sources with "true" in their streamId are true heading; everything else is magnetic.
   */
  private isHeadingSourceMagnetic(): boolean {
    const winner = this.getWinnerForSlot('heading');
    if (!winner) return false;
    // If streamId contains 'true', it's already true heading
    return !winner.streamId.includes('true');
  }

  // ================================================================
  // Source Availability (for Data Source Selection UI)
  // ================================================================

  /**
   * Get availability info for all slot types that have registered sources.
   * Used by the client-side data source selection UI.
   */
  getSourceAvailability(): SlotAvailability[] {
    const now = Date.now();
    const slotMap = new Map<string, SourceInfo[]>();

    // Build availability from stream metadata + debug data
    for (const [key, meta] of this.streamMeta) {
      const debugEntry = this.debugData.get(key);
      const lastUpdate = debugEntry?.timestamp;

      // Compute liveness
      const expectedIntervalMs = 1000 / meta.updateRate;
      const livenessThreshold = Math.max(this.LIVENESS_MIN_MS, expectedIntervalMs * this.LIVENESS_GRACE_FACTOR);

      let alive = false;
      let deadTooLong = false;

      if (lastUpdate) {
        const age = now - new Date(lastUpdate).getTime();
        alive = age < livenessThreshold;
        deadTooLong = age > this.LIVENESS_REMOVE_MS;
      } else {
        // Never received data
        deadTooLong = true;
      }

      // Check if this source is the selected (active) mapping for this slot
      const slotMappings = this.mappings.get(meta.dataType);
      const isSelected = slotMappings?.some(
        m => m.pluginId === meta.pluginId && m.streamId === meta.streamId && m.active
      ) ?? false;

      // Skip dead sources (unless they're currently selected)
      if (deadTooLong && !isSelected) continue;

      if (!slotMap.has(meta.dataType)) {
        slotMap.set(meta.dataType, []);
      }

      slotMap.get(meta.dataType)!.push({
        pluginId: meta.pluginId,
        streamId: meta.streamId,
        pluginName: meta.pluginName,
        streamName: meta.streamName,
        interface: meta.interface,
        alive,
        lastUpdate,
        selected: isSelected,
      });
    }

    // Convert to array
    const result: SlotAvailability[] = [];
    for (const [slotType, sources] of slotMap) {
      result.push({ slotType, sources });
    }

    return result;
  }

  // ================================================================
  // Mapping Management (for Settings UI)
  // ================================================================

  getMappings(): SensorMapping[] {
    const result: SensorMapping[] = [];
    for (const mappings of this.mappings.values()) {
      result.push(...mappings);
    }
    return result;
  }

  /**
   * Set a mapping from a plugin stream to a sensor slot.
   */
  async setMapping(slotType: string, pluginId: string, streamId: string, priority?: number): Promise<void> {
    if (!this.mappings.has(slotType)) {
      this.mappings.set(slotType, []);
    }

    const slotMappings = this.mappings.get(slotType)!;

    // Check if mapping already exists
    const existing = slotMappings.find(m => m.pluginId === pluginId && m.streamId === streamId);
    if (existing) {
      if (priority !== undefined) existing.priority = priority;
      existing.active = true;
    } else {
      slotMappings.push({
        slotType,
        pluginId,
        streamId,
        priority: priority ?? 0,
        active: true,
      });
    }

    // Sort by priority descending (highest first)
    slotMappings.sort((a, b) => b.priority - a.priority);

    await this.saveMappings();
    this.emitMappingsUpdated();
  }

  /**
   * Remove a mapping.
   */
  async removeMapping(slotType: string, pluginId: string, streamId: string): Promise<void> {
    const slotMappings = this.mappings.get(slotType);
    if (!slotMappings) return;

    const index = slotMappings.findIndex(m => m.pluginId === pluginId && m.streamId === streamId);
    if (index >= 0) {
      slotMappings.splice(index, 1);
      // Also remove slot value if this was the active source
      const winner = this.getWinnerForSlot(slotType);
      if (!winner) {
        this.slotValues.delete(slotType);
      }
      await this.saveMappings();
      this.emitMappingsUpdated();
    }
  }

  /**
   * Remove all mappings for a specific plugin (e.g., when plugin is disabled).
   */
  async removeMappingsForPlugin(pluginId: string): Promise<void> {
    let changed = false;
    for (const [slotType, slotMappings] of this.mappings) {
      const before = slotMappings.length;
      const filtered = slotMappings.filter(m => m.pluginId !== pluginId);
      if (filtered.length !== before) {
        this.mappings.set(slotType, filtered);
        changed = true;
      }
    }
    if (changed) {
      await this.saveMappings();
      this.emitMappingsUpdated();
    }
  }

  /**
   * Auto-map a driver's declared data streams to sensor slots.
   * Schedules mapping after a delay so only streams that are actually
   * sending data get mapped (avoids prefilling with dead sources).
   */
  async autoMapDriver(pluginId: string, streams: DataStreamDeclaration[]): Promise<void> {
    // Delay auto-mapping to give streams time to start sending data
    setTimeout(async () => {
      for (const stream of streams) {
        const existing = this.mappings.get(stream.dataType);
        const hasActive = existing?.some(m => m.active);
        if (hasActive) continue;

        // Only auto-map streams that have actually sent data
        const debugKey = `${pluginId}:${stream.id}`;
        const debugEntry = this.debugData.get(debugKey);
        if (!debugEntry) continue;

        await this.setMapping(stream.dataType, pluginId, stream.id, 0);
      }
    }, 5000);
  }

  /**
   * Get debug data for the data sources UI.
   * Returns ALL raw data from all plugins/interfaces.
   */
  getDebugData(): Array<{ pluginId: string; streamId: string; dataType: string; value: any; timestamp: string }> {
    return Array.from(this.debugData.values());
  }

  /**
   * Clear packet data (e.g., when the plugin providing it is disabled).
   */
  clearPacketData(pluginId: string): void {
    if (this.packetPluginId === pluginId) {
      this.packetData = null;
      this.packetPluginId = null;
    }
  }

  // ================================================================
  // Internal Helpers
  // ================================================================

  /**
   * Emit mappings_updated with full payload including source availability.
   */
  private emitMappingsUpdated(): void {
    this.emit('mappings_updated', {
      mappings: this.getMappings(),
      sourceAvailability: this.getSourceAvailability(),
    });
  }

  // ================================================================
  // Persistence
  // ================================================================

  private async loadMappings(): Promise<void> {
    try {
      const raw = await dbWorker.getSetting('sensorMappings');
      if (raw) {
        const configs: SensorMappingConfig[] = JSON.parse(raw);
        for (const config of configs) {
          if (!this.mappings.has(config.slotType)) {
            this.mappings.set(config.slotType, []);
          }
          this.mappings.get(config.slotType)!.push({
            ...config,
            lastValue: undefined,
            lastUpdate: undefined,
          });
        }
        console.log(`[SensorMappingService] Loaded ${configs.length} mappings`);
      }
    } catch (error) {
      console.error('[SensorMappingService] Error loading mappings:', error);
    }
  }

  private async saveMappings(): Promise<void> {
    const configs: SensorMappingConfig[] = [];
    for (const slotMappings of this.mappings.values()) {
      for (const m of slotMappings) {
        configs.push({
          slotType: m.slotType,
          pluginId: m.pluginId,
          streamId: m.streamId,
          priority: m.priority,
          active: m.active,
        });
      }
    }
    await dbWorker.setSetting('sensorMappings', JSON.stringify(configs));
  }

  // ================================================================
  // Cleanup
  // ================================================================

  stop(): void {
    if (this.assembleInterval) {
      clearInterval(this.assembleInterval);
      this.assembleInterval = null;
    }
    console.log('[SensorMappingService] Stopped');
  }
}
