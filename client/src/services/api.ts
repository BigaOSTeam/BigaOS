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

// Weather API
export const weatherAPI = {
  getCurrentWeather: () => api.get('/weather/current'),
  getForecast: () => api.get('/weather/forecast')
};

// Camera API
export const cameraAPI = {
  listCameras: () => api.get('/cameras'),
  getCameraDetails: (id: string) => api.get(`/cameras/${id}`),
  getCameraStream: (id: string) => api.get(`/cameras/${id}/stream`)
};

export default api;
