/**
 * Alert system type definitions for client
 *
 * Note: Unit conversion is now handled on the server.
 * Thresholds in AlertDefinition are in USER'S display units.
 * The server converts to/from standard units internally.
 */

// Sound options for alerts (matches ALERT_SOUNDS keys in audio.ts)
export type AlertTone =
  | 'none'
  | 'beep'
  | 'notification'
  | 'alarm'
  | 'chime'
  | 'warning'
  | 'sonar'
  | 'bell'
  | 'siren'
  | 'gentle'
  | 'urgent'
  | 'foghorn'
  | 'triple'
  | 'ascending'
  | 'ding';

// Human-readable labels for tones
export const TONE_LABELS: Record<AlertTone, string> = {
  none: 'None',
  beep: 'Beep',
  notification: 'Notification',
  alarm: 'Alarm',
  chime: 'Chime',
  warning: 'Warning',
  sonar: 'Sonar Ping',
  bell: 'Ship Bell',
  siren: 'Siren',
  gentle: 'Gentle',
  urgent: 'Urgent Beeps',
  foghorn: 'Foghorn',
  triple: 'Triple Beep',
  ascending: 'Ascending',
  ding: 'Soft Ding',
};

// Visual severity levels
export type AlertSeverity = 'info' | 'warning' | 'critical';

// All available data sources for alert conditions
export type AlertDataSource =
  // Sensor - measured from boat instruments
  | 'wind_speed'
  | 'speed_over_ground'
  | 'depth'
  | 'battery_voltage'
  | 'battery_soc'
  // Weather service - current conditions
  | 'wind_gusts'
  | 'wave_height'
  | 'temperature_air'
  | 'temperature_water'
  // Weather service - forecast
  | 'wind_forecast'
  | 'wave_forecast';

// Comparison operators for alert conditions
export type AlertOperator =
  | 'greater_than'
  | 'greater_or_equal'
  | 'less_than'
  | 'less_or_equal'
  | 'equals'
  | 'not_equals';

// Human-readable labels for data sources
export const DATA_SOURCE_LABELS: Record<AlertDataSource, string> = {
  // Sensor data (measured)
  wind_speed: 'Wind Speed (Sensor)',
  speed_over_ground: 'Speed Over Ground (Sensor)',
  depth: 'Depth (Sensor)',
  battery_voltage: 'Battery Voltage (Sensor)',
  battery_soc: 'Battery SOC (Sensor)',
  // Weather service - current
  wind_gusts: 'Wind Gusts (Weather)',
  wave_height: 'Wave Height (Weather)',
  temperature_air: 'Air Temperature (Weather)',
  temperature_water: 'Water Temperature (Weather)',
  // Weather service - forecast
  wind_forecast: 'Wind Forecast (Weather)',
  wave_forecast: 'Wave Forecast (Weather)',
};

// Unit category for each data source (used to determine unit label)
export type UnitCategory = 'wind' | 'speed' | 'depth' | 'temperature' | 'fixed';

export const DATA_SOURCE_UNIT_CATEGORY: Record<AlertDataSource, UnitCategory> = {
  wind_speed: 'wind',
  wind_gusts: 'wind',
  wind_forecast: 'wind',
  speed_over_ground: 'speed',
  depth: 'depth',
  wave_height: 'depth',
  wave_forecast: 'depth',
  temperature_air: 'temperature',
  temperature_water: 'temperature',
  battery_voltage: 'fixed',
  battery_soc: 'fixed',
};

// Fixed units (not affected by user preferences)
export const FIXED_UNITS: Partial<Record<AlertDataSource, string>> = {
  battery_voltage: 'V',
  battery_soc: '%',
};

// Default units for each data source (used as fallback)
export const DATA_SOURCE_UNITS: Record<AlertDataSource, string> = {
  wind_speed: 'kt',
  wind_gusts: 'kt',
  wave_height: 'm',
  temperature_air: '°C',
  temperature_water: '°C',
  wind_forecast: 'kt',
  wave_forecast: 'm',
  speed_over_ground: 'kt',
  depth: 'm',
  battery_voltage: 'V',
  battery_soc: '%',
};

/**
 * Get unit label for a data source based on user's unit preferences
 */
export const getUnitForDataSource = (
  dataSource: AlertDataSource,
  windUnit: string,
  speedUnit: string,
  depthUnit: string,
  temperatureUnit: string
): string => {
  const category = DATA_SOURCE_UNIT_CATEGORY[dataSource];
  switch (category) {
    case 'wind':
      return windUnit;
    case 'speed':
      return speedUnit;
    case 'depth':
      return depthUnit;
    case 'temperature':
      return temperatureUnit;
    case 'fixed':
      return FIXED_UNITS[dataSource] ?? '';
    default:
      return DATA_SOURCE_UNITS[dataSource];
  }
};

