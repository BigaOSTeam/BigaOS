import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { dummyDataService } from '../services/dummy-data.service';
import { dbWorker } from '../services/database-worker.service';

export class WebSocketServer {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private storageCounter: number = 0;
  private readonly STORAGE_INTERVAL: number = 1; // Store to DB every second

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Initialize demo mode from database
    this.initializeDemoMode();

    this.setupEventHandlers();
    this.startDataBroadcast();
  }

  private async initializeDemoMode() {
    try {
      const demoModeSetting = await dbWorker.getSetting('demoMode');
      if (demoModeSetting && demoModeSetting !== 'undefined') {
        const enabled = JSON.parse(demoModeSetting);
        dummyDataService.setDemoMode(enabled);
        console.log(`Demo mode initialized: ${enabled}`);
      } else {
        // Default to true if not set
        dummyDataService.setDemoMode(true);
        console.log('Demo mode initialized: true (default)');
      }
    } catch (error) {
      console.error('Error initializing demo mode:', error);
      // Default to true on error
      dummyDataService.setDemoMode(true);
    }
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send initial data
      socket.emit('sensor_update', dummyDataService.generateSensorData());
      socket.emit('state_change', {
        currentState: dummyDataService.getCurrentState(),
        timestamp: new Date()
      });

      // Send current settings
      this.sendSettings(socket);

      // Handle client subscriptions
      socket.on('subscribe', (data) => {
        console.log('Client subscribed to:', data.paths);
        socket.emit('subscription_confirmed', { paths: data.paths });
      });

      // Handle settings update
      socket.on('settings_update', (data) => {
        console.log('Settings update received:', data);

        // Save setting to database (async, fire-and-forget for non-critical settings)
        if (data.key && data.value !== undefined) {
          dbWorker.setSetting(data.key, JSON.stringify(data.value), data.description)
            .catch((error) => {
              console.error('Error saving setting:', error);
              socket.emit('settings_error', { error: 'Failed to save setting' });
            });

          // Update dummy data service demo mode when demoMode setting changes
          if (data.key === 'demoMode') {
            dummyDataService.setDemoMode(data.value);
          }
        }

        // Broadcast to ALL clients (including sender) so everyone stays in sync
        this.io.emit('settings_changed', {
          key: data.key,
          value: data.value,
          timestamp: new Date()
        });
      });

      // Handle request for all settings
      socket.on('get_settings', () => {
        this.sendSettings(socket);
      });

      // Handle control commands
      socket.on('control', (data) => {
        console.log('Control command received:', data);

        if (data.type === 'set_state') {
          dummyDataService.changeState(data.state);
          this.io.emit('state_change', {
            currentState: data.state,
            previousState: null,
            timestamp: new Date()
          });
        }

        socket.emit('control_response', {
          success: true,
          command: data
        });
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  private async sendSettings(socket: any) {
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
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error sending settings:', error);
    }
  }

  private startDataBroadcast() {
    // Broadcast sensor data every second
    this.updateInterval = setInterval(() => {
      const sensorData = dummyDataService.generateSensorData();

      this.io.emit('sensor_update', {
        type: 'sensor_update',
        data: sensorData,
        timestamp: new Date()
      });

      // Store sensor data to database every STORAGE_INTERVAL seconds
      this.storageCounter++;
      if (this.storageCounter >= this.STORAGE_INTERVAL) {
        this.storageCounter = 0;
        this.storeSensorData(sensorData);
      }
    }, 1000);
  }

  private storeSensorData(sensorData: any) {
    // Collect all sensor readings into a batch
    const readings: Array<{ category: string; sensorName: string; value: number; unit?: string }> = [];

    // Navigation data
    if (sensorData.navigation) {
      const nav = sensorData.navigation;
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
      // Handle both heading and headingMagnetic
      const heading = nav.heading ?? nav.headingMagnetic;
      if (heading !== undefined) {
        readings.push({ category: 'navigation', sensorName: 'heading', value: heading, unit: 'deg' });
      }
    }

    // Environment data
    if (sensorData.environment) {
      const env = sensorData.environment;
      // Handle nested depth object (depth.belowTransducer) or direct depth value
      const depthValue = env.depth?.belowTransducer ?? env.depth;
      if (typeof depthValue === 'number') {
        readings.push({ category: 'environment', sensorName: 'depth', value: depthValue, unit: 'm' });
      }
      if (env.waterTemperature !== undefined) {
        readings.push({ category: 'environment', sensorName: 'waterTemperature', value: env.waterTemperature, unit: 'C' });
      }
      // Handle wind data - might be nested
      const windSpeed = env.wind?.speedApparent ?? env.windSpeed;
      const windDirection = env.wind?.angleApparent ?? env.windDirection;
      if (windSpeed !== undefined) {
        readings.push({ category: 'environment', sensorName: 'windSpeed', value: windSpeed, unit: 'kt' });
      }
      if (windDirection !== undefined) {
        readings.push({ category: 'environment', sensorName: 'windDirection', value: windDirection, unit: 'deg' });
      }
    }

    // Electrical data - handle both singular 'battery' and plural 'batteries'
    if (sensorData.electrical) {
      const elec = sensorData.electrical;

      // Handle singular battery object
      if (elec.battery) {
        const battery = elec.battery;
        if (battery.voltage !== undefined) {
          readings.push({ category: 'electrical', sensorName: 'house_voltage', value: battery.voltage, unit: 'V' });
        }
        if (battery.current !== undefined) {
          readings.push({ category: 'electrical', sensorName: 'house_current', value: battery.current, unit: 'A' });
        }
        if (battery.stateOfCharge !== undefined) {
          readings.push({ category: 'electrical', sensorName: 'house_stateOfCharge', value: battery.stateOfCharge, unit: '%' });
        }
        if (battery.temperature !== undefined) {
          readings.push({ category: 'electrical', sensorName: 'house_temperature', value: battery.temperature, unit: 'C' });
        }
      }

      // Handle plural batteries object
      if (elec.batteries) {
        for (const [batteryId, battery] of Object.entries(elec.batteries) as [string, any][]) {
          if (battery.voltage !== undefined) {
            readings.push({ category: 'electrical', sensorName: `${batteryId}_voltage`, value: battery.voltage, unit: 'V' });
          }
          if (battery.current !== undefined) {
            readings.push({ category: 'electrical', sensorName: `${batteryId}_current`, value: battery.current, unit: 'A' });
          }
          if (battery.stateOfCharge !== undefined) {
            readings.push({ category: 'electrical', sensorName: `${batteryId}_stateOfCharge`, value: battery.stateOfCharge, unit: '%' });
          }
          if (battery.temperature !== undefined) {
            readings.push({ category: 'electrical', sensorName: `${batteryId}_temperature`, value: battery.temperature, unit: 'C' });
          }
        }
      }
    }

    // Engine/Motor data
    if (sensorData.propulsion) {
      for (const [engineId, engine] of Object.entries(sensorData.propulsion) as [string, any][]) {
        if (engine.rpm !== undefined) {
          readings.push({ category: 'propulsion', sensorName: `${engineId}_rpm`, value: engine.rpm, unit: 'rpm' });
        }
        if (engine.temperature !== undefined) {
          readings.push({ category: 'propulsion', sensorName: `${engineId}_temperature`, value: engine.temperature, unit: 'C' });
        }
        if (engine.oilPressure !== undefined) {
          readings.push({ category: 'propulsion', sensorName: `${engineId}_oilPressure`, value: engine.oilPressure, unit: 'kPa' });
        }
        if (engine.fuelRate !== undefined) {
          readings.push({ category: 'propulsion', sensorName: `${engineId}_fuelRate`, value: engine.fuelRate, unit: 'L/h' });
        }
      }
    }

    // Tank data
    if (sensorData.tanks) {
      for (const [tankId, tank] of Object.entries(sensorData.tanks) as [string, any][]) {
        if (tank.currentLevel !== undefined) {
          readings.push({ category: 'tanks', sensorName: `${tankId}_level`, value: tank.currentLevel, unit: '%' });
        }
      }
    }

    // Send all readings as a single batch to the worker (non-blocking)
    if (readings.length > 0) {
      dbWorker.addSensorDataBatch(readings);
    }
  }

  public stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.io.close();
  }

  /**
   * Broadcast connectivity status change to all clients
   */
  public broadcastConnectivityChange(online: boolean): void {
    this.io.emit('connectivity_change', {
      online,
      timestamp: new Date()
    });
  }

  /**
   * Broadcast download progress to all clients
   */
  public broadcastDownloadProgress(progress: {
    fileId: string;
    status: 'downloading' | 'extracting' | 'completed' | 'error' | 'idle';
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    error?: string;
  }): void {
    this.io.emit('download_progress', {
      ...progress,
      timestamp: new Date()
    });
  }
}

// Export a singleton reference that will be set by index.ts
export let wsServerInstance: WebSocketServer | null = null;

export function setWsServerInstance(instance: WebSocketServer): void {
  wsServerInstance = instance;
}
