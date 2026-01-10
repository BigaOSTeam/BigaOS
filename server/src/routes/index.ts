import { Router } from 'express';
import { stateController } from '../controllers/state.controller';
import { sensorController } from '../controllers/sensor.controller';
import { DatabaseController } from '../controllers/database.controller';
import { navigationController } from '../controllers/navigation.controller';
import { dataManagementController } from '../controllers/data-management.controller';
import { tilesController } from '../controllers/tiles.controller';

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

// Data management routes
router.get('/data/status', dataManagementController.getStatus.bind(dataManagementController));
router.get('/data/progress/:fileId', dataManagementController.getDownloadProgress.bind(dataManagementController));
router.post('/data/download/:fileId', dataManagementController.downloadFile.bind(dataManagementController));
router.post('/data/cancel/:fileId', dataManagementController.cancelDownload.bind(dataManagementController));
router.put('/data/:fileId/url', dataManagementController.updateUrl.bind(dataManagementController));
router.delete('/data/:fileId', dataManagementController.deleteFile.bind(dataManagementController));

// Offline tiles routes
router.get('/tiles/status', tilesController.getStatus.bind(tilesController));
router.get('/tiles/regions', tilesController.getRegions.bind(tilesController));
router.post('/tiles/regions', tilesController.createRegion.bind(tilesController));
router.delete('/tiles/regions/:regionId', tilesController.deleteRegion.bind(tilesController));
router.post('/tiles/cancel/:regionId', tilesController.cancelDownload.bind(tilesController));
router.post('/tiles/estimate', tilesController.getEstimate.bind(tilesController));
router.get('/tiles/storage', tilesController.getStorageStats.bind(tilesController));
// Tile serving (must be last due to wildcard params)
router.get('/tiles/:source/:z/:x/:y', tilesController.serveTile.bind(tilesController));

// Geocoding routes (proxied through server for offline awareness)
router.get('/geocoding/search', tilesController.searchLocations.bind(tilesController));

export default router;
