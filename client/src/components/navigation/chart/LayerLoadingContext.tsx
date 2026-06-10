/**
 * Shared loading channel for the chart's data overlays (depth, seabed,
 * heritage). Each layer reports its loading state here instead of pushing its
 * own notification, so several active layers produce ONE combined note rather
 * than a stack of near-identical "Loading ..." messages. With a single layer
 * loading, its specific message is shown; with several, a generic combined one.
 * The per-layer "online — tap to download" nudges are not routed through this.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useAlerts } from '../../../context/AlertContext';
import { useLanguage } from '../../../i18n/LanguageContext';

type SetLayerLoading = (key: string, label: string | null) => void;

const LayerLoadingContext = createContext<SetLayerLoading | null>(null);

export const LayerLoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pushNotification, clearNotification, updateNotification } = useAlerts();
  const { t } = useLanguage();

  const loadingRef = useRef<Map<string, string>>(new Map());
  const noteIdRef = useRef<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const setLayerLoading = useCallback<SetLayerLoading>(
    (key, label) => {
      const loading = loadingRef.current;
      if (label === null) loading.delete(key);
      else loading.set(key, label);

      if (loading.size === 0) {
        if (noteIdRef.current) {
          clearNotification(noteIdRef.current);
          noteIdRef.current = null;
        }
        return;
      }

      const message =
        loading.size === 1 ? loading.values().next().value! : tRef.current('chart.loading_layers');
      if (noteIdRef.current) updateNotification(noteIdRef.current, { message });
      else noteIdRef.current = pushNotification({ message, severity: 'info', tone: 'none' });
    },
    [pushNotification, clearNotification, updateNotification]
  );

  // Drop the note if the whole chart unmounts mid-load.
  useEffect(() => {
    return () => {
      if (noteIdRef.current) {
        clearNotification(noteIdRef.current);
        noteIdRef.current = null;
      }
    };
  }, [clearNotification]);

  return <LayerLoadingContext.Provider value={setLayerLoading}>{children}</LayerLoadingContext.Provider>;
};

export const useLayerLoading = (): SetLayerLoading => {
  const ctx = useContext(LayerLoadingContext);
  if (!ctx) {
    throw new Error('useLayerLoading must be used within a LayerLoadingProvider');
  }
  return ctx;
};
