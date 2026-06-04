import axios from 'axios';
import { API_BASE_URL } from '../utils/urls';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Sensor API
export const sensorAPI = {
  getAllSensors: () => api.get('/sensors'),
  getSensorCategory: (category: string) => api.get(`/sensors/${category}`),
  getSensorHistory: (category: string, limit?: number) =>
    api.get(`/sensors/${category}/history`, { params: { limit } }),
  getSpecificSensorHistory: (category: string, sensor: string, minutes?: number) =>
    api.get(`/sensors/history/${category}/${sensor}`, { params: { minutes } }),
  getHistoryBatch: (category: string, sensors: string[], minutes: number) =>
    api.post<Record<string, any[]>>('/sensors/history/batch', { category, sensors, minutes }),
};

// Navigation API
export const navigationAPI = {
  /**
   * Calculate a water-only route between two points
   * Uses longer timeout since pathfinding can take time for complex routes
   */
  calculateRoute: (startLat: number, startLon: number, endLat: number, endLon: number) =>
    api.post<{
      success: boolean;
      waypoints: Array<{ lat: number; lon: number }>;
      distance: number;
      waypointCount: number;
      crossesLand: boolean;
      failureReason?: string;
    }>('/navigation/route', { startLat, startLon, endLat, endLon }, { timeout: 120000 }),

  /**
   * Check if a direct route crosses land
   */
  checkRoute: (startLat: number, startLon: number, endLat: number, endLon: number) =>
    api.post<{
      crossesLand: boolean;
      landPointCount: number;
    }>('/navigation/check-route', { startLat, startLon, endLat, endLon }),

  /**
   * Get water type at a coordinate
   */
  getWaterType: (lat: number, lon: number) =>
    api.get<{
      lat: number;
      lon: number;
      waterType: 'ocean' | 'lake' | 'land';
      isWater: boolean;
    }>('/navigation/water-type', { params: { lat, lon } }),

  /**
   * Update demo navigation values on server
   */
  updateDemoNavigation: (data: { latitude?: number; longitude?: number; heading?: number; speed?: number }) =>
    api.post<{
      success: boolean;
      navigation: { latitude: number; longitude: number; heading: number; speed: number };
    }>('/navigation/demo', data),

  /**
   * Get current demo navigation values from server
   */
  getDemoNavigation: () =>
    api.get<{
      demoMode: boolean;
      navigation: { latitude: number; longitude: number; heading: number; speed: number };
    }>('/navigation/demo'),

  /**
   * Get water classification grid for debug overlay
   */
  getWaterGrid: (minLat: number, maxLat: number, minLon: number, maxLon: number, gridSize?: number) =>
    api.get<{
      grid: Array<{ lat: number; lon: number; type: 'ocean' | 'lake' | 'land' }>;
      count: number;
      bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
      gridSize: number;
    }>('/navigation/debug/water-grid', { params: { minLat, maxLat, minLon, maxLon, gridSize } }),

  /**
   * Get debug info about water detection service
   */
  getDebugInfo: () =>
    api.get<{
      initialized: boolean;
      usingSpatialIndex: boolean;
      usingLakeSpatialIndex: boolean;
      cacheStats: { size: number; maxSize: number };
    }>('/navigation/debug/info')
};

// Data Management API
export interface DownloadProgress {
  fileId: string;
  status: 'downloading' | 'extracting' | 'converting' | 'indexing' | 'completed' | 'error' | 'idle';
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  startTime?: number;
  conversionProgress?: number;
}

export interface DataFileInfo {
  id: string;
  name: string;
  description: string;
  category: 'navigation' | 'depth' | 'other';
  defaultUrl: string;
  url: string;
  localPath: string;
  extractTo?: string;
  exists: boolean;
  localDate?: string;
  remoteDate?: string;
  size?: number;
  remoteSize?: number;
  downloadStatus?: DownloadProgress;
}

export const dataAPI = {
  /**
   * Get status of all data files (includes download progress)
   */
  getStatus: () =>
    api.get<{ files: DataFileInfo[] }>('/data/status'),

  /**
   * Get download progress for a specific file
   */
  getProgress: (fileId: string) =>
    api.get<DownloadProgress>(`/data/progress/${fileId}`),

  /**
   * Start server-side download of a data file
   */
  downloadFile: (fileId: string) =>
    api.post<{ message: string; progress: DownloadProgress }>(`/data/download/${fileId}`),

  /**
   * Cancel an active download
   */
  cancelDownload: (fileId: string) =>
    api.post<{ success: boolean; message: string }>(`/data/cancel/${fileId}`),

  /**
   * Update URL for a data file
   */
  updateUrl: (fileId: string, url: string) =>
    api.put<{ success: boolean; url: string }>(`/data/${fileId}/url`, { url }),

  /**
   * Delete a data file
   */
  deleteFile: (fileId: string) =>
    api.delete<{ success: boolean; message: string }>(`/data/${fileId}`)
};

