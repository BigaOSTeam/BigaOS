import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { wsService } from '../services/websocket';

interface BoatSettingsContextValue {
  settings: Record<string, unknown>;
  loaded: boolean;
  setSetting: (key: string, value: unknown) => void;
}

const BoatSettingsContext = createContext<BoatSettingsContextValue | null>(null);

interface BoatSettingsProviderProps {
  children: ReactNode;
}

/**
 * BoatSettings holds the boat-wide settings dictionary mirrored from the
 * server. It exists alongside (not in place of) SettingsContext: that one
 * still owns the type-safe, business-logic settings (units, alerts, vessel
 * info, etc.) — this one is a generic key/value store for things that are
 * shared boat-wide but don't need a dedicated context entry. Both subscribe
 * to the same `settings_sync` / `settings_changed` events; that's fine.
 */
export const BoatSettingsProvider: React.FC<BoatSettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handleSync = (data: { settings: Record<string, unknown> }) => {
      setSettings(data.settings || {});
      setLoaded(true);
    };

    const handleChanged = (data: { key: string; value: unknown }) => {
      setSettings((prev) => {
        if (prev[data.key] === data.value) return prev;
        return { ...prev, [data.key]: data.value };
      });
    };

    wsService.on('settings_sync', handleSync);
    wsService.on('settings_changed', handleChanged);

    // Request initial settings on mount and on every reconnect.
    const requestSettings = () => wsService.emit('get_settings', {});
    requestSettings();
    const handleReachable = (data: { reachable: boolean }) => {
      if (data.reachable) requestSettings();
    };
    wsService.on('server_reachability', handleReachable);

    return () => {
      wsService.off('settings_sync', handleSync);
      wsService.off('settings_changed', handleChanged);
      wsService.off('server_reachability', handleReachable);
    };
  }, []);

  const setSetting = useCallback((key: string, value: unknown) => {
    setSettings((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
    wsService.emit('settings_update', { key, value });
  }, []);

  const value = useMemo<BoatSettingsContextValue>(
    () => ({ settings, loaded, setSetting }),
    [settings, loaded, setSetting]
  );

  return <BoatSettingsContext.Provider value={value}>{children}</BoatSettingsContext.Provider>;
};

export const useBoatSettings = (): BoatSettingsContextValue => {
  const ctx = useContext(BoatSettingsContext);
  if (!ctx) throw new Error('useBoatSettings must be used within BoatSettingsProvider');
  return ctx;
};

export function useBoatSetting<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const { settings, setSetting } = useBoatSettings();
  const stored = settings[key];
  const value = (stored === undefined ? defaultValue : stored) as T;
  const setter = useCallback((v: T) => setSetting(key, v), [key, setSetting]);
  return [value, setter];
}
