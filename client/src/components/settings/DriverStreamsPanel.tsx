/**
 * DriverSettingsDialog - Per-driver settings dialog
 *
 * Opens as a full-screen dialog from a settings button on driver plugin cards.
 * Features:
 * - Plugin config fields rendered from configSchema
 * - Data source selection: per-slot dropdowns showing available sources
 * - Sources dynamically detected based on live data flow
 * - Collapsible debug section showing ALL raw data from all interfaces
 */

import React, { useState, useEffect, useCallback } from 'react';
import { theme } from '../../styles/theme';
import {
  PluginInfo,
  SensorMappingInfo,
  DebugDataEntry,
  SlotAvailability,
  SourceInfo,
} from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSettings } from '../../context/SettingsContext';
import { CustomSelect } from '../ui/CustomSelect';

// ============================================================================
// Slot type labels and categories
// ============================================================================

const SLOT_LABELS: Record<string, string> = {
  position: 'GPS Position',
  course_over_ground: 'Course Over Ground',
  speed_over_ground: 'Speed Over Ground',
  heading: 'Heading',
  speed_through_water: 'Speed Through Water',
  depth: 'Depth',
  roll: 'Roll',
  pitch: 'Pitch',
  yaw: 'Yaw',
  rudder_angle: 'Rudder Angle',
  wind_speed_apparent: 'Wind Speed (Apparent)',
  wind_angle_apparent: 'Wind Angle (Apparent)',
  wind_speed_true: 'Wind Speed (True)',
  wind_angle_true: 'Wind Angle (True)',
  voltage: 'Battery Voltage',
  current: 'Battery Current',
  temperature: 'Temperature',
  soc: 'State of Charge',
  rpm: 'Engine RPM',
  water_temperature: 'Water Temperature',
  barometric_pressure: 'Atmospheric Pressure',
  humidity: 'Humidity',
  fuel_level: 'Fuel Level',
};

const SLOT_CATEGORIES: [string, string[]][] = [
  ['Navigation', ['position', 'course_over_ground', 'speed_over_ground', 'heading', 'speed_through_water', 'roll', 'pitch', 'yaw', 'rudder_angle']],
  ['Environment', ['depth', 'wind_speed_apparent', 'wind_angle_apparent', 'wind_speed_true', 'wind_angle_true', 'water_temperature', 'barometric_pressure', 'humidity']],
  ['Electrical', ['voltage', 'current', 'temperature', 'soc']],
  ['Propulsion', ['rpm', 'fuel_level']],
];

const INTERFACE_LABELS: Record<string, string> = {
  nmea2000: 'NMEA 2000',
  nmea0183: 'NMEA 0183',
  imu: 'IMU',
  i2c: 'I\u00B2C',
  demo: 'Demo',
  gps: 'GPS',
  serial: 'Serial',
};

// ============================================================================
// Component
// ============================================================================

interface DriverSettingsDialogProps {
  plugin: PluginInfo;
  sensorMappings: SensorMappingInfo[];
  debugData: DebugDataEntry[];
  sourceAvailability: SlotAvailability[];
  allDriverPlugins: PluginInfo[];
  pluginConfig: Record<string, any>;
  onSetMapping: (slotType: string, pluginId: string, streamId: string) => void;
  onRemoveMapping: (slotType: string, pluginId: string, streamId: string) => void;
  onRefreshMappings: () => void;
  onSetConfig: (key: string, value: any) => void;
  onClose: () => void;
}

