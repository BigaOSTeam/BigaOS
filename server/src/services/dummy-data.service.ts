import { BoatState, StateInputs, GeoPosition } from '../types/boat-state.types';
import { SensorData } from '../types/sensor.types';

class DummyDataService {
  private currentState: BoatState = BoatState.DRIFTING;
  private basePosition: GeoPosition = {
    latitude: 47.6062,
    longitude: -122.3321,
    timestamp: new Date()
  };
  private anchorPosition: GeoPosition | null = null;
  private stateStartTime: Date = new Date();

  // Generate realistic sensor data based on current boat state
  generateSensorData(): SensorData {
    const timeInState = (Date.now() - this.stateStartTime.getTime()) / 1000;

    let speed = 0;
    let heading = 180;
    let heelAngle = 0;
    let windSpeed = 8;
    let throttle = 0;
    let motorRunning = false;

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

    // Update position based on speed and heading
    this.updatePosition(speed, heading);

    return {
      navigation: {
        position: { ...this.basePosition },
        courseOverGround: heading,
        speedOverGround: speed,
        headingMagnetic: heading,
        headingTrue: this.normalizeAngle(heading + 12), // Add magnetic variation
        attitude: {
          roll: heelAngle,
          pitch: this.randomVariation(2, 1),
          yaw: heading
        }
      },
      environment: {
        depth: {
          belowTransducer: this.randomVariation(8.5, 1.2)
        },
        wind: {
          speedApparent: windSpeed,
          angleApparent: this.randomVariation(45, 10),
          speedTrue: this.randomVariation(windSpeed - 1, 1),
          angleTrue: this.randomVariation(50, 10)
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

  // Generate dummy weather data
  generateWeatherData() {
    return {
      current: {
        temperature: this.randomVariation(18, 3),
        windSpeed: this.randomVariation(10, 3),
        windDirection: this.randomVariation(270, 30),
        pressure: this.randomVariation(1013, 5),
        humidity: this.randomVariation(65, 10)
      },
      forecast: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(Date.now() + i * 3600000),
        temperature: this.randomVariation(18, 4),
        windSpeed: this.randomVariation(12, 4),
        windGust: this.randomVariation(18, 5),
        windDirection: this.randomVariation(270, 40),
        waveHeight: this.randomVariation(1.2, 0.5),
        pressure: this.randomVariation(1013, 7),
        precipitation: this.randomVariation(0, 2)
      }))
    };
  }

  // Generate dummy camera list
  generateCameraList() {
    return [
      {
        id: 'anchor-camera',
        name: 'Anchor Camera',
        location: 'Bow',
        enabled: true,
        status: 'online'
      },
      {
        id: 'cockpit-camera',
        name: 'Cockpit Camera',
        location: 'Helm',
        enabled: true,
        status: 'online'
      },
      {
        id: 'stern-camera',
        name: 'Stern Camera',
        location: 'Stern',
        enabled: true,
        status: 'online'
      }
    ];
  }
}

export const dummyDataService = new DummyDataService();
