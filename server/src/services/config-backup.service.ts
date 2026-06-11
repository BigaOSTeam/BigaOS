/**
 * Config backup service — explicit export / import of user configuration.
 *
 * This is the disaster-recovery path for "the NVMe died and the replacement
 * takes days". Instead of hours of re-clicking through settings, the user
 * downloads a bundle and uploads it back after reinstall.
 *
 * In-scope: settings (everything the user explicitly configured: units,
 * vessel info, alerts, language/theme, markers, plugin states + per-plugin
 * config, etc. — all of which live in the global `settings` table), the
 * switches table, the buttons table, and a list of installed plugins so we
 * can auto-reinstall them from the registry on import.
 *
 * Out-of-scope: sensor_data, events, trip_log, maintenance_log,
 * weather_cache, clients/client_settings (per-device, regenerated on first
 * connect), db_metadata. Ephemeral underway state (active route waypoints,
 * current navigation target) is stripped on export — restoring it on a new
 * boat-day would just be confusing.
 */

import { dbWorker } from './database-worker.service';
import { DataController } from './data.controller';
import { wsServerInstance } from '../websocket/websocket-server';
import { setLanguage as setI18nLanguage } from '../i18n/lang';
import { UserUnitPreferences } from '../types/units.types';

export const CONFIG_BUNDLE_VERSION = 2;

/**
 * Settings keys that represent underway / ephemeral state, not configuration.
 * Stripped on export so a backup taken mid-passage doesn't restore "I was
 * sailing somewhere" onto a fresh install.
 */
const UNDERWAY_SETTING_KEYS = new Set<string>([
  'routeWaypoints',
  'navigationTarget',
  'routeDepthInfo',
]);

export interface ConfigBundlePlugin {
  id: string;
  version: string;
  enabled: boolean;
}

export interface ConfigBundle {
  version: number;
  exportedAt: string;
  app: string;
  data: {
    settings: Record<string, any>;
    switches: any[];
    buttons: any[];
    plugins?: ConfigBundlePlugin[];
  };
}

export interface ImportSummary {
  settingsCount: number;
  switchesCount: number;
  buttonsCount: number;
  pluginsReinstalled: string[];
  pluginsMissing: string[];
}

