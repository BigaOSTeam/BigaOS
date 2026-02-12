/**
 * PluginsTab - Plugin marketplace and installed plugins management
 *
 * Sub-tabs:
 * - Installed: List of installed plugins with enable/disable toggle, status, uninstall
 * - Marketplace: Browse and install plugins from the GitHub registry
 */

import React, { useState, useEffect } from 'react';
import { theme } from '../../styles/theme';
import { usePlugins, PluginInfo } from '../../context/PluginContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { DriverSettingsDialog } from './DriverStreamsPanel';
import { CustomSelect } from '../ui/CustomSelect';

type SubTab = 'installed' | 'marketplace';

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

export const PluginsTab: React.FC = () => {
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const {
    plugins,
    registryPlugins,
    registryLoading,
    refreshRegistry,
    installPlugin,
    uninstallPlugin,
    enablePlugin,
    disablePlugin,
    sensorMappings,
    debugData,
    setMapping,
    removeMapping,
    refreshMappings,
    pluginConfigs,
    loadPluginConfig,
    setPluginConfig,
  } = usePlugins();

  const [subTab, setSubTab] = useState<SubTab>('installed');
  const [settingsPlugin, setSettingsPlugin] = useState<PluginInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState<string>('all');

  // Fetch registry when marketplace tab is opened
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

  const handleToggle = (plugin: PluginInfo) => {
    if (plugin.enabledByUser) {
      disablePlugin(plugin.id);
    } else {
      enablePlugin(plugin.id);
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
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('plugins.search')}
          style={{
            flex: 1,
            minWidth: 0,
            padding: `${theme.space.sm} ${theme.space.md}`,
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.base,
            outline: 'none',
            boxSizing: 'border-box',
            minHeight: '48px',
          }}
        />
        <div style={{ width: '140px', flexShrink: 0 }}>
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
                alignItems: 'center',
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

            {/* Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm, flexShrink: 0 }}>
              {/* Enable/Disable Toggle */}
              <button
                onClick={() => handleToggle(plugin)}
                className="touch-btn"
                style={{
                  width: '56px',
                  height: '32px',
                  borderRadius: '16px',
                  border: 'none',
                  background: plugin.enabledByUser ? theme.colors.primary : theme.colors.bgCardActive,
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
                  left: plugin.enabledByUser ? '27px' : '3px',
                  transition: `left ${theme.transition.fast}`,
                }} />
              </button>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
              {/* Settings button for drivers with configSchema */}
              {plugin.manifest.type === 'driver' && plugin.manifest.driver?.configSchema && plugin.manifest.driver.configSchema.length > 0 && (
                <button
                  onClick={() => setSettingsPlugin(plugin)}
                  className="touch-btn"
                  style={{
                    padding: `${theme.space.sm} ${theme.space.md}`,
                    background: 'transparent',
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.sm,
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.sm,
                    cursor: 'pointer',
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.space.xs,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {t('plugins.settings')}
                </button>
              )}

              {/* Uninstall button (not for built-in) */}
              {!plugin.manifest.builtin && (
                <button
                  onClick={() => handleUninstall(plugin)}
                  className="touch-btn"
                  style={{
                    padding: `${theme.space.sm} ${theme.space.md}`,
                    background: 'transparent',
                    border: `1px solid ${theme.colors.error}`,
                    borderRadius: theme.radius.sm,
                    color: theme.colors.error,
                    fontSize: theme.fontSize.sm,
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  {t('plugins.uninstall')}
                </button>
              )}
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
        <input
          value={marketplaceSearch}
          onChange={(e) => setMarketplaceSearch(e.target.value)}
          placeholder={t('plugins.search')}
          style={{
            flex: 1,
            minWidth: 0,
            padding: `${theme.space.sm} ${theme.space.md}`,
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.base,
            outline: 'none',
            boxSizing: 'border-box',
            minHeight: '48px',
          }}
        />
        <div style={{ width: '140px', flexShrink: 0 }}>
          <CustomSelect
            value={marketplaceFilter}
            options={marketplaceFilterOptions}
            onChange={setMarketplaceFilter}
          />
        </div>
        <button
          onClick={() => refreshRegistry()}
          disabled={registryLoading}
          className="touch-btn"
          style={{
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            cursor: registryLoading ? 'default' : 'pointer',
            opacity: registryLoading ? 0.5 : 1,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              animation: registryLoading ? 'spin 1s linear infinite' : 'none',
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
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
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
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
            {!rp.isInstalled ? (
              <button
                onClick={() => installPlugin(rp.id)}
                className="touch-btn"
                style={{
                  padding: `${theme.space.sm} ${theme.space.lg}`,
                  background: theme.colors.primary,
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  color: '#fff',
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.medium,
                  cursor: 'pointer',
                }}
              >
                {t('plugins.install')}
              </button>
            ) : rp.hasUpdate ? (
              <button
                onClick={() => installPlugin(rp.id, rp.latestVersion)}
                className="touch-btn"
                style={{
                  padding: `${theme.space.sm} ${theme.space.lg}`,
                  background: theme.colors.warning,
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  color: '#000',
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.medium,
                  cursor: 'pointer',
                }}
              >
                {t('plugins.update')}
              </button>
            ) : (
              <span style={{
                padding: `${theme.space.sm} ${theme.space.lg}`,
                fontSize: theme.fontSize.sm,
                color: theme.colors.textMuted,
              }}>
                {t('plugins.installed_label')}
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
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className="touch-btn"
            style={{
              flex: 1,
              padding: `${theme.space.sm} ${theme.space.md}`,
              background: subTab === tab ? theme.colors.primary : theme.colors.bgCardActive,
              border: `1px solid ${subTab === tab ? theme.colors.primary : theme.colors.border}`,
              borderRadius: theme.radius.md,
              color: subTab === tab ? '#fff' : theme.colors.textMuted,
              fontSize: theme.fontSize.base,
              fontWeight: subTab === tab ? theme.fontWeight.semibold : theme.fontWeight.normal,
              cursor: 'pointer',
              transition: `all ${theme.transition.fast}`,
              minHeight: '48px',
            }}
          >
            {t(`plugins.${tab}`)}
          </button>
        ))}
      </div>

      {subTab === 'installed' ? renderInstalledTab() : renderMarketplaceTab()}

      {/* Driver Settings Dialog */}
      {settingsPlugin && (
        <DriverSettingsDialog
          plugin={settingsPlugin}
          sensorMappings={sensorMappings}
          debugData={debugData}
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
