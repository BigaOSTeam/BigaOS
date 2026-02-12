/**
 * NMEA 2000 PGN Handlers
 *
 * Routes parsed PGN messages to BigaOS sensor streams.
 * All values pass through with zero unit conversion because
 * canboatjs outputs radians/m/s/K/Pa and BigaOS uses the same units internally.
 *
 * Supports 15 PGNs producing 25 data streams.
 */

// Rate limiting: minimum milliseconds between pushes per stream
const RATE_LIMITS = {
  gps: 200,               // 5Hz nav
  cog: 200,
  sog: 200,
  heading_magnetic: 200,
  heading_true: 200,
  stw: 500,               // 2Hz
  depth: 500,
  wind_speed_apparent: 500,
  wind_angle_apparent: 500,
  wind_speed_true: 500,
  wind_angle_true: 500,
  roll: 200,
  pitch: 200,
  yaw: 200,
  rudder: 500,
  battery_0_voltage: 1000,  // 1Hz
  battery_0_current: 1000,
  battery_0_temp: 1000,
  battery_0_soc: 1000,
  engine_0_rpm: 500,
  engine_0_temp: 1000,
  water_temp: 1000,
  pressure: 1000,
  humidity: 1000,
  fuel_level: 1000,
};

class PGNHandlers {
  constructor(api, options = {}) {
    this.api = api;
    this.lastPush = {};  // streamId -> timestamp
    this.pgnFilter = null;

    // Parse PGN whitelist filter
    if (options.pgnFilter && options.pgnFilter.trim()) {
      this.pgnFilter = new Set(
        options.pgnFilter.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      );
    }
  }

  /**
   * Handle a parsed PGN message from canboatjs.
   * @param {object} parsed - canboatjs parsed message with { pgn, fields, src, ... }
   */
  handle(parsed) {
    if (!parsed || !parsed.fields) return;
    if (this.pgnFilter && !this.pgnFilter.has(parsed.pgn)) return;

    switch (parsed.pgn) {
      case 129025: return this._handlePositionRapid(parsed.fields);
      case 129026: return this._handleCogSog(parsed.fields);
      case 127250: return this._handleHeading(parsed.fields);
      case 128259: return this._handleSpeedThroughWater(parsed.fields);
      case 128267: return this._handleWaterDepth(parsed.fields);
      case 130306: return this._handleWindData(parsed.fields);
      case 127257: return this._handleAttitude(parsed.fields);
      case 127245: return this._handleRudder(parsed.fields);
      case 127508: return this._handleBatteryStatus(parsed.fields, parsed.src);
      case 127488: return this._handleEngineRapid(parsed.fields);
      case 127489: return this._handleEngineDynamic(parsed.fields);
      case 130310: return this._handleEnvironmentalParams(parsed.fields);
      case 130311: return this._handleEnvironmentalParams2(parsed.fields);
      case 127505: return this._handleFluidLevel(parsed.fields);
    }
  }

  // PGN 129025 - Position, Rapid Update
  _handlePositionRapid(fields) {
    const lat = fields.Latitude;
    const lon = fields.Longitude;
    if (lat == null || lon == null) return;
    // canboatjs returns lat/lon in decimal degrees (geographic standard)
    this._push('gps', { latitude: lat, longitude: lon, timestamp: new Date() });
  }

  // PGN 129026 - COG & SOG, Rapid Update
  _handleCogSog(fields) {
    const cog = fields['COG'];
    const sog = fields['SOG'];
    if (cog != null) this._push('cog', cog);       // radians
    if (sog != null) this._push('sog', sog);       // m/s
  }

  // PGN 127250 - Vessel Heading
  _handleHeading(fields) {
    const heading = fields.Heading;
    const ref = fields.Reference;
    if (heading == null) return;

    if (ref === 'Magnetic') {
      this._push('heading_magnetic', heading);      // radians
    } else if (ref === 'True') {
      this._push('heading_true', heading);          // radians
    } else {
      // Unknown reference, push as magnetic by default
      this._push('heading_magnetic', heading);
    }
  }

  // PGN 128259 - Speed, Water Referenced
  _handleSpeedThroughWater(fields) {
    const stw = fields['Speed Water Referenced'];
    if (stw != null) this._push('stw', stw);        // m/s
  }

