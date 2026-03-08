/**
 * AlertService - Server-side alert evaluation
 *
 * This service:
 * - Stores alert definitions (thresholds in STANDARD units)
 * - Evaluates sensor and weather data against alerts
 * - Triggers alerts when conditions are met
 * - Manages snooze and dismiss states
 * - Broadcasts alert events
 *
 * All thresholds are stored in STANDARD units (m/s, meters, Kelvin).
 * When displaying to users, values are converted to their preferred units.
 */

import { EventEmitter } from 'events';
import { dbWorker } from './database-worker.service';
import {
  AlertDefinition,
  AlertDefinitionInput,
  AlertSettings,
  TriggeredAlert,
  AlertDataSource,
  AlertOperator,
  DEFAULT_ALERT_SETTINGS,
  DATA_SOURCE_UNIT_CATEGORY,
  FIXED_UNITS,
  isWeatherDataSource,
  evaluateCondition,
  resolveAlertMessage,
  generateAlertId,
  OPERATOR_LABELS,
} from '../types/alert.types';
import { StandardSensorData, StandardWeatherForecast } from '../types/data.types';
import {
  UserUnitPreferences,
  DEFAULT_USER_UNITS,
  convertFromStandard,
  convertToStandard,
  getUnitLabel,
  speedToStandard,
  depthToStandard,
  temperatureToStandard,
} from '../types/units.types';
import { lang } from '../i18n/lang';

// Special alarm settings
interface DepthAlarmSettings {
  threshold: number | null; // meters (null = disabled)
  soundEnabled: boolean;
}

interface AnchorAlarmSettings {
  active: boolean;
  anchorPosition: { lat: number; lon: number } | null;
  swingRadius: number; // meters
}

// Full anchor alarm state as received from client (for syncing to other clients)
interface ClientAnchorAlarmState {
  active: boolean;
  anchorPosition: { lat: number; lon: number } | null;
  chainLength: number;
  depth: number;
  swingRadius: number;
}

export class AlertService extends EventEmitter {
  private settings: AlertSettings = { ...DEFAULT_ALERT_SETTINGS };
  private triggeredAlerts: Map<string, TriggeredAlert> = new Map();
  private snoozedUntil: Map<string, Date> = new Map();
  private userUnits: UserUnitPreferences = { ...DEFAULT_USER_UNITS };

  // Cache weather data for forecast-based alerts
  private cachedWeatherData: StandardWeatherForecast | null = null;

  // Special alarms (depth and anchor)
  private depthAlarm: DepthAlarmSettings = { threshold: null, soundEnabled: true };
  private anchorAlarm: AnchorAlarmSettings = { active: false, anchorPosition: null, swingRadius: 0 };
  private clientAnchorAlarmState: ClientAnchorAlarmState | null = null; // Full state for client sync
  private lastBoatPosition: { lat: number; lon: number } | null = null;

  // Special alert IDs
  private static readonly DEPTH_ALERT_ID = 'special_depth_alarm';
  private static readonly ANCHOR_ALERT_ID = 'special_anchor_alarm';

  /**
   * Initialize the alert service
   */
  async initialize(): Promise<void> {
    await this.loadSettings();
    await this.loadUserUnits();
  }

  /**
   * Load alert settings from database
   */
  private async loadSettings(): Promise<void> {
    try {
      const settingsJson = await dbWorker.getSetting('alertSettings');
      if (settingsJson) {
        const parsed = JSON.parse(settingsJson);
        this.settings = {
          globalEnabled: parsed.globalEnabled ?? true,
          alerts: parsed.alerts ?? DEFAULT_ALERT_SETTINGS.alerts,
        };
      }
    } catch (error) {
      console.error('[AlertService] Error loading settings, using defaults:', error);
      this.settings = { ...DEFAULT_ALERT_SETTINGS };
    }
  }

