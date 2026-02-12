/**
 * DriverSettingsDialog - Per-driver settings dialog
 *
 * Opens as a full-screen dialog from a settings button on driver plugin cards.
 * Features:
 * - Plugin config fields rendered from configSchema
 * - Stream list with status indicators, toggles, and conflict warnings
 * - Rename support for custom (non-core) sensors
 * - Collapsible debug section with raw values
 */

import React, { useState, useEffect, useCallback } from 'react';
import { theme } from '../../styles/theme';
import {
  PluginInfo,
  SensorMappingInfo,
  DebugDataEntry,
} from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { CustomSelect } from '../ui/CustomSelect';

// Core sensor types used by chart/navigation - not renameable
const CORE_SENSOR_TYPES = new Set([
  'position',
  'heading',
  'depth',
  'speed_through_water',
  'roll',
  'pitch',
  'wind_speed',
  'wind_angle',
]);

interface DriverSettingsDialogProps {
  plugin: PluginInfo;
  sensorMappings: SensorMappingInfo[];
  debugData: DebugDataEntry[];
  allDriverPlugins: PluginInfo[];
  pluginConfig: Record<string, any>;
  onSetMapping: (slotType: string, pluginId: string, streamId: string) => void;
  onRemoveMapping: (slotType: string, pluginId: string, streamId: string) => void;
  onRefreshMappings: () => void;
  onSetConfig: (key: string, value: any) => void;
  onClose: () => void;
}

interface DataStream {
  id: string;
  name: string;
  dataType: string;
  unit: string;
  updateRate?: number;
  description?: string;
}