  // PGN 128267 - Water Depth
  _handleWaterDepth(fields) {
    const depth = fields.Depth;
    const offset = fields.Offset || 0;
    if (depth != null) this._push('depth', depth + offset);  // meters
  }

  // PGN 130306 - Wind Data
  _handleWindData(fields) {
    const speed = fields['Wind Speed'];
    const angle = fields['Wind Angle'];
    const ref = fields.Reference;

    if (speed == null && angle == null) return;

    if (ref === 'Apparent') {
      if (speed != null) this._push('wind_speed_apparent', speed);   // m/s
      if (angle != null) this._push('wind_angle_apparent', angle);   // radians
    } else if (ref === 'True (boat referenced)' || ref === 'True (ground referenced to North)') {
      if (speed != null) this._push('wind_speed_true', speed);
      if (angle != null) this._push('wind_angle_true', angle);
    }
  }

  // PGN 127257 - Attitude
  _handleAttitude(fields) {
    const roll = fields.Roll;
    const pitch = fields.Pitch;
    const yaw = fields.Yaw;
    if (roll != null) this._push('roll', roll);      // radians
    if (pitch != null) this._push('pitch', pitch);   // radians
    if (yaw != null) this._push('yaw', yaw);         // radians
  }

  // PGN 127245 - Rudder
  _handleRudder(fields) {
    const position = fields.Position;
    if (position != null) this._push('rudder', position);  // radians
  }

  // PGN 127508 - Battery Status
  _handleBatteryStatus(fields, src) {
    const instance = fields['Battery Instance'] || 0;
    const prefix = `battery_${instance}`;

    const voltage = fields.Voltage;
    const current = fields.Current;
    const temp = fields.Temperature;
    const soc = fields['State of Charge'];

    if (voltage != null) this._push(`${prefix}_voltage`, voltage);   // Volts
    if (current != null) this._push(`${prefix}_current`, current);   // Amps
    if (temp != null) this._push(`${prefix}_temp`, temp);            // Kelvin
    if (soc != null) this._push(`${prefix}_soc`, soc);              // Percentage
  }

  // PGN 127488 - Engine Parameters, Rapid Update
  _handleEngineRapid(fields) {
    const instance = fields['Engine Instance'] || 0;
    const rpm = fields['Engine Speed'];
    if (rpm != null) this._push(`engine_${instance}_rpm`, rpm);  // RPM (direct)
  }

  // PGN 127489 - Engine Parameters, Dynamic
  _handleEngineDynamic(fields) {
    const instance = fields['Engine Instance'] || 0;
    const temp = fields['Engine Coolant Temperature'];
    if (temp != null) this._push(`engine_${instance}_temp`, temp);  // Kelvin
  }

  // PGN 130310 - Environmental Parameters (outside)
  _handleEnvironmentalParams(fields) {
    const waterTemp = fields['Water Temperature'];
    const pressure = fields['Atmospheric Pressure'];
    if (waterTemp != null) this._push('water_temp', waterTemp);     // Kelvin
    if (pressure != null) this._push('pressure', pressure);         // Pascal
  }

  // PGN 130311 - Environmental Parameters (humidity)
  _handleEnvironmentalParams2(fields) {
    const humidity = fields.Humidity;
    const waterTemp = fields['Water Temperature'];
    const pressure = fields.Pressure;
    if (humidity != null) this._push('humidity', humidity);         // Percentage
    if (waterTemp != null) this._push('water_temp', waterTemp);    // Kelvin
    if (pressure != null) this._push('pressure', pressure);        // Pascal
  }

  // PGN 127505 - Fluid Level
  _handleFluidLevel(fields) {
    const type = fields['Fluid Type'];
    const level = fields.Level;
    if (level == null) return;

    switch (type) {
      case 'Fuel':
        this._push('fuel_level', level);
        break;
      case 'Water':
        this._push('freshwater_level', level);
        break;
      case 'Gray water':
      case 'Black water':
        this._push('waste_level', level);
        break;
    }
  }

  /**
   * Push a value to a stream, respecting rate limits.
   */
  _push(streamId, value) {
    const now = Date.now();
    const limit = RATE_LIMITS[streamId] || 1000;
    const last = this.lastPush[streamId] || 0;

    if (now - last < limit) return;

    this.lastPush[streamId] = now;
    this.api.pushSensorValue(streamId, value);
  }
}

module.exports = { PGNHandlers };
