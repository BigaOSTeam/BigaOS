/**
 * PluginContext - Client-side plugin state management
 *
 * Syncs with the server's PluginManager via WebSocket:
 * - Installed plugins and their status
 * - Marketplace registry
 * - Sensor mappings
 * - Plugin actions (enable, disable, install, etc.)
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';

// ============================================================================
// Types
// ============================================================================

export interface PluginManifestInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  type: 'driver' | 'ui-extension' | 'service' | 'integration';
  main: string;
  flag?: 'official' | 'community';
  capabilities: string[];
  configSchema?: Array<{
    key: string;
    label: string;
    type: string;
    default: any;
    description?: string;
    options?: Array<{ value: string; label: string }>;
    required?: boolean;
  }>;
  driver?: {
    protocol: string;
    dataStreams: Array<{
      id: string;
      name: string;
      dataType: string;
      unit: string;
      updateRate?: number;
      description?: string;
    }>;
    configSchema?: Array<{
      key: string;
      label: string;
      type: string;
      default: any;
      description?: string;
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
    }>;
  };
  dashboardItems?: Array<{
    id: string;
    name: string;
    description?: string;
    defaultSize: { w: number; h: number };
    clientBundle?: string;
    dataNeeds?: string[];
  }>;
}

export interface PluginInfo {
  id: string;
  manifest: PluginManifestInfo;
  status: 'installed' | 'enabled' | 'disabled' | 'error' | 'loading' | 'missing';
  error?: string;
  enabledByUser: boolean;
  installedVersion: string;
  setupMessage?: string;
  /** Parsed i18n translations keyed by language code */
  i18n?: Record<string, Record<string, string>>;
}

export interface RegistryPlugin {
  id: string;
  name: string;
  description: string;
  author: string;
  type: string;
  flag: string;
  latestVersion: string;
  capabilities: string[];
  isInstalled: boolean;
  installedVersion?: string;
  hasUpdate: boolean;
}

export interface SensorMappingInfo {
  slotType: string;
  pluginId: string;
  streamId: string;
  priority: number;
  active: boolean;
  lastValue?: any;
  lastUpdate?: string;
}

export interface DebugDataEntry {
  pluginId: string;
  streamId: string;
  dataType: string;
  value: any;
  timestamp: string;
}

export interface SourceInfo {
  pluginId: string;
  streamId: string;
  pluginName: string;
  streamName: string;
  interface: string;
  alive: boolean;
  lastUpdate?: string;
  selected: boolean;
}

export interface SlotAvailability {
  slotType: string;
  sources: SourceInfo[];
}

// ============================================================================
// Context Interface
// ============================================================================

interface PluginContextType {
  // Installed plugins
  plugins: PluginInfo[];

  // Merged plugin translations for a given language (all plugins combined)
  getPluginTranslations: (lang: string) => Record<string, string>;

  // Demo mode: true when the demo driver plugin is enabled
  isDemoActive: boolean;

  // Registry (marketplace)
  registryPlugins: RegistryPlugin[];
  registryLoading: boolean;
  refreshRegistry: () => void;

  // Install/update/uninstall progress
  installingPlugins: Set<string>;
  uninstallingPlugins: Set<string>;

  // Plugin actions
  installPlugin: (pluginId: string, version?: string) => void;
  uninstallPlugin: (pluginId: string) => void;
  enablePlugin: (pluginId: string) => void;
  disablePlugin: (pluginId: string) => void;

  // Sensor mappings
  sensorMappings: SensorMappingInfo[];
  debugData: DebugDataEntry[];
  sourceAvailability: SlotAvailability[];
  setMapping: (slotType: string, pluginId: string, streamId: string) => void;
  removeMapping: (slotType: string, pluginId: string, streamId: string) => void;
  autoMapDriver: (pluginId: string) => void;
  refreshMappings: () => void;

  // Plugin config
  pluginConfigs: Record<string, Record<string, any>>;
  loadPluginConfig: (pluginId: string, keys: string[]) => void;
  setPluginConfig: (pluginId: string, key: string, value: any) => void;

  // Plugin actions (RPC)
  executePluginAction: (pluginId: string, action: string, params?: any) => void;
  pluginActionResults: Record<string, any>;

  // System actions
  rebootSystem: () => void;
}

// ============================================================================
// Context
// ============================================================================

