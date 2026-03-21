import { SensorData } from '../types/sensor.types';
import { GeoPosition } from '../types/data.types';

const DEG_TO_RAD = Math.PI / 180;

class DummyDataService {
  private basePosition: GeoPosition = {
    latitude: 43.45,   // Adriatic Sea, west of Split
    longitude: 16.20,  // In the water, off Croatian coast
    timestamp: new Date()
  };

  // Demo mode controlled values (set by client)
  private demoMode: boolean = true;
  private demoSpeed: number = 0;
  private demoHeading: number = 0;
  private demoPosition: GeoPosition = {
    latitude: 43.45,
    longitude: 16.20,
    timestamp: new Date()
  };

  // Generate realistic sensor data
  generateSensorData(): SensorData {
    let speed = 0;
    let heading = 180;
    let heelAngle = 0;
    let windSpeed = 8;
    let throttle = 0;
    let motorRunning = false;
    let position = this.basePosition;

    // In demo mode, use client-controlled values
    if (this.demoMode) {
      speed = this.demoSpeed;
      heading = this.demoHeading;
      position = this.demoPosition;
      const t = Date.now() / 1000;
      heelAngle = Math.sin(t * 0.4) * 3 + Math.sin(t * 1.1) * 1.5 + this.randomVariation(0, 0.3);
      windSpeed = this.randomVariation(8, 2);
      motorRunning = speed > 0;
      throttle = speed > 0 ? Math.min(speed * 10, 100) : 0;
    } else {
      // Default random behavior when not in demo mode
      speed = this.randomVariation(1.2, 0.4);
      heading = this.randomVariation(200, 15);
      const t2 = Date.now() / 1000;
      heelAngle = Math.sin(t2 * 0.4) * 3 + Math.sin(t2 * 1.1) * 1.5 + this.randomVariation(0, 0.3);
      windSpeed = this.randomVariation(8, 2);

      // Update position based on speed and heading
      this.updatePosition(speed, heading);
      position = this.basePosition;
    }

    return {
      navigation: {
        position: { ...position },
        courseOverGround: heading * DEG_TO_RAD,
        speedOverGround: speed,
        heading: heading * DEG_TO_RAD,
        attitude: {
          roll: heelAngle * DEG_TO_RAD,
          pitch: this.randomVariation(2, 1) * DEG_TO_RAD,
          yaw: heading * DEG_TO_RAD
        }
      },
      environment: {
        depth: {
          belowTransducer: this.randomVariation(8.5, 1.2)
        },
        wind: {
          speedApparent: windSpeed,
          angleApparent: this.randomVariation(45, 10) * DEG_TO_RAD,
          speedTrue: this.randomVariation(windSpeed - 1, 1),
          angleTrue: this.randomVariation(50, 10) * DEG_TO_RAD
        },
        temperature: {
          engineRoom: this.randomVariation(motorRunning ? 35 : 28, 2),
          cabin: this.randomVariation(22, 1),
          batteryCompartment: this.randomVariation(24, 1),
          outside: this.randomVariation(18, 2)
        }
      },
      electrical: {
        battery: {
          voltage: this.randomVariation(12.4, 0.2),
          current: motorRunning ? this.randomVariation(-45, 5) : this.randomVariation(-2, 1),
          temperature: this.randomVariation(24, 2),
          stateOfCharge: this.randomVariation(75, 3)
        }
      },
      propulsion: {
        motor: {
          state: motorRunning ? 'running' : 'stopped',
          temperature: motorRunning ? this.randomVariation(40, 3) : this.randomVariation(25, 2),
          throttle: throttle
        }
      }
    };
  }

  // Demo mode controls
  setDemoMode(enabled: boolean) {
    this.demoMode = enabled;
  }

  isDemoMode(): boolean {
    return this.demoMode;
  }

  setDemoNavigation(data: { latitude?: number; longitude?: number; heading?: number; speed?: number }) {
    if (data.latitude !== undefined) {
      this.demoPosition.latitude = data.latitude;
    }
    if (data.longitude !== undefined) {
      this.demoPosition.longitude = data.longitude;
    }
    if (data.heading !== undefined) {
      this.demoHeading = data.heading;
    }
    if (data.speed !== undefined) {
      this.demoSpeed = data.speed;
    }
    this.demoPosition.timestamp = new Date();
  }

  getDemoNavigation() {
    return {
      latitude: this.demoPosition.latitude,
      longitude: this.demoPosition.longitude,
      heading: this.demoHeading,
      speed: this.demoSpeed,
    };
  }

  // Helper methods
  private randomVariation(base: number, variation: number): number {
    return base + (Math.random() - 0.5) * 2 * variation;
  }

  private normalizeAngle(angle: number): number {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
  }

  private updatePosition(speed: number, heading: number) {
    // Simple position update (speed in knots, heading in degrees)
    const deltaTime = 1; // seconds
    const speedMs = speed * 0.514444; // knots to m/s
    const distance = speedMs * deltaTime;

    const headingRad = (heading * Math.PI) / 180;
    const latChange = (distance * Math.cos(headingRad)) / 111320; // meters to degrees
    const lonChange = (distance * Math.sin(headingRad)) / (111320 * Math.cos(this.basePosition.latitude * Math.PI / 180));

    this.basePosition.latitude += latChange;
    this.basePosition.longitude += lonChange;
    this.basePosition.timestamp = new Date();
  }

}

export const dummyDataService = new DummyDataService();
