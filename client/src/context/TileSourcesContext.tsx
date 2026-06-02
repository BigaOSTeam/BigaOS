import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { tileSourcesAPI, PublicTileSource } from '../services/api';
import { API_BASE_URL } from '../utils/urls';
import { useClientSetting } from './ClientSettingsContext';

/**
 * Loads the server's tile-source registry once and exposes it to the chart
 * views. The registry is the single source of truth for which base maps and
 * overlays exist, their attribution, and their "not for navigation" status.
 *
 * Base/overlay *selection* (which base is active, which overlays are on) lives
 * in per-client settings, not here — see `useChartLayers`.
 */

// Fallback used before the fetch resolves or if the server is unreachable.
// Mirrors the server registry's core entries so a fresh/offline client still
// renders a usable chart instead of a blank screen.
const FALLBACK_SOURCES: PublicTileSource[] = [
  {
    id: 'street',
    labelKey: 'tile_source.street',
    role: 'base',
    kind: 'remote',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    offlineDownloadable: true,
  },
  {
    id: 'satellite',
    labelKey: 'tile_source.satellite',
    role: 'base',
    kind: 'remote',
    attribution:
      '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX IT Services GmbH (CC BY-NC-SA 4.0)',
    maxZoom: 17,
    notForNavigation: true,
    offlineDownloadable: true,
  },
  {
    id: 'nautical',
    labelKey: 'tile_source.nautical',
    role: 'overlay',
    kind: 'remote',
    attribution: '© <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors',
    maxZoom: 18,
    defaultEnabled: true,
    offlineDownloadable: true,
  },
];

interface TileSourcesContextValue {
  sources: PublicTileSource[];
  bases: PublicTileSource[];
  overlays: PublicTileSource[];
  loaded: boolean;
  getSource: (id: string) => PublicTileSource | undefined;
  /** Build the server-proxied tile URL template for a source id. */
  tileUrl: (id: string) => string;
}

const TileSourcesContext = createContext<TileSourcesContextValue | null>(null);

export const TileSourcesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sources, setSources] = useState<PublicTileSource[]>(FALLBACK_SOURCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    tileSourcesAPI
      .list()
      .then((res) => {
        if (cancelled) return;
        if (res.data?.sources?.length) {
          setSources(res.data.sources);
        }
        setLoaded(true);
      })
      .catch((err) => {
        // Keep the fallback sources; the chart still works with street +
        // satellite + nautical. Log for diagnosis but don't surface an error.
        console.warn('Failed to load tile-source registry, using fallback:', err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tileUrl = useCallback(
    (id: string) => `${API_BASE_URL}/tiles/${id}/{z}/{x}/{y}`,
    []
  );

  const getSource = useCallback(
    (id: string) => sources.find((s) => s.id === id),
    [sources]
  );

  const value = useMemo<TileSourcesContextValue>(() => {
    return {
      sources,
      bases: sources.filter((s) => s.role === 'base'),
      overlays: sources.filter((s) => s.role === 'overlay'),
      loaded,
      getSource,
      tileUrl,
    };
  }, [sources, loaded, getSource, tileUrl]);

  return <TileSourcesContext.Provider value={value}>{children}</TileSourcesContext.Provider>;
};

export const useTileSources = (): TileSourcesContextValue => {
  const ctx = useContext(TileSourcesContext);
  if (!ctx) throw new Error('useTileSources must be used within a TileSourcesProvider');
  return ctx;
};

// Per-client settings keys for chart layer selection.
const BASE_MAP_KEY = 'chartBaseMap';
const OVERLAYS_KEY = 'chartOverlays';
// Legacy boolean — read once for migration, never written.
const LEGACY_SATELLITE_KEY = 'chartUseSatellite';

export interface ChartLayersState {
  /** Active base-map source id (e.g. 'street', 'satellite'). */
  baseMapId: string;
  setBaseMapId: (id: string) => void;
  /** Cycle to the next available base map (for the sidebar toggle button). */
  cycleBaseMap: () => void;
  /** Map of overlay id → enabled. Overlays default from the registry. */
  overlayEnabled: Record<string, boolean>;
  setOverlayEnabled: (id: string, enabled: boolean) => void;
  toggleOverlay: (id: string) => void;
  /** Sources currently visible (active base first, then enabled overlays). */
  activeSources: PublicTileSource[];
}

/**
 * Chart layer selection backed by per-client settings. Handles migration from
 * the old `chartUseSatellite` boolean: if no `chartBaseMap` is stored yet but
 * the legacy flag was true, the base defaults to 'satellite'.
 */
export const useChartLayers = (): ChartLayersState => {
  const { bases, overlays, getSource } = useTileSources();
  const [legacySatellite] = useClientSetting<boolean>(LEGACY_SATELLITE_KEY, false);
  const [storedBase, setStoredBase] = useClientSetting<string>(BASE_MAP_KEY, '');
  const [storedOverlays, setStoredOverlays] = useClientSetting<Record<string, boolean>>(
    OVERLAYS_KEY,
    {}
  );

  // Resolve the active base id. Precedence: explicit stored value → legacy
  // satellite flag → first base in the registry → 'street'.
  const baseMapId = useMemo(() => {
    if (storedBase && getSource(storedBase)?.role === 'base') return storedBase;
    if (legacySatellite && getSource('satellite')) return 'satellite';
    return bases[0]?.id ?? 'street';
  }, [storedBase, legacySatellite, bases, getSource]);

  const setBaseMapId = useCallback(
    (id: string) => setStoredBase(id),
    [setStoredBase]
  );

  const cycleBaseMap = useCallback(() => {
    if (bases.length === 0) return;
    const idx = bases.findIndex((b) => b.id === baseMapId);
    const next = bases[(idx + 1) % bases.length];
    setStoredBase(next.id);
  }, [bases, baseMapId, setStoredBase]);

  // Resolve overlay enabled-state: stored value wins, else registry default.
  const overlayEnabled = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const o of overlays) {
      result[o.id] =
        storedOverlays[o.id] !== undefined ? storedOverlays[o.id] : !!o.defaultEnabled;
    }
    return result;
  }, [overlays, storedOverlays]);

  const setOverlayEnabled = useCallback(
    (id: string, enabled: boolean) => {
      setStoredOverlays({ ...overlayEnabled, [id]: enabled });
    },
    [overlayEnabled, setStoredOverlays]
  );

  const toggleOverlay = useCallback(
    (id: string) => setOverlayEnabled(id, !overlayEnabled[id]),
    [overlayEnabled, setOverlayEnabled]
  );

  const activeSources = useMemo(() => {
    const out: PublicTileSource[] = [];
    const base = getSource(baseMapId);
    if (base) out.push(base);
    for (const o of overlays) {
      if (overlayEnabled[o.id]) out.push(o);
    }
    return out;
  }, [baseMapId, overlays, overlayEnabled, getSource]);

  return {
    baseMapId,
    setBaseMapId,
    cycleBaseMap,
    overlayEnabled,
    setOverlayEnabled,
    toggleOverlay,
    activeSources,
  };
};

/**
 * Aggregate the attribution HTML of the given sources into a single,
 * de-duplicated string for the chart's attribution control.
 */
export function buildAttribution(sources: PublicTileSource[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of sources) {
    if (s.attribution && !seen.has(s.attribution)) {
      seen.add(s.attribution);
      parts.push(s.attribution);
    }
  }
  return parts.join(' | ');
}
