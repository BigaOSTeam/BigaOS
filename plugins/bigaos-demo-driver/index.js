/**
 * BigaOS Demo Driver Plugin
 *
 * Built-in plugin that generates realistic sensor data for testing
 * and development. Replaces the old SensorDataService with the
 * same data generation logic, but using the plugin API.
 *
 * Uses pushSensorDataPacket() to send a complete StandardSensorData
 * every second, matching the original 1Hz behavior.
 */

// Conversion helpers (matching server/src/types/units.types.ts)
const KNOTS_TO_MS = 0.514444;
const CELSIUS_TO_KELVIN = 273.15;

function knotsToMs(knots) {
  return knots * KNOTS_TO_MS;
}

function celsiusToKelvin(celsius) {
  return celsius + CELSIUS_TO_KELVIN;
}

function randomVariation(base, variation) {
  return base + (Math.random() - 0.5) * 2 * variation;
}

function normalizeAngle(angle) {
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

// ============================================================================
// Demo Driver Plugin
// ============================================================================

let api = null;
let demoSpeed = 0;      // knots (from client)
let demoHeading = 0;    // degrees
let demoPosition = {
  latitude: 43.45,      // Adriatic Sea, west of Split
  longitude: 16.2,
  timestamp: new Date(),
};

function generateSensorData() {
  const speedKnots = demoSpeed;
  const heading = demoHeading;
  const position = demoPosition;

  const heelAngle = speedKnots > 5 ? randomVariation(speedKnots * 2, 2) : randomVariation(2, 1);
  const windSpeedKnots = randomVariation(8, 2);
  const motorRunning = speedKnots > 0;
  const throttle = speedKnots > 0 ? Math.min(speedKnots * 10, 100) : 0;

  // Temperatures in Celsius
  const engineRoomTempC = randomVariation(motorRunning ? 35 : 28, 2);
  const cabinTempC = randomVariation(22, 1);
  const batteryTempC = randomVariation(24, 1);
  const outsideTempC = randomVariation(18, 2);
  const batteryCompartmentTempC = randomVariation(24, 2);
  const motorTempC = motorRunning ? randomVariation(40, 3) : randomVariation(25, 2);

  return {
    timestamp: new Date().toISOString(),
    navigation: {
      position: { ...position, timestamp: new Date() },
      courseOverGround: heading,
      speedOverGround: knotsToMs(speedKnots),
      headingMagnetic: heading,
      headingTrue: normalizeAngle(heading + 12),
      attitude: {
        roll: heelAngle,
        pitch: randomVariation(2, 1),
        yaw: heading,
      },
    },
    environment: {
      depth: {
        belowTransducer: randomVariation(8.5, 1.2),
      },
      wind: {
        speedApparent: knotsToMs(windSpeedKnots),
        angleApparent: randomVariation(45, 10),
        speedTrue: knotsToMs(randomVariation(windSpeedKnots - 1, 1)),
        angleTrue: randomVariation(50, 10),
      },
      temperature: {
        engineRoom: celsiusToKelvin(engineRoomTempC),
        cabin: celsiusToKelvin(cabinTempC),
        batteryCompartment: celsiusToKelvin(batteryCompartmentTempC),
        outside: celsiusToKelvin(outsideTempC),
      },
    },
    electrical: {
      battery: {
        voltage: randomVariation(12.4, 0.2),
        current: motorRunning ? randomVariation(-45, 5) : randomVariation(-2, 1),
        temperature: celsiusToKelvin(batteryTempC),
        stateOfCharge: randomVariation(75, 3),
      },
    },
    propulsion: {
      motor: {
        state: motorRunning ? 'running' : 'stopped',
        temperature: celsiusToKelvin(motorTempC),
        throttle: throttle,
      },
    },
  };
}

module.exports = {
  async activate(pluginApi) {
    api = pluginApi;
    api.log('Demo driver activating...');

    // Load saved demo navigation state
    const savedNav = await api.getSetting('demoNavigation');
    if (savedNav) {
      if (savedNav.latitude !== undefined) demoPosition.latitude = savedNav.latitude;
      if (savedNav.longitude !== undefined) demoPosition.longitude = savedNav.longitude;
      if (savedNav.heading !== undefined) demoHeading = savedNav.heading;
      if (savedNav.speed !== undefined) demoSpeed = savedNav.speed;
    }

    // Generate and push data at 1Hz
    api.setInterval(() => {
      const data = generateSensorData();
      api.pushSensorDataPacket(data);
    }, 1000);

    api.log('Demo driver active - generating data at 1Hz');
  },

  async deactivate() {
    if (api) {
      api.log('Demo driver deactivating...');
      // Save current navigation state
      await api.setSetting('demoNavigation', {
        latitude: demoPosition.latitude,
        longitude: demoPosition.longitude,
        heading: demoHeading,
        speed: demoSpeed,
      });
    }
    api = null;
  },

  // ================================================================
  // Demo-specific methods (called by the server for demo mode control)
  // ================================================================

  setDemoNavigation(data) {
    if (data.latitude !== undefined) demoPosition.latitude = data.latitude;
    if (data.longitude !== undefined) demoPosition.longitude = data.longitude;
    if (data.heading !== undefined) demoHeading = data.heading;
    if (data.speed !== undefined) demoSpeed = data.speed;
    demoPosition.timestamp = new Date();
  },

  getDemoNavigation() {
    return {
      latitude: demoPosition.latitude,
      longitude: demoPosition.longitude,
      heading: demoHeading,
      speed: demoSpeed,
    };
  },

  getCurrentPosition() {
    return {
      lat: demoPosition.latitude,
      lon: demoPosition.longitude,
    };
  },
};
