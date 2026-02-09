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
  } = usePlugins();

  const [subTab, setSubTab] = useState<SubTab>('installed');

  // Fetch registry when marketplace tab is opened
  useEffect(() => {
    if (subTab === 'marketplace') {
      refreshRegistry();
    }
  }, [subTab, refreshRegistry]);

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

  const renderInstalledTab = () => (
    <div>
      {plugins.length === 0 && (
        <div style={{
          padding: theme.space.xl,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
        }}>
          {t('plugins.no_plugins')}
        </div>
      )}

      {plugins.map((plugin) => (
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
            alignItems: 'center',
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

            {/* Uninstall button (not for built-in) */}
            {!plugin.manifest.builtin && (
              <button
                onClick={() => handleUninstall(plugin)}
                className="touch-btn"
                style={{
                  padding: `${theme.space.xs} ${theme.space.md}`,
                  background: 'transparent',
                  border: `1px solid ${theme.colors.error}`,
                  borderRadius: theme.radius.sm,
                  color: theme.colors.error,
                  fontSize: theme.fontSize.xs,
                  cursor: 'pointer',
                }}
              >
                {t('plugins.uninstall')}
              </button>
            )}
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
      {/* Refresh button */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: theme.space.md,
      }}>
        <button
          onClick={() => refreshRegistry()}
          disabled={registryLoading}
          className="touch-btn"
          style={{
            padding: `${theme.space.xs} ${theme.space.md}`,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            cursor: registryLoading ? 'default' : 'pointer',
            opacity: registryLoading ? 0.5 : 1,
          }}
        >
          {registryLoading ? t('plugins.loading_marketplace') : t('plugins.refresh')}
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
      {!registryLoading && registryPlugins.length === 0 && (
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
      {registryPlugins.map((rp) => (
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
              fontSize: theme.fontSize.sm,
              fontWeight: subTab === tab ? theme.fontWeight.semibold : theme.fontWeight.normal,
              cursor: 'pointer',
              transition: `all ${theme.transition.fast}`,
            }}
          >
            {t(`plugins.${tab}`)}
          </button>
        ))}
      </div>

      {subTab === 'installed' ? renderInstalledTab() : renderMarketplaceTab()}
    </div>
  );
};
