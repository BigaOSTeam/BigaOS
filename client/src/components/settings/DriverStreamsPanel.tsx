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
import { useTheme } from '../../context/ThemeContext';
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
import { SLabel, SSection, SInput, SButton, SToggle, SInfoBox } from '../ui/SettingsUI';

// ============================================================================
// Slot categories (slot types grouped for display)
// ============================================================================

const SLOT_CATEGORIES: [string, string[]][] = [
  ['slot_cat.navigation', ['position', 'course_over_ground', 'speed_over_ground', 'heading', 'speed_through_water', 'roll', 'pitch', 'yaw', 'rudder_angle']],
  ['slot_cat.environment', ['depth', 'wind_speed_apparent', 'wind_angle_apparent', 'wind_speed_true', 'wind_angle_true', 'water_temperature', 'barometric_pressure', 'humidity']],
  ['slot_cat.electrical', ['voltage', 'current', 'temperature', 'soc']],
  ['slot_cat.propulsion', ['rpm', 'fuel_level']],
];

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
  const { theme } = useTheme();
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

  // Get interface label via i18n with fallback
  const getInterfaceLabel = (iface: string): string => {
    const key = `iface.${iface}`;
    const translated = t(key);
    return translated !== key ? translated : (iface || t('common.unknown'));
  };

  // Build dropdown options for a slot
  const getDropdownOptions = useCallback((slotType: string) => {
    const options: { value: string; label: string }[] = [
      { value: 'off', label: t('common.off') },
    ];

    const slot = availabilityBySlot.get(slotType);
    if (!slot) return options;

    for (const source of slot.sources) {
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
    const existingMappings = sensorMappings.filter(m => m.slotType === slotType && m.active);
    for (const mapping of existingMappings) {
      onRemoveMapping(slotType, mapping.pluginId, mapping.streamId);
    }

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
    if (!selected) return theme.colors.textMuted;
    if (selected.alive) return '#22c55e';
    return theme.colors.warning;
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

  // Render a slot row (shared between categorized and uncategorized)
  const renderSlotRow = (slotType: string, idx: number, total: number) => {
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
          borderBottom: idx < total - 1 ? `1px solid ${theme.colors.border}` : 'none',
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
          fontSize: theme.fontSize.md,
          color: theme.colors.textPrimary,
          minWidth: 0,
        }}>
          {t(`slot.${slotType}`) !== `slot.${slotType}` ? t(`slot.${slotType}`) : slotType}
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
              {t('common.off') || 'Off'}
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
        className="settings-scroll"
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
          <SButton
            variant="ghost"
            onClick={onClose}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              padding: theme.space.sm,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </SButton>
        </div>

        {/* Data Sources Section */}
        <SSection style={{ marginBottom: theme.space.sm }}>
          {t('plugins.data_sources') || 'Data Sources'}
        </SSection>

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
            {SLOT_CATEGORIES.map(([categoryKey, slotTypes]) => {
              const visibleSlots = slotTypes.filter(st => availableSlotTypes.has(st));
              if (visibleSlots.length === 0) return null;

              return (
                <div key={categoryKey}>
                  <div style={{
                    padding: `${theme.space.sm} ${theme.space.md}`,
                    background: theme.colors.bgCardActive,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.colors.textSecondary,
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>
                    {t(categoryKey)}
                  </div>
                  {visibleSlots.map((slotType, idx) => renderSlotRow(slotType, idx, visibleSlots.length))}
                </div>
              );
            })}

            {/* Uncategorized slots */}
            {(() => {
              const categorizedSlots = new Set(SLOT_CATEGORIES.flatMap(([, slots]) => slots));
              const uncategorized = [...availableSlotTypes].filter(st => !categorizedSlots.has(st));
              if (uncategorized.length === 0) return null;

              return (
                <div>
                  <div style={{
                    padding: `${theme.space.sm} ${theme.space.md}`,
                    background: theme.colors.bgCardActive,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.colors.textSecondary,
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}>
                    {t('common.other') || 'Other'}
                  </div>
                  {uncategorized.map((slotType, idx) => renderSlotRow(slotType, idx, uncategorized.length))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Debug Section */}
        <div style={{ marginTop: theme.space.lg }}>
          <SButton
            variant="secondary"
            fullWidth
            onClick={() => setDebugExpanded(!debugExpanded)}
            style={{
              justifyContent: 'space-between',
              borderRadius: debugExpanded ? `${theme.radius.md} ${theme.radius.md} 0 0` : theme.radius.md,
            }}
          >
            <span>{t('plugins.debug') || 'Debug'}</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              style={{
                transform: debugExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: `transform ${theme.transition.fast}`,
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </SButton>

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
                <div
                  className="settings-scroll"
                  style={{
                    fontSize: theme.fontSize.xs,
                    fontFamily: 'monospace',
                    maxHeight: '60vh',
                    overflowY: 'auto',
                  }}
                >
                  {[...debugByPlugin.entries()].map(([pluginId, entries]) => (
                    <div key={pluginId}>
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
            <SButton
              variant="secondary"
              fullWidth
              onClick={() => setAdvancedExpanded(!advancedExpanded)}
              style={{
                justifyContent: 'space-between',
                borderRadius: advancedExpanded ? `${theme.radius.md} ${theme.radius.md} 0 0` : theme.radius.md,
              }}
            >
              <span>{t('plugins.advanced_settings') || 'Advanced Settings'}</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                style={{
                  transform: advancedExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: `transform ${theme.transition.fast}`,
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </SButton>

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
                  // Try translating the label as an i18n key; fall back to raw string
                  const fieldLabel = t(field.label) !== field.label ? t(field.label) : field.label;
                  const fieldDesc = field.description
                    ? (t(field.description) !== field.description ? t(field.description) : field.description)
                    : undefined;

                  return (
                    <div key={field.key}>
                      <SLabel style={{ color: theme.colors.textPrimary, fontWeight: theme.fontWeight.medium }}>
                        {fieldLabel}
                      </SLabel>

                      {field.type === 'boolean' ? (
                        <SToggle
                          checked={!!value}
                          onChange={(checked) => onSetConfig(field.key, checked)}
                        />
                      ) : field.type === 'select' && field.options ? (
                        <CustomSelect
                          value={String(value)}
                          options={field.options.map(o => ({
                            value: o.value,
                            label: t(o.label) !== o.label ? t(o.label) : o.label,
                          }))}
                          onChange={(v) => onSetConfig(field.key, v)}
                        />
                      ) : field.type === 'number' ? (
                        <SInput
                          type="number"
                          value={value ?? ''}
                          onChange={(e) => onSetConfig(field.key, e.target.value === '' ? field.default : Number(e.target.value))}
                        />
                      ) : (
                        <SInput
                          type="text"
                          value={value ?? ''}
                          onChange={(e) => onSetConfig(field.key, e.target.value)}
                        />
                      )}

                      {fieldDesc && (
                        <div style={{
                          fontSize: theme.fontSize.xs,
                          color: theme.colors.textMuted,
                          marginTop: theme.space.xs,
                        }}>
                          {fieldDesc}
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
          <SInfoBox>
            <span style={{ fontWeight: theme.fontWeight.semibold, color: theme.colors.textSecondary }}>
              {t('plugins.not_yet_supported') || 'Not yet supported:'}
            </span>{' '}
            NMEA 0183 (2 in / 2 out), Seatalk1 (1 in), 1-Wire temperature sensors, GPS/AIS via MAIANA add-on.
          </SInfoBox>
        )}
      </div>
    </div>
  );
};
