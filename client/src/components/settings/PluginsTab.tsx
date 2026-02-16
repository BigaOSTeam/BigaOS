/**
 * PluginsTab - Plugin marketplace and installed plugins management
 *
 * Sub-tabs:
 * - Installed: List of installed plugins with enable/disable toggle, status, uninstall
 * - Marketplace: Browse and install plugins from the GitHub registry
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { usePlugins, PluginInfo } from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { DriverSettingsDialog } from './DriverStreamsPanel';
import { CustomSelect } from '../ui/CustomSelect';
import { SInput, SButton } from '../ui/SettingsUI';

type SubTab = 'installed' | 'marketplace';

export const PluginsTab: React.FC = () => {
  const { theme } = useTheme();

  // Type badge colors
  const TYPE_COLORS: Record<string, string> = {
    driver: theme.colors.primary,
    'ui-extension': '#8b5cf6',
    service: '#06b6d4',
    integration: '#f59e0b',
  };

  const FLAG_COLORS: Record<string, string> = {
    official: '#22c55e',
    community: '#6366f1',
  };

  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const {
    plugins,
    registryPlugins,
    registryLoading,
    refreshRegistry,
    installingPlugins,
    installPlugin,
    uninstallPlugin,
    sensorMappings,
    debugData,
    sourceAvailability,
    setMapping,
    removeMapping,
    refreshMappings,
    pluginConfigs,
    loadPluginConfig,
    setPluginConfig,
    rebootSystem,
  } = usePlugins();

  const [subTab, setSubTab] = useState<SubTab>('installed');
  const [settingsPlugin, setSettingsPlugin] = useState<PluginInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');

  // Minimum-duration spin so the user always sees feedback on manual refresh
  const [minSpin, setMinSpin] = useState(false);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback(() => {
    setMinSpin(true);
    refreshRegistry();
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = setTimeout(() => setMinSpin(false), 600);
  }, [refreshRegistry]);

  useEffect(() => () => { if (spinTimerRef.current) clearTimeout(spinTimerRef.current); }, []);

  const isSpinning = minSpin || registryLoading;

  // Fetch registry on mount (for update badges) and when marketplace tab is opened
  useEffect(() => {
    refreshRegistry();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (subTab === 'marketplace') {
      refreshRegistry();
    }
  }, [subTab, refreshRegistry]);

  // Load config when settings dialog opens
  useEffect(() => {
    if (settingsPlugin) {
      const keys = settingsPlugin.manifest.driver?.configSchema?.map(f => f.key) || [];
      if (keys.length > 0) {
        loadPluginConfig(settingsPlugin.id, keys);
      }
    }
  }, [settingsPlugin, loadPluginConfig]);

  const handleUninstall = async (plugin: PluginInfo) => {
    const confirmed = await confirm({
      title: t('plugins.uninstall_title'),
      message: `${t('plugins.uninstall_message')} "${plugin.manifest.name}"?`,
    });
    if (confirmed) {
      uninstallPlugin(plugin.id);
    }
  };

  const renderStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      enabled: '#22c55e',
      disabled: theme.colors.textMuted,
      loading: theme.colors.warning,
      error: theme.colors.error,
      installed: theme.colors.textMuted,
    };

    return (
      <span style={{
        fontSize: theme.fontSize.xs,
        color: colors[status] || theme.colors.textMuted,
        fontWeight: theme.fontWeight.medium,
      }}>
        {t(`plugins.status_${status}`)}
      </span>
    );
  };

  const renderTypeBadge = (type: string) => (
    <span style={{
      fontSize: '10px',
      padding: `1px ${theme.space.xs}`,
      borderRadius: theme.radius.xs,
      background: `${TYPE_COLORS[type] || theme.colors.textMuted}22`,
      color: TYPE_COLORS[type] || theme.colors.textMuted,
      fontWeight: theme.fontWeight.medium,
      textTransform: 'uppercase',
    }}>
      {t(`plugins.type_${type}`) || type}
    </span>
  );

  const renderFlagBadge = (flag?: string) => {
    if (!flag) return null;
    return (
      <span style={{
        fontSize: '10px',
        padding: `1px ${theme.space.xs}`,
        borderRadius: theme.radius.xs,
        background: `${FLAG_COLORS[flag] || theme.colors.textMuted}22`,
        color: FLAG_COLORS[flag] || theme.colors.textMuted,
        fontWeight: theme.fontWeight.medium,
      }}>
        {t(`plugins.${flag}`)}
      </span>
    );
  };

  // ================================================================
  // Installed Tab
  // ================================================================

  // Build dynamic filter options from actual plugin types
  const filterOptions = React.useMemo(() => {
    const types = new Set(plugins.map(p => p.manifest.type));
    const opts = [{ value: 'all', label: t('plugins.filter_all') }];
    for (const type of Array.from(types).sort()) {
      opts.push({ value: type, label: t(`plugins.type_${type}`) || type });
    }
    return opts;
  }, [plugins, t]);

  // Build dynamic marketplace filter options from registry plugin types
  const marketplaceFilterOptions = React.useMemo(() => {
    const types = new Set(registryPlugins.map(p => p.type));
    const opts = [{ value: 'all', label: t('plugins.filter_all') }];
    for (const type of Array.from(types).sort()) {
      opts.push({ value: type, label: t(`plugins.type_${type}`) || type });
    }
    return opts;
  }, [registryPlugins, t]);

  // Filter marketplace plugins
  const filteredMarketplace = registryPlugins.filter(p => {
    const q = marketplaceSearch.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
    if (marketplaceFilter !== 'all' && p.type !== marketplaceFilter) return false;
    return true;
  });

  // Filter plugins based on search and filter
  const filteredPlugins = plugins.filter(p => {
    const q = searchQuery.toLowerCase();
    if (q && !p.manifest.name.toLowerCase().includes(q) && !p.manifest.description.toLowerCase().includes(q)) {
      return false;
    }
    if (filter !== 'all' && p.manifest.type !== filter) return false;
    return true;
  });

  const renderInstalledTab = () => (
    <div>
      {/* Search + Filter row */}
      <div style={{
        display: 'flex',
        gap: theme.space.sm,
        marginBottom: theme.space.md,
        alignItems: 'stretch',
      }}>
        <SInput
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('plugins.search')}
          inputStyle={{ flex: 1, minWidth: 0 }}
        />
        <div style={{ flexShrink: 0 }}>
          <CustomSelect
            value={filter}
            options={filterOptions}
            onChange={setFilter}
          />
        </div>
      </div>

      {filteredPlugins.length === 0 && (
        <div style={{
          padding: theme.space.xl,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
        }}>
          {t('plugins.no_plugins')}
        </div>
      )}

      {filteredPlugins.map((plugin) => (
        <div key={plugin.id} style={{
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
          marginBottom: theme.space.md,
        }}>
          {/* Plugin header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: theme.space.sm,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: theme.space.sm,
                marginBottom: theme.space.xs,
              }}>
                <span style={{
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                  color: theme.colors.textPrimary,
                }}>
                  {plugin.manifest.name}
                </span>
                {renderTypeBadge(plugin.manifest.type)}
                {renderFlagBadge(plugin.manifest.flag)}
              </div>
              <div style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
              }}>
                v{plugin.installedVersion} - {plugin.manifest.author}
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{
            fontSize: theme.fontSize.sm,
            color: theme.colors.textMuted,
            marginBottom: theme.space.sm,
            lineHeight: 1.4,
          }}>
            {plugin.manifest.description}
          </div>

          {/* Setup message */}
          {plugin.setupMessage && (
            <div style={{
              padding: `${theme.space.sm} ${theme.space.md}`,
              background: `${theme.colors.warning}18`,
              border: `1px solid ${theme.colors.warning}44`,
              borderRadius: theme.radius.sm,
              marginBottom: theme.space.sm,
              fontSize: theme.fontSize.xs,
              color: theme.colors.warning,
              display: 'flex',
              alignItems: 'center',
              gap: theme.space.sm,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {plugin.setupMessage}
            </div>
          )}

          {/* Status and actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
              {renderStatusBadge(plugin.status)}
              {plugin.error && (
                <span style={{
                  fontSize: theme.fontSize.xs,
                  color: theme.colors.error,
                }}>
                  - {plugin.error}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* Update button OR Reboot button if setup requires reboot */}
              {(() => {
                const rp = registryPlugins.find(r => r.id === plugin.id);
                const needsReboot = plugin.setupMessage?.toLowerCase().includes('reboot');
                const hasUpdate = rp && rp.hasUpdate;
                const isUpdating = installingPlugins.has(plugin.id);

                if (needsReboot && !hasUpdate) {
                  return (
                    <SButton
                      variant="warning"
                      onClick={() => rebootSystem()}
                      style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6" />
                        <path d="M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    </SButton>
                  );
                }

                if (!hasUpdate) return null;
                return (
                  <SButton
                    variant="warning"
                    onClick={() => !isUpdating && installPlugin(plugin.id, rp.latestVersion)}
                    disabled={isUpdating}
                    style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                  >
                    {isUpdating ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ animation: 'spin 0.6s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                  </SButton>
                );
              })()}

              {/* Settings button for drivers with configSchema */}
              {plugin.manifest.type === 'driver' && plugin.manifest.driver?.configSchema && plugin.manifest.driver.configSchema.length > 0 && (
                <SButton
                  variant="outline"
                  onClick={() => setSettingsPlugin(plugin)}
                  style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </SButton>
              )}

              <SButton
                variant="danger"
                onClick={() => handleUninstall(plugin)}
                style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </SButton>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // ================================================================
  // Marketplace Tab
  // ================================================================

  const renderMarketplaceTab = () => (
    <div>
      {/* Search + Filter + Refresh row */}
      <div style={{
        display: 'flex',
        gap: theme.space.sm,
        marginBottom: theme.space.md,
        alignItems: 'stretch',
      }}>
        <SInput
          value={marketplaceSearch}
          onChange={(e) => setMarketplaceSearch(e.target.value)}
          placeholder={t('plugins.search')}
          inputStyle={{ flex: 1, minWidth: 0 }}
        />
        <div style={{ flexShrink: 0 }}>
          <CustomSelect
            value={marketplaceFilter}
            options={marketplaceFilterOptions}
            onChange={setMarketplaceFilter}
          />
        </div>
        <SButton
          variant="secondary"
          onClick={handleRefresh}
          disabled={isSpinning}
          style={{ flexShrink: 0 }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              animation: isSpinning ? 'spin 0.6s linear infinite' : 'none',
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </SButton>
      </div>

      {/* Loading state */}
      {registryLoading && registryPlugins.length === 0 && (
        <div style={{
          padding: theme.space.xl,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
        }}>
          {t('plugins.loading_marketplace')}
        </div>
      )}

      {/* No plugins state */}
      {!registryLoading && filteredMarketplace.length === 0 && (
        <div style={{
          padding: theme.space.xl,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
        }}>
          {t('plugins.no_marketplace')}
        </div>
      )}

      {/* Plugin cards */}
      {filteredMarketplace.map((rp) => (
        <div key={rp.id} style={{
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
          marginBottom: theme.space.md,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: theme.space.md,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: theme.space.sm,
                marginBottom: theme.space.xs,
              }}>
                <span style={{
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                  color: theme.colors.textPrimary,
                }}>
                  {rp.name}
                </span>
                {renderTypeBadge(rp.type)}
                {renderFlagBadge(rp.flag)}
              </div>
              <div style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
              }}>
                v{rp.latestVersion} - {rp.author}
              </div>
            </div>

            {/* Install/Update button */}
            {installingPlugins.has(rp.id) ? (
              <SButton
                variant="secondary"
                disabled
                style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ animation: 'spin 0.6s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </SButton>
            ) : !rp.isInstalled ? (
              <SButton
                variant="primary"
                onClick={() => installPlugin(rp.id)}
                style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </SButton>
            ) : rp.hasUpdate ? (
              <SButton
                variant="warning"
                onClick={() => installPlugin(rp.id, rp.latestVersion)}
                style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </SButton>
            ) : (
              <span style={{
                padding: `${theme.space.sm} ${theme.space.md}`,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
          </div>

          <div style={{
            fontSize: theme.fontSize.sm,
            color: theme.colors.textMuted,
            marginTop: theme.space.sm,
            lineHeight: 1.4,
          }}>
            {rp.description}
          </div>
        </div>
      ))}
    </div>
  );

  // ================================================================
  // Main Render
  // ================================================================

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        gap: theme.space.sm,
        marginBottom: theme.space.lg,
      }}>
        {(['installed', 'marketplace'] as SubTab[]).map((tab) => (
          <SButton
            key={tab}
            variant={subTab === tab ? 'primary' : 'outline'}
            onClick={() => setSubTab(tab)}
            fullWidth
          >
            {t(`plugins.${tab}`)}
          </SButton>
        ))}
      </div>

      {subTab === 'installed' ? renderInstalledTab() : renderMarketplaceTab()}

      {/* Driver Settings Dialog */}
      {settingsPlugin && (
        <DriverSettingsDialog
          plugin={settingsPlugin}
          sensorMappings={sensorMappings}
          debugData={debugData}
          sourceAvailability={sourceAvailability}
          allDriverPlugins={plugins.filter(p => p.manifest.type === 'driver')}
          pluginConfig={pluginConfigs[settingsPlugin.id] || {}}
          onSetMapping={setMapping}
          onRemoveMapping={removeMapping}
          onRefreshMappings={refreshMappings}
          onSetConfig={(key, value) => setPluginConfig(settingsPlugin.id, key, value)}
          onClose={() => setSettingsPlugin(null)}
        />
      )}
    </div>
  );
};
