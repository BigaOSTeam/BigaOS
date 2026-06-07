/**
 * SensorDataService - Generates sensor data in standard NMEA2000 units
 *
 * This service generates realistic sensor data for demo/testing purposes.
 * All data is output in standard units:
 * - Speed: m/s
 * - Temperature: Kelvin
 * - Depth: meters
 * - Angles: radians
 *
 * When real NMEA2000 hardware is connected, this service will be replaced
 * by actual hardware data feeds.
 */

import { EventEmitter } from 'events';
import { GeoPosition } from '../types/data.types';
import {
  StandardSensorData,
  StandardNavigationData,
  StandardEnvironmentData,
  StandardElectricalData,
  StandardPropulsionData,
} from '../types/data.types';
import { knotsToMs, celsiusToKelvin } from '../types/units.types';

const DEG_TO_RAD = Math.PI / 180;

export class SensorDataService extends EventEmitter {
  private basePosition: GeoPosition = {
    latitude: 43.45, // Adriatic Sea, west of Split
    longitude: 16.2, // In the water, off Croatian coast
    timestamp: new Date(),
  };

  // Demo mode controlled values (set by client, in DISPLAY units)
  private demoMode: boolean = true;
  private demoSpeed: number = 0; // knots (from client)
  private demoHeading: number = 0; // degrees
  private demoPosition: GeoPosition = {
    latitude: 43.45,
    longitude: 16.2,
    timestamp: new Date(),
  };

  // Data generation interval
  private dataInterval: ReturnType<typeof setInterval> | null = null;
  private readonly UPDATE_INTERVAL_MS = 1000; // 1 Hz

  /**
   * Start generating sensor data at 1 Hz
   */
  start(): void {
    if (this.dataInterval) return;

    this.dataInterval = setInterval(() => {
      const data = this.generateSensorData();
      this.emit('sensor_data', data);
    }, this.UPDATE_INTERVAL_MS);

    console.log('[SensorDataService] Started generating sensor data at 1 Hz');
  }

  /**
   * Stop generating sensor data
   */
  stop(): void {
    if (this.dataInterval) {
      clearInterval(this.dataInterval);
      this.dataInterval = null;
      console.log('[SensorDataService] Stopped generating sensor data');
    }
  }

  /**
   * Get current sensor data in STANDARD units (m/s, Kelvin, meters)
   */
  getCurrentData(): StandardSensorData {
    return this.generateSensorData();
  }

