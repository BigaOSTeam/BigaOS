import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// State API
export const stateAPI = {
  getCurrentState: () => api.get('/state'),
  overrideState: (state: string, reason: string) =>
    api.post('/state/override', { state, reason }),
  cancelOverride: () => api.delete('/state/override'),
  getStateHistory: () => api.get('/state/history')
};

// Sensor API
export const sensorAPI = {
  getAllSensors: () => api.get('/sensors'),
  getSensorCategory: (category: string) => api.get(`/sensors/${category}`),
  getSensorHistory: (category: string, limit?: number) =>
    api.get(`/sensors/${category}/history`, { params: { limit } }),
  getSpecificSensorHistory: (category: string, sensor: string, minutes?: number) =>
    api.get(`/sensors/history/${category}/${sensor}`, { params: { minutes } })
};

// Navigation API
export const navigationAPI = {
  /**
   * Calculate a water-only route between two points
   */
  calculateRoute: (startLat: number, startLon: number, endLat: number, endLon: number) =>
    api.post<{
      success: boolean;
      waypoints: Array<{ lat: number; lon: number }>;
      distance: number;
      waypointCount: number;
      crossesLand: boolean;
    }>('/navigation/route', { startLat, startLon, endLat, endLon }),

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
    }>('/navigation/demo')
};

// Data Management API
export interface DownloadProgress {
  fileId: string;
  status: 'downloading' | 'extracting' | 'completed' | 'error' | 'idle';
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  startTime?: number;
}

export interface DataFileInfo {
  id: string;
  name: string;
  description: string;
  category: 'navigation' | 'other';
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

export default api;
