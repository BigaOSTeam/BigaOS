import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { dummyDataService } from '../services/dummy-data.service';

export class WebSocketServer {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;

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

      // Handle client subscriptions
      socket.on('subscribe', (data) => {
        console.log('Client subscribed to:', data.paths);
        socket.emit('subscription_confirmed', { paths: data.paths });
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

  private startDataBroadcast() {
    // Broadcast sensor data every second
    this.updateInterval = setInterval(() => {
      const sensorData = dummyDataService.generateSensorData();

      this.io.emit('sensor_update', {
        type: 'sensor_update',
        data: sensorData,
        timestamp: new Date()
      });

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

  public stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.io.close();
  }
}
