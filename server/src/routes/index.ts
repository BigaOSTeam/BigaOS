import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sensorController } from '../controllers/sensor.controller';
import { DatabaseController } from '../controllers/database.controller';
import { navigationController } from '../controllers/navigation.controller';
import { navigationDataController } from '../controllers/navigation-data.controller';
import { tilesController } from '../controllers/tiles.controller';
import { depthController } from '../controllers/depth.controller';
import { heritageController } from '../controllers/heritage.controller';
import { seabedController } from '../controllers/seabed.controller';
import { regionalImportController } from '../controllers/regional-import.controller';
import { autopilotController } from '../controllers/autopilot.controller';
import { weatherController } from '../controllers/weather.controller';
import { unifiedDataController } from '../controllers/unified-data.controller';
import { systemController } from '../controllers/system.controller';
import { apkController } from '../controllers/apk.controller';
import { configController } from '../controllers/config.controller';
import { LogbookController } from '../controllers/logbook.controller';
import clientsRouter from './clients';
import express from 'express';

const router = Router();

// Rate limiters. Heavy ops (downloads, deletes, system commands) get a tight
// budget; static reads get a generous one. Tile serving is intentionally not
// rate-limited because a single map view fetches dozens of tiles per pan.
const heavyOpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly' },
});
const fileOpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly' },
});
// Tile serving fires *hundreds* of requests during vigorous panning — two tile
// layers (e.g. satellite + nautical), each with a load buffer, plus the
// client's on-error retries. 1200/min was far too low and produced a 429 storm
// (a 429 triggers a cache-buster retry, which 429s again...). Set very high so
// it never bites normal use; it's only a backstop against a runaway loop.
const tileServeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many tile requests',
});

// Client management routes
router.use('/clients', clientsRouter);

// Sensor routes
router.get('/sensors', sensorController.getAllSensors.bind(sensorController));
router.post('/sensors/history/batch', sensorController.getHistoryBatch.bind(sensorController));
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
router.post('/navigation/weather-route', navigationController.weatherRoute.bind(navigationController));
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
router.get('/data/status', fileOpsLimiter, navigationDataController.getStatus.bind(navigationDataController));
router.get('/data/progress/:fileId', navigationDataController.getDownloadProgress.bind(navigationDataController));
router.post('/data/download/:fileId', heavyOpsLimiter, navigationDataController.downloadFile.bind(navigationDataController));
router.post('/data/cancel/:fileId', heavyOpsLimiter, navigationDataController.cancelDownload.bind(navigationDataController));
router.put('/data/:fileId/url', heavyOpsLimiter, navigationDataController.updateUrl.bind(navigationDataController));
router.delete('/data/:fileId', heavyOpsLimiter, navigationDataController.deleteFile.bind(navigationDataController));

// Tile routes — live proxy + source registry. (Offline/bulk tile download was
// removed; tiles are fetched on demand only.)
router.get('/tiles/sources', fileOpsLimiter, tilesController.getTileSources.bind(tilesController));
router.get('/tiles/status', fileOpsLimiter, tilesController.getStatus.bind(tilesController));
router.get('/tiles/storage', fileOpsLimiter, tilesController.getStorageStats.bind(tilesController));
// Tile serving (must be last due to wildcard params).
router.get('/tiles/:source/:z/:x/:y', tileServeLimiter, tilesController.serveTile.bind(tilesController));

// Depth contours — vector isobaths, offline-first (downloaded tiles) with an
// EMODnet WCS online fallback. /coverage is a fast local-vs-online pre-check.
router.get('/depth/contours', fileOpsLimiter, depthController.getContours.bind(depthController));
router.get('/depth/coverage', fileOpsLimiter, depthController.getCoverage.bind(depthController));

// "Worth a Look" points of interest — EMODnet shipwrecks + UNESCO coastal World
// Heritage sites, offline-first (downloaded pack) with a live EMODnet WFS fallback.
router.get('/heritage/features', fileOpsLimiter, heritageController.getFeatures.bind(heritageController));

// Seabed composition (anchoring) — EMODnet substrate + Posidonia polygons,
// offline-first (downloaded pack) with a live EMODnet Seabed Habitats WFS fallback.
router.get('/seabed/features', fileOpsLimiter, seabedController.getFeatures.bind(seabedController));

// Regional importer — user-added lake depth (modeled from an OSM outline + max
// depth), generated on-device and folded into the Depth overlay.
router.get('/regional/search', fileOpsLimiter, regionalImportController.search.bind(regionalImportController));
router.get('/regional/lakes', fileOpsLimiter, regionalImportController.list.bind(regionalImportController));
router.post('/regional/lakes', heavyOpsLimiter, regionalImportController.create.bind(regionalImportController));
router.delete('/regional/lakes/:id', heavyOpsLimiter, regionalImportController.remove.bind(regionalImportController));

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
router.get('/system/update/check', heavyOpsLimiter, systemController.checkForUpdate.bind(systemController));
router.post('/system/update/install', heavyOpsLimiter, systemController.installUpdate.bind(systemController));

// Android APK routes — info + download for the in-app update flow.
router.get('/apk/info', fileOpsLimiter, apkController.getInfo);
router.get('/apk/download', fileOpsLimiter, apkController.download);

// Logbook — passive GPS recording with per-day notes and replay. Read + edit
// only; the logbook is immutable history, no delete endpoint.
router.get('/logbook/days', LogbookController.listDays);
router.get('/logbook/days/:date', LogbookController.getDay);
router.get('/logbook/days/:date/track', LogbookController.getDayTrack);
router.patch('/logbook/days/:date', LogbookController.updateDay);

// Config backup — manual export/import of user configuration.
// Import accepts a larger body than the global 100kb default because bundles
// include all plugin configs, marker lists, etc.
router.get('/config/export', heavyOpsLimiter, configController.export.bind(configController));
router.post(
  '/config/import',
  heavyOpsLimiter,
  express.json({ limit: '10mb' }),
  configController.import.bind(configController)
);

export default router;
