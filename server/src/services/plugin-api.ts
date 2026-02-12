/**
 * PluginAPI - Scoped API surface given to each plugin
 *
 * Each plugin gets its own PluginAPI instance. Access to methods
 * is gated by the plugin's declared capabilities in its manifest.
 * All resources (event listeners, intervals) are tracked and
 * auto-cleaned on dispose().
 */

import { EventEmitter } from 'events';
import {
  PluginManifest,
  PluginCapability,
  DataStreamDeclaration,
} from '../types/plugin.types';
import { StandardSensorData } from '../types/data.types';
import { dbWorker } from './database-worker.service';

export class PluginAPI {
  private pluginId: string;
  private manifest: PluginManifest;
  private dataEmitter: EventEmitter;
  private eventSubscriptions: Array<{ emitter: EventEmitter; event: string; handler: (...args: any[]) => void }> = [];
  private intervals: ReturnType<typeof setInterval>[] = [];
  private disposed = false;

  constructor(pluginId: string, manifest: PluginManifest, dataEmitter: EventEmitter) {
    this.pluginId = pluginId;
    this.manifest = manifest;
    this.dataEmitter = dataEmitter;
  }

  // ================================================================
  // Capability Check
  // ================================================================

  private requireCapability(cap: PluginCapability): void {
    if (!this.manifest.capabilities.includes(cap)) {
      throw new Error(`Plugin "${this.pluginId}" does not have capability "${cap}"`);
    }
  }

  // ================================================================
  // Sensor Data (capability: 'sensor-data')
  // ================================================================

  /**
   * Push a single sensor value into the data pipeline.
   * The value must be in STANDARD units (m/s, meters, Kelvin, etc.).
   *
   * @param streamId - The stream ID from the plugin's dataStreams declaration
   * @param value - The value in standard units
   * @param timestamp - Optional timestamp (defaults to now)
   */
  pushSensorValue(streamId: string, value: any, timestamp?: Date): void {
    this.requireCapability('sensor-data');
    if (this.disposed) return;

    // Validate streamId is declared in manifest
    const stream = this.manifest.driver?.dataStreams?.find(s => s.id === streamId);
    if (!stream) {
      throw new Error(`Stream "${streamId}" not declared in plugin manifest for "${this.pluginId}"`);
    }

    this.dataEmitter.emit('plugin_sensor_data', {
      pluginId: this.pluginId,
      streamId,
      dataType: stream.dataType,
      value,
      timestamp: timestamp || new Date(),
    });
  }

  /**
   * Push a complete StandardSensorData packet.
   * Used when a plugin generates all data at once (e.g., demo driver).
   */
  pushSensorDataPacket(data: StandardSensorData): void {
    this.requireCapability('sensor-data');
    if (this.disposed) return;

    this.dataEmitter.emit('plugin_sensor_packet', {
      pluginId: this.pluginId,
      data,
      timestamp: new Date(),
    });
  }

  /**
   * Register custom data that dashboard widgets from this plugin can access.
   */
  registerDashboardData(key: string, value: any): void {
    this.requireCapability('sensor-data');
    if (this.disposed) return;

    this.dataEmitter.emit('plugin_dashboard_data', {
      pluginId: this.pluginId,
      key,
      value,
      timestamp: new Date(),
    });
  }

  // ================================================================
  // Settings (capability: 'settings')
  // ================================================================

  /**
   * Get a plugin-specific setting.
   * Settings are namespaced: stored as "plugin.<pluginId>.<key>"
   */
  async getSetting(key: string): Promise<any> {
    this.requireCapability('settings');
    const fullKey = `plugin.${this.pluginId}.${key}`;
    const raw = await dbWorker.getSetting(fullKey);
    if (raw) {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return null;
  }

  /**
   * Set a plugin-specific setting.
   */
  async setSetting(key: string, value: any): Promise<void> {
    this.requireCapability('settings');
    const fullKey = `plugin.${this.pluginId}.${key}`;
    await dbWorker.setSetting(fullKey, JSON.stringify(value));
  }

  // ================================================================
  // Events (capability: 'events')
  // ================================================================

  /**
   * Subscribe to DataController events.
   * Available events: 'sensor_update', 'weather_update', 'alert_triggered', 'alert_cleared'
   */
  onEvent(event: string, handler: (...args: any[]) => void): void {
    this.requireCapability('events');
    this.dataEmitter.on(event, handler);
    this.eventSubscriptions.push({ emitter: this.dataEmitter, event, handler });
  }

  // ================================================================
  // Alerts (capability: 'alerts')
  // ================================================================

  /**
   * Trigger a plugin-generated alert.
   */
  triggerAlert(alert: {
    name: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    tone?: string;
  }): void {
    this.requireCapability('alerts');
    this.dataEmitter.emit('plugin_alert', {
      pluginId: this.pluginId,
      alertId: `plugin_${this.pluginId}_${Date.now()}`,
      ...alert,
    });
  }

  // ================================================================
  // Utilities
  // ================================================================

  /**
   * Create an interval that is automatically cleaned up on dispose.
   */
  setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval> {
    const interval = setInterval(callback, ms);
    this.intervals.push(interval);
    return interval;
  }

  /**
   * Clear a specific interval.
   */
  clearInterval(interval: ReturnType<typeof setInterval>): void {
    clearInterval(interval);
    this.intervals = this.intervals.filter(i => i !== interval);
  }

  /**
   * Get the plugin's own ID.
   */
  getPluginId(): string {
    return this.pluginId;
  }

  /**
   * Get the plugin's manifest.
   */
  getManifest(): PluginManifest {
    return this.manifest;
  }

  /**
   * Log a message with plugin prefix.
   */
  log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = `[Plugin:${this.pluginId}]`;
    switch (level) {
      case 'info': console.log(prefix, message); break;
      case 'warn': console.warn(prefix, message); break;
      case 'error': console.error(prefix, message); break;
    }
  }

  // ================================================================
  // Cleanup
  // ================================================================

  /**
   * Clean up all resources registered by this plugin.
   */
  dispose(): void {
    this.disposed = true;

    // Remove all event subscriptions
    for (const sub of this.eventSubscriptions) {
      sub.emitter.off(sub.event, sub.handler);
    }
    this.eventSubscriptions = [];

    // Clear all intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }
}
