import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { wsService } from '../services/websocket';
import { useClient } from './ClientContext';

interface ClientSettingsContextValue {
  settings: Record<string, unknown>;
  loaded: boolean;
  setSetting: (key: string, value: unknown) => void;
}

const ClientSettingsContext = createContext<ClientSettingsContextValue | null>(null);

interface ClientSettingsProviderProps {
  children: ReactNode;
}

export const ClientSettingsProvider: React.FC<ClientSettingsProviderProps> = ({ children }) => {
  const { clientId } = useClient();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!clientId) return;

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

    wsService.on('client_settings_sync', handleSync);
    wsService.on('client_settings_changed', handleChanged);

    // Request initial settings on mount and on every reconnect.
    const requestSettings = () => {
      requestedRef.current = true;
      wsService.emit('get_client_settings', { clientId });
    };
    requestSettings();
    const handleReachable = (data: { reachable: boolean }) => {
      if (data.reachable) requestSettings();
    };
    wsService.on('server_reachability', handleReachable);

    return () => {
      wsService.off('client_settings_sync', handleSync);
      wsService.off('client_settings_changed', handleChanged);
      wsService.off('server_reachability', handleReachable);
    };
  }, [clientId]);

  const setSetting = useCallback(
    (key: string, value: unknown) => {
      setSettings((prev) => {
        if (prev[key] === value) return prev;
        return { ...prev, [key]: value };
      });
      wsService.emit('client_settings_update', { clientId, key, value });
    },
    [clientId]
  );

  const value = useMemo<ClientSettingsContextValue>(
    () => ({ settings, loaded, setSetting }),
    [settings, loaded, setSetting]
  );

  return (
    <ClientSettingsContext.Provider value={value}>{children}</ClientSettingsContext.Provider>
  );
};

export const useClientSettings = (): ClientSettingsContextValue => {
  const ctx = useContext(ClientSettingsContext);
  if (!ctx) throw new Error('useClientSettings must be used within ClientSettingsProvider');
  return ctx;
};

export function useClientSetting<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const { settings, setSetting } = useClientSettings();
  const stored = settings[key];
  const value = (stored === undefined ? defaultValue : stored) as T;
  const setter = useCallback((v: T) => setSetting(key, v), [key, setSetting]);
  return [value, setter];
}
