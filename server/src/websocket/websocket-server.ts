import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { dummyDataService } from '../services/dummy-data.service';
import db from '../database/database';

export class WebSocketServer {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private storageCounter: number = 0;
  private readonly STORAGE_INTERVAL: number = 5; // Store to DB every 5 seconds

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.setupEventHandlers();
    this.startDataBroadcast();
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

        try {
          // Save setting to database
          if (data.key && data.value !== undefined) {
            db.setSetting(data.key, JSON.stringify(data.value), data.description);
          }

          // Broadcast to ALL clients (including sender) so everyone stays in sync
          this.io.emit('settings_changed', {
            key: data.key,
            value: data.value,
            timestamp: new Date()
          });
        } catch (error) {
          console.error('Error saving setting:', error);
          socket.emit('settings_error', { error: 'Failed to save setting' });
        }
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

  private sendSettings(socket: any) {
    try {
      const allSettings = db.getAllSettings();
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

      // Occasionally send notifications
      if (Math.random() < 0.01) { // 1% chance per update
        this.io.emit('notification', {
          type: 'notification',
          severity: 'info',
          title: 'System Update',
          message: 'All systems operating normally',
          timestamp: new Date()
        });
      }
    }, 1000);
  }

  private storeSensorData(sensorData: any) {
    try {
      // Navigation data
      if (sensorData.navigation) {
        const nav = sensorData.navigation;
        if (nav.position) {
          db.addSensorData('navigation', 'latitude', nav.position.latitude, 'deg');
          db.addSensorData('navigation', 'longitude', nav.position.longitude, 'deg');
        }
        if (nav.speedOverGround !== undefined) {
          db.addSensorData('navigation', 'speedOverGround', nav.speedOverGround, 'kt');
        }
        if (nav.courseOverGround !== undefined) {
          db.addSensorData('navigation', 'courseOverGround', nav.courseOverGround, 'deg');
        }
        // Handle both heading and headingMagnetic
        const heading = nav.heading ?? nav.headingMagnetic;
        if (heading !== undefined) {
          db.addSensorData('navigation', 'heading', heading, 'deg');
        }
      }

      // Environment data
      if (sensorData.environment) {
        const env = sensorData.environment;
        // Handle nested depth object (depth.belowTransducer) or direct depth value
        const depthValue = env.depth?.belowTransducer ?? env.depth;
        if (typeof depthValue === 'number') {
          db.addSensorData('environment', 'depth', depthValue, 'm');
        }
        if (env.waterTemperature !== undefined) {
          db.addSensorData('environment', 'waterTemperature', env.waterTemperature, 'C');
        }
        // Handle wind data - might be nested
        const windSpeed = env.wind?.speedApparent ?? env.windSpeed;
        const windDirection = env.wind?.angleApparent ?? env.windDirection;
        if (windSpeed !== undefined) {
          db.addSensorData('environment', 'windSpeed', windSpeed, 'kt');
        }
        if (windDirection !== undefined) {
          db.addSensorData('environment', 'windDirection', windDirection, 'deg');
        }
      }

      // Electrical data - handle both singular 'battery' and plural 'batteries'
      if (sensorData.electrical) {
        const elec = sensorData.electrical;

        // Handle singular battery object
        if (elec.battery) {
          const battery = elec.battery;
          if (battery.voltage !== undefined) {
            db.addSensorData('electrical', 'house_voltage', battery.voltage, 'V');
          }
          if (battery.current !== undefined) {
            db.addSensorData('electrical', 'house_current', battery.current, 'A');
          }
          if (battery.stateOfCharge !== undefined) {
            db.addSensorData('electrical', 'house_stateOfCharge', battery.stateOfCharge, '%');
          }
          if (battery.temperature !== undefined) {
            db.addSensorData('electrical', 'house_temperature', battery.temperature, 'C');
          }
        }

        // Handle plural batteries object
        if (elec.batteries) {
          for (const [batteryId, battery] of Object.entries(elec.batteries) as [string, any][]) {
            if (battery.voltage !== undefined) {
              db.addSensorData('electrical', `${batteryId}_voltage`, battery.voltage, 'V');
            }
            if (battery.current !== undefined) {
              db.addSensorData('electrical', `${batteryId}_current`, battery.current, 'A');
            }
            if (battery.stateOfCharge !== undefined) {
              db.addSensorData('electrical', `${batteryId}_stateOfCharge`, battery.stateOfCharge, '%');
            }
            if (battery.temperature !== undefined) {
              db.addSensorData('electrical', `${batteryId}_temperature`, battery.temperature, 'C');
            }
          }
        }
      }

      // Engine/Motor data
      if (sensorData.propulsion) {
        for (const [engineId, engine] of Object.entries(sensorData.propulsion) as [string, any][]) {
          if (engine.rpm !== undefined) {
            db.addSensorData('propulsion', `${engineId}_rpm`, engine.rpm, 'rpm');
          }
          if (engine.temperature !== undefined) {
            db.addSensorData('propulsion', `${engineId}_temperature`, engine.temperature, 'C');
          }
          if (engine.oilPressure !== undefined) {
            db.addSensorData('propulsion', `${engineId}_oilPressure`, engine.oilPressure, 'kPa');
          }
          if (engine.fuelRate !== undefined) {
            db.addSensorData('propulsion', `${engineId}_fuelRate`, engine.fuelRate, 'L/h');
          }
        }
      }

      // Tank data
      if (sensorData.tanks) {
        for (const [tankId, tank] of Object.entries(sensorData.tanks) as [string, any][]) {
          if (tank.currentLevel !== undefined) {
            db.addSensorData('tanks', `${tankId}_level`, tank.currentLevel, '%');
          }
        }
      }
    } catch (error) {
      console.error('Error storing sensor data:', error);
    }
  }

  public stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.io.close();
  }
}