// All available operators
const ALL_OPERATORS: AlertOperator[] = [
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'equals',
  'not_equals',
];

// Which operators are valid for each data source (all get the same operators)
export const DATA_SOURCE_OPERATORS: Record<AlertDataSource, AlertOperator[]> = {
  wind_speed: ALL_OPERATORS,
  wind_gusts: ALL_OPERATORS,
  wave_height: ALL_OPERATORS,
  temperature_air: ALL_OPERATORS,
  temperature_water: ALL_OPERATORS,
  wind_forecast: ALL_OPERATORS,
  wave_forecast: ALL_OPERATORS,
  speed_over_ground: ALL_OPERATORS,
  depth: ALL_OPERATORS,
  battery_voltage: ALL_OPERATORS,
  battery_soc: ALL_OPERATORS,
};

// Symbol labels for operators (used in messages)
export const OPERATOR_LABELS: Record<AlertOperator, string> = {
  greater_than: '>',
  greater_or_equal: '>=',
  less_than: '<',
  less_or_equal: '<=',
  equals: '=',
  not_equals: '!=',
};

// Spoken labels for operators (used in dropdowns)
export const OPERATOR_SPOKEN_LABELS: Record<AlertOperator, string> = {
  greater_than: '> (greater than)',
  greater_or_equal: '>= (greater or equal)',
  less_than: '< (less than)',
  less_or_equal: '<= (less or equal)',
  equals: '= (equals)',
  not_equals: '!= (not equals)',
};

// i18n-aware getter functions
// These accept a translation function t(key) and return translated labels

export const getDataSourceLabel = (source: AlertDataSource, t: (key: string) => string): string => {
  const KEY_MAP: Record<AlertDataSource, string> = {
    wind_speed: 'alert.ds.wind_speed',
    speed_over_ground: 'alert.ds.speed_over_ground',
    depth: 'alert.ds.depth',
    battery_voltage: 'alert.ds.battery_voltage',
    battery_soc: 'alert.ds.battery_soc',
    wind_gusts: 'alert.ds.wind_gusts',
    wave_height: 'alert.ds.wave_height',
    temperature_air: 'alert.ds.temperature_air',
    temperature_water: 'alert.ds.temperature_water',
    wind_forecast: 'alert.ds.wind_forecast',
    wave_forecast: 'alert.ds.wave_forecast',
  };
  return t(KEY_MAP[source]);
};

export const getToneLabel = (tone: AlertTone, t: (key: string) => string): string => {
  const KEY_MAP: Record<AlertTone, string> = {
    none: 'alert.tone.none',
    beep: 'alert.tone.beep',
    notification: 'alert.tone.notification',
    alarm: 'alert.tone.alarm',
    chime: 'alert.tone.chime',
    warning: 'alert.tone.warning',
    sonar: 'alert.tone.sonar',
    bell: 'alert.tone.bell',
    siren: 'alert.tone.siren',
    gentle: 'alert.tone.gentle',
    urgent: 'alert.tone.urgent',
    foghorn: 'alert.tone.foghorn',
    triple: 'alert.tone.triple',
    ascending: 'alert.tone.ascending',
    ding: 'alert.tone.ding',
  };
  return t(KEY_MAP[tone]);
};

export const getOperatorSpokenLabel = (op: AlertOperator, t: (key: string) => string): string => {
  const KEY_MAP: Record<AlertOperator, string> = {
    greater_than: 'alert.op.greater_than',
    greater_or_equal: 'alert.op.greater_or_equal',
    less_than: 'alert.op.less_than',
    less_or_equal: 'alert.op.less_or_equal',
    equals: 'alert.op.equals',
    not_equals: 'alert.op.not_equals',
  };
  return t(KEY_MAP[op]);
};

export const getSeverityLabel = (severity: AlertSeverity, t: (key: string) => string): string => {
  const KEY_MAP: Record<AlertSeverity, string> = {
    info: 'alert.severity.info',
    warning: 'alert.severity.warning',
    critical: 'alert.severity.critical',
  };
  return t(KEY_MAP[severity]);
};

// Weather data sources (all support forecast hours)
export const WEATHER_DATA_SOURCES: AlertDataSource[] = [
  'wind_gusts',
  'wave_height',
  'temperature_air',
  'temperature_water',
  'wind_forecast',
  'wave_forecast',
];