export async function exportConfig(): Promise<ConfigBundle> {
  const settingsRows = await dbWorker.getAllSettings();
  const settings: Record<string, any> = {};
  for (const row of settingsRows) {
    if (UNDERWAY_SETTING_KEYS.has(row.key)) continue;
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  const switches = await dbWorker.getAllSwitches();
  const buttons = await dbWorker.getAllButtons();

  // Use the live PluginManager state — pluginStates in the settings table
  // only records plugins the user has *explicitly* toggled, but
  // PluginManager.getPluginList() reflects every plugin discovered on disk
  // along with its current enabled flag. That's the source of truth for
  // "what was on the boat when this bundle was made".
  const plugins: ConfigBundlePlugin[] = [];
  const pm = DataController.getInstance().getPluginManager();
  if (pm) {
    for (const p of pm.getPluginList()) {
      plugins.push({
        id: p.id,
        version: p.installedVersion || p.manifest?.version || '',
        enabled: p.enabledByUser,
      });
    }
  }

  return {
    version: CONFIG_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'BigaOS',
    data: { settings, switches, buttons, plugins },
  };
}

function validateBundle(bundle: any): asserts bundle is ConfigBundle {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Bundle is not a JSON object');
  }
  if (typeof bundle.version !== 'number') {
    throw new Error('Bundle is missing a numeric "version" field');
  }
  if (bundle.version < 1 || bundle.version > CONFIG_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported bundle version ${bundle.version}; this server accepts versions 1–${CONFIG_BUNDLE_VERSION}`
    );
  }
  if (!bundle.data || typeof bundle.data !== 'object') {
    throw new Error('Bundle is missing the "data" object');
  }
  const d = bundle.data;
  if (!d.settings || typeof d.settings !== 'object') {
    throw new Error('Bundle data.settings must be an object');
  }
  if (!Array.isArray(d.switches)) {
    throw new Error('Bundle data.switches must be an array');
  }
  if (!Array.isArray(d.buttons)) {
    throw new Error('Bundle data.buttons must be an array');
  }
  if (d.plugins !== undefined && !Array.isArray(d.plugins)) {
    throw new Error('Bundle data.plugins must be an array if present');
  }
}

export async function importConfig(bundleInput: unknown): Promise<ImportSummary> {
  validateBundle(bundleInput);
  const bundle = bundleInput;

  // 1. Settings: wipe and rewrite the table so the imported bundle is the
  //    sole source of truth. Otherwise stale keys from the current install
  //    would linger.
  await dbWorker.deleteAllSettings();
  const settingsEntries = Object.entries(bundle.data.settings);
  for (const [key, value] of settingsEntries) {
    await dbWorker.setSetting(key, JSON.stringify(value));
  }

  // 2. Switches: wipe and reinsert preserving IDs (button actions can
  //    reference switches by ID, so renaming on import would break them).
  await dbWorker.deleteAllSwitches();
  for (const sw of bundle.data.switches) {
    if (!sw || typeof sw.id !== 'string') continue;
    await dbWorker.createSwitch(
      sw.id,
      sw.name ?? '',
      sw.icon ?? 'lightbulb',
      sw.target_client_id ?? sw.targetClientId ?? '',
      sw.device_type ?? sw.deviceType ?? 'rpi4b',
      sw.relay_type ?? sw.relayType ?? 'active-low',
      sw.startup_behavior ?? sw.startupBehavior ?? 'keep-state',
      typeof sw.gpio_pin === 'number' ? sw.gpio_pin :
        (typeof sw.gpioPin === 'number' ? sw.gpioPin : 0)
    );
  }

  // 3. Buttons: same — preserve IDs.
  await dbWorker.deleteAllButtons();
  for (const btn of bundle.data.buttons) {
    if (!btn || typeof btn.id !== 'string') continue;
    const actionJson = typeof btn.action_json === 'string'
      ? btn.action_json
      : JSON.stringify(btn.action ?? { type: 'toggle_switch', switchId: '' });
    await dbWorker.createButton(
      btn.id,
      btn.name ?? '',
      btn.source_client_id ?? btn.sourceClientId ?? '',
      btn.device_type ?? btn.deviceType ?? 'rpi4b',
      typeof btn.gpio_pin === 'number' ? btn.gpio_pin :
        (typeof btn.gpioPin === 'number' ? btn.gpioPin : 0),
      btn.pull ?? 'up',
      btn.trigger ?? 'falling',
      typeof btn.debounce_ms === 'number' ? btn.debounce_ms :
        (typeof btn.debounceMs === 'number' ? btn.debounceMs : 50),
      btn.enabled === 0 || btn.enabled === false ? 0 : 1,
      actionJson,
      btn.overlay_enabled === 1 || btn.overlayEnabled === true ? 1 : 0,
      btn.overlay_edge ?? btn.overlayEdge ?? 'bottom',
      typeof btn.overlay_percent === 'number' ? btn.overlay_percent :
        (typeof btn.overlayPercent === 'number' ? btn.overlayPercent : 50),
    );
  }

  // 4. Apply side effects that normally fire when an individual setting
  //    changes via the WS path. We can't replay every settings_changed
  //    event because the import rewrites the whole table at once.
  const language = bundle.data.settings.language;
  if (typeof language === 'string') {
    setI18nLanguage(language as any);
  }

  // Push refreshed unit prefs to the DataController + AlertService so the
  // pipeline isn't running with the previous install's units.
  const unitPrefs: Partial<UserUnitPreferences> = {};
  for (const key of ['speedUnit', 'windUnit', 'depthUnit', 'temperatureUnit'] as const) {
    const v = bundle.data.settings[key];
    if (typeof v === 'string') {
      (unitPrefs as any)[key] = v;
    }
  }
  const dc = DataController.getInstance();
  if (Object.keys(unitPrefs).length > 0) {
    dc.updateUserPreferences(unitPrefs);
    dc.getAlertService().updateUserUnits(unitPrefs);
  }

  // 5. Plugin reinstall: for each plugin listed in the bundle, install it
  //    from the registry if it's not already on disk. Persist the
  //    enabled-state map either way so plugins discovered from disk get
  //    their state recorded, not just registry-installed ones.
  const pluginsReinstalled: string[] = [];
  const pluginsMissing: string[] = [];
  const bundlePlugins = (bundle.data.plugins ?? []) as ConfigBundlePlugin[];

  if (bundlePlugins.length > 0) {
    // Rewrite the pluginStates map to match the bundle, so even
    // discovered-from-disk plugins get an explicit state recorded.
    const statesObj: Record<string, boolean> = {};
    for (const bp of bundlePlugins) statesObj[bp.id] = !!bp.enabled;
    await dbWorker.setSetting('pluginStates', JSON.stringify(statesObj));

    const pm = dc.getPluginManager();
    if (pm) {
      let registry: any = null;
      try {
        registry = await pm.fetchRegistry();
      } catch (err) {
        console.warn('[ConfigImport] Failed to fetch plugin registry:', err);
      }
      const installed = new Set(pm.getPluginList().map(p => p.id));
      for (const bp of bundlePlugins) {
        if (installed.has(bp.id)) {
          // Already on disk — nothing to do, state was just persisted above.
          pluginsReinstalled.push(bp.id);
          continue;
        }
        const entry = registry?.plugins?.find((p: any) => p.id === bp.id);
        if (!entry) {
          pluginsMissing.push(bp.id);
          continue;
        }
        try {
          const ok = await pm.installPlugin(entry, bp.version || undefined);
          if (ok) {
            pluginsReinstalled.push(bp.id);
          } else {
            pluginsMissing.push(bp.id);
          }
        } catch (err) {
          console.warn(`[ConfigImport] installPlugin failed for ${bp.id}:`, err);
          pluginsMissing.push(bp.id);
        }
      }
    }
  }

  // 6. Reload in-memory caches in the services that own them, so they
  //    match what's now on disk. Each reload emits the appropriate
  //    "changed" event, which the WS layer broadcasts to all clients.
  await dc.getAlertService().reloadFromDb();
  await dc.getSwitchService().reloadFromDb();
  await dc.getButtonService().reloadFromDb();
  dc.getAlertService().refreshAlertMessages();

  // 7. Push one settings_sync to all connected clients so SettingsContext
  //    + BoatSettings pick up the new values without a page reload.
  if (wsServerInstance) {
    await wsServerInstance.broadcastSettingsSyncAll();
  }

  return {
    settingsCount: settingsEntries.length,
    switchesCount: bundle.data.switches.length,
    buttonsCount: bundle.data.buttons.length,
    pluginsReinstalled,
    pluginsMissing,
  };
}
