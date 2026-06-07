/**
 * NightModeProvider — per-device red "night vision" display.
 *
 * Reddening is done with a single global SVG colour-matrix filter (luminance →
 * red) applied to a full-viewport wrapper that encloses the whole visible app,
 * so it covers the UI chrome *and* the map tiles / canvas overlays uniformly —
 * something a colour theme cannot do. A luminance→red matrix keeps every pixel
 * legible as a shade of red (unlike a red multiply overlay, which would turn
 * this app's blue/cyan UI black).
 *
 * The filter is only attached to the wrapper while active; when inactive the
 * wrapper is `display: contents`, so it has zero layout effect in normal use.
 * It must NOT be applied to <html>/<body>: a `filter` on an ancestor re-anchors
 * `position: fixed` descendants to that ancestor, and this app has fixed
 * overlays — the wrapper is sized to the viewport so they still cover the screen.
 *
 * Configuration is per-client (key `nightMode`, same mechanism as sidebarPosition).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { wsService } from '../services/websocket';
import { useClientSetting } from './ClientSettingsContext';
import { useNow } from '../hooks/useNow';
import {
  NightModeConfig,
  DEFAULT_NIGHT_MODE,
  NIGHT_BRIGHTNESS,
  computeNightActive,
  type LatLon,
} from '../types/nightMode';

interface NightModeContextValue {
  config: NightModeConfig;
  setConfig: (config: NightModeConfig) => void;
  /** Whether the red filter is currently shown on this device. */
  active: boolean;
  /** Flip the effective state (used by the physical-button action). Exits auto. */
  toggle: () => void;
  /** Push this device's night-mode config to every screen on the boat. */
  applyToAll: () => void;
}

const NightModeContext = createContext<NightModeContextValue | null>(null);

const FILTER_ID = 'bigaos-night';

/** Hidden inline SVG holding the luminance→red colour matrix. */
const NightVisionFilterDefs: React.FC = () => (
  <svg
    width="0"
    height="0"
    aria-hidden="true"
    style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
  >
    <defs>
      <filter id={FILTER_ID} colorInterpolationFilters="sRGB">
        {/* R = weighted luminance of (R,G,B); G = B = 0; alpha passthrough. */}
        <feColorMatrix
          type="matrix"
          values="0.45 0.45 0.45 0 0
                  0    0    0    0 0
                  0    0    0    0 0
                  0    0    0    1 0"
        />
      </filter>
    </defs>
  </svg>
);

export const NightModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useClientSetting<NightModeConfig>('nightMode', DEFAULT_NIGHT_MODE);
  const now = useNow(60_000);

  // Latest boat position, tracked in a ref so 5 Hz GPS updates never re-render
  // the whole app. Night state is recomputed on the minute tick / config change,
  // reading the freshest position at that point.
  const posRef = useRef<LatLon | null>(null);
  useEffect(() => {
    const handler = (data: any) => {
      const p = data?.data?.navigation?.position;
      if (p && typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        posRef.current = { lat: p.latitude, lon: p.longitude };
      }
    };
    wsService.on('sensor_update', handler);
    return () => wsService.off('sensor_update', handler);
  }, []);

  const active = useMemo(
    () => computeNightActive(config, now, posRef.current),
    [config, now],
  );

  const brightness = NIGHT_BRIGHTNESS[config.intensity] ?? NIGHT_BRIGHTNESS.medium;

  const toggle = useCallback(() => {
    const isActive = computeNightActive(config, new Date(), posRef.current);
    setConfig({ ...config, mode: isActive ? 'off' : 'on' });
  }, [config, setConfig]);

  const applyToAll = useCallback(() => {
    wsService.emit('night_mode_apply_all', { config });
  }, [config]);

  const value = useMemo<NightModeContextValue>(
    () => ({ config, setConfig, active, toggle, applyToAll }),
    [config, setConfig, active, toggle, applyToAll],
  );

  return (
    <NightModeContext.Provider value={value}>
      <NightVisionFilterDefs />
      <div
        className={active ? 'night-wrapper night-vision' : 'night-wrapper'}
        style={{ ['--night-brightness' as any]: brightness }}
      >
        {children}
      </div>
    </NightModeContext.Provider>
  );
};

export const useNightMode = (): NightModeContextValue => {
  const ctx = useContext(NightModeContext);
  if (!ctx) throw new Error('useNightMode must be used within a NightModeProvider');
  return ctx;
};
