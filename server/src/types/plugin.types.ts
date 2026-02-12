/**
 * Plugin System Type Definitions
 *
 * Defines all interfaces for BigaOS plugin system:
 * - Plugin manifests and registry
 * - Sensor slot types and mappings
 * - Plugin lifecycle and capabilities
 */

// ============================================================================
// Plugin Manifest Types
// ============================================================================

export type PluginType = 'driver' | 'ui-extension' | 'service' | 'integration';

export type PluginFlag = 'official' | 'community';

export type PluginCapability =
  | 'sensor-data'   // Can push data into DataController
  | 'settings'      // Can read/write plugin-namespaced settings
  | 'events'        // Can listen to system events
  | 'alerts'        // Can create plugin-generated alerts
  | 'network';      // Needs network access (serial, TCP, UDP)

export interface PluginManifest {
  // Required fields
  id: string;                         // Unique identifier, e.g. "bigaos-nmea2000"
  name: string;                       // Human-readable name
  version: string;                    // Semver, e.g. "1.0.0"
  description: string;                // Short description
  author: string;                     // Author name or org
  type: PluginType;                   // Plugin category
  main: string;                       // Entry point relative to plugin root, e.g. "index.js"
  capabilities: PluginCapability[];   // Required system capabilities

  // Optional fields
  icon?: string;                      // Icon filename (SVG preferred), relative to plugin root
  license?: string;                   // SPDX license identifier
  homepage?: string;                  // URL to documentation
  repository?: string;                // URL to source code
  flag?: PluginFlag;                  // Official or community
  builtin?: boolean;                  // Cannot be uninstalled if true
  minBigaOSVersion?: string;          // Minimum compatible BigaOS version

  // Driver-specific
  driver?: {
    protocol: string;                 // e.g. "nmea2000", "signalk", "serial", "demo"
    dataStreams: DataStreamDeclaration[];
    configSchema?: ConfigField[];     // User-configurable options
  };

  // Client-side dashboard items this plugin provides
  dashboardItems?: DashboardItemDeclaration[];

  // i18n support
  i18n?: {
    languages: string[];              // e.g. ["en", "de"]
    directory: string;                // Relative path to i18n files, e.g. "i18n/"
  };
}

// ============================================================================
// Data Stream & Sensor Slot Types
// ============================================================================

/**
 * All possible sensor "slots" in the system.
 * Built-in slots map to StandardSensorData fields.
 * Plugins can also declare custom slot types via string.
 */
export type SensorSlotType =
  // Navigation
  | 'position'              // { latitude: number, longitude: number }
  | 'speed_over_ground'     // number (m/s)
  | 'course_over_ground'    // number (radians)
  | 'heading_magnetic'      // number (radians)
  | 'heading_true'          // number (radians)
  | 'attitude'              // { roll, pitch, yaw }
  // Environment
  | 'depth'                 // number (meters)
  | 'wind_apparent'         // { speed: number, angle: number } (m/s, radians)
  | 'wind_true'             // { speed: number, angle: number } (m/s, radians)
  | 'temperature_engine'    // number (Kelvin)
  | 'temperature_cabin'     // number (Kelvin)
  | 'temperature_outside'   // number (Kelvin)
  | 'temperature_battery'   // number (Kelvin)
  // Electrical
  | 'battery_voltage'       // number (Volts)
  | 'battery_current'       // number (Amps)
  | 'battery_soc'           // number (Percentage 0-100)
  | 'battery_temperature'   // number (Kelvin)
  // Propulsion
  | 'motor_state'           // 'running' | 'stopped'
  | 'motor_temperature'     // number (Kelvin)
  | 'motor_throttle'        // number (Percentage 0-100)
  // Custom (plugins can use any string)
  | string;

/**
 * Declaration of a data stream that a driver plugin can provide.
 */
export interface DataStreamDeclaration {
  id: string;                         // e.g. "gps_position", "wind_apparent"
  name: string;                       // Human-readable: "GPS Position"
  dataType: SensorSlotType;           // What kind of data this produces
  unit: string;                       // Unit of output data (e.g., "degrees", "m/s")
  updateRate?: number;                // Expected Hz (for UI display)
  description?: string;               // What this stream provides
}

/**
 * Configuration field schema for plugin settings UI.
 */
export interface ConfigField {
  key: string;                        // Setting key
  label: string;                      // Display label
  type: 'string' | 'number' | 'boolean' | 'select' | 'port';
  default: any;                       // Default value
  description?: string;               // Help text
  options?: { value: string; label: string }[];  // For 'select' type
  required?: boolean;
}

/**
 * Declaration of a dashboard item that a plugin provides.
 */
export interface DashboardItemDeclaration {
  id: string;                         // Unique within the plugin, e.g. "fuel-gauge"
  name: string;                       // Human-readable: "Fuel Gauge"
  description?: string;               // What this widget shows
  defaultSize: { w: number; h: number };
  clientBundle?: string;              // Relative path to pre-built React component JS
  dataNeeds?: string[];               // Sensor slot types this widget needs
}

// ============================================================================
// Sensor Mapping Types
// ============================================================================

/**
 * A mapping from a plugin's data stream to an internal sensor slot.
 */
export interface SensorMapping {
  slotType: SensorSlotType;           // The internal sensor slot
  pluginId: string;                   // Which plugin provides this
  streamId: string;                   // Which stream in that plugin
  priority: number;                   // Higher priority wins if multiple sources
  active: boolean;                    // Whether this mapping is currently active
  lastValue?: any;                    // Last received value (not persisted)
  lastUpdate?: string;                // ISO timestamp of last update (not persisted)
}

/**
 * Serializable version of SensorMapping for persistence.
 */
export interface SensorMappingConfig {
  slotType: SensorSlotType;
  pluginId: string;
  streamId: string;
  priority: number;
  active: boolean;
}

// ============================================================================
// Plugin Registry Types (GitHub-hosted)
// ============================================================================

export interface RegistryVersion {
  version: string;
  downloadUrl: string;                // GitHub raw URL to tarball
  releaseDate: string;                // ISO date
  changelog?: string;                 // Brief changelog
  minBigaOSVersion?: string;
}

export interface RegistryEntry {
  id: string;                         // Must match plugin.json id
  name: string;
  description: string;
  author: string;
  type: PluginType;
  flag: PluginFlag;
  latestVersion: string;
  minBigaOSVersion?: string;
  icon?: string;                      // URL to icon
  capabilities: PluginCapability[];
  downloadUrl: string;                // URL to latest tarball
  repository?: string;                // Link to plugin source
  versions: RegistryVersion[];
}

export interface PluginRegistry {
  schemaVersion: number;              // Registry format version (start at 1)
  updatedAt: string;                  // ISO date
  plugins: RegistryEntry[];
}

// ============================================================================
// Plugin Instance Types
// ============================================================================

export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error' | 'loading';

export interface PluginInfo {
  id: string;
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  enabledByUser: boolean;
  installedVersion: string;
}

/**
 * The interface that plugin entry points must export.
 */
export interface BigaOSPlugin {
  activate(api: any): Promise<void>;
  deactivate(): Promise<void>;
}

// ============================================================================
// Plugin Sensor Data Events
// ============================================================================

export interface PluginSensorValueEvent {
  pluginId: string;
  streamId: string;
  dataType: SensorSlotType;
  value: any;
  timestamp: Date;
}

export interface PluginSensorPacketEvent {
  pluginId: string;
  data: any;  // StandardSensorData
  timestamp: Date;
}
