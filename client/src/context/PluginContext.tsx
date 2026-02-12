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
  builtin?: boolean;
  capabilities: string[];
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
  status: 'installed' | 'enabled' | 'disabled' | 'error' | 'loading';
  error?: string;
  enabledByUser: boolean;
  installedVersion: string;
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

// ============================================================================
// Context Interface
// ============================================================================

interface PluginContextType {
  // Installed plugins
  plugins: PluginInfo[];

  // Demo mode: true when the demo driver plugin is enabled
  isDemoActive: boolean;

  // Chart-only mode: true when the chart-only plugin is enabled
  isChartOnly: boolean;

  // Registry (marketplace)
  registryPlugins: RegistryPlugin[];
  registryLoading: boolean;
  refreshRegistry: () => void;

  // Plugin actions
  installPlugin: (pluginId: string, version?: string) => void;
  uninstallPlugin: (pluginId: string) => void;
  enablePlugin: (pluginId: string) => void;
  disablePlugin: (pluginId: string) => void;

  // Sensor mappings
  sensorMappings: SensorMappingInfo[];
  debugData: DebugDataEntry[];
  setMapping: (slotType: string, pluginId: string, streamId: string) => void;
  removeMapping: (slotType: string, pluginId: string, streamId: string) => void;
  autoMapDriver: (pluginId: string) => void;
  refreshMappings: () => void;

  // Plugin config
  pluginConfigs: Record<string, Record<string, any>>;
  loadPluginConfig: (pluginId: string, keys: string[]) => void;
  setPluginConfig: (pluginId: string, key: string, value: any) => void;
}

// ============================================================================
// Context
// ============================================================================

const PluginContext = createContext<PluginContextType | null>(null);

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [registryPlugins, setRegistryPlugins] = useState<RegistryPlugin[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [sensorMappings, setSensorMappings] = useState<SensorMappingInfo[]>([]);
  const [debugData, setDebugData] = useState<DebugDataEntry[]>([]);
  const [pluginConfigs, setPluginConfigs] = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    const handlePluginSync = (data: { plugins: PluginInfo[] }) => {
      setPlugins(data.plugins);
    };

    const handlePluginUpdate = (data: { plugins: PluginInfo[] }) => {
      setPlugins(data.plugins);
    };

    const handleMappingsSync = (data: { mappings: SensorMappingInfo[]; debugData?: DebugDataEntry[] }) => {
      setSensorMappings(data.mappings);
      if (data.debugData) {
        setDebugData(data.debugData);
      }
    };

    const handleMappingsUpdated = (data: { mappings: SensorMappingInfo[] }) => {
      setSensorMappings(data.mappings);
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

    wsService.on('plugin_sync', handlePluginSync);
    wsService.on('plugin_update', handlePluginUpdate);
    wsService.on('sensor_mappings_sync', handleMappingsSync);
    wsService.on('sensor_mappings_updated', handleMappingsUpdated);
    wsService.on('plugin_registry_sync', handleRegistrySync);
    wsService.on('plugin_config_sync', handleConfigSync);

    // Request initial data
    wsService.emit('get_plugins', {});
    wsService.emit('get_sensor_mappings', {});

    return () => {
      wsService.off('plugin_sync', handlePluginSync);
      wsService.off('plugin_update', handlePluginUpdate);
      wsService.off('sensor_mappings_sync', handleMappingsSync);
      wsService.off('sensor_mappings_updated', handleMappingsUpdated);
      wsService.off('plugin_registry_sync', handleRegistrySync);
      wsService.off('plugin_config_sync', handleConfigSync);
    };
  }, []);

  const refreshRegistry = useCallback(() => {
    setRegistryLoading(true);
    wsService.emit('plugin_fetch_registry', {});
  }, []);

  const installPlugin = useCallback((pluginId: string, version?: string) => {
    wsService.emit('plugin_install', { pluginId, version });
  }, []);

  const uninstallPlugin = useCallback((pluginId: string) => {
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

  const isDemoActive = plugins.some(p => p.id === 'bigaos-demo-driver' && p.status === 'enabled');
  const isChartOnly = plugins.some(p => p.id === 'bigaos-chart-only' && p.status === 'enabled');

  const value: PluginContextType = {
    plugins,
    isDemoActive,
    isChartOnly,
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
    autoMapDriver,
    refreshMappings,
    pluginConfigs,
    loadPluginConfig,
    setPluginConfig,
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