  /**
   * Load user unit preferences
   */
  private async loadUserUnits(): Promise<void> {
    try {
      const speedUnit = await dbWorker.getSetting('speedUnit');
      const windUnit = await dbWorker.getSetting('windUnit');
      const depthUnit = await dbWorker.getSetting('depthUnit');
      const temperatureUnit = await dbWorker.getSetting('temperatureUnit');

      if (speedUnit) this.userUnits.speedUnit = JSON.parse(speedUnit);
      if (windUnit) this.userUnits.windUnit = JSON.parse(windUnit);
      if (depthUnit) this.userUnits.depthUnit = JSON.parse(depthUnit);
      if (temperatureUnit) this.userUnits.temperatureUnit = JSON.parse(temperatureUnit);
    } catch (error) {
      console.error('[AlertService] Error loading user units:', error);
    }
  }

  /**
   * Update user unit preferences
   */
  updateUserUnits(units: Partial<UserUnitPreferences>): void {
    this.userUnits = { ...this.userUnits, ...units };
  }

  /**
   * Refresh alert messages for active triggered alerts (e.g. after language change).
   * Re-generates alertName and message using current i18n language.
   */
  refreshAlertMessages(): void {
    // Refresh depth alarm message
    const depthAlert = this.triggeredAlerts.get(AlertService.DEPTH_ALERT_ID);
    if (depthAlert && this.depthAlarm.threshold !== null) {
      const displayDepth = convertFromStandard(depthAlert.currentValue, 'depth', this.userUnits);
      const displayThreshold = convertFromStandard(this.depthAlarm.threshold, 'depth', this.userUnits);
      const unitLabel = getUnitLabel('depth', this.userUnits);
      depthAlert.alertName = lang.get('alert.depth_alarm');
      depthAlert.message = lang.get('alert.shallow_water', {
        displayDepth: `${displayDepth.toFixed(1)}${unitLabel}`,
        displayThreshold: `${displayThreshold.toFixed(1)}${unitLabel}`,
      });
      this.emit('alert_triggered', depthAlert);
    }

    // Refresh anchor alarm message
    const anchorAlert = this.triggeredAlerts.get(AlertService.ANCHOR_ALERT_ID);
    if (anchorAlert) {
      const overDistance = Math.round(anchorAlert.currentValue - this.anchorAlarm.swingRadius);
      anchorAlert.alertName = lang.get('alert.anchor_alarm');
      anchorAlert.message = lang.get('alert.anchor_dragging', { overDistance: overDistance.toString() });
      this.emit('alert_triggered', anchorAlert);
    }
  }

