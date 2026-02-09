/**
 * SensorMappingService - Assembles plugin data into StandardSensorData
 *
 * This service sits between plugins and the DataController:
 * - Receives individual sensor values from driver plugins
 * - Assembles them into a unified StandardSensorData at 1Hz
 * - Supports priority-based mapping (multiple sources for same slot)
 * - Auto-maps new drivers to empty sensor slots
 * - Provides debug stream of raw values per plugin+stream
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

  async initialize(): Promise<void> {
    await this.loadMappings();

    // Start assembly loop
    this.assembleInterval = setInterval(() => {
      this.assembleAndEmit();
    }, this.ASSEMBLE_RATE_MS);

    console.log('[SensorMappingService] Initialized');
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
   */
  private buildStandardSensorData(): StandardSensorData {
    const get = (slot: string) => this.slotValues.get(slot)?.value;

    const position = get('position') || { latitude: 0, longitude: 0, timestamp: new Date() };
    const sog = get('speed_over_ground') ?? 0;
    const cog = get('course_over_ground') ?? 0;
    const headingMag = get('heading_magnetic') ?? 0;
    const headingTrue = get('heading_true') ?? headingMag;
    const attitude = get('attitude') || { roll: 0, pitch: 0, yaw: 0 };
    const depth = get('depth') ?? 10;
    const windApparent = get('wind_apparent') || { speed: 0, angle: 0 };
    const windTrue = get('wind_true') || { speed: 0, angle: 0 };

    const navigation: StandardNavigationData = {
      position: { ...position, timestamp: position.timestamp || new Date() },
      courseOverGround: cog,
      speedOverGround: sog,
      headingMagnetic: headingMag,
      headingTrue: headingTrue,
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
        voltage: get('battery_voltage') ?? 12,
        current: get('battery_current') ?? 0,
        temperature: get('battery_temperature') ?? 297,
        stateOfCharge: get('battery_soc') ?? 75,
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
    this.emit('mappings_updated', this.getMappings());
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
      this.emit('mappings_updated', this.getMappings());
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
      this.emit('mappings_updated', this.getMappings());
    }
  }

  /**
   * Auto-map a driver's declared data streams to sensor slots.
   * Only maps to slots that don't already have an active source.
   */
  async autoMapDriver(pluginId: string, streams: DataStreamDeclaration[]): Promise<void> {
    for (const stream of streams) {
      const existing = this.mappings.get(stream.dataType);
      const hasActive = existing?.some(m => m.active);

      if (!hasActive) {
        await this.setMapping(stream.dataType, pluginId, stream.id, 0);
      }
    }
  }

  /**
   * Get debug data for the data sources UI.
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