export const DriverSettingsDialog: React.FC<DriverSettingsDialogProps> = ({
  plugin,
  sensorMappings,
  debugData,
  sourceAvailability,
  allDriverPlugins,
  pluginConfig,
  onSetMapping,
  onRemoveMapping,
  onRefreshMappings,
  onSetConfig,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const { timeFormat } = useSettings();
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  const configSchema = plugin.manifest.driver?.configSchema || [];

  // Auto-refresh debug data when debug is expanded
  useEffect(() => {
    if (!debugExpanded) return;
    const interval = setInterval(onRefreshMappings, 2000);
    return () => clearInterval(interval);
  }, [debugExpanded, onRefreshMappings]);

  // Auto-refresh source availability every 3 seconds when dialog is open
  useEffect(() => {
    const interval = setInterval(onRefreshMappings, 3000);
    return () => clearInterval(interval);
  }, [onRefreshMappings]);

  // Build a lookup: slotType -> SlotAvailability
  const availabilityBySlot = new Map<string, SlotAvailability>();
  for (const slot of sourceAvailability) {
    availabilityBySlot.set(slot.slotType, slot);
  }

  // Get all slot types that have at least one source
  const availableSlotTypes = new Set(sourceAvailability.map(s => s.slotType));

  // Get the selected source for a slot type
  const getSelectedSource = useCallback((slotType: string): SourceInfo | null => {
    const slot = availabilityBySlot.get(slotType);
    if (!slot) return null;
    return slot.sources.find(s => s.selected) ?? null;
  }, [availabilityBySlot]);

  // Get dropdown value for a slot
  const getDropdownValue = useCallback((slotType: string): string => {
    const selected = getSelectedSource(slotType);
    if (!selected) return 'off';
    return `${selected.pluginId}:${selected.streamId}`;
  }, [getSelectedSource]);

  // Get interface label
  const getInterfaceLabel = (iface: string): string => {
    return INTERFACE_LABELS[iface] || iface || 'Unknown';
  };

  // Build dropdown options for a slot
  const getDropdownOptions = useCallback((slotType: string) => {
    const options: { value: string; label: string }[] = [
      { value: 'off', label: 'Off' },
    ];

    const slot = availabilityBySlot.get(slotType);
    if (!slot) return options;

    for (const source of slot.sources) {
      // Show alive sources + the currently selected source (even if dead)
      if (source.alive || source.selected) {
        const ifaceLabel = getInterfaceLabel(source.interface);
        const label = `${source.pluginName} (${ifaceLabel})`;
        options.push({
          value: `${source.pluginId}:${source.streamId}`,
          label,
        });
      }
    }

    return options;
  }, [availabilityBySlot]);

  // Handle dropdown change for a slot
  const handleSourceChange = useCallback((slotType: string, value: string) => {
    // First, remove any existing active mapping for this slot
    const existingMappings = sensorMappings.filter(m => m.slotType === slotType && m.active);
    for (const mapping of existingMappings) {
      onRemoveMapping(slotType, mapping.pluginId, mapping.streamId);
    }

    // Then set the new mapping (unless "off")
    if (value !== 'off') {
      const [pluginId, streamId] = value.split(':');
      if (pluginId && streamId) {
        onSetMapping(slotType, pluginId, streamId);
      }
    }
  }, [sensorMappings, onRemoveMapping, onSetMapping]);

  // Get status color for a slot
  const getSlotStatusColor = useCallback((slotType: string): string => {
    const selected = getSelectedSource(slotType);
    if (!selected) return theme.colors.textMuted; // off / gray
    if (selected.alive) return '#22c55e'; // green
    return theme.colors.warning; // orange / stale
  }, [getSelectedSource]);

  // Format debug values
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return '---';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number') return value.toFixed(4);
    return String(value);
  };

  // Get interface label for a debug entry from stream meta
  const getDebugInterfaceLabel = (entry: DebugDataEntry): string => {
    // Look up in source availability data
    for (const slot of sourceAvailability) {
      for (const source of slot.sources) {
        if (source.pluginId === entry.pluginId && source.streamId === entry.streamId) {
          return getInterfaceLabel(source.interface);
        }
      }
    }
    return '';
  };

  // Group debug data by plugin
  const debugByPlugin = new Map<string, DebugDataEntry[]>();
  for (const entry of debugData) {
    if (!debugByPlugin.has(entry.pluginId)) {
      debugByPlugin.set(entry.pluginId, []);
    }
    debugByPlugin.get(entry.pluginId)!.push(entry);
  }

  // Get plugin name for debug header
  const getPluginName = (pluginId: string): string => {
    const p = allDriverPlugins.find(dp => dp.id === pluginId);
    return p?.manifest.name ?? pluginId;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: theme.colors.bgOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: theme.zIndex.modal,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.colors.bgSecondary,
          borderRadius: theme.radius.lg,
          padding: theme.space.xl,
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: theme.shadow.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.space.lg,
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: theme.fontSize.lg,
              fontWeight: theme.fontWeight.bold,
              color: theme.colors.textPrimary,
            }}>
              {plugin.manifest.name}
            </h2>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginTop: theme.space.xs,
            }}>
              v{plugin.installedVersion}
            </div>
          </div>
          <button
            onClick={onClose}
            className="touch-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: 'pointer',
              padding: theme.space.sm,
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Data Sources Section */}
        <div style={{
          fontSize: theme.fontSize.sm,
          fontWeight: theme.fontWeight.semibold,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: theme.space.sm,
        }}>
          {t('plugins.data_sources') || 'Data Sources'}
        </div>

        {sourceAvailability.length === 0 ? (
          <div style={{
            padding: theme.space.lg,
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            fontStyle: 'italic',
            textAlign: 'center',
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
          }}>
            {t('plugins.no_streams') || 'No data sources detected'}
          </div>
        ) : (
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            overflow: 'hidden',
          }}>
            {SLOT_CATEGORIES.map(([category, slotTypes]) => {
              // Only show categories that have at least one available slot
              const visibleSlots = slotTypes.filter(st => availableSlotTypes.has(st));
              if (visibleSlots.length === 0) return null;

              return (
                <div key={category}>
                  {/* Category header */}
                  <div style={{
                    padding: `${theme.space.xs} ${theme.space.md}`,
                    background: theme.colors.bgCardActive,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>
                    {category}
                  </div>

                  {/* Slot rows */}
                  {visibleSlots.map((slotType, idx) => {
                    const statusColor = getSlotStatusColor(slotType);
                    const options = getDropdownOptions(slotType);
                    const currentValue = getDropdownValue(slotType);

                    return (
                      <div
                        key={slotType}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: `${theme.space.sm} ${theme.space.md}`,
                          minHeight: '48px',
                          gap: theme.space.md,
                          borderBottom: idx < visibleSlots.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                        }}
                      >
                        {/* Status dot */}
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: statusColor,
                          flexShrink: 0,
                        }} />

                        {/* Slot label */}
                        <div style={{
                          flex: 1,
                          fontSize: theme.fontSize.sm,
                          color: theme.colors.textPrimary,
                          minWidth: 0,
                        }}>
                          {SLOT_LABELS[slotType] || slotType}
                        </div>

                        {/* Source dropdown */}
                        <div style={{ width: '180px', flexShrink: 0 }}>
                          {options.length <= 1 ? (
                            // Only "Off" available — show as disabled text
                            <div style={{
                              fontSize: theme.fontSize.xs,
                              color: theme.colors.textMuted,
                              fontStyle: 'italic',
                              textAlign: 'right',
                              padding: `${theme.space.xs} 0`,
                            }}>
                              Off
                            </div>
                          ) : (
                            <CustomSelect
                              compact
                              value={currentValue}
                              options={options}
                              onChange={(v) => handleSourceChange(slotType, v)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Show any slot types not covered by SLOT_CATEGORIES */}
            {(() => {
              const categorizedSlots = new Set(SLOT_CATEGORIES.flatMap(([, slots]) => slots));
              const uncategorized = [...availableSlotTypes].filter(st => !categorizedSlots.has(st));
              if (uncategorized.length === 0) return null;

              return (
                <div>
                  <div style={{
                    padding: `${theme.space.xs} ${theme.space.md}`,
                    background: theme.colors.bgCardActive,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>
                    Other
                  </div>
                  {uncategorized.map((slotType, idx) => {
                    const statusColor = getSlotStatusColor(slotType);
                    const options = getDropdownOptions(slotType);
                    const currentValue = getDropdownValue(slotType);

                    return (
                      <div
                        key={slotType}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: `${theme.space.sm} ${theme.space.md}`,
                          minHeight: '48px',
                          gap: theme.space.md,
                          borderBottom: idx < uncategorized.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                        }}
                      >
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: statusColor,
                          flexShrink: 0,
                        }} />
                        <div style={{
                          flex: 1,
                          fontSize: theme.fontSize.sm,
                          color: theme.colors.textPrimary,
                          minWidth: 0,
                        }}>
                          {SLOT_LABELS[slotType] || slotType}
                        </div>
                        <div style={{ width: '180px', flexShrink: 0 }}>
                          {options.length <= 1 ? (
                            <div style={{
                              fontSize: theme.fontSize.xs,
                              color: theme.colors.textMuted,
                              fontStyle: 'italic',
                              textAlign: 'right',
                              padding: `${theme.space.xs} 0`,
                            }}>
                              Off
                            </div>
                          ) : (
                            <CustomSelect
                              compact
                              value={currentValue}
                              options={options}
                              onChange={(v) => handleSourceChange(slotType, v)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Debug Section */}
        <div style={{ marginTop: theme.space.lg }}>
          <button
            onClick={() => setDebugExpanded(!debugExpanded)}
            className="touch-btn"
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: `${theme.space.sm} ${theme.space.md}`,
              background: theme.colors.bgCard,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: debugExpanded ? `${theme.radius.md} ${theme.radius.md} 0 0` : theme.radius.md,
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.sm,
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            <span>{t('plugins.debug') || 'Debug'}</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              style={{
                transform: debugExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {debugExpanded && (
            <div style={{
              padding: theme.space.md,
              background: theme.colors.bgCard,
              border: `1px solid ${theme.colors.border}`,
              borderTop: 'none',
              borderRadius: `0 0 ${theme.radius.md} ${theme.radius.md}`,
            }}>
              {debugData.length === 0 ? (
                <div style={{
                  fontSize: theme.fontSize.xs,
                  color: theme.colors.textMuted,
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: theme.space.md,
                }}>
                  {t('plugins.debug_no_data') || 'No data received yet'}
                </div>
              ) : (
                <div style={{
                  fontSize: theme.fontSize.xs,
                  fontFamily: 'monospace',
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}>
                  {[...debugByPlugin.entries()].map(([pluginId, entries]) => (
                    <div key={pluginId}>
                      {/* Plugin header */}
                      <div style={{
                        padding: `${theme.space.xs} 0`,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                        color: theme.colors.textMuted,
                        borderBottom: `1px solid ${theme.colors.border}40`,
                        marginTop: theme.space.xs,
                      }}>
                        {getPluginName(pluginId)}
                      </div>

                      {entries.map((entry, idx) => {
                        const ifaceLabel = getDebugInterfaceLabel(entry);
                        return (
                          <div key={`${pluginId}-${idx}`} style={{
                            display: 'flex',
                            gap: theme.space.sm,
                            padding: `${theme.space.xs} 0`,
                            borderBottom: idx < entries.length - 1 ? `1px solid ${theme.colors.border}20` : 'none',
                          }}>
                            <span style={{ color: theme.colors.primary, minWidth: '130px' }}>
                              {entry.streamId}
                              {ifaceLabel ? ` (${ifaceLabel})` : ''}
                            </span>
                            <span style={{ color: theme.colors.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formatValue(entry.value)}
                            </span>
                            <span style={{ color: theme.colors.textMuted, flexShrink: 0 }}>
                              {new Date(entry.timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: timeFormat === '12h' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Advanced Settings (collapsible, contains config fields) */}
        {configSchema.length > 0 && (
          <div style={{ marginTop: theme.space.md }}>
            <button
              onClick={() => setAdvancedExpanded(!advancedExpanded)}
              className="touch-btn"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: `${theme.space.sm} ${theme.space.md}`,
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: advancedExpanded ? `${theme.radius.md} ${theme.radius.md} 0 0` : theme.radius.md,
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              <span>{t('plugins.advanced_settings') || 'Advanced Settings'}</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                style={{
                  transform: advancedExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {advancedExpanded && (
              <div style={{
                padding: theme.space.md,
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderTop: 'none',
                borderRadius: `0 0 ${theme.radius.md} ${theme.radius.md}`,
                display: 'flex',
                flexDirection: 'column',
                gap: theme.space.md,
              }}>
                {configSchema.map((field) => {
                  const value = pluginConfig[field.key] ?? field.default;

                  return (
                    <div key={field.key}>
                      <label style={{
                        display: 'block',
                        fontSize: theme.fontSize.sm,
                        color: theme.colors.textPrimary,
                        marginBottom: theme.space.xs,
                        fontWeight: theme.fontWeight.medium,
                      }}>
                        {field.label}
                      </label>

                      {field.type === 'boolean' ? (
                        <button
                          onClick={() => onSetConfig(field.key, !value)}
                          className="touch-btn"
                          style={{
                            width: '56px',
                            height: '32px',
                            borderRadius: '16px',
                            border: 'none',
                            background: value ? theme.colors.primary : theme.colors.bgCardActive,
                            cursor: 'pointer',
                            position: 'relative',
                            transition: `background ${theme.transition.fast}`,
                          }}
                        >
                          <div style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '3px',
                            left: value ? '27px' : '3px',
                            transition: `left ${theme.transition.fast}`,
                          }} />
                        </button>
                      ) : field.type === 'select' && field.options ? (
                        <CustomSelect
                          value={String(value)}
                          options={field.options.map(o => ({ value: o.value, label: o.label }))}
                          onChange={(v) => onSetConfig(field.key, v)}
                        />
                      ) : field.type === 'number' ? (
                        <input
                          type="number"
                          value={value ?? ''}
                          onChange={(e) => onSetConfig(field.key, e.target.value === '' ? field.default : Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: `${theme.space.sm} ${theme.space.md}`,
                            background: theme.colors.bgPrimary,
                            border: `1px solid ${theme.colors.border}`,
                            borderRadius: theme.radius.sm,
                            color: theme.colors.textPrimary,
                            fontSize: theme.fontSize.sm,
                            outline: 'none',
                            boxSizing: 'border-box',
                            minHeight: '44px',
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={value ?? ''}
                          onChange={(e) => onSetConfig(field.key, e.target.value)}
                          style={{
                            width: '100%',
                            padding: `${theme.space.sm} ${theme.space.md}`,
                            background: theme.colors.bgPrimary,
                            border: `1px solid ${theme.colors.border}`,
                            borderRadius: theme.radius.sm,
                            color: theme.colors.textPrimary,
                            fontSize: theme.fontSize.sm,
                            outline: 'none',
                            boxSizing: 'border-box',
                            minHeight: '44px',
                          }}
                        />
                      )}

                      {field.description && (
                        <div style={{
                          fontSize: theme.fontSize.xs,
                          color: theme.colors.textMuted,
                          marginTop: theme.space.xs,
                        }}>
                          {field.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Unsupported interfaces info (MacArthur HAT only) */}
        {plugin.id === 'bigaos-macarthur-hat' && (
          <div style={{
            marginTop: theme.space.lg,
            padding: theme.space.md,
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
          }}>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              lineHeight: 1.5,
            }}>
              <span style={{ fontWeight: theme.fontWeight.semibold, color: theme.colors.textSecondary }}>
                {t('plugins.not_yet_supported') || 'Not yet supported:'}
              </span>{' '}
              NMEA 0183 (2 in / 2 out), Seatalk1 (1 in), 1-Wire temperature sensors, GPS/AIS via MAIANA add-on.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