export const DriverSettingsDialog: React.FC<DriverSettingsDialogProps> = ({
  plugin,
  sensorMappings,
  debugData,
  allDriverPlugins,
  pluginConfig,
  onSetMapping,
  onRemoveMapping,
  onRefreshMappings,
  onSetConfig,
  onClose,
}) => {
  const { t } = useLanguage();
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [renamingStream, setRenamingStream] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  const streams: DataStream[] = plugin.manifest.driver?.dataStreams || [];
  const configSchema = plugin.manifest.driver?.configSchema || [];

  const PROTOCOL_NAMES: Record<string, string> = {
    nmea2000: 'NMEA 2000',
    nmea0183: 'NMEA 0183',
    i2c: 'I\u00B2C',
  };
  const protocolLabel = plugin.manifest.driver?.protocol
    ? PROTOCOL_NAMES[plugin.manifest.driver.protocol] || plugin.manifest.driver.protocol
    : null;

  // Auto-refresh debug data when debug is expanded
  useEffect(() => {
    if (!debugExpanded) return;
    const interval = setInterval(onRefreshMappings, 2000);
    return () => clearInterval(interval);
  }, [debugExpanded, onRefreshMappings]);

  // Get the active mapping for this plugin's stream
  const getMappingForStream = useCallback((stream: DataStream): SensorMappingInfo | undefined => {
    return sensorMappings.find(
      m => m.slotType === stream.dataType && m.pluginId === plugin.id && m.streamId === stream.id && m.active
    );
  }, [sensorMappings, plugin.id]);

  // Check if stream is enabled (has an active mapping)
  const isStreamEnabled = useCallback((stream: DataStream): boolean => {
    return !!getMappingForStream(stream);
  }, [getMappingForStream]);

  // Get status indicator for a stream
  const getStreamStatus = useCallback((stream: DataStream) => {
    const mapping = getMappingForStream(stream);
    if (!mapping || !mapping.lastUpdate) {
      return { color: theme.colors.textMuted, label: t('plugins.no_data') };
    }
    const age = Date.now() - new Date(mapping.lastUpdate).getTime();
    if (age < 3000) {
      return { color: '#22c55e', label: t('plugins.data_flowing') };
    }
    if (age < 10000) {
      return { color: theme.colors.warning, label: t('plugins.data_stale') };
    }
    return { color: theme.colors.error, label: t('plugins.data_stale') };
  }, [getMappingForStream, t]);

  // Find conflicting mapping from another enabled driver for the same data type
  const getConflict = useCallback((stream: DataStream): { pluginName: string; isCore: boolean } | null => {
    const conflicting = sensorMappings.find(
      m => m.slotType === stream.dataType && m.active && m.pluginId !== plugin.id
    );
    if (!conflicting) return null;

    // Only show conflict if the other plugin is actually enabled
    const otherPlugin = allDriverPlugins.find(p => p.id === conflicting.pluginId);
    if (!otherPlugin || otherPlugin.status !== 'enabled') return null;

    const isCore = CORE_SENSOR_TYPES.has(stream.dataType);
    return {
      pluginName: otherPlugin.manifest.name,
      isCore,
    };
  }, [sensorMappings, plugin.id, allDriverPlugins]);

  // Toggle a stream on/off
  const handleToggleStream = useCallback((stream: DataStream) => {
    if (isStreamEnabled(stream)) {
      onRemoveMapping(stream.dataType, plugin.id, stream.id);
    } else {
      onSetMapping(stream.dataType, plugin.id, stream.id);
    }
  }, [isStreamEnabled, onRemoveMapping, onSetMapping, plugin.id]);

  // Start renaming a stream
  const startRename = (stream: DataStream) => {
    setRenamingStream(stream.id);
    setRenameValue(customNames[stream.id] || stream.name);
  };

  // Confirm rename
  const confirmRename = (streamId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      setCustomNames(prev => ({ ...prev, [streamId]: trimmed }));
    }
    setRenamingStream(null);
  };

  // Get display name for a stream
  const getDisplayName = (stream: DataStream): string => {
    return customNames[stream.id] || stream.name;
  };

  // Format debug values
  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return '---';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number') return value.toFixed(2);
    return String(value);
  };

  const pluginDebugData = debugData.filter(d => d.pluginId === plugin.id);

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
          maxWidth: '500px',
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

        {/* Protocol section header */}
        {protocolLabel && configSchema.length > 0 && (
          <div style={{
            fontSize: theme.fontSize.sm,
            fontWeight: theme.fontWeight.semibold,
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: theme.space.sm,
          }}>
            {protocolLabel}
          </div>
        )}

        {/* Config Fields */}
        {configSchema.length > 0 && (
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.space.md,
            marginBottom: theme.space.lg,
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

        {/* Stream List */}
        {streams.length === 0 ? (
          <div style={{
            padding: theme.space.lg,
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            fontStyle: 'italic',
            textAlign: 'center',
          }}>
            {t('plugins.no_streams')}
          </div>
        ) : (
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            overflow: 'hidden',
          }}>
            {streams.map((stream, idx) => {
              const enabled = isStreamEnabled(stream);
              const status = getStreamStatus(stream);
              const conflict = enabled ? getConflict(stream) : null;
              const isCore = CORE_SENSOR_TYPES.has(stream.dataType);
              const isRenaming = renamingStream === stream.id;

              return (
                <div key={stream.id}>
                  {/* Stream Row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: `${theme.space.sm} ${theme.space.md}`,
                    minHeight: '52px',
                    gap: theme.space.md,
                    borderBottom: idx < streams.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                  }}>
                    {/* Status dot */}
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: enabled ? status.color : theme.colors.textMuted,
                      flexShrink: 0,
                    }} />

                    {/* Stream info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isRenaming ? (
                        <div style={{ display: 'flex', gap: theme.space.xs, alignItems: 'center' }}>
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmRename(stream.id);
                              if (e.key === 'Escape') setRenamingStream(null);
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              background: theme.colors.bgPrimary,
                              border: `1px solid ${theme.colors.primary}`,
                              borderRadius: theme.radius.sm,
                              color: theme.colors.textPrimary,
                              fontSize: theme.fontSize.sm,
                              padding: `${theme.space.xs} ${theme.space.sm}`,
                              outline: 'none',
                            }}
                          />
                          <button
                            onClick={() => confirmRename(stream.id)}
                            className="touch-btn"
                            style={{
                              background: theme.colors.primary,
                              border: 'none',
                              borderRadius: theme.radius.sm,
                              color: '#fff',
                              padding: `${theme.space.xs} ${theme.space.sm}`,
                              fontSize: theme.fontSize.xs,
                              cursor: 'pointer',
                              minWidth: '44px',
                              minHeight: '32px',
                            }}
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.xs }}>
                          <div>
                            <div style={{
                              fontSize: theme.fontSize.sm,
                              color: theme.colors.textPrimary,
                            }}>
                              {getDisplayName(stream)}
                            </div>
                            <div style={{
                              fontSize: theme.fontSize.xs,
                              color: theme.colors.textMuted,
                            }}>
                              {stream.dataType} - {stream.unit}
                            </div>
                          </div>
                          {/* Rename button for non-core sensors */}
                          {!isCore && (
                            <button
                              onClick={() => startRename(stream)}
                              className="touch-btn"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: theme.colors.textMuted,
                                cursor: 'pointer',
                                padding: theme.space.xs,
                                minWidth: '32px',
                                minHeight: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggleStream(stream)}
                      className="touch-btn"
                      style={{
                        width: '56px',
                        height: '32px',
                        borderRadius: '16px',
                        border: 'none',
                        background: enabled ? theme.colors.primary : theme.colors.bgCardActive,
                        cursor: 'pointer',
                        position: 'relative',
                        transition: `background ${theme.transition.fast}`,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: '#fff',
                        position: 'absolute',
                        top: '3px',
                        left: enabled ? '27px' : '3px',
                        transition: `left ${theme.transition.fast}`,
                      }} />
                    </button>
                  </div>

                  {/* Conflict warning */}
                  {conflict && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.space.sm,
                      padding: `${theme.space.xs} ${theme.space.md}`,
                      background: `${theme.colors.warning}15`,
                      borderLeft: `3px solid ${theme.colors.warning}`,
                      fontSize: theme.fontSize.xs,
                      color: theme.colors.warning,
                      borderBottom: idx < streams.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span>
                        {t('plugins.conflict_warning', {
                          plugin: conflict.pluginName,
                          dataType: stream.dataType,
                        })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
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
            <span>{t('plugins.debug')}</span>
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
              {pluginDebugData.length === 0 ? (
                <div style={{
                  fontSize: theme.fontSize.xs,
                  color: theme.colors.textMuted,
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: theme.space.md,
                }}>
                  {t('plugins.debug_no_data')}
                </div>
              ) : (
                <div style={{
                  fontSize: theme.fontSize.xs,
                  fontFamily: 'monospace',
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}>
                  {pluginDebugData.map((entry, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: theme.space.sm,
                      padding: `${theme.space.xs} 0`,
                      borderBottom: idx < pluginDebugData.length - 1 ? `1px solid ${theme.colors.border}20` : 'none',
                    }}>
                      <span style={{ color: theme.colors.primary, minWidth: '80px' }}>
                        {entry.streamId}
                      </span>
                      <span style={{ color: theme.colors.textPrimary, flex: 1 }}>
                        {formatValue(entry.value)}
                      </span>
                      <span style={{ color: theme.colors.textMuted }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
