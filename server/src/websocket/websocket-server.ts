/**
 * WebSocket Server - Thin transport layer
 *
 * This server:
 * - Subscribes to DataController events
 * - Broadcasts data to connected clients (already in display units)
 * - Routes client messages to appropriate services
 * - Handles connection lifecycle
 *
 * All data is converted to user's display units by the DataController
 * before being sent here, so this layer just forwards data.
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { DataController, getDataController } from '../services/data.controller';
import { dbWorker } from '../services/database-worker.service';
import { connectivityService } from '../services/connectivity.service';
import { DisplaySensorData } from '../types/data.types';
import { TriggeredAlert, AlertSettings } from '../types/alert.types';
import { UserUnitPreferences } from '../types/units.types';
import { setLanguage as setI18nLanguage } from '../i18n/lang';

export class WebSocketServer {
  private io: SocketIOServer;
  private dataController: DataController | null = null;
  private storageCounter: number = 0;
  private readonly STORAGE_INTERVAL: number = 1; // Store to DB every second

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      pingTimeout: 5000,
      pingInterval: 3000,
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize with DataController (called after DataController is ready)
   */
  async initialize(): Promise<void> {
    this.dataController = getDataController();
    this.subscribeToDataController();
    console.log('[WebSocketServer] Initialized and subscribed to DataController');
  }

  /**
   * Subscribe to DataController events
   */
  private subscribeToDataController(): void {
    if (!this.dataController) return;

    // Sensor data updates (already in display units)
    this.dataController.on('sensor_update', (data: DisplaySensorData) => {
      this.broadcastSensorUpdate(data);
    });

    // Weather updates (already in display units)
    this.dataController.on('weather_update', (data: any) => {
      this.broadcastWeatherUpdate(data);
    });

    // Alert events
    this.dataController.on('alert_triggered', (alert: TriggeredAlert) => {
      this.io.emit('alert_triggered', {
        type: 'alert_triggered',
        alert,
        timestamp: new Date(),
      });
    });

    this.dataController.on('alert_cleared', (alertId: string) => {
      this.io.emit('alert_cleared', {
        type: 'alert_cleared',
        alertId,
        timestamp: new Date(),
      });
    });

    this.dataController.on('alert_snoozed', (data: { alertId: string; snoozedUntil: string }) => {
      this.io.emit('alert_snoozed', {
        type: 'alert_snoozed',
        ...data,
        timestamp: new Date(),
      });
    });

    // Alert settings updates
    this.dataController.getAlertService().on('settings_updated', (settings: AlertSettings) => {
      this.io.emit('alert_settings_sync', {
        settings,
        timestamp: new Date(),
      });
    });

    // Special alarm cleared events
    this.dataController.getAlertService().on('depth_alarm_cleared', () => {
      this.io.emit('depth_alarm_cleared', {
        timestamp: new Date(),
      });
    });

    this.dataController.getAlertService().on('anchor_alarm_cleared', () => {
      this.io.emit('anchor_alarm_cleared', {
        timestamp: new Date(),
      });
    });

    // Plugin system events
    this.dataController.on('plugin_update', (data: any) => {
      this.io.emit('plugin_update', {
        ...data,
        timestamp: new Date(),
      });
    });

    // Sensor mapping events
    const sensorMapping = this.dataController.getSensorMappingService();
    if (sensorMapping) {
      sensorMapping.on('mappings_updated', (mappings: any) => {
        this.io.emit('sensor_mappings_updated', {
          mappings,
          timestamp: new Date(),
        });
      });
    }
  }

  /**
   * Set up client connection handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send initial data
      this.sendInitialData(socket);

      // Handle client subscriptions
      socket.on('subscribe', (data) => {
        console.log('Client subscribed to:', data.paths);
        socket.emit('subscription_confirmed', { paths: data.paths });
      });

      // Handle settings updates
      socket.on('settings_update', (data) => {
        this.handleSettingsUpdate(data, socket);
      });

      // Handle request for all settings
      socket.on('get_settings', () => {
        this.sendSettings(socket);
      });

      // Handle control commands
      socket.on('control', (data) => {
        this.handleControlCommand(data, socket);
      });

      // ================================================================
      // Plugin System Handlers
      // ================================================================

      socket.on('get_plugins', () => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            socket.emit('plugin_sync', {
              plugins: pm.getPluginList(),
              timestamp: new Date(),
            });
          }
        }
      });

      socket.on('plugin_enable', async (data: { pluginId: string }) => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            await pm.enablePlugin(data.pluginId);
          }
        }
      });

      socket.on('plugin_disable', async (data: { pluginId: string }) => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            await pm.disablePlugin(data.pluginId);
          }
        }
      });

      socket.on('plugin_install', async (data: { pluginId: string; version?: string }) => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            const registry = await pm.fetchRegistry();
            if (registry) {
              const entry = registry.plugins.find((p: any) => p.id === data.pluginId);
              if (entry) {
                await pm.installPlugin(entry, data.version);
              }
            }
          }
        }
      });

      socket.on('plugin_uninstall', async (data: { pluginId: string }) => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            await pm.uninstallPlugin(data.pluginId);
          }
        }
      });

      socket.on('plugin_fetch_registry', async () => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          if (pm) {
            const registry = await pm.fetchRegistry(true);
            const installedPlugins = pm.getPluginList();
            const installedIds = new Set(installedPlugins.map((p: any) => p.id));

            const registryPlugins = (registry?.plugins || []).map((rp: any) => ({
              ...rp,
              isInstalled: installedIds.has(rp.id),
              installedVersion: installedPlugins.find((p: any) => p.id === rp.id)?.installedVersion,
              hasUpdate: installedIds.has(rp.id) &&
                installedPlugins.find((p: any) => p.id === rp.id)?.installedVersion !== rp.latestVersion,
            }));

            socket.emit('plugin_registry_sync', {
              plugins: registryPlugins,
              timestamp: new Date(),
            });
          }
        }
      });

      socket.on('plugin_config_get', async (data: { pluginId: string; keys: string[] }) => {
        const config: Record<string, any> = {};
        for (const key of data.keys) {
          const fullKey = `plugin.${data.pluginId}.${key}`;
          const raw = await dbWorker.getSetting(fullKey);
          if (raw) {
            try { config[key] = JSON.parse(raw); } catch { config[key] = raw; }
          }
        }
        socket.emit('plugin_config_sync', { pluginId: data.pluginId, config });
      });

      socket.on('plugin_config_set', async (data: { pluginId: string; key: string; value: any }) => {
        const fullKey = `plugin.${data.pluginId}.${data.key}`;
        await dbWorker.setSetting(fullKey, JSON.stringify(data.value));
        socket.emit('plugin_config_sync', { pluginId: data.pluginId, config: { [data.key]: data.value } });
      });

      // ================================================================
      // Sensor Mapping Handlers
      // ================================================================

      socket.on('get_sensor_mappings', () => {
        if (this.dataController) {
          const sm = this.dataController.getSensorMappingService();
          if (sm) {
            socket.emit('sensor_mappings_sync', {
              mappings: sm.getMappings(),
              debugData: sm.getDebugData(),
              timestamp: new Date(),
            });
          }
        }
      });

      socket.on('sensor_mapping_set', async (data: { slotType: string; pluginId: string; streamId: string }) => {
        if (this.dataController) {
          const sm = this.dataController.getSensorMappingService();
          if (sm) {
            await sm.setMapping(data.slotType, data.pluginId, data.streamId);
          }
        }
      });

      socket.on('sensor_mapping_remove', async (data: { slotType: string; pluginId: string; streamId: string }) => {
        if (this.dataController) {
          const sm = this.dataController.getSensorMappingService();
          if (sm) {
            await sm.removeMapping(data.slotType, data.pluginId, data.streamId);
          }
        }
      });

      socket.on('sensor_mapping_automap', async (data: { pluginId: string }) => {
        if (this.dataController) {
          const pm = this.dataController.getPluginManager();
          const sm = this.dataController.getSensorMappingService();
          if (pm && sm) {
            const streams = pm.getDriverStreams(data.pluginId);
            if (streams) {
              await sm.autoMapDriver(data.pluginId, streams);
            }
          }
        }
      });

      // Handle anchor alarm updates - forward to alert service AND broadcast
      socket.on('anchor_alarm_update', (data) => {
        if (this.dataController) {
          // Send to alert service for server-side evaluation
          this.dataController.getAlertService().updateAnchorAlarm(data.anchorAlarm);
        }
        // Broadcast to all clients
        this.io.emit('anchor_alarm_changed', {
          ...data,
          timestamp: new Date(),
        });
      });

      // Handle depth alarm updates - forward to alert service
      socket.on('depth_alarm_update', (data: { threshold: number | null; soundEnabled: boolean }) => {
        if (this.dataController) {
          this.dataController.getAlertService().updateDepthAlarm(data.threshold, data.soundEnabled);
        }
      });

      // Handle alert actions
      socket.on('alert_snooze', (data: { alertId: string; minutes?: number }) => {
        if (this.dataController) {
          this.dataController.getAlertService().snoozeAlert(data.alertId, data.minutes);
        }
      });

      socket.on('alert_dismiss', (data: { alertId: string }) => {
        if (this.dataController) {
          this.dataController.getAlertService().dismissAlert(data.alertId);
        }
      });

      socket.on('alert_update', async (data: any) => {
        if (this.dataController) {
          try {
            await this.dataController.getAlertService().upsertAlert(data);
          } catch (error) {
            socket.emit('alert_error', { error: 'Failed to update alert' });
          }
        }
      });

      socket.on('alert_delete', async (data: { alertId: string }) => {
        if (this.dataController) {
          await this.dataController.getAlertService().deleteAlert(data.alertId);
        }
      });

      socket.on('alert_global_enable', async (data: { enabled: boolean }) => {
        if (this.dataController) {
          await this.dataController.getAlertService().setGlobalEnabled(data.enabled);
        }
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Send initial data to newly connected client
   */
  private async sendInitialData(socket: any): Promise<void> {
    if (this.dataController) {
      // Send current sensor data
      const sensorData = this.dataController.getSensorDataForDisplay();
      if (sensorData) {
        socket.emit('sensor_update', {
          type: 'sensor_update',
          data: sensorData,
          timestamp: new Date(),
        });
      }

      // Send current state
      const sensorService = this.dataController.getSensorService();
      socket.emit('state_change', {
        currentState: sensorService.getCurrentState(),
        timestamp: new Date(),
      });

      // Send current triggered alerts
      const triggeredAlerts = this.dataController.getAlertService().getTriggeredAlerts();
      if (triggeredAlerts.length > 0) {
        socket.emit('alerts_sync', {
          alerts: triggeredAlerts,
          timestamp: new Date(),
        });
      }

      // Send alert settings (converted to display units)
      const alertSettings = this.dataController.getAlertService().getSettingsForDisplay();
      socket.emit('alert_settings_sync', {
        settings: alertSettings,
        timestamp: new Date(),
      });

      // Send current depth alarm state from AlertService (authoritative source)
      // This overrides whatever depthAlarm value is in the DB settings
      const depthAlarmState = this.dataController.getAlertService().getDepthAlarmState();
      socket.emit('depth_alarm_sync', {
        threshold: depthAlarmState.threshold,
        soundEnabled: depthAlarmState.soundEnabled,
        timestamp: new Date(),
      });

      // Send current anchor alarm state if active
      const anchorAlarmState = this.dataController.getAlertService().getAnchorAlarmState();
      if (anchorAlarmState?.active) {
        socket.emit('anchor_alarm_changed', {
          anchorAlarm: anchorAlarmState,
          timestamp: new Date(),
        });
      }
    }

    // Send plugin data
    if (this.dataController) {
      const pm = this.dataController.getPluginManager();
      if (pm) {
        socket.emit('plugin_sync', {
          plugins: pm.getPluginList(),
          timestamp: new Date(),
        });
      }

      const sm = this.dataController.getSensorMappingService();
      if (sm) {
        socket.emit('sensor_mappings_sync', {
          mappings: sm.getMappings(),
          debugData: sm.getDebugData(),
          timestamp: new Date(),
        });
      }
    }

    // Send settings
    await this.sendSettings(socket);

    // Send weather
    await this.sendWeather(socket);
  }

  /**
   * Handle settings update from client
   */
  private async handleSettingsUpdate(data: any, socket: any): Promise<void> {
    console.log('Settings update received:', data);

    if (data.key && data.value !== undefined) {
      // Save to database
      try {
        await dbWorker.setSetting(data.key, JSON.stringify(data.value), data.description);
      } catch (error) {
        console.error('Error saving setting:', error);
        socket.emit('settings_error', { error: 'Failed to save setting' });
        return;
      }

      // Handle language change
      if (data.key === 'language') {
        setI18nLanguage(data.value);
        // Refresh messages for any active alerts so they display in the new language
        if (this.dataController) {
          this.dataController.getAlertService().refreshAlertMessages();
        }
      }

      // Handle unit preference changes
      if (['speedUnit', 'windUnit', 'depthUnit', 'temperatureUnit'].includes(data.key)) {
        if (this.dataController) {
          const preferences: Partial<UserUnitPreferences> = {};
          preferences[data.key as keyof UserUnitPreferences] = data.value;
          this.dataController.updateUserPreferences(preferences);
          this.dataController.getAlertService().updateUserUnits(preferences);
        }
      }

      // Broadcast to ALL clients
      this.io.emit('settings_changed', {
        key: data.key,
        value: data.value,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle control commands
   */
  private handleControlCommand(data: any, socket: any): void {
    console.log('Control command received:', data);

    if (data.type === 'set_state' && this.dataController) {
      this.dataController.getSensorService().changeState(data.state);
      this.io.emit('state_change', {
        currentState: data.state,
        previousState: null,
        timestamp: new Date(),
      });
    }

    // Handle demo navigation updates - sync to all clients
    if (data.type === 'demo_navigation' && this.dataController) {
      this.dataController.setDemoNavigation(data);
      // Broadcast to all clients so other map views sync position
      this.io.emit('demo_navigation_sync', {
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading,
        speed: data.speed,
        timestamp: new Date(),
      });
    }

    socket.emit('control_response', {
      success: true,
      command: data,
    });
  }

  /**
   * Send all settings to a client
   */
  private async sendSettings(socket: any): Promise<void> {
    try {
      const allSettings = await dbWorker.getAllSettings();
      const settingsObj: Record<string, any> = {};

      for (const setting of allSettings) {
        try {
          settingsObj[setting.key] = JSON.parse(setting.value);
        } catch {
          settingsObj[setting.key] = setting.value;
        }
      }

      socket.emit('settings_sync', {
        settings: settingsObj,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Error sending settings:', error);
    }
  }

  /**
   * Send current weather to a client
   */
  private async sendWeather(socket: any): Promise<void> {
    if (!this.dataController) return;

    const weatherService = this.dataController.getWeatherService();
    const current = await weatherService.getCachedCurrent();
    const forecast = await weatherService.getCachedForecast();

    if (current) {
      // Convert to display units
      const weatherData = this.dataController.getWeatherData();
      if (weatherData) {
        const displayWeather = this.dataController.convertWeatherToDisplay(weatherData);
        socket.emit('weather_update', {
          current: displayWeather.current,
          forecast: displayWeather.hourly.slice(0, 48),
          lastUpdated: new Date().toISOString(),
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Broadcast sensor update to all clients
   */
  private broadcastSensorUpdate(data: DisplaySensorData): void {
    this.io.emit('sensor_update', {
      type: 'sensor_update',
      data: data,
      timestamp: new Date(),
    });

    // Store to database periodically
    this.storageCounter++;
    if (this.storageCounter >= this.STORAGE_INTERVAL) {
      this.storageCounter = 0;
      this.storeSensorData(data);
    }
  }

  /**
   * Broadcast weather update to all clients
   */
  private broadcastWeatherUpdate(data: any): void {
    this.io.emit('weather_update', {
      current: data.current,
      forecast: data.hourly?.slice(0, 48) ?? [],
      lastUpdated: new Date().toISOString(),
      timestamp: new Date(),
    });
  }

  /**
   * Store sensor data to database (in display units for historical queries)
   */
  private storeSensorData(data: DisplaySensorData): void {
    const readings: Array<{ category: string; sensorName: string; value: number; unit?: string }> = [];

    // Navigation data
    if (data.navigation) {
      const nav = data.navigation;
      if (nav.position) {
        readings.push({ category: 'navigation', sensorName: 'latitude', value: nav.position.latitude, unit: 'deg' });
        readings.push({ category: 'navigation', sensorName: 'longitude', value: nav.position.longitude, unit: 'deg' });
      }
      if (nav.speedOverGround !== undefined) {
        readings.push({ category: 'navigation', sensorName: 'speedOverGround', value: nav.speedOverGround, unit: 'kt' });
      }
      if (nav.courseOverGround !== undefined) {
        readings.push({ category: 'navigation', sensorName: 'courseOverGround', value: nav.courseOverGround, unit: 'deg' });
      }
      if (nav.headingMagnetic !== undefined) {
        readings.push({ category: 'navigation', sensorName: 'heading', value: nav.headingMagnetic, unit: 'deg' });
      }
    }

    // Environment data
    if (data.environment) {
      const env = data.environment;
      if (env.depth?.belowTransducer !== undefined) {
        readings.push({ category: 'environment', sensorName: 'depth', value: env.depth.belowTransducer, unit: 'm' });
      }
      if (env.wind?.speedApparent !== undefined) {
        readings.push({ category: 'environment', sensorName: 'windSpeed', value: env.wind.speedApparent, unit: 'kt' });
      }
      if (env.wind?.angleApparent !== undefined) {
        readings.push({ category: 'environment', sensorName: 'windDirection', value: env.wind.angleApparent, unit: 'deg' });
      }
    }

    // Electrical data
    if (data.electrical?.battery) {
      const battery = data.electrical.battery;
      if (battery.voltage !== undefined) {
        readings.push({ category: 'electrical', sensorName: 'house_voltage', value: battery.voltage, unit: 'V' });
      }
      if (battery.current !== undefined) {
        readings.push({ category: 'electrical', sensorName: 'house_current', value: battery.current, unit: 'A' });
      }
      if (battery.stateOfCharge !== undefined) {
        readings.push({ category: 'electrical', sensorName: 'house_stateOfCharge', value: battery.stateOfCharge, unit: '%' });
      }
    }

    // Propulsion data
    if (data.propulsion?.motor) {
      const motor = data.propulsion.motor;
      if (motor.throttle !== undefined) {
        readings.push({ category: 'propulsion', sensorName: 'motor_throttle', value: motor.throttle, unit: '%' });
      }
    }

    // Send to database worker
    if (readings.length > 0) {
      dbWorker.addSensorDataBatch(readings);
    }
  }

  /**
   * Broadcast connectivity status change
   */
  public broadcastConnectivityChange(online: boolean): void {
    this.io.emit('connectivity_change', {
      online,
      timestamp: new Date(),
    });
  }

  /**
   * Broadcast download progress
   */
  public broadcastDownloadProgress(progress: {
    fileId: string;
    status: 'downloading' | 'extracting' | 'indexing' | 'completed' | 'error' | 'idle';
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    error?: string;
  }): void {
    this.io.emit('download_progress', {
      ...progress,
      timestamp: new Date(),
    });
  }

  /**
   * Stop the WebSocket server
   */
  public broadcastSystemUpdating(): void {
    this.io.emit('system_updating', {
      timestamp: new Date(),
    });
  }

  public broadcastUpdateAvailable(version: string): void {
    this.io.emit('update_available', {
      version,
      timestamp: new Date(),
    });
  }

  public stop(): void {
    this.io.close();
    console.log('[WebSocketServer] Stopped');
  }
}

// Export singleton reference
export let wsServerInstance: WebSocketServer | null = null;

export function setWsServerInstance(instance: WebSocketServer): void {
  wsServerInstance = instance;
}
