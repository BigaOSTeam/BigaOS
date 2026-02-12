/**
 * PluginManager - Plugin discovery, loading, lifecycle management
 *
 * Responsibilities:
 * - Discover installed plugins from the plugins/ directory
 * - Load and activate plugins with scoped PluginAPI instances
 * - Handle enable/disable with timeout-protected lifecycle calls
 * - Install/uninstall plugins from the GitHub registry
 * - Persist plugin states to database
 * - Emit events for WebSocket broadcasting
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  PluginManifest,
  PluginStatus,
  PluginInfo,
  BigaOSPlugin,
  PluginRegistry,
  RegistryEntry,
} from '../types/plugin.types';
import { PluginAPI } from './plugin-api';
import { SensorMappingService } from './sensor-mapping.service';
import { dbWorker } from './database-worker.service';

interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  module: BigaOSPlugin | null;
  api: PluginAPI | null;
  installedVersion: string;
  enabledByUser: boolean;
}

export class PluginManager extends EventEmitter {
  private plugins: Map<string, PluginInstance> = new Map();
  private pluginsDir: string;
  private dataEmitter: EventEmitter;
  private sensorMapping: SensorMappingService;
  private registryUrl: string = 'https://raw.githubusercontent.com/BigaOSTeam/BigaOS/main/plugins/registry.json';
  private cachedRegistry: PluginRegistry | null = null;

  constructor(dataEmitter: EventEmitter, sensorMapping: SensorMappingService, pluginsDir?: string) {
    super();
    this.dataEmitter = dataEmitter;
    this.sensorMapping = sensorMapping;
    this.pluginsDir = pluginsDir || path.join(__dirname, '../../../plugins');
  }

  async initialize(): Promise<void> {
    // Ensure plugins directory exists
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    // Load registry URL from settings
    try {
      const registryUrlSetting = await dbWorker.getSetting('pluginRegistryUrl');
      if (registryUrlSetting) {
        this.registryUrl = JSON.parse(registryUrlSetting);
      }
    } catch {
      // Use default
    }

    // Load plugin enabled/disabled states from database
    const pluginStates = await this.loadPluginStates();

    // Discover installed plugins
    this.discoverPlugins(pluginStates);

    // Activate enabled plugins
    for (const [id, plugin] of this.plugins) {
      if (plugin.enabledByUser) {
        await this.activatePlugin(id);
      }
    }

    console.log(`[PluginManager] Initialized with ${this.plugins.size} plugin(s)`);
  }

  // ================================================================
  // Discovery
  // ================================================================

  /**
   * Scan plugins directory for plugin.json files.
   */
  private discoverPlugins(states: Map<string, boolean>): void {
    let dirs: fs.Dirent[];
    try {
      dirs = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
    } catch {
      console.warn('[PluginManager] Could not read plugins directory');
      return;
    }

    for (const dir of dirs) {
      const manifestPath = path.join(this.pluginsDir, dir.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifestJson = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: PluginManifest = JSON.parse(manifestJson);

        const defaultEnabled = false;

        this.plugins.set(manifest.id, {
          manifest,
          status: 'installed',
          module: null,
          api: null,
          installedVersion: manifest.version,
          enabledByUser: states.get(manifest.id) ?? defaultEnabled,
        });

        console.log(`[PluginManager] Discovered plugin: ${manifest.id} v${manifest.version}`);
      } catch (err) {
        console.error(`[PluginManager] Failed to read manifest for ${dir.name}:`, err);
      }
    }
  }

  // ================================================================
  // Activation / Deactivation
  // ================================================================

  /**
   * Load and activate a plugin with isolation.
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (plugin.status === 'enabled') return true;

    plugin.status = 'loading';
    this.emitPluginUpdate();

    try {
      // Resolve entry point
      const entryPoint = path.join(this.pluginsDir, pluginId, plugin.manifest.main);
      if (!fs.existsSync(entryPoint)) {
        throw new Error(`Entry point not found: ${entryPoint}`);
      }

      // Create scoped API for this plugin
      const api = new PluginAPI(pluginId, plugin.manifest, this.dataEmitter);

      // Dynamic require with cache clearing
      const resolvedPath = require.resolve(entryPoint);
      delete require.cache[resolvedPath];
      const pluginModule: BigaOSPlugin = require(entryPoint);

      // Validate exports
      if (typeof pluginModule.activate !== 'function' || typeof pluginModule.deactivate !== 'function') {
        throw new Error('Plugin must export activate() and deactivate() functions');
      }

      // Activate with timeout (30 seconds)
      await Promise.race([
        pluginModule.activate(api),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Plugin activation timed out (30s)')), 30000)
        ),
      ]);

      plugin.module = pluginModule;
      plugin.api = api;
      plugin.status = 'enabled';
      plugin.error = undefined;

      // Auto-map driver streams
      if (plugin.manifest.type === 'driver' && plugin.manifest.driver?.dataStreams) {
        await this.sensorMapping.autoMapDriver(pluginId, plugin.manifest.driver.dataStreams);
      }

      console.log(`[PluginManager] Activated: ${pluginId}`);
      this.emitPluginUpdate();
      return true;
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message || 'Unknown activation error';
      plugin.module = null;
      plugin.api = null;

      console.error(`[PluginManager] Failed to activate ${pluginId}:`, err);
      this.emitPluginUpdate();
      return false;
    }
  }

  /**
   * Deactivate a plugin.
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.module) return false;

    try {
      await Promise.race([
        plugin.module.deactivate(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Deactivation timed out (10s)')), 10000)
        ),
      ]);
    } catch (err) {
      console.error(`[PluginManager] Error deactivating ${pluginId}:`, err);
    }

    // Clean up scoped API resources
    if (plugin.api) {
      plugin.api.dispose();
    }

    // Clear sensor data from this plugin
    this.sensorMapping.clearPacketData(pluginId);

    plugin.module = null;
    plugin.api = null;
    plugin.status = 'disabled';

    console.log(`[PluginManager] Deactivated: ${pluginId}`);
    this.emitPluginUpdate();
    return true;
  }

  // ================================================================
  // Enable / Disable (user-facing)
  // ================================================================

  async enablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.enabledByUser = true;
    await this.savePluginState(pluginId, true);

    return this.activatePlugin(pluginId);
  }

  async disablePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.enabledByUser = false;
    await this.savePluginState(pluginId, false);

    return this.deactivatePlugin(pluginId);
  }

  // ================================================================
  // Install / Uninstall
  // ================================================================

  /**
   * Install a plugin from the registry.
   */
  async installPlugin(registryEntry: RegistryEntry, version?: string): Promise<boolean> {
    const targetVersion = version || registryEntry.latestVersion;
    const versionEntry = registryEntry.versions.find(v => v.version === targetVersion);
    if (!versionEntry) return false;

    const pluginDir = path.join(this.pluginsDir, registryEntry.id);

    try {
      // Download tarball from GitHub
      const response = await fetch(versionEntry.downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Create plugin directory
      if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
      }

      // Extract tarball
      const tar = await import('tar');
      const tmpPath = path.join(this.pluginsDir, `${registryEntry.id}.tar.gz`);
      fs.writeFileSync(tmpPath, buffer);

      await tar.extract({
        file: tmpPath,
        cwd: pluginDir,
        strip: 1,  // Remove top-level directory from archive
      });

      // Clean up temp file
      fs.unlinkSync(tmpPath);

      // Verify plugin.json exists
      const manifestPath = path.join(pluginDir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Downloaded plugin does not contain plugin.json');
      }

      // Run npm install if package.json exists (for plugins with dependencies)
      const packageJsonPath = path.join(pluginDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        console.log(`[PluginManager] Running npm install for ${registryEntry.id}...`);
        const { execSync } = require('child_process');
        try {
          execSync('npm install --production', {
            cwd: pluginDir,
            timeout: 120000, // 2 minutes
            stdio: 'pipe',
          });
          console.log(`[PluginManager] npm install completed for ${registryEntry.id}`);
        } catch (npmErr: any) {
          console.warn(`[PluginManager] npm install failed for ${registryEntry.id}: ${npmErr.message}`);
          // Continue anyway - plugin may have bundled node_modules
        }
      }

      // Read manifest
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Add to plugins map
      this.plugins.set(manifest.id, {
        manifest,
        status: 'installed',
        module: null,
        api: null,
        installedVersion: manifest.version,
        enabledByUser: false,
      });

      console.log(`[PluginManager] Installed: ${manifest.id} v${manifest.version}`);
      this.emitPluginUpdate();
      return true;
    } catch (err: any) {
      console.error(`[PluginManager] Failed to install ${registryEntry.id}:`, err);

      // Clean up on failure
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }

      return false;
    }
  }

  /**
   * Uninstall a plugin.
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Cannot uninstall built-in plugins
    if (plugin.manifest.builtin) {
      console.warn(`[PluginManager] Cannot uninstall built-in plugin: ${pluginId}`);
      return false;
    }

    // Deactivate if running
    if (plugin.module) {
      await this.deactivatePlugin(pluginId);
    }

    // Remove mappings
    await this.sensorMapping.removeMappingsForPlugin(pluginId);

    // Remove plugin directory
    const pluginDir = path.join(this.pluginsDir, pluginId);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    // Remove from state
    await this.removePluginState(pluginId);
    this.plugins.delete(pluginId);

    console.log(`[PluginManager] Uninstalled: ${pluginId}`);
    this.emitPluginUpdate();
    return true;
  }

  // ================================================================
  // Registry
  // ================================================================

  /**
   * Fetch available plugins from the GitHub registry.
   */
  async fetchRegistry(forceRefresh?: boolean): Promise<PluginRegistry | null> {
    if (this.cachedRegistry && !forceRefresh) return this.cachedRegistry;
    if (!this.registryUrl) return null;

    try {
      const response = await fetch(this.registryUrl);
      if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`);
      this.cachedRegistry = await response.json() as PluginRegistry;
      return this.cachedRegistry;
    } catch (err) {
      console.error('[PluginManager] Failed to fetch registry:', err);
      return null;
    }
  }

  /**
   * Set the registry URL.
   */
  async setRegistryUrl(url: string): Promise<void> {
    this.registryUrl = url;
    this.cachedRegistry = null;
    await dbWorker.setSetting('pluginRegistryUrl', JSON.stringify(url));
  }

  // ================================================================
  // State Access (for UI)
  // ================================================================

  /**
   * Get info for all installed plugins.
   */
  getPluginList(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.manifest.id,
      manifest: p.manifest,
      status: p.status,
      error: p.error,
      enabledByUser: p.enabledByUser,
      installedVersion: p.installedVersion,
    }));
  }

  /**
   * Get info for a single plugin.
   */
  getPlugin(pluginId: string): PluginInfo | null {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;
    return {
      id: plugin.manifest.id,
      manifest: plugin.manifest,
      status: plugin.status,
      error: plugin.error,
      enabledByUser: plugin.enabledByUser,
      installedVersion: plugin.installedVersion,
    };
  }

  /**
   * Get a specific plugin's driver data streams.
   */
  getDriverStreams(pluginId: string): any[] | null {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.manifest.type !== 'driver') return null;
    return plugin.manifest.driver?.dataStreams ?? [];
  }

  // ================================================================
  // Persistence
  // ================================================================

  private async loadPluginStates(): Promise<Map<string, boolean>> {
    const states = new Map<string, boolean>();
    try {
      const raw = await dbWorker.getSetting('pluginStates');
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [id, enabled] of Object.entries(parsed)) {
          states.set(id, enabled as boolean);
        }
      }
    } catch {
      // Default: no saved states
    }
    return states;
  }

  private async savePluginState(pluginId: string, enabled: boolean): Promise<void> {
    const states = await this.loadPluginStates();
    states.set(pluginId, enabled);
    const obj = Object.fromEntries(states);
    await dbWorker.setSetting('pluginStates', JSON.stringify(obj));
  }

  private async removePluginState(pluginId: string): Promise<void> {
    const states = await this.loadPluginStates();
    states.delete(pluginId);
    const obj = Object.fromEntries(states);
    await dbWorker.setSetting('pluginStates', JSON.stringify(obj));
  }

  // ================================================================
  // Events
  // ================================================================

  private emitPluginUpdate(): void {
    this.emit('plugin_update', {
      plugins: this.getPluginList(),
    });
  }

  // ================================================================
  // Cleanup
  // ================================================================

  async stop(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (plugin.module) {
        await this.deactivatePlugin(id);
      }
    }
    console.log('[PluginManager] Stopped');
  }
}