  /**
   * Save settings to database
   */
  private async saveSettings(): Promise<void> {
    try {
      await dbWorker.setSetting('alertSettings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('[AlertService] Error saving settings:', error);
    }
  }

  // ============================================================================
  // Special Alarms (Depth and Anchor)
  // ============================================================================

  /**
   * Update depth alarm settings
   */
  updateDepthAlarm(threshold: number | null, soundEnabled: boolean): void {
    const oldSoundEnabled = this.depthAlarm.soundEnabled;
    this.depthAlarm = { threshold, soundEnabled };

    // If disabled, clear any triggered depth alert
    if (threshold === null) {
      this.clearAlert(AlertService.DEPTH_ALERT_ID);
      return;
    }

    // If sound setting changed and alert is currently triggered, update the tone
    if (oldSoundEnabled !== soundEnabled) {
      const existing = this.triggeredAlerts.get(AlertService.DEPTH_ALERT_ID);
      if (existing) {
        existing.tone = soundEnabled ? 'alarm' : 'none';
        this.emit('alert_triggered', existing);
      }
    }
  }

  /**
   * Update anchor alarm settings
   */
  updateAnchorAlarm(settings: ClientAnchorAlarmState | null): void {
    // Store full client state for syncing to new clients
    this.clientAnchorAlarmState = settings;

    if (settings === null || !settings.active) {
      this.anchorAlarm = { active: false, anchorPosition: null, swingRadius: 0 };
      this.clearAlert(AlertService.ANCHOR_ALERT_ID);
    } else {
      this.anchorAlarm = {
        active: settings.active,
        anchorPosition: settings.anchorPosition,
        swingRadius: settings.swingRadius,
      };
    }
  }

  /**
   * Get anchor alarm state for client sync
   */
  getAnchorAlarmState(): ClientAnchorAlarmState | null {
    return this.clientAnchorAlarmState;
  }

  /**
   * Get depth alarm state for client sync
   */
  getDepthAlarmState(): DepthAlarmSettings {
    return { ...this.depthAlarm };
  }

  /**
   * Dismiss depth alarm (clears the alarm setting)
   */
  dismissDepthAlarm(): void {
    this.depthAlarm.threshold = null;
    this.clearAlert(AlertService.DEPTH_ALERT_ID);
    this.emit('depth_alarm_cleared');
  }

  /**
   * Dismiss anchor alarm (deactivates the anchor watch)
   */
  dismissAnchorAlarm(): void {
    this.anchorAlarm = { active: false, anchorPosition: null, swingRadius: 0 };
    this.clientAnchorAlarmState = null;
    this.clearAlert(AlertService.ANCHOR_ALERT_ID);
    this.emit('anchor_alarm_cleared');
  }

  /**
   * Evaluate depth alarm
   */
  private evaluateDepthAlarm(currentDepth: number): void {
    if (this.depthAlarm.threshold === null) return;

    const isTriggered = currentDepth < this.depthAlarm.threshold;
    const wasTriggered = this.triggeredAlerts.has(AlertService.DEPTH_ALERT_ID);

    if (isTriggered && !wasTriggered) {
      // Convert to display units
      const displayDepth = convertFromStandard(currentDepth, 'depth', this.userUnits);
      const displayThreshold = convertFromStandard(this.depthAlarm.threshold, 'depth', this.userUnits);
      const unitLabel = getUnitLabel('depth', this.userUnits);

      const triggered: TriggeredAlert = {
        alertId: AlertService.DEPTH_ALERT_ID,
        alertName: lang.get('alert.depth_alarm'),
        triggeredAt: new Date().toISOString(),
        currentValue: displayDepth,
        threshold: displayThreshold,
        message: lang.get('alert.shallow_water', {
          displayDepth: `${displayDepth.toFixed(1)}${unitLabel}`,
          displayThreshold: `${displayThreshold.toFixed(1)}${unitLabel}`,
        }),
        severity: 'critical',
        // Only play sound if soundEnabled is true
        tone: this.depthAlarm.soundEnabled ? 'alarm' : 'none',
      };

      this.triggeredAlerts.set(AlertService.DEPTH_ALERT_ID, triggered);
      console.log(`[AlertService] Depth alarm triggered: ${triggered.message}`);
      this.emit('alert_triggered', triggered);
    } else if (isTriggered && wasTriggered) {
      // Update the message with current depth and emit update
      const existing = this.triggeredAlerts.get(AlertService.DEPTH_ALERT_ID);
      if (existing) {
        const displayDepth = convertFromStandard(currentDepth, 'depth', this.userUnits);
        const displayThreshold = convertFromStandard(this.depthAlarm.threshold, 'depth', this.userUnits);
        const unitLabel = getUnitLabel('depth', this.userUnits);
        const newMessage = lang.get('alert.shallow_water', {
          displayDepth: `${displayDepth.toFixed(1)}${unitLabel}`,
          displayThreshold: `${displayThreshold.toFixed(1)}${unitLabel}`,
        });

        // Only emit if message changed (depth changed enough to show different number)
        if (existing.message !== newMessage) {
          existing.currentValue = displayDepth;
          existing.message = newMessage;
          // Keep tone in sync with current soundEnabled setting
          existing.tone = this.depthAlarm.soundEnabled ? 'alarm' : 'none';
          this.emit('alert_triggered', existing);
        }
      }
    } else if (!isTriggered && wasTriggered) {
      this.clearAlert(AlertService.DEPTH_ALERT_ID);
    }
  }

  /**
   * Evaluate anchor alarm
   */
  private evaluateAnchorAlarm(boatLat: number, boatLon: number): void {
    if (!this.anchorAlarm.active || !this.anchorAlarm.anchorPosition) return;

    // Calculate distance from anchor to boat (Haversine formula)
    const R = 6371000; // Earth radius in meters
    const lat1 = this.anchorAlarm.anchorPosition.lat * Math.PI / 180;
    const lat2 = boatLat * Math.PI / 180;
    const dLat = (boatLat - this.anchorAlarm.anchorPosition.lat) * Math.PI / 180;
    const dLon = (boatLon - this.anchorAlarm.anchorPosition.lon) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const isTriggered = distance > this.anchorAlarm.swingRadius;
    const wasTriggered = this.triggeredAlerts.has(AlertService.ANCHOR_ALERT_ID);
    const overDistance = Math.round(distance - this.anchorAlarm.swingRadius);

    if (isTriggered && !wasTriggered) {
      const triggered: TriggeredAlert = {
        alertId: AlertService.ANCHOR_ALERT_ID,
        alertName: lang.get('alert.anchor_alarm'),
        triggeredAt: new Date().toISOString(),
        currentValue: distance,
        threshold: this.anchorAlarm.swingRadius,
        message: lang.get('alert.anchor_dragging', { overDistance: overDistance.toString() }),
        severity: 'critical',
        tone: 'alarm',
      };

      this.triggeredAlerts.set(AlertService.ANCHOR_ALERT_ID, triggered);
      console.log(`[AlertService] Anchor alarm triggered: ${triggered.message}`);
      this.emit('alert_triggered', triggered);
    } else if (isTriggered && wasTriggered) {
      // Update the message with current distance and emit update
      const existing = this.triggeredAlerts.get(AlertService.ANCHOR_ALERT_ID);
      if (existing) {
        const newMessage = lang.get('alert.anchor_dragging', { overDistance: overDistance.toString() });
        // Only emit if message changed (distance changed enough to show different number)
        if (existing.message !== newMessage) {
          existing.currentValue = distance;
          existing.message = newMessage;
          this.emit('alert_triggered', existing);
        }
      }
    } else if (!isTriggered && wasTriggered) {
      this.clearAlert(AlertService.ANCHOR_ALERT_ID);
    }
  }

  // ============================================================================
  // Alert Evaluation
  // ============================================================================

  /**
   * Evaluate all alerts against current sensor data
   */
  evaluateSensorData(data: StandardSensorData): void {
    // Store boat position (needed for anchor alarm and magnetic declination)
    this.lastBoatPosition = {
      lat: data.navigation.position.latitude,
      lon: data.navigation.position.longitude,
    };

    // Special alarms (depth, anchor) always run regardless of globalEnabled
    this.evaluateDepthAlarm(data.environment.depth.belowTransducer);
    this.evaluateAnchorAlarm(
      data.navigation.position.latitude,
      data.navigation.position.longitude
    );

    if (!this.settings.globalEnabled) return;

    // Evaluate custom alerts
    for (const alert of this.settings.alerts) {
      if (!alert.enabled) continue;
      if (isWeatherDataSource(alert.dataSource)) continue; // Skip weather alerts

      const value = this.getValueFromSensorData(data, alert.dataSource);
      if (value === null) continue;

      this.evaluateAlert(alert, value);
    }
  }

  /**
   * Evaluate all alerts against current weather data
   */
  evaluateWeatherData(data: StandardWeatherForecast): void {
    if (!this.settings.globalEnabled) return;

    // Cache weather data for forecast lookups
    this.cachedWeatherData = data;

    for (const alert of this.settings.alerts) {
      if (!alert.enabled) continue;
      if (!isWeatherDataSource(alert.dataSource)) continue; // Skip sensor alerts

      const value = this.getValueFromWeatherData(data, alert.dataSource, alert.forecastHours);
      if (value === null) continue;

      this.evaluateAlert(alert, value);
    }
  }

  /**
   * Evaluate a single alert against a value
   */
  private evaluateAlert(alert: AlertDefinition, value: number): void {
    const alertId = alert.id;

    // Check if snoozed
    const snoozedUntil = this.snoozedUntil.get(alertId);
    if (snoozedUntil && new Date() < snoozedUntil) {
      return; // Still snoozed
    }

    // Clear expired snooze
    if (snoozedUntil && new Date() >= snoozedUntil) {
      this.snoozedUntil.delete(alertId);
    }

    // Evaluate condition (both value and threshold are in STANDARD units)
    const isTriggered = evaluateCondition(value, alert.operator, alert.threshold);
    const wasTriggered = this.triggeredAlerts.has(alertId);

    if (isTriggered && !wasTriggered) {
      // Trigger new alert
      this.triggerAlert(alert, value);
    } else if (!isTriggered && wasTriggered) {
      // Clear alert
      this.clearAlert(alertId);
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: AlertDefinition, value: number): void {
    // Convert values to display units for the message
    const category = DATA_SOURCE_UNIT_CATEGORY[alert.dataSource];
    const displayValue = convertFromStandard(value, category, this.userUnits);
    const displayThreshold = convertFromStandard(alert.threshold, category, this.userUnits);
    const unitLabel = category === 'fixed'
      ? (FIXED_UNITS[alert.dataSource] ?? '')
      : getUnitLabel(category, this.userUnits);

    // Resolve message with display values
    const message = resolveAlertMessage(
      alert.message,
      displayValue,
      displayThreshold,
      alert.operator,
      unitLabel
    );

    const triggered: TriggeredAlert = {
      alertId: alert.id,
      alertName: alert.name,
      triggeredAt: new Date().toISOString(),
      currentValue: displayValue,
      threshold: displayThreshold,
      message,
      severity: alert.severity,
      tone: alert.tone,
    };

    this.triggeredAlerts.set(alert.id, triggered);

    console.log(`[AlertService] Alert triggered: ${alert.name} - ${message}`);
    this.emit('alert_triggered', triggered);
  }

  /**
   * Clear a triggered alert
   */
  private clearAlert(alertId: string): void {
    if (this.triggeredAlerts.has(alertId)) {
      this.triggeredAlerts.delete(alertId);
      console.log(`[AlertService] Alert cleared: ${alertId}`);
      this.emit('alert_cleared', alertId);
    }
  }

  // ============================================================================
  // Data Extraction
  // ============================================================================

  /**
   * Extract value from sensor data (in STANDARD units)
   */
  private getValueFromSensorData(data: StandardSensorData, source: AlertDataSource): number | null {
    switch (source) {
      case 'wind_speed':
        return data.environment.wind.speedTrue; // m/s
      case 'speed_over_ground':
        return data.navigation.speedOverGround; // m/s
      case 'depth':
        return data.environment.depth.belowTransducer; // meters
      case 'battery_voltage':
        return data.electrical.battery.voltage; // Volts
      case 'battery_soc':
        return data.electrical.battery.stateOfCharge; // %
      default:
        return null;
    }
  }

  /**
   * Extract value from weather data (in STANDARD units)
   * For forecast sources, gets max value within forecast window
   */
  private getValueFromWeatherData(
    data: StandardWeatherForecast,
    source: AlertDataSource,
    forecastHours?: number
  ): number | null {
    const hours = forecastHours ?? 1;
    const now = new Date();

    // Get forecast window
    const forecastWindow = data.hourly
      .filter((point) => {
        const pointTime = new Date(point.timestamp);
        const hoursFromNow = (pointTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursFromNow >= 0 && hoursFromNow <= hours;
      })
      .slice(0, hours);

    if (forecastWindow.length === 0) {
      // Use current data if no forecast available
      return this.getWeatherValue(data.current, source);
    }

    // Get max value in forecast window
    const values = forecastWindow
      .map((point) => this.getWeatherValue(point, source))
      .filter((v): v is number => v !== null);

    if (values.length === 0) return null;

    // For most sources, return max. For temperature, behavior might differ
    return Math.max(...values);
  }

  /**
   * Extract a single value from a weather point (in STANDARD units)
   */
  private getWeatherValue(point: any, source: AlertDataSource): number | null {
    switch (source) {
      case 'wind_gusts':
        return point.wind?.gusts ?? null; // m/s
      case 'wind_forecast':
        return point.wind?.speed ?? null; // m/s
      case 'wave_height':
      case 'wave_forecast':
        return point.waves?.height ?? null; // meters
      case 'temperature_air':
        // Weather service doesn't have air temp, return null
        return null;
      case 'temperature_water':
        return point.seaTemperature ?? null; // Kelvin
      default:
        return null;
    }
  }

  // ============================================================================
  // Alert Management (CRUD)
  // ============================================================================

  /**
   * Get all alert settings (raw, with standard units)
   * Use getSettingsForDisplay() for client-facing data
   */
  getSettings(): AlertSettings {
    return { ...this.settings };
  }

  /**
   * Get alert settings with thresholds converted to display units
   * This should be used when sending settings to clients
   */
  getSettingsForDisplay(): AlertSettings {
    return {
      globalEnabled: this.settings.globalEnabled,
      alerts: this.settings.alerts.map((alert) => {
        const category = DATA_SOURCE_UNIT_CATEGORY[alert.dataSource];
        const displayThreshold = convertFromStandard(alert.threshold, category, this.userUnits);
        return {
          ...alert,
          threshold: displayThreshold, // Convert to display units
        };
      }),
    };
  }

  /**
   * Get all triggered alerts
   */
  getTriggeredAlerts(): TriggeredAlert[] {
    return Array.from(this.triggeredAlerts.values());
  }

  /**
   * Update global enabled state
   */
  async setGlobalEnabled(enabled: boolean): Promise<void> {
    this.settings.globalEnabled = enabled;
    await this.saveSettings();

    // Clear all triggered alerts when disabled
    if (!enabled) {
      for (const alertId of this.triggeredAlerts.keys()) {
        this.clearAlert(alertId);
      }
    }

    this.emit('settings_updated', this.getSettingsForDisplay());
  }

  /**
   * Create or update an alert
   * Input threshold is in USER'S units, will be converted to standard
   */
  async upsertAlert(input: AlertDefinitionInput): Promise<AlertDefinition> {
    // Convert threshold from user's units to standard units
    const category = DATA_SOURCE_UNIT_CATEGORY[input.dataSource];
    const standardThreshold = convertToStandard(input.threshold, category, this.userUnits);

    const alert: AlertDefinition = {
      id: input.id || generateAlertId(),
      name: input.name,
      enabled: input.enabled,
      dataSource: input.dataSource,
      operator: input.operator,
      threshold: standardThreshold, // Store in STANDARD units
      forecastHours: input.forecastHours,
      snoozeDurationMinutes: input.snoozeDurationMinutes,
      severity: input.severity,
      tone: input.tone,
      message: input.message,
      isPremade: input.isPremade ?? false,
      premadeId: input.premadeId,
    };

    // Find existing alert index
    const existingIndex = this.settings.alerts.findIndex((a) => a.id === alert.id);

    if (existingIndex >= 0) {
      this.settings.alerts[existingIndex] = alert;
    } else {
      this.settings.alerts.push(alert);
    }

    await this.saveSettings();

    // Clear any triggered state if alert is disabled
    if (!alert.enabled && this.triggeredAlerts.has(alert.id)) {
      this.clearAlert(alert.id);
    }

    this.emit('settings_updated', this.getSettingsForDisplay());
    return alert;
  }

  /**
   * Delete an alert
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    const index = this.settings.alerts.findIndex((a) => a.id === alertId);
    if (index < 0) return false;

    this.settings.alerts.splice(index, 1);
    await this.saveSettings();

    // Clear any triggered state
    if (this.triggeredAlerts.has(alertId)) {
      this.clearAlert(alertId);
    }

    this.snoozedUntil.delete(alertId);
    this.emit('settings_updated', this.getSettingsForDisplay());
    return true;
  }

  /**
   * Snooze an alert
   */
  snoozeAlert(alertId: string, minutes?: number): void {
    const alert = this.settings.alerts.find((a) => a.id === alertId);
    if (!alert) return;

    const snoozeDuration = minutes ?? alert.snoozeDurationMinutes;
    const snoozedUntil = new Date(Date.now() + snoozeDuration * 60 * 1000);

    this.snoozedUntil.set(alertId, snoozedUntil);

    // Update triggered alert with snooze info
    const triggered = this.triggeredAlerts.get(alertId);
    if (triggered) {
      triggered.snoozedUntil = snoozedUntil.toISOString();
    }

    console.log(`[AlertService] Alert snoozed: ${alertId} until ${snoozedUntil.toISOString()}`);
    this.emit('alert_snoozed', { alertId, snoozedUntil: snoozedUntil.toISOString() });
  }

  /**
   * Dismiss an alert (clear without snooze)
   * For special alerts, this also clears the underlying alarm
   */
  dismissAlert(alertId: string): void {
    // Handle special alarms
    if (alertId === AlertService.DEPTH_ALERT_ID) {
      this.dismissDepthAlarm();
      return;
    }
    if (alertId === AlertService.ANCHOR_ALERT_ID) {
      this.dismissAnchorAlarm();
      return;
    }

    // Regular alert
    this.clearAlert(alertId);
    this.snoozedUntil.delete(alertId);
  }

  /**
   * Reset a premade alert to its default values
   */
  async resetPremadeAlert(premadeId: string): Promise<AlertDefinition | null> {
    const defaultAlert = DEFAULT_ALERT_SETTINGS.alerts.find((a) => a.premadeId === premadeId);
    if (!defaultAlert) return null;

    const existingAlert = this.settings.alerts.find((a) => a.premadeId === premadeId);
    const alertId = existingAlert?.id || `premade_${premadeId}`;

    const resetAlert: AlertDefinition = {
      ...defaultAlert,
      id: alertId,
    };

    const index = this.settings.alerts.findIndex((a) => a.id === alertId);
    if (index >= 0) {
      this.settings.alerts[index] = resetAlert;
    } else {
      this.settings.alerts.push(resetAlert);
    }

    await this.saveSettings();
    this.emit('settings_updated', this.getSettingsForDisplay());
    return resetAlert;
  }

  /**
   * Get an alert converted to display units (for UI)
   */
  getAlertForDisplay(alertId: string): (AlertDefinition & { displayThreshold: number; displayUnit: string }) | null {
    const alert = this.settings.alerts.find((a) => a.id === alertId);
    if (!alert) return null;

    const category = DATA_SOURCE_UNIT_CATEGORY[alert.dataSource];
    const displayThreshold = convertFromStandard(alert.threshold, category, this.userUnits);
    const displayUnit = category === 'fixed'
      ? (FIXED_UNITS[alert.dataSource] ?? '')
      : getUnitLabel(category, this.userUnits);

    return {
      ...alert,
      displayThreshold,
      displayUnit,
    };
  }

  /**
   * Get all alerts converted to display units (for UI)
   */
  getAlertsForDisplay(): (AlertDefinition & { displayThreshold: number; displayUnit: string })[] {
    return this.settings.alerts.map((alert) => {
      const category = DATA_SOURCE_UNIT_CATEGORY[alert.dataSource];
      const displayThreshold = convertFromStandard(alert.threshold, category, this.userUnits);
      const displayUnit = category === 'fixed'
        ? (FIXED_UNITS[alert.dataSource] ?? '')
        : getUnitLabel(category, this.userUnits);

      return {
        ...alert,
        displayThreshold,
        displayUnit,
      };
    });
  }
}

// Export singleton instance
export const alertService = new AlertService();