  /**
   * Generate realistic sensor data in STANDARD units
   */
  generateSensorData(): StandardSensorData {
    // Values in knots/Celsius (legacy units) that we'll convert
    let speedKnots = 0;
    let heading = 180;
    let heelAngle = 0;
    let windSpeedKnots = 8;
    let throttle = 0;
    let motorRunning = false;
    let position = this.basePosition;

    // In demo mode, use client-controlled values
    if (this.demoMode) {
      speedKnots = this.demoSpeed; // Client sends in knots
      heading = this.demoHeading;
      position = this.demoPosition;
      heelAngle = speedKnots > 5 ? this.randomVariation(speedKnots * 2, 2) : this.randomVariation(2, 1);
      windSpeedKnots = this.randomVariation(8, 2);
      motorRunning = speedKnots > 0;
      throttle = speedKnots > 0 ? Math.min(speedKnots * 10, 100) : 0;
    } else {
      // Default random behavior when not in demo mode
      speedKnots = this.randomVariation(1.2, 0.4);
      heading = this.randomVariation(200, 15);
      heelAngle = this.randomVariation(5, 2);
      windSpeedKnots = this.randomVariation(8, 2);

      // Update position based on speed and heading
      this.updatePosition(speedKnots, heading);
      position = this.basePosition;
    }

    // Temperatures in Celsius (to be converted to Kelvin)
    const engineRoomTempC = this.randomVariation(motorRunning ? 35 : 28, 2);
    const cabinTempC = this.randomVariation(22, 1);
    const batteryTempC = this.randomVariation(24, 1);
    const outsideTempC = this.randomVariation(18, 2);
    const batteryCompartmentTempC = this.randomVariation(24, 2);
    const motorTempC = motorRunning ? this.randomVariation(40, 3) : this.randomVariation(25, 2);

    // Build sensor data in STANDARD units (angles in radians)
    const navigation: StandardNavigationData = {
      position: { ...position },
      courseOverGround: heading * DEG_TO_RAD,
      speedOverGround: knotsToMs(speedKnots), // Convert to m/s
      speedThroughWater: knotsToMs(speedKnots), // no separate sim log; mirror SOG
      heading: heading * DEG_TO_RAD,
      attitude: {
        roll: heelAngle * DEG_TO_RAD,
        pitch: this.randomVariation(2, 1) * DEG_TO_RAD,
        yaw: heading * DEG_TO_RAD,
      },
    };

    const environment: StandardEnvironmentData = {
      depth: {
        belowTransducer: this.randomVariation(8.5, 1.2), // Already in meters
      },
      wind: {
        speedApparent: knotsToMs(windSpeedKnots), // Convert to m/s
        angleApparent: this.randomVariation(45, 10) * DEG_TO_RAD,
        speedTrue: knotsToMs(this.randomVariation(windSpeedKnots - 1, 1)), // Convert to m/s
        angleTrue: this.randomVariation(50, 10) * DEG_TO_RAD,
      },
      temperature: {
        engineRoom: celsiusToKelvin(engineRoomTempC),
        cabin: celsiusToKelvin(cabinTempC),
        batteryCompartment: celsiusToKelvin(batteryCompartmentTempC),
        outside: celsiusToKelvin(outsideTempC),
      },
    };

    const electrical: StandardElectricalData = {
      battery: {
        voltage: this.randomVariation(12.4, 0.2), // Volts (no conversion)
        current: motorRunning ? this.randomVariation(-45, 5) : this.randomVariation(-2, 1), // Amps (no conversion)
        temperature: celsiusToKelvin(batteryTempC),
        stateOfCharge: this.randomVariation(75, 3), // Percentage (no conversion)
        timeRemaining: 14400, // Seconds (demo: ~4h)
        power: motorRunning ? this.randomVariation(-550, 50) : this.randomVariation(-25, 10), // Watts
      },
    };

    const propulsion: StandardPropulsionData = {
      motor: {
        state: motorRunning ? 'running' : 'stopped',
        temperature: celsiusToKelvin(motorTempC),
        throttle: throttle, // Percentage (no conversion)
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

  // ============================================================================
  // Demo Mode Controls
  // ============================================================================

  setDemoMode(enabled: boolean): void {
    this.demoMode = enabled;
    console.log(`[SensorDataService] Demo mode: ${enabled}`);
  }

  isDemoMode(): boolean {
    return this.demoMode;
  }

  /**
   * Set demo navigation values
   * Note: speed is expected in KNOTS (client's display unit), will be converted internally
   */
  setDemoNavigation(data: {
    latitude?: number;
    longitude?: number;
    heading?: number;
    speed?: number; // knots
  }): void {
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
      this.demoSpeed = data.speed; // Store in knots for now, convert in generateSensorData
    }
    this.demoPosition.timestamp = new Date();
  }

  getDemoNavigation(): { latitude: number; longitude: number; heading: number; speed: number } {
    return {
      latitude: this.demoPosition.latitude,
      longitude: this.demoPosition.longitude,
      heading: this.demoHeading,
      speed: this.demoSpeed, // Returns in knots (for client display)
    };
  }

  /**
   * Get current position (for weather service)
   */
  getCurrentPosition(): { lat: number; lon: number } | null {
    const data = this.generateSensorData();
    if (data.navigation?.position) {
      return {
        lat: data.navigation.position.latitude,
        lon: data.navigation.position.longitude,
      };
    }
    return null;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private randomVariation(base: number, variation: number): number {
    return base + (Math.random() - 0.5) * 2 * variation;
  }

  private normalizeAngle(angle: number): number {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
  }

  private updatePosition(speedKnots: number, heading: number): void {
    // Simple position update (speed in knots, heading in degrees)
    const deltaTime = 1; // seconds
    const speedMs = knotsToMs(speedKnots);
    const distance = speedMs * deltaTime;

    const headingRad = (heading * Math.PI) / 180;
    const latChange = (distance * Math.cos(headingRad)) / 111320; // meters to degrees
    const lonChange =
      (distance * Math.sin(headingRad)) /
      (111320 * Math.cos((this.basePosition.latitude * Math.PI) / 180));

    this.basePosition.latitude += latChange;
    this.basePosition.longitude += lonChange;
    this.basePosition.timestamp = new Date();
  }
}

// Export singleton instance
export const sensorDataService = new SensorDataService();
