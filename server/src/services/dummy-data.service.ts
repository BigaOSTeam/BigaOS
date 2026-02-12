import { BoatState, StateInputs, GeoPosition } from '../types/boat-state.types';
import { SensorData } from '../types/sensor.types';

const DEG_TO_RAD = Math.PI / 180;

class DummyDataService {
  private currentState: BoatState = BoatState.DRIFTING;
  private basePosition: GeoPosition = {
    latitude: 43.45,   // Adriatic Sea, west of Split
    longitude: 16.20,  // In the water, off Croatian coast
    timestamp: new Date()
  };
  private anchorPosition: GeoPosition | null = null;
  private stateStartTime: Date = new Date();

  // Demo mode controlled values (set by client)
  private demoMode: boolean = true;
  private demoSpeed: number = 0;
  private demoHeading: number = 0;
  private demoPosition: GeoPosition = {
    latitude: 43.45,
    longitude: 16.20,
    timestamp: new Date()
  };

  // Generate realistic sensor data based on current boat state
  generateSensorData(): SensorData {
    const timeInState = (Date.now() - this.stateStartTime.getTime()) / 1000;

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
      heelAngle = speed > 5 ? this.randomVariation(speed * 2, 2) : this.randomVariation(2, 1);
      windSpeed = this.randomVariation(8, 2);
      motorRunning = speed > 0;
      throttle = speed > 0 ? Math.min(speed * 10, 100) : 0;
    } else {
      // Original random behavior when not in demo mode
      switch (this.currentState) {
        case BoatState.ANCHORED:
          speed = this.randomVariation(0.1, 0.05);
          heading = this.randomVariation(180, 10);
          heelAngle = this.randomVariation(2, 1);
          windSpeed = this.randomVariation(10, 3);
          break;

        case BoatState.SAILING:
          speed = this.randomVariation(5.5, 0.8);
          heading = this.randomVariation(240, 5);
          heelAngle = this.randomVariation(15, 3);
          windSpeed = this.randomVariation(12, 2);
          break;

        case BoatState.MOTORING:
          speed = this.randomVariation(4.8, 0.3);
          heading = this.randomVariation(180, 3);
          heelAngle = this.randomVariation(3, 1);
          motorRunning = true;
          throttle = 60;
          break;

        case BoatState.IN_MARINA:
          speed = 0.05;
          heading = this.randomVariation(90, 2);
          heelAngle = this.randomVariation(1, 0.5);
          windSpeed = this.randomVariation(5, 2);
          break;

        case BoatState.DRIFTING:
          speed = this.randomVariation(1.2, 0.4);
          heading = this.randomVariation(200, 15);
          heelAngle = this.randomVariation(5, 2);
          windSpeed = this.randomVariation(8, 2);
          break;
      }

      // Update position based on speed and heading (only when not in demo mode)
      this.updatePosition(speed, heading);
      position = this.basePosition;
    }

    return {
      navigation: {
        position: { ...position },
        courseOverGround: heading * DEG_TO_RAD,
        speedOverGround: speed,
        headingMagnetic: heading * DEG_TO_RAD,
        headingTrue: this.normalizeAngle(heading + 12) * DEG_TO_RAD, // Add magnetic variation
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

  generateStateInputs(): StateInputs {
    const sensorData = this.generateSensorData();
    const timeInState = (Date.now() - this.stateStartTime.getTime()) / 1000;

    return {
      anchorChainOut: this.currentState === BoatState.ANCHORED,
      gpsSpeed: sensorData.navigation.speedOverGround,
      motorRunning: sensorData.propulsion.motor.state === 'running',
      gpsPosition: sensorData.navigation.position,
      depthBelowTransducer: sensorData.environment.depth.belowTransducer,
      timeInState: timeInState
    };
  }

  // Simulate state changes
  changeState(newState: BoatState) {
    if (newState === BoatState.ANCHORED && !this.anchorPosition) {
      this.anchorPosition = { ...this.basePosition };
    } else if (newState !== BoatState.ANCHORED) {
      this.anchorPosition = null;
    }

    this.currentState = newState;
    this.stateStartTime = new Date();
  }

  getCurrentState(): BoatState {
    return this.currentState;
  }

  getAnchorPosition(): GeoPosition | null {
    return this.anchorPosition;
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

    // If anchored, add some drift but keep near anchor
    if (this.currentState === BoatState.ANCHORED && this.anchorPosition) {
      const maxDrift = 0.0001; // degrees (~11 meters)
      const latDiff = this.basePosition.latitude - this.anchorPosition.latitude;
      const lonDiff = this.basePosition.longitude - this.anchorPosition.longitude;

      if (Math.abs(latDiff) > maxDrift) {
        this.basePosition.latitude = this.anchorPosition.latitude + (latDiff > 0 ? maxDrift : -maxDrift);
      }
      if (Math.abs(lonDiff) > maxDrift) {
        this.basePosition.longitude = this.anchorPosition.longitude + (lonDiff > 0 ? maxDrift : -maxDrift);
      }
    }
  }

}

export const dummyDataService = new DummyDataService();