// Check if a data source is weather-based (supports forecast hours)
export const isWeatherDataSource = (source: AlertDataSource): boolean => {
  return WEATHER_DATA_SOURCES.includes(source);
};

/**
 * Alert definition
 * Threshold is in USER'S display units (server converts to standard internally)
 */
export interface AlertDefinition {
  id: string;
  name: string;
  enabled: boolean;
  dataSource: AlertDataSource;
  operator: AlertOperator;
  threshold: number; // User's display units
  forecastHours?: number; // For forecast-based alerts
  snoozeDurationMinutes: number;
  severity: AlertSeverity;
  tone: AlertTone;
  message: string; // Supports {value}, {threshold}, {condition} placeholders
  isPremade: boolean;
  premadeId?: string; // Identifier for premade alerts (for reset)
}

/**
 * Triggered alert (received from server)
 * All values are already in user's display units
 */
export interface TriggeredAlert {
  alertId: string;
  alertName?: string;
  triggeredAt: Date;
  currentValue?: number; // Display units
  threshold?: number; // Display units
  message: string; // Already resolved with display units
  severity?: AlertSeverity;
  tone?: AlertTone;
  snoozedUntil?: Date;
}

// Alert settings stored in SettingsContext
export interface AlertSettings {
  globalEnabled: boolean;
  alerts: AlertDefinition[];
}

// Default snooze duration options (in minutes)
export const SNOOZE_OPTIONS = [5, 15, 30, 60] as const;

// Generate unique ID for new alerts
export const generateAlertId = (): string => {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Premade alert templates (thresholds in display units - knots, meters)
export const PREMADE_ALERTS: Omit<AlertDefinition, 'id'>[] = [
  {
    name: 'Wind Alert',
    enabled: true,
    dataSource: 'wind_forecast',
    operator: 'greater_than',
    threshold: 20, // knots
    forecastHours: 1,
    snoozeDurationMinutes: 30,
    severity: 'warning',
    tone: 'notification',
    message: 'Wind forecast {condition} {threshold} (max: {value} in next hour)',
    isPremade: true,
    premadeId: 'wind_alert_20kt_1h',
  },
  {
    name: 'High Wind Warning',
    enabled: true,
    dataSource: 'wind_forecast',
    operator: 'greater_than',
    threshold: 30, // knots
    forecastHours: 3,
    snoozeDurationMinutes: 60,
    severity: 'critical',
    tone: 'alarm',
    message: 'Strong winds ({value}) forecast in next 3 hours',
    isPremade: true,
    premadeId: 'wind_alert_30kt_3h',
  },
  {
    name: 'Low Battery',
    enabled: true,
    dataSource: 'battery_voltage',
    operator: 'less_than',
    threshold: 12.0, // Volts
    snoozeDurationMinutes: 15,
    severity: 'critical',
    tone: 'alarm',
    message: 'Battery voltage low: {value}',
    isPremade: true,
    premadeId: 'low_battery_12v',
  },
  {
    name: 'High Wave Alert',
    enabled: true,
    dataSource: 'wave_forecast',
    operator: 'greater_than',
    threshold: 2.0, // meters
    forecastHours: 3,
    snoozeDurationMinutes: 30,
    severity: 'warning',
    tone: 'notification',
    message: 'Waves forecast {condition} {threshold} (max: {value} in next 3 hours)',
    isPremade: true,
    premadeId: 'wave_alert_2m_3h',
  },
];

// Initialize premade alerts with generated IDs
export const initializePremadeAlerts = (): AlertDefinition[] => {
  return PREMADE_ALERTS.map((alert) => ({
    ...alert,
    id: `premade_${alert.premadeId}`,
  }));
};

// Default alert settings
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  globalEnabled: true,
  alerts: initializePremadeAlerts(),
};

// Resolve message placeholders with actual values (kept for UI preview)
export const resolveAlertMessage = (
  message: string,
  value: number,
  threshold: number,
  operator?: AlertOperator,
  unit?: string
): string => {
  const unitStr = unit ?? '';
  return message
    .replace('{value}', `${value.toFixed(1)}${unitStr}`)
    .replace('{threshold}', `${threshold.toFixed(1)}${unitStr}`)
    .replace('{condition}', operator ? OPERATOR_LABELS[operator] : '');
};

// Get severity color for UI
export const getSeverityColor = (severity: AlertSeverity): string => {
  switch (severity) {
    case 'info':
      return '#4fc3f7';
    case 'warning':
      return '#ffa726';
    case 'critical':
      return '#ef5350';
  }
};
