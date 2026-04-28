/**
 * DriverSettingsDialog - Plugin settings dialog
 *
 * Opens as a full-screen dialog from a settings button on plugin cards.
 * Features:
 * - Plugin config fields rendered from configSchema (top-level or driver-level)
 * - Data source selection: per-slot dropdowns showing available sources (drivers only)
 * - Sources dynamically detected based on live data flow (drivers only)
 * - Collapsible debug section showing ALL raw data from all interfaces (drivers only)
 * - Status display via getStatus RPC polling (service/integration plugins)
 * - Info and password config field types
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  PluginInfo,
  SensorMappingInfo,
  DebugDataEntry,
  SlotAvailability,
  SourceInfo,
  usePlugins,
} from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSettings } from '../../context/SettingsContext';
import { CustomSelect } from '../ui/CustomSelect';
import { SLabel, SSection, SInput, SButton, SToggle, SInfoBox } from '../ui/SettingsUI';

// ============================================================================
// Slot categories (slot types grouped for display)
// ============================================================================

const SLOT_CATEGORIES: [string, string[]][] = [
  ['slot_cat.navigation', ['position', 'course_over_ground', 'speed_over_ground', 'heading', 'speed_through_water', 'roll', 'pitch', 'yaw', 'rudder_angle', 'chain_length']],
  ['slot_cat.environment', ['depth', 'wind_speed_apparent', 'wind_angle_apparent', 'wind_speed_true', 'wind_angle_true', 'wind_speed', 'wind_angle', 'water_temperature', 'barometric_pressure', 'humidity']],
  ['slot_cat.electrical', ['voltage', 'current', 'battery_voltage', 'battery_current', 'temperature', 'soc', 'battery_temperature', 'battery_soc', 'battery_time_remaining', 'battery_power']],
  ['slot_cat.propulsion', ['rpm', 'fuel_level', 'tank_level']],
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
  const { executePluginAction, pluginActionResults } = usePlugins();
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [magCalActive, setMagCalActive] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const configSchema = plugin.manifest.configSchema || plugin.manifest.driver?.configSchema || [];
  const isDriver = plugin.manifest.type === 'driver';
  const isMacArthur = plugin.id === 'bigaos-macarthur-hat';
  const imuCalStatus = pluginActionResults['bigaos-macarthur-hat:imu_calibration_status'];
  const pluginStatus = pluginActionResults[`${plugin.id}:getStatus`];

  // Handle connect/disconnect action with loading + error feedback
  const handleAction = useCallback((action: 'connect' | 'disconnect') => {
    setActionLoading(action);
    setActionError(null);
    executePluginAction(plugin.id, action);
  }, [plugin.id, executePluginAction]);

  // Watch for connect/disconnect results to clear loading and show errors
  const connectResult = pluginActionResults[`${plugin.id}:connect`];
  const disconnectResult = pluginActionResults[`${plugin.id}:disconnect`];
  useEffect(() => {
    if (!actionLoading) return;
    const result = actionLoading === 'connect' ? connectResult : disconnectResult;
    if (!result) return;
    if (result.error) {
      setActionError(result.error);
    }
    setActionLoading(null);
  }, [actionLoading, connectResult, disconnectResult]);

  // Poll plugin status via getStatus RPC (non-driver plugins)
  useEffect(() => {
    if (isDriver) return;
    executePluginAction(plugin.id, 'getStatus');
    const interval = setInterval(() => {
      executePluginAction(plugin.id, 'getStatus');
    }, 5000);
    return () => clearInterval(interval);
  }, [isDriver, plugin.id, executePluginAction]);

  // Poll IMU calibration status when advanced settings are open (MacArthur HAT only)
  useEffect(() => {
    if (!isMacArthur || !advancedExpanded) return;
    executePluginAction('bigaos-macarthur-hat', 'imu_calibration_status');
    const interval = setInterval(() => {
      executePluginAction('bigaos-macarthur-hat', 'imu_calibration_status');
    }, 1000);
    return () => clearInterval(interval);
  }, [isMacArthur, advancedExpanded, executePluginAction]);

  // Auto-refresh debug data when debug is expanded (drivers only)
  useEffect(() => {
    if (!isDriver || !debugExpanded) return;
    const interval = setInterval(onRefreshMappings, 2000);
    return () => clearInterval(interval);
  }, [isDriver, debugExpanded, onRefreshMappings]);

  // Auto-refresh source availability every 3 seconds (drivers only)
  useEffect(() => {
    if (!isDriver) return;
    const interval = setInterval(onRefreshMappings, 3000);
    return () => clearInterval(interval);
  }, [isDriver, onRefreshMappings]);

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
        const ifaceLabel = source.interface ? getInterfaceLabel(source.interface) : '';
        const label = ifaceLabel ? `${source.pluginName} (${ifaceLabel})` : source.pluginName;
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

  // Render config fields from configSchema (shared between driver and non-driver views)
  const renderConfigFields = () =>
    configSchema.map((field) => {
      const value = pluginConfig[field.key] ?? field.default;
      const fieldLabel = t(field.label) !== field.label ? t(field.label) : field.label;
      const fieldDesc = field.description
        ? (t(field.description) !== field.description ? t(field.description) : field.description)
        : undefined;

      // Info type: render as instructional text block
      if (field.type === 'info') {
        return (
          <SInfoBox key={field.key} style={{ marginTop: 0 }}>
            <div style={{ whiteSpace: 'pre-line' }}>
              {fieldDesc || fieldLabel}
            </div>
          </SInfoBox>
        );
      }

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
          ) : field.type === 'password' ? (
            <SInput
              type="password"
              value={value ?? ''}
              placeholder="••••••••"
              onChange={(e) => onSetConfig(field.key, e.target.value)}
            />
          ) : (
            <SInput
              type="text"
              value={value ?? ''}
              onChange={(e) => onSetConfig(field.key, e.target.value)}
            />
          )}

          {fieldDesc && field.type !== 'info' && (
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
    });

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

        {/* Plugin Status Section (non-driver plugins with getStatus action) */}
        {!isDriver && pluginStatus && (
          <div style={{
            padding: theme.space.md,
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            marginBottom: theme.space.md,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.space.sm,
              marginBottom: theme.space.sm,
            }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: pluginStatus.connected ? '#22c55e' : theme.colors.error,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: theme.fontSize.md,
                fontWeight: theme.fontWeight.semibold,
                color: theme.colors.textPrimary,
              }}>
                {pluginStatus.connected
                  ? (t('plugins.status_connected') || 'Connected')
                  : (t('plugins.status_disconnected') || 'Disconnected')}
              </span>
            </div>

            {pluginStatus.connected && pluginStatus.hostname && (
              <div
                style={{
                  padding: theme.space.sm,
                  marginTop: theme.space.sm,
                  marginBottom: theme.space.sm,
                  background: `${theme.colors.primary}15`,
                  border: `1px solid ${theme.colors.primary}40`,
                  borderRadius: theme.radius.sm,
                }}
              >
                <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: '4px' }}>
                  {t('plugins.tailscale_connect_url_hint') || 'Use this URL in the BigaOS mobile app:'}
                </div>
                <div
                  style={{
                    fontSize: theme.fontSize.md,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.colors.textPrimary,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  http://{pluginStatus.hostname}:3000
                </div>
                <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: '4px' }}>
                  {t('plugins.tailscale_connect_url_note') ||
                    'MagicDNS must be enabled in your Tailscale admin console for the hostname to resolve.'}
                </div>
              </div>
            )}
            {pluginStatus.tailscaleIP && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${theme.space.xs} 0` }}>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
                  {t('plugins.tailscale_ip') || 'Tailscale IP'}
                </span>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary, fontFamily: 'monospace' }}>
                  {pluginStatus.tailscaleIP}
                </span>
              </div>
            )}
            {pluginStatus.hostname && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${theme.space.xs} 0` }}>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
                  {t('plugins.tailscale_hostname') || 'Hostname'}
                </span>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary, fontFamily: 'monospace' }}>
                  {pluginStatus.hostname}
                </span>
              </div>
            )}
            {pluginStatus.detectedSubnet && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: `${theme.space.xs} 0` }}>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
                  {t('plugins.tailscale_subnet') || 'Local Subnet'}
                </span>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary, fontFamily: 'monospace' }}>
                  {pluginStatus.detectedSubnet}
                </span>
              </div>
            )}

            {/* Action error display */}
            {actionError && (
              <div style={{
                padding: theme.space.sm,
                marginTop: theme.space.sm,
                background: `${theme.colors.error}15`,
                border: `1px solid ${theme.colors.error}40`,
                borderRadius: theme.radius.sm,
                fontSize: theme.fontSize.sm,
                color: theme.colors.error,
                wordBreak: 'break-word',
              }}>
                {actionError}
              </div>
            )}

            {/* Connect / Disconnect buttons */}
            <div style={{ display: 'flex', gap: theme.space.sm, marginTop: theme.space.md }}>
              {pluginStatus.connected ? (
                <SButton
                  variant="danger"
                  fullWidth
                  disabled={!!actionLoading}
                  onClick={() => handleAction('disconnect')}
                >
                  {actionLoading === 'disconnect' ? (t('common.loading') || 'Loading...') : (t('plugins.disconnect') || 'Disconnect')}
                </SButton>
              ) : (
                <SButton
                  variant="primary"
                  fullWidth
                  disabled={!!actionLoading}
                  onClick={() => handleAction('connect')}
                >
                  {actionLoading === 'connect' ? (t('common.loading') || 'Connecting...') : (t('plugins.connect') || 'Connect')}
                </SButton>
              )}
            </div>
          </div>
        )}

        {/* Data Sources Section (drivers only) */}
        {isDriver && (
          <>
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
          </>
        )}

        {/* Config fields: collapsible "Advanced Settings" for drivers, direct for non-drivers */}
        {configSchema.length > 0 && (
          isDriver ? (
            /* Driver: collapsible Advanced Settings */
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
                  {renderConfigFields()}
                </div>
              )}
            </div>
          ) : (
            /* Non-driver: config fields shown directly as main content */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: theme.space.md,
            }}>
              {renderConfigFields()}
            </div>
          )
        )}

        {/* IMU Calibration (MacArthur HAT only) */}
        {isMacArthur && advancedExpanded && imuCalStatus && imuCalStatus.status !== 'unavailable' && (
          <div style={{
            marginTop: theme.space.md,
            padding: theme.space.md,
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
          }}>
            <div style={{
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.semibold,
              color: theme.colors.textPrimary,
              marginBottom: theme.space.sm,
            }}>
              {t('imu.calibration') || 'IMU Calibration'}
            </div>

            {/* Status */}
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginBottom: theme.space.md,
            }}>
              {imuCalStatus.calibrated
                ? (t('imu.calibrated') || 'Calibrated')
                : (t('imu.not_calibrated') || 'Not calibrated')}
              {imuCalStatus.status !== 'idle' && imuCalStatus.status !== 'complete' && (
                <span style={{ color: theme.colors.warning, marginLeft: theme.space.sm }}>
                  {imuCalStatus.status === 'calibrating_gyro' && `${t('imu.calibrating_gyro') || 'Calibrating gyro'}... ${imuCalStatus.progress}%`}
                  {imuCalStatus.status === 'calibrating_mount' && `${t('imu.calibrating_mount') || 'Setting level'}... ${imuCalStatus.progress}%`}
                  {imuCalStatus.status === 'calibrating_mag' && `${t('imu.calibrating_mag') || 'Mag calibration'} (${imuCalStatus.magSamples} ${t('imu.samples') || 'samples'})`}
                </span>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: theme.space.sm, flexWrap: 'wrap' }}>
              <SButton
                variant="secondary"
                onClick={() => executePluginAction('bigaos-macarthur-hat', 'imu_recalibrate_gyro_mount')}
                disabled={imuCalStatus.status !== 'idle' && imuCalStatus.status !== 'complete'}
                style={{ flex: 1, minWidth: '140px' }}
              >
                {t('imu.recalibrate') || 'Recalibrate Level'}
              </SButton>

              {!magCalActive ? (
                <SButton
                  variant="secondary"
                  onClick={() => {
                    executePluginAction('bigaos-macarthur-hat', 'imu_start_mag_calibration');
                    setMagCalActive(true);
                  }}
                  disabled={imuCalStatus.status !== 'idle' && imuCalStatus.status !== 'complete'}
                  style={{ flex: 1, minWidth: '140px' }}
                >
                  {t('imu.start_mag_cal') || 'Calibrate Compass'}
                </SButton>
              ) : (
                <SButton
                  variant="primary"
                  onClick={() => {
                    executePluginAction('bigaos-macarthur-hat', 'imu_stop_mag_calibration');
                    setMagCalActive(false);
                  }}
                  style={{ flex: 1, minWidth: '140px' }}
                >
                  {t('imu.stop_mag_cal') || 'Finish Compass Cal'}
                </SButton>
              )}
            </div>

            {magCalActive && (
              <div style={{
                marginTop: theme.space.sm,
                fontSize: theme.fontSize.xs,
                color: theme.colors.warning,
                fontStyle: 'italic',
              }}>
                {t('imu.mag_cal_hint') || 'Slowly rotate the boat through as many headings as possible, then press Finish.'}
              </div>
            )}
          </div>
        )}

        {/* Unsupported interfaces info (MacArthur HAT only) */}
        {isMacArthur && (
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
