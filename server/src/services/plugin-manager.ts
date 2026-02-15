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
import * as os from 'os';
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
  setupMessage?: string;
  /** Parsed i18n translations keyed by language code */
  i18n?: Record<string, Record<string, string>>;
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

        const defaultEnabled = manifest.builtin === true;

        // Restore persisted setup message (e.g. "Reboot required")
        // Clear it if the system has been rebooted since the message was written
        let setupMessage: string | undefined;
        const setupMsgFile = path.join(this.pluginsDir, dir.name, '.setup-message');
        if (fs.existsSync(setupMsgFile)) {
          const fileMtime = fs.statSync(setupMsgFile).mtimeMs;
          const bootTime = Date.now() - os.uptime() * 1000;
          if (fileMtime < bootTime) {
            // System was rebooted since the message was written — clear it
            fs.unlinkSync(setupMsgFile);
          } else {
            setupMessage = fs.readFileSync(setupMsgFile, 'utf-8').trim();
          }
        }

        // Load plugin i18n files if declared
        const i18n = this.loadPluginI18n(dir.name, manifest);

        this.plugins.set(manifest.id, {
          manifest,
          status: 'installed',
          module: null,
          api: null,
          installedVersion: manifest.version,
          enabledByUser: states.get(manifest.id) ?? defaultEnabled,
          setupMessage,
          i18n,
        });

        console.log(`[PluginManager] Discovered plugin: ${manifest.id} v${manifest.version}`);
      } catch (err) {
        console.error(`[PluginManager] Failed to read manifest for ${dir.name}:`, err);
      }
    }
  }

  /**
   * Load and parse a plugin's i18n .txt files.
   * Returns { en: { key: value }, de: { key: value } } or undefined.
   */
  private loadPluginI18n(dirName: string, manifest: PluginManifest): Record<string, Record<string, string>> | undefined {
    if (!manifest.i18n?.directory || !manifest.i18n?.languages?.length) return undefined;

    const i18nDir = path.join(this.pluginsDir, dirName, manifest.i18n.directory);
    if (!fs.existsSync(i18nDir)) return undefined;

    const result: Record<string, Record<string, string>> = {};

    for (const lang of manifest.i18n.languages) {
      const filePath = path.join(i18nDir, `${lang}.txt`);
      if (!fs.existsSync(filePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const translations: Record<string, string> = {};
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          if (key) translations[key] = value;
        }
        if (Object.keys(translations).length > 0) {
          result[lang] = translations;
        }
      } catch (err) {
        console.warn(`[PluginManager] Failed to read i18n file for ${manifest.id}/${lang}:`, err);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
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

      // Register stream metadata and auto-map driver streams
      if (plugin.manifest.type === 'driver' && plugin.manifest.driver?.dataStreams) {
        this.sensorMapping.registerStreamMeta(pluginId, plugin.manifest.name, plugin.manifest.driver.dataStreams);
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

    // Clear sensor data and stream metadata from this plugin
    this.sensorMapping.clearPacketData(pluginId);
    this.sensorMapping.clearStreamMeta(pluginId);

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

      // Clean existing plugin directory (removes stale node_modules from previous install)
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }
      fs.mkdirSync(pluginDir, { recursive: true });

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

      // Run setup.sh if it exists (system-level setup like apt packages, boot config)
      let setupMessage: string | undefined;
      const setupScript = path.join(pluginDir, 'setup.sh');
      if (fs.existsSync(setupScript)) {
        console.log(`[PluginManager] Running setup.sh for ${registryEntry.id}...`);
        const { execSync } = require('child_process');
        try {
          const output = execSync(`sudo bash "${setupScript}"`, {
            cwd: pluginDir,
            timeout: 120000,
            stdio: 'pipe',
          }).toString();
          console.log(`[PluginManager] setup.sh output for ${registryEntry.id}:\n${output}`);
          if (output.includes('REBOOT_REQUIRED')) {
            setupMessage = 'Reboot required to apply hardware changes';
          }
        } catch (setupErr: any) {
          const stderr = setupErr.stderr?.toString() || setupErr.message;
          console.warn(`[PluginManager] setup.sh failed for ${registryEntry.id}: ${stderr}`);
          setupMessage = `System setup failed: ${stderr.split('\n')[0]}`;
        }
      }

      // Persist setup message so it survives server restarts
      const setupMsgFile = path.join(pluginDir, '.setup-message');
      if (setupMessage) {
        fs.writeFileSync(setupMsgFile, setupMessage, 'utf-8');
      } else if (fs.existsSync(setupMsgFile)) {
        fs.unlinkSync(setupMsgFile);
      }

      // Read manifest
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Load plugin i18n files if declared
      const i18n = this.loadPluginI18n(manifest.id, manifest);

      // Add to plugins map
      this.plugins.set(manifest.id, {
        manifest,
        status: 'installed',
        module: null,
        api: null,
        installedVersion: manifest.version,
        enabledByUser: false,
        setupMessage,
        i18n,
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

    // Run uninstall.sh if it exists (clean up system-level changes from setup.sh)
    const pluginDir = path.join(this.pluginsDir, pluginId);
    const uninstallScript = path.join(pluginDir, 'uninstall.sh');
    if (fs.existsSync(uninstallScript)) {
      console.log(`[PluginManager] Running uninstall.sh for ${pluginId}...`);
      const { execSync } = require('child_process');
      try {
        const output = execSync(`sudo bash "${uninstallScript}"`, {
          cwd: pluginDir,
          timeout: 60000,
          stdio: 'pipe',
        }).toString();
        console.log(`[PluginManager] uninstall.sh output for ${pluginId}:\n${output}`);
      } catch (err: any) {
        const stderr = err.stderr?.toString() || err.message;
        console.warn(`[PluginManager] uninstall.sh failed for ${pluginId}: ${stderr}`);
      }
    }

    // Remove plugin directory
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
      setupMessage: p.setupMessage,
      i18n: p.i18n,
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
      setupMessage: plugin.setupMessage,
      i18n: plugin.i18n,
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