const PluginContext = createContext<PluginContextType | null>(null);

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [registryPlugins, setRegistryPlugins] = useState<RegistryPlugin[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set());
  const [uninstallingPlugins, setUninstallingPlugins] = useState<Set<string>>(new Set());
  const [sensorMappings, setSensorMappings] = useState<SensorMappingInfo[]>([]);
  const [debugData, setDebugData] = useState<DebugDataEntry[]>([]);
  const [sourceAvailability, setSourceAvailability] = useState<SlotAvailability[]>([]);
  const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, any>>>({});
  const [pluginActionResults, setPluginActionResults] = useState<Record<string, any>>({});

  useEffect(() => {
    const clearInstallingPlugins = (plugins: PluginInfo[]) => {
      setInstallingPlugins(prev => {
        if (prev.size === 0) return prev;
        const installedIds = new Set(plugins.map(p => p.id));
        const next = new Set(prev);
        for (const id of prev) {
          if (installedIds.has(id)) next.delete(id);
        }
        return next.size === prev.size ? prev : next;
      });
    };

    const clearUninstallingPlugins = (plugins: PluginInfo[]) => {
      setUninstallingPlugins(prev => {
        if (prev.size === 0) return prev;
        const installedIds = new Set(plugins.map(p => p.id));
        const next = new Set(prev);
        for (const id of prev) {
          if (!installedIds.has(id)) next.delete(id);
        }
        return next.size === prev.size ? prev : next;
      });
    };

    const handlePluginSync = (data: { plugins: PluginInfo[] }) => {
      setPlugins(data.plugins);
      clearInstallingPlugins(data.plugins);
      clearUninstallingPlugins(data.plugins);
    };

    const handlePluginUpdate = (data: { plugins: PluginInfo[] }) => {
      setPlugins(data.plugins);
      clearInstallingPlugins(data.plugins);
      clearUninstallingPlugins(data.plugins);

      // Locally update registry entries so hasUpdate clears immediately
      const installedVersions = new Map(data.plugins.map(p => [p.id, p.installedVersion]));
      setRegistryPlugins(prev => prev.map(rp => {
        const newVersion = installedVersions.get(rp.id);
        if (!newVersion || newVersion === rp.installedVersion) return rp;
        return {
          ...rp,
          isInstalled: true,
          installedVersion: newVersion,
          hasUpdate: newVersion !== rp.latestVersion,
        };
      }));

      // Also refresh from server for full accuracy
      wsService.emit('plugin_fetch_registry', {});
    };

    const handleMappingsSync = (data: { mappings: SensorMappingInfo[]; debugData?: DebugDataEntry[]; sourceAvailability?: SlotAvailability[] }) => {
      setSensorMappings(data.mappings);
      if (data.debugData) {
        setDebugData(data.debugData);
      }
      if (data.sourceAvailability) {
        setSourceAvailability(data.sourceAvailability);
      }
    };

    const handleMappingsUpdated = (data: { mappings: SensorMappingInfo[]; sourceAvailability?: SlotAvailability[] }) => {
      setSensorMappings(data.mappings);
      if (data.sourceAvailability) {
        setSourceAvailability(data.sourceAvailability);
      }
    };

    const handleRegistrySync = (data: { plugins: RegistryPlugin[] }) => {
      setRegistryPlugins(data.plugins);
      setRegistryLoading(false);
    };

    const handleConfigSync = (data: { pluginId: string; config: Record<string, any> }) => {
      setPluginConfigs(prev => ({
        ...prev,
        [data.pluginId]: { ...(prev[data.pluginId] || {}), ...data.config },
      }));
    };

    const handleInstallError = (data: { pluginId: string; error: string }) => {
      console.warn(`[PluginContext] Install failed for ${data.pluginId}: ${data.error}`);
      setInstallingPlugins(prev => {
        const next = new Set(prev);
        next.delete(data.pluginId);
        return next;
      });
    };

    wsService.on('plugin_sync', handlePluginSync);
    wsService.on('plugin_update', handlePluginUpdate);
    wsService.on('plugin_install_error', handleInstallError);
    wsService.on('sensor_mappings_sync', handleMappingsSync);
    wsService.on('sensor_mappings_updated', handleMappingsUpdated);
    wsService.on('plugin_registry_sync', handleRegistrySync);
    wsService.on('plugin_config_sync', handleConfigSync);

    const handleActionResult = (data: { pluginId: string; action: string; result: any }) => {
      setPluginActionResults(prev => ({
        ...prev,
        [`${data.pluginId}:${data.action}`]: data.result,
      }));
    };
    wsService.on('plugin_action_result', handleActionResult);

    // Request initial data
    wsService.emit('get_plugins', {});
    wsService.emit('get_sensor_mappings', {});

    return () => {
      wsService.off('plugin_sync', handlePluginSync);
      wsService.off('plugin_update', handlePluginUpdate);
      wsService.off('plugin_install_error', handleInstallError);
      wsService.off('sensor_mappings_sync', handleMappingsSync);
      wsService.off('sensor_mappings_updated', handleMappingsUpdated);
      wsService.off('plugin_registry_sync', handleRegistrySync);
      wsService.off('plugin_config_sync', handleConfigSync);
      wsService.off('plugin_action_result', handleActionResult);
    };
  }, []);

  const refreshRegistry = useCallback(() => {
    setRegistryLoading(true);
    wsService.emit('plugin_fetch_registry', {});
  }, []);

  const installPlugin = useCallback((pluginId: string, version?: string) => {
    setInstallingPlugins(prev => new Set(prev).add(pluginId));
    wsService.emit('plugin_install', { pluginId, version });
  }, []);

  const uninstallPlugin = useCallback((pluginId: string) => {
    setUninstallingPlugins(prev => new Set(prev).add(pluginId));
    wsService.emit('plugin_uninstall', { pluginId });
  }, []);

  const enablePlugin = useCallback((pluginId: string) => {
    wsService.emit('plugin_enable', { pluginId });
  }, []);

  const disablePlugin = useCallback((pluginId: string) => {
    wsService.emit('plugin_disable', { pluginId });
  }, []);

  const setMapping = useCallback((slotType: string, pluginId: string, streamId: string) => {
    wsService.emit('sensor_mapping_set', { slotType, pluginId, streamId });
  }, []);

  const removeMapping = useCallback((slotType: string, pluginId: string, streamId: string) => {
    wsService.emit('sensor_mapping_remove', { slotType, pluginId, streamId });
  }, []);

  const autoMapDriver = useCallback((pluginId: string) => {
    wsService.emit('sensor_mapping_automap', { pluginId });
  }, []);

  const refreshMappings = useCallback(() => {
    wsService.emit('get_sensor_mappings', {});
  }, []);

  const loadPluginConfig = useCallback((pluginId: string, keys: string[]) => {
    wsService.emit('plugin_config_get', { pluginId, keys });
  }, []);

  const setPluginConfig = useCallback((pluginId: string, key: string, value: any) => {
    setPluginConfigs(prev => ({
      ...prev,
      [pluginId]: { ...(prev[pluginId] || {}), [key]: value },
    }));
    wsService.emit('plugin_config_set', { pluginId, key, value });
  }, []);

  const executePluginAction = useCallback((pluginId: string, action: string, params?: any) => {
    wsService.emit('plugin_action', { pluginId, action, params });
  }, []);

  const rebootSystem = useCallback(() => {
    wsService.emit('system_reboot', {});
  }, []);

  // Merge all plugin translations for a given language
  const getPluginTranslations = useCallback((lang: string): Record<string, string> => {
    const merged: Record<string, string> = {};
    for (const plugin of plugins) {
      if (!plugin.i18n) continue;
      // Try requested language, fall back to English
      const translations = plugin.i18n[lang] || plugin.i18n['en'];
      if (translations) {
        Object.assign(merged, translations);
      }
    }
    return merged;
  }, [plugins]);

  const isDemoActive = plugins.some(p => p.id === 'bigaos-demo-driver' && p.status === 'enabled');

  const value: PluginContextType = {
    plugins,
    getPluginTranslations,
    isDemoActive,
    registryPlugins,
    registryLoading,
    refreshRegistry,
    installingPlugins,
    uninstallingPlugins,
    installPlugin,
    uninstallPlugin,
    enablePlugin,
    disablePlugin,
    sensorMappings,
    debugData,
    sourceAvailability,
    setMapping,
    removeMapping,
    autoMapDriver,
    refreshMappings,
    pluginConfigs,
    loadPluginConfig,
    setPluginConfig,
    executePluginAction,
    pluginActionResults,
    rebootSystem,
  };

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  );
};

export const usePlugins = () => {
  const context = useContext(PluginContext);
  if (!context) throw new Error('usePlugins must be used within PluginProvider');
  return context;
};