// Tile source registry
export type TileSourceRole = 'base' | 'overlay';
export type TileSourceKind = 'remote' | 'contours' | 'mbtiles';

/**
 * Public view of a server tile source (from GET /tiles/sources). The chart UI
 * renders its base/overlay controls, attribution, and disclaimers from this.
 */
export interface PublicTileSource {
  id: string;
  labelKey: string;
  role: TileSourceRole;
  kind: TileSourceKind;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  defaultEnabled?: boolean;
  notForNavigation?: boolean;
  offlineDownloadable?: boolean;
  estimatedBytesPerTile?: number;
}

export interface DeviceStorage {
  total: number;
  used: number;
  available: number;
  totalFormatted: string;
  usedFormatted: string;
  availableFormatted: string;
  usedPercent: number;
}

export interface StorageStats {
  totalRegions: number;
  completeRegions: number;
  totalBytes: number;
  totalSize: string;
  deviceStorage: DeviceStorage;
}

// Geocoding API (proxied through server for offline awareness)
export interface GeocodingSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  osm_id?: number;
  osm_type?: string;
  name?: string;
  city?: string;
  country?: string;
}

export interface GeocodingResponse {
  results: GeocodingSearchResult[];
  offline: boolean;
  message?: string;
}

export const geocodingAPI = {
  /**
   * Search for locations - returns empty results when offline
   */
  search: (query: string, limit: number = 5) =>
    api.get<GeocodingResponse>('/geocoding/search', {
      params: { q: query, limit }
    }),
};

// Weather API
import type { WeatherGrid, WeatherGridBounds, WeatherSettings, WeatherPoint } from '../types';

export interface WeatherCurrentResponse {
  current: WeatherPoint;
  location: { lat: number; lon: number };
  fetchedAt: string;
  expiresAt: string;
}

export interface WeatherForecastResponse {
  location: { lat: number; lon: number };
  current: WeatherPoint;
  hourly: WeatherPoint[];
  fetchedAt: string;
  expiresAt: string;
}

export const weatherAPI = {
  /**
   * Get current weather for a location
   */
  getCurrent: (lat: number, lon: number) =>
    api.get<WeatherCurrentResponse>('/weather/current', { params: { lat, lon } }),

  /**
   * Get hourly forecast for a location
   */
  getForecast: (lat: number, lon: number, hours: number = 168) =>
    api.get<WeatherForecastResponse>('/weather/forecast', { params: { lat, lon, hours } }),

  /**
   * Get weather grid for map overlay
   * Uses longer timeout since it may need multiple API calls with rate limiting
   */
  getGrid: (bounds: WeatherGridBounds, resolution: number = 0.5, hour: number = 0, config?: { signal?: AbortSignal }) =>
    api.get<WeatherGrid>('/weather/grid', {
      params: { ...bounds, resolution, hour },
      signal: config?.signal,
      timeout: 60000, // 60s timeout for grid requests (rate limiting may cause delays)
    }),

  /**
   * Get current weather settings
   */
  getSettings: () =>
    api.get<WeatherSettings>('/weather/settings'),

  /**
   * Update weather settings
   */
  updateSettings: (settings: Partial<WeatherSettings>) =>
    api.put<{ success: boolean; settings: WeatherSettings }>('/weather/settings', settings),
};

export const tileSourcesAPI = {
  /**
   * Get the tile-source registry (bases + overlays the server knows about).
   */
  list: () =>
    api.get<{ sources: PublicTileSource[] }>('/tiles/sources'),
};

// Depth contours (EMODnet/GEBCO isobaths, GeoJSON LineStrings tagged with depth).
export interface DepthContourFeature {
  type: 'Feature';
  properties: { depth: number };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}
export interface DepthContours {
  type: 'FeatureCollection';
  features: DepthContourFeature[];
  // Where the contours came from: 'local' = downloaded tiles (fast/offline),
  // 'online' = live EMODnet WCS fallback (slower; suggest downloading),
  // 'none' = no data for this area. Absent on older responses.
  source?: 'local' | 'online' | 'none';
}

