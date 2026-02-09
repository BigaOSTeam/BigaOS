import { Router } from 'express';
import { stateController } from '../controllers/state.controller';
import { sensorController } from '../controllers/sensor.controller';
import { DatabaseController } from '../controllers/database.controller';
import { navigationController } from '../controllers/navigation.controller';
import { navigationDataController } from '../controllers/navigation-data.controller';
import { tilesController } from '../controllers/tiles.controller';
import { autopilotController } from '../controllers/autopilot.controller';
import { weatherController } from '../controllers/weather.controller';
import { unifiedDataController } from '../controllers/unified-data.controller';
import { systemController } from '../controllers/system.controller';

const router = Router();

// State routes
router.get('/state', stateController.getCurrentState.bind(stateController));
router.post('/state/override', stateController.overrideState.bind(stateController));
router.delete('/state/override', stateController.cancelOverride.bind(stateController));
router.get('/state/history', stateController.getStateHistory.bind(stateController));

// Sensor routes
router.get('/sensors', sensorController.getAllSensors.bind(sensorController));
router.get('/sensors/history/:category/:sensor', sensorController.getSpecificSensorHistory.bind(sensorController));
router.get('/sensors/:category', sensorController.getSensorCategory.bind(sensorController));
router.get('/sensors/:category/history', sensorController.getSensorHistory.bind(sensorController));

// Database routes
router.get('/database/stats', DatabaseController.getStats);
router.get('/database/settings', DatabaseController.getSettings);
router.put('/database/settings', DatabaseController.updateSetting);
router.get('/database/events', DatabaseController.getEvents);
router.post('/database/events/:id/acknowledge', DatabaseController.acknowledgeEvent);
router.get('/database/maintenance', DatabaseController.getMaintenanceLog);
router.post('/database/maintenance', DatabaseController.addMaintenanceItem);
router.put('/database/maintenance/:id', DatabaseController.updateMaintenanceItem);
router.get('/database/trips', DatabaseController.getTripLog);
router.post('/database/trips/start', DatabaseController.startTrip);
router.post('/database/trips/:id/end', DatabaseController.endTrip);
router.post('/database/cleanup', DatabaseController.cleanupOldData);

// Navigation routes
router.post('/navigation/route', navigationController.calculateRoute.bind(navigationController));
router.post('/navigation/check-route', navigationController.checkRoute.bind(navigationController));
router.get('/navigation/water-type', navigationController.getWaterType.bind(navigationController));
router.get('/navigation/demo', navigationController.getDemoNavigation.bind(navigationController));
router.post('/navigation/demo', navigationController.updateDemoNavigation.bind(navigationController));
// Navigation debug routes
router.get('/navigation/debug/water-grid', navigationController.getWaterGrid.bind(navigationController));
router.get('/navigation/debug/info', navigationController.getDebugInfo.bind(navigationController));

// Autopilot routes
router.get('/autopilot/status', autopilotController.getStatus.bind(autopilotController));
router.post('/autopilot/heading', autopilotController.setHeading.bind(autopilotController));
router.post('/autopilot/activate', autopilotController.activate.bind(autopilotController));
router.post('/autopilot/deactivate', autopilotController.deactivate.bind(autopilotController));

// Unified data routes (DataController API)
router.get('/unified', unifiedDataController.getSnapshot);
router.get('/unified/sensors', unifiedDataController.getSensors);
router.get('/unified/sensors/:path(*)', unifiedDataController.getSensorValue);
router.get('/unified/weather', unifiedDataController.getWeather);
router.get('/unified/alerts', unifiedDataController.getAlerts);
router.get('/unified/alerts/:id', unifiedDataController.getAlert);
router.put('/unified/alerts', unifiedDataController.upsertAlert);
router.delete('/unified/alerts/:id', unifiedDataController.deleteAlert);
router.post('/unified/alerts/:id/snooze', unifiedDataController.snoozeAlert);
router.post('/unified/alerts/:id/dismiss', unifiedDataController.dismissAlert);
router.post('/unified/alerts/:id/reset', unifiedDataController.resetPremadeAlert);
router.put('/unified/alerts/global', unifiedDataController.setGlobalEnabled);
router.get('/unified/units', unifiedDataController.getUnits);
router.put('/unified/units', unifiedDataController.updateUnits);

// Navigation data management routes
router.get('/data/status', navigationDataController.getStatus.bind(navigationDataController));
router.get('/data/progress/:fileId', navigationDataController.getDownloadProgress.bind(navigationDataController));
router.post('/data/download/:fileId', navigationDataController.downloadFile.bind(navigationDataController));
router.post('/data/cancel/:fileId', navigationDataController.cancelDownload.bind(navigationDataController));
router.put('/data/:fileId/url', navigationDataController.updateUrl.bind(navigationDataController));
router.delete('/data/:fileId', navigationDataController.deleteFile.bind(navigationDataController));

// Offline tiles routes
router.get('/tiles/status', tilesController.getStatus.bind(tilesController));
router.get('/tiles/regions', tilesController.getRegions.bind(tilesController));
router.post('/tiles/regions', tilesController.createRegion.bind(tilesController));
router.delete('/tiles/regions/:regionId', tilesController.deleteRegion.bind(tilesController));
router.post('/tiles/cancel/:regionId', tilesController.cancelDownload.bind(tilesController));
router.post('/tiles/retry/:regionId', tilesController.retryDownload.bind(tilesController));
router.post('/tiles/estimate', tilesController.getEstimate.bind(tilesController));
router.get('/tiles/storage', tilesController.getStorageStats.bind(tilesController));
// Tile serving (must be last due to wildcard params)
router.get('/tiles/:source/:z/:x/:y', tilesController.serveTile.bind(tilesController));

// Weather routes
router.get('/weather/current', weatherController.getCurrent.bind(weatherController));
router.get('/weather/forecast', weatherController.getForecast.bind(weatherController));
router.get('/weather/grid', weatherController.getGrid.bind(weatherController));
router.get('/weather/settings', weatherController.getSettings.bind(weatherController));
router.put('/weather/settings', weatherController.updateSettings.bind(weatherController));
router.delete('/weather/cache', weatherController.clearCache.bind(weatherController));

// Geocoding routes (proxied through server for offline awareness)
router.get('/geocoding/search', tilesController.searchLocations.bind(tilesController));

// System routes
router.get('/system/update/check', systemController.checkForUpdate.bind(systemController));
router.post('/system/update/install', systemController.installUpdate.bind(systemController));

export default router;
