/**
 * BigaOS Demo Driver Plugin
 *
 * Built-in plugin that generates random sensor data for testing
 * and development. Pushes individual sensor values via the plugin API
 * so they can be mapped to any sensor slot in the Data Sources tab.
 * Also pushes a complete StandardSensorData packet for backward
 * compatibility with the existing dashboard.
 */

const KNOTS_TO_MS = 0.514444;
const CELSIUS_TO_KELVIN = 273.15;
const DEG_TO_RAD = Math.PI / 180;

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

function degToRad(deg) {
  return deg * DEG_TO_RAD;
}

// ============================================================================
// Demo Driver Plugin
// ============================================================================

let api = null;
let demoSpeed = 0;      // knots (from client)
let demoHeading = 0;    // radians (from client)
let demoPosition = {
  latitude: 43.45,      // Adriatic Sea, west of Split
  longitude: 16.2,
  timestamp: new Date(),
};

function pushAllStreams() {
  const speedKnots = demoSpeed;
  const heading = demoHeading;
  const position = demoPosition;
  const motorRunning = speedKnots > 0;

  // Core streams (angles in radians)
  api.pushSensorValue('gps', { ...position, timestamp: new Date() });
  api.pushSensorValue('heading_true', heading);
  api.pushSensorValue('depth', randomVariation(8.5, 1.2));
  api.pushSensorValue('stw', knotsToMs(randomVariation(speedKnots * 0.9, 0.3)));
  api.pushSensorValue('roll', degToRad(speedKnots > 5 ? randomVariation(speedKnots * 2, 2) : randomVariation(2, 1)));

  // Electrical
  const voltage = randomVariation(12.4, 0.2);
  const current = motorRunning ? randomVariation(-45, 5) : randomVariation(-2, 1);
  api.pushSensorValue('voltage', voltage);
  api.pushSensorValue('current', current);
  api.pushSensorValue('soc', randomVariation(75, 3));
  api.pushSensorValue('power', voltage * current);
  api.pushSensorValue('time_remaining', motorRunning ? randomVariation(7200, 600) : randomVariation(14400, 1200));

  // Wind
  api.pushSensorValue('wind_speed', knotsToMs(randomVariation(8, 2)));
  api.pushSensorValue('wind_angle', degToRad(randomVariation(45, 10)));

  // Temperatures
  api.pushSensorValue('temperature', randomVariation(22, 1));
  api.pushSensorValue('water_temp', randomVariation(18, 2));

  // Weather
  api.pushSensorValue('pressure', randomVariation(1013, 3));
  api.pushSensorValue('humidity', randomVariation(65, 5));

  // Engine
  api.pushSensorValue('fuel_level', randomVariation(60, 1));
  api.pushSensorValue('rpm', motorRunning ? randomVariation(2200, 100) : 0);

  // Steering
  api.pushSensorValue('rudder', degToRad(randomVariation(0, 5)));

  // Tanks
  api.pushSensorValue('tank_fresh', randomVariation(70, 1));
  api.pushSensorValue('tank_waste', randomVariation(30, 1));

  // Simulated raw analog tank inputs (uncalibrated voltages).
  // Each channel drifts on a different sine period so the calibration wizard
  // visibly moves while you capture points. Range ~0.4–3.0 V — typical for a
  // 3.3 V supply through a divider with a 0–190 Ω resistive sender.
  const now = Date.now() / 1000;
  const drift = (period, phase, baseV, ampV) =>
    baseV + Math.sin((now / period) + phase) * ampV + (Math.random() - 0.5) * 0.01;
  api.pushSensorValue('tank_input_0', drift(120, 0.0, 1.7, 1.3));
  api.pushSensorValue('tank_input_1', drift(180, 1.5, 1.7, 1.0));
  api.pushSensorValue('tank_input_2', drift(90,  3.0, 1.5, 0.8));
  api.pushSensorValue('tank_input_3', drift(240, 4.5, 2.0, 0.6));

  // Anchor chain
  api.pushSensorValue('chain_counter', randomVariation(25, 0.5));
}

function generateLegacyPacket() {
  const speedKnots = demoSpeed;
  const heading = demoHeading;
  const position = demoPosition;
  const motorRunning = speedKnots > 0;
  const heelAngle = speedKnots > 5 ? randomVariation(speedKnots * 2, 2) : randomVariation(2, 1);
  const windSpeedKnots = randomVariation(8, 2);

  return {
    timestamp: new Date().toISOString(),
    navigation: {
      position: { ...position, timestamp: new Date() },
      courseOverGround: heading,
      speedOverGround: knotsToMs(speedKnots),
      heading: heading,
      attitude: {
        roll: degToRad(heelAngle),
        pitch: degToRad(randomVariation(2, 1)),
        yaw: heading,
      },
    },
    environment: {
      depth: {
        belowTransducer: randomVariation(8.5, 1.2),
      },
      wind: {
        speedApparent: knotsToMs(windSpeedKnots),
        angleApparent: degToRad(randomVariation(45, 10)),
        speedTrue: knotsToMs(randomVariation(windSpeedKnots - 1, 1)),
        angleTrue: degToRad(randomVariation(50, 10)),
      },
      temperature: {
        engineRoom: celsiusToKelvin(randomVariation(motorRunning ? 35 : 28, 2)),
        cabin: celsiusToKelvin(randomVariation(22, 1)),
        batteryCompartment: celsiusToKelvin(randomVariation(24, 2)),
        outside: celsiusToKelvin(randomVariation(18, 2)),
      },
    },
    electrical: {
      battery: {
        voltage: randomVariation(12.4, 0.2),
        current: motorRunning ? randomVariation(-45, 5) : randomVariation(-2, 1),
        temperature: celsiusToKelvin(randomVariation(24, 1)),
        stateOfCharge: randomVariation(75, 3),
        timeRemaining: motorRunning ? randomVariation(7200, 600) : randomVariation(14400, 1200),
        power: randomVariation(12.4, 0.2) * (motorRunning ? randomVariation(-45, 5) : randomVariation(-2, 1)),
      },
    },
    propulsion: {
      motor: {
        state: motorRunning ? 'running' : 'stopped',
        temperature: celsiusToKelvin(motorRunning ? randomVariation(40, 3) : randomVariation(25, 2)),
        throttle: speedKnots > 0 ? Math.min(speedKnots * 10, 100) : 0,
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
      pushAllStreams();
      api.pushSensorDataPacket(generateLegacyPacket());
    }, 1000);

    api.log('Demo driver active - generating data at 1Hz');
  },

  async deactivate() {
    if (api) {
      api.log('Demo driver deactivating...');
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