export const depthAPI = {
  /**
   * Fetch depth contours for a bbox. Offline-first: downloaded tiles are fast,
   * but the online WCS fallback for an un-downloaded region can be slow (cold
   * regions up to ~2 min), so the timeout is generous. Callers pass an
   * AbortSignal to cancel on map move.
   */
  getContours: (
    bbox: { west: number; south: number; east: number; north: number },
    signal?: AbortSignal
  ) =>
    api.get<DepthContours>('/depth/contours', {
      params: bbox,
      signal,
      timeout: 180000,
    }),

  /**
   * Fast pre-check: are downloaded tiles available for this bbox? Lets the chart
   * show a "fetching online (slow)" note up front for un-downloaded areas,
   * instead of only after the slow contour fetch returns.
   */
  getCoverage: (
    bbox: { west: number; south: number; east: number; north: number },
    signal?: AbortSignal
  ) =>
    api.get<{ local: boolean }>('/depth/coverage', { params: bbox, signal, timeout: 8000 }),
};

// Map status: connectivity + device storage (no offline tile downloads).
export const mapStatusAPI = {
  /**
   * Get server connectivity status
   */
  getStatus: () =>
    api.get<{ online: boolean; lastCheck: number }>('/tiles/status'),

  /**
   * Get device storage statistics (free space, etc.)
   */
  getStorageStats: () =>
    api.get<StorageStats>('/tiles/storage'),
};

// System / Update API
export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  publishedAt: string;
  lastChecked: string;
  error?: string;
}

export const systemAPI = {
  checkForUpdate: (force: boolean = false) =>
    api.get<UpdateInfo>('/system/update/check', { params: { force } }),

  installUpdate: () =>
    api.post<{ status: string; version: string }>('/system/update/install'),
};

// Config backup
export interface ConfigImportSummary {
  status: 'ok';
  settingsCount: number;
  switchesCount: number;
  buttonsCount: number;
  /** Plugins that were already on disk or that we successfully fetched from the registry. */
  pluginsReinstalled?: string[];
  /** Plugins listed in the bundle but missing from the registry — user must install manually. */
  pluginsMissing?: string[];
}

// Logbook API — passive GPS recording with per-day notes and replay.
// All values from the server are in STANDARD units (m/s for speeds, meters for
// distance, radians for course, epoch-ms for timestamps). The client converts
// to user-preferred units at render time.
export interface LogbookDaySummary {
  date: string;                // 'YYYY-MM-DD'
  title: string | null;
  note: string | null;
  first_segment_at: number | null;
  last_segment_at: number | null;
  distance_m: number;
  underway_ms: number;
  max_sog: number;             // m/s
  segment_count: number;
}

export interface LogbookSegment {
  id: number;
  started_at: number;
  ended_at: number | null;
  distance_m: number;
  avg_sog: number;             // m/s
  max_sog: number;             // m/s
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
  point_count: number;
}

export interface LogbookDay {
  date: string;
  title: string | null;
  note: string | null;
  first_segment_at: number | null;
  last_segment_at: number | null;
}

export interface LogbookTrackpoint {
  ts: number;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  segment_id: number | null;
}

export const logbookAPI = {
  listDays: (params?: { from?: string; to?: string; limit?: number }) =>
    api.get<{ days: LogbookDaySummary[] }>('/logbook/days', { params }),

  getDay: (date: string) =>
    api.get<{ day: LogbookDay; segments: LogbookSegment[] }>(`/logbook/days/${date}`),

  getTrack: (date: string) =>
    api.get<{ date: string; points: LogbookTrackpoint[] }>(`/logbook/days/${date}/track`),

  updateDay: (date: string, body: { title?: string | null; note?: string | null }) =>
    api.patch<{ success: true }>(`/logbook/days/${date}`, body),
};

export const configAPI = {
  /** URL the browser hits to trigger a file download for the config bundle. */
  exportUrl: () => `${API_BASE_URL}/config/export`,

  /** Import a parsed bundle. The server wipes + rewrites settings/switches/buttons. */
  import: (bundle: unknown) =>
    api.post<ConfigImportSummary>('/config/import', bundle, {
      // Imports can include plugin configs and may trigger plugin
      // reinstalls from the registry — give it lots of headroom.
      timeout: 180000,
    }),
};

export default api;
