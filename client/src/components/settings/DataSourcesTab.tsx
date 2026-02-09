/**
 * DataSourcesTab - Sensor mapping, debug view, and data flow indicators
 *
 * Shows:
 * - All sensor "slots" and which plugin/stream is mapped to each
 * - Visual indicator of data flow (green = active, gray = no data, red = stale)
 * - Debug toggle showing raw values for each active stream
 * - Auto-map button per driver plugin
 * - "Clear All Sensor Data" button to reset stored sensor data
 */

import React, { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { usePlugins, SensorMappingInfo } from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';

// Built-in sensor slot definitions
const SENSOR_SLOTS = [
  { type: 'position', label: 'Position', category: 'Navigation' },
  { type: 'speed_over_ground', label: 'Speed Over Ground', category: 'Navigation' },
  { type: 'course_over_ground', label: 'Course Over Ground', category: 'Navigation' },
  { type: 'heading_magnetic', label: 'Heading Magnetic', category: 'Navigation' },
  { type: 'heading_true', label: 'Heading True', category: 'Navigation' },
  { type: 'attitude', label: 'Attitude', category: 'Navigation' },
  { type: 'depth', label: 'Depth', category: 'Environment' },
  { type: 'wind_apparent', label: 'Apparent Wind', category: 'Environment' },
  { type: 'wind_true', label: 'True Wind', category: 'Environment' },
  { type: 'temperature_engine', label: 'Engine Temperature', category: 'Environment' },
  { type: 'temperature_cabin', label: 'Cabin Temperature', category: 'Environment' },
  { type: 'temperature_outside', label: 'Outside Temperature', category: 'Environment' },
  { type: 'temperature_battery', label: 'Battery Temperature', category: 'Environment' },
  { type: 'battery_voltage', label: 'Battery Voltage', category: 'Electrical' },
  { type: 'battery_current', label: 'Battery Current', category: 'Electrical' },
  { type: 'battery_soc', label: 'Battery SOC', category: 'Electrical' },
  { type: 'battery_temperature', label: 'Battery Compartment Temp', category: 'Electrical' },
  { type: 'motor_state', label: 'Motor State', category: 'Propulsion' },
  { type: 'motor_temperature', label: 'Motor Temperature', category: 'Propulsion' },
  { type: 'motor_throttle', label: 'Motor Throttle', category: 'Propulsion' },
];

const CATEGORIES = ['Navigation', 'Environment', 'Electrical', 'Propulsion'];

export const DataSourcesTab: React.FC = () => {
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const {
    plugins,
    sensorMappings,
    debugData,
    setMapping,
    removeMapping,
    autoMapDriver,
    refreshMappings,
  } = usePlugins();

  const [showDebug, setShowDebug] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORIES));

  // Refresh mappings periodically when debug is shown
  useEffect(() => {
    if (!showDebug) return;
    const interval = setInterval(refreshMappings, 2000);
    return () => clearInterval(interval);
  }, [showDebug, refreshMappings]);

  // Get active driver plugins
  const driverPlugins = plugins.filter(p => p.manifest.type === 'driver' && p.status === 'enabled');

  // Get all available streams from all driver plugins
  const allStreams: Array<{ pluginId: string; pluginName: string; streamId: string; streamName: string; dataType: string }> = [];
  for (const plugin of driverPlugins) {
    for (const stream of plugin.manifest.driver?.dataStreams || []) {
      allStreams.push({
        pluginId: plugin.id,
        pluginName: plugin.manifest.name,
        streamId: stream.id,
        streamName: stream.name,
        dataType: stream.dataType,
      });
    }
  }

  // Get the active mapping for a slot
  const getMappingForSlot = (slotType: string): SensorMappingInfo | undefined => {
    return sensorMappings.find(m => m.slotType === slotType && m.active);
  };

  // Get the available streams that can feed a particular slot type
  const getStreamsForSlot = (slotType: string) => {
    return allStreams.filter(s => s.dataType === slotType);
  };

  // Data freshness indicator
  const getStatusIndicator = (mapping: SensorMappingInfo | undefined) => {
    if (!mapping || !mapping.lastUpdate) {
      return { color: theme.colors.textMuted, label: t('data_sources.no_data') };
    }
    const age = Date.now() - new Date(mapping.lastUpdate).getTime();
    if (age < 3000) {
      return { color: '#22c55e', label: t('data_sources.data_flowing') };
    }
    if (age < 10000) {
      return { color: theme.colors.warning, label: t('data_sources.stale') };
    }
    return { color: theme.colors.error, label: t('data_sources.stale') };
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleClearSensorData = async () => {
    const confirmed = await confirm({
      title: t('data_sources.clear_all_title'),
      message: t('data_sources.clear_all_message'),
    });
    if (confirmed) {
      // Remove all mappings by removing each active one
      for (const mapping of sensorMappings) {
        if (mapping.active) {
          removeMapping(mapping.slotType, mapping.pluginId, mapping.streamId);
        }
      }
    }
  };

  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return '---';
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return String(value);
  };

  return (
    <div>
      {/* Header Section */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.space.lg,
      }}>
        <div>
          <div style={{
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
            color: theme.colors.textPrimary,
          }}>
            {t('data_sources.title')}
          </div>
          <div style={{
            fontSize: theme.fontSize.sm,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
          }}>
            {t('data_sources.subtitle')}
          </div>
        </div>

        {/* Debug Toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="touch-btn"
          style={{
            padding: `${theme.space.sm} ${theme.space.md}`,
            background: showDebug ? theme.colors.primary : theme.colors.bgCardActive,
            border: `1px solid ${showDebug ? theme.colors.primary : theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: showDebug ? '#fff' : theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            cursor: 'pointer',
          }}
        >
          {t('data_sources.debug_mode')}
        </button>
      </div>

      {/* Active Driver Plugins with Auto-Map */}
      {driverPlugins.length > 0 && (
        <div style={{
          marginBottom: theme.space.lg,
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
        }}>
          <div style={{
            fontSize: theme.fontSize.sm,
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: theme.space.md,
          }}>
            {t('data_sources.active_drivers')}
          </div>

          {driverPlugins.map(plugin => (
            <div key={plugin.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: `${theme.space.sm} 0`,
              borderBottom: `1px solid ${theme.colors.border}`,
            }}>
              <div>
                <div style={{ fontSize: theme.fontSize.base, color: theme.colors.textPrimary }}>
                  {plugin.manifest.name}
                </div>
                <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
                  {plugin.manifest.driver?.protocol} - {plugin.manifest.driver?.dataStreams?.length || 0} {t('data_sources.streams')}
                </div>
              </div>

              <button
                onClick={() => autoMapDriver(plugin.id)}
                className="touch-btn"
                style={{
                  padding: `${theme.space.xs} ${theme.space.md}`,
                  background: theme.colors.bgCardActive,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.sm,
                  color: theme.colors.primary,
                  fontSize: theme.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                {t('data_sources.auto_map')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* No drivers warning */}
      {driverPlugins.length === 0 && (
        <div style={{
          padding: theme.space.lg,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
          marginBottom: theme.space.lg,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
        }}>
          {t('data_sources.no_drivers')}
        </div>
      )}

      {/* Sensor Slots by Category */}
      {CATEGORIES.map(category => {
        const slots = SENSOR_SLOTS.filter(s => s.category === category);
        const isExpanded = expandedCategories.has(category);

        return (
          <div key={category} style={{ marginBottom: theme.space.md }}>
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category)}
              className="touch-btn"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: `${theme.space.sm} ${theme.space.md}`,
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: isExpanded ? `${theme.radius.md} ${theme.radius.md} 0 0` : theme.radius.md,
                color: theme.colors.textPrimary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
              }}
            >
              {category}
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Slots in Category */}
            {isExpanded && (
              <div style={{
                border: `1px solid ${theme.colors.border}`,
                borderTop: 'none',
                borderRadius: `0 0 ${theme.radius.md} ${theme.radius.md}`,
              }}>
                {slots.map((slot, idx) => {
                  const mapping = getMappingForSlot(slot.type);
                  const available = getStreamsForSlot(slot.type);
                  const status = getStatusIndicator(mapping);

                  return (
                    <div key={slot.type} style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: `${theme.space.sm} ${theme.space.md}`,
                      background: theme.colors.bgPrimary,
                      borderBottom: idx < slots.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                      gap: theme.space.md,
                    }}>
                      {/* Status dot */}
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: status.color,
                        flexShrink: 0,
                      }} />

                      {/* Slot label */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: theme.fontSize.sm,
                          color: theme.colors.textPrimary,
                        }}>
                          {slot.label}
                        </div>
                        {mapping && (
                          <div style={{
                            fontSize: theme.fontSize.xs,
                            color: theme.colors.textMuted,
                          }}>
                            {driverPlugins.find(p => p.id === mapping.pluginId)?.manifest.name || mapping.pluginId}
                            {' / '}
                            {mapping.streamId}
                          </div>
                        )}
                        {!mapping && (
                          <div style={{
                            fontSize: theme.fontSize.xs,
                            color: theme.colors.textMuted,
                            fontStyle: 'italic',
                          }}>
                            {t('data_sources.no_source')}
                          </div>
                        )}
                      </div>

                      {/* Debug value */}
                      {showDebug && mapping && (
                        <div style={{
                          fontSize: theme.fontSize.xs,
                          color: theme.colors.primary,
                          fontFamily: 'monospace',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {formatValue(mapping.lastValue)}
                        </div>
                      )}

                      {/* Source selector */}
                      {available.length > 0 && (
                        <select
                          value={mapping ? `${mapping.pluginId}:${mapping.streamId}` : ''}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              if (mapping) {
                                removeMapping(slot.type, mapping.pluginId, mapping.streamId);
                              }
                            } else {
                              const [pId, sId] = e.target.value.split(':');
                              setMapping(slot.type, pId, sId);
                            }
                          }}
                          style={{
                            padding: `${theme.space.xs} ${theme.space.sm}`,
                            background: theme.colors.bgCardActive,
                            border: `1px solid ${theme.colors.border}`,
                            borderRadius: theme.radius.sm,
                            color: theme.colors.textPrimary,
                            fontSize: theme.fontSize.xs,
                            cursor: 'pointer',
                            maxWidth: '140px',
                          }}
                        >
                          <option value="">{t('data_sources.no_source')}</option>
                          {available.map(s => (
                            <option key={`${s.pluginId}:${s.streamId}`} value={`${s.pluginId}:${s.streamId}`}>
                              {s.streamName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Debug Data Raw View */}
      {showDebug && debugData.length > 0 && (
        <div style={{
          marginTop: theme.space.lg,
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
        }}>
          <div style={{
            fontSize: theme.fontSize.sm,
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: theme.space.md,
          }}>
            {t('data_sources.raw_data')}
          </div>
          <div style={{
            fontSize: theme.fontSize.xs,
            fontFamily: 'monospace',
            color: theme.colors.textPrimary,
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
            {debugData.map((entry, idx) => (
              <div key={idx} style={{
                padding: `${theme.space.xs} 0`,
                borderBottom: `1px solid ${theme.colors.border}`,
                display: 'flex',
                gap: theme.space.sm,
              }}>
                <span style={{ color: theme.colors.primary }}>{entry.pluginId}</span>
                <span style={{ color: theme.colors.textMuted }}>/{entry.streamId}</span>
                <span style={{ color: theme.colors.textPrimary, flex: 1 }}>
                  {formatValue(entry.value)}
                </span>
                <span style={{ color: theme.colors.textMuted }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clear All Sensor Data */}
      <div style={{
        marginTop: theme.space.xl,
        paddingTop: theme.space.lg,
        borderTop: `1px solid ${theme.colors.border}`,
      }}>
        <button
          onClick={handleClearSensorData}
          className="touch-btn"
          style={{
            width: '100%',
            padding: theme.space.md,
            background: 'transparent',
            border: `1px solid ${theme.colors.error}`,
            borderRadius: theme.radius.md,
            color: theme.colors.error,
            fontSize: theme.fontSize.sm,
            fontWeight: theme.fontWeight.medium,
            cursor: 'pointer',
          }}
        >
          {t('data_sources.clear_all')}
        </button>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginTop: theme.space.sm,
          textAlign: 'center',
        }}>
          {t('data_sources.clear_all_help')}
        </div>
      </div>
    </div>
  );
};
