import { Router } from 'express';
import { stateController } from '../controllers/state.controller';
import { sensorController } from '../controllers/sensor.controller';
import { weatherController } from '../controllers/weather.controller';
import { cameraController } from '../controllers/camera.controller';

const router = Router();

// State routes
router.get('/state', stateController.getCurrentState.bind(stateController));
router.post('/state/override', stateController.overrideState.bind(stateController));
router.delete('/state/override', stateController.cancelOverride.bind(stateController));
router.get('/state/history', stateController.getStateHistory.bind(stateController));

// Sensor routes
router.get('/sensors', sensorController.getAllSensors.bind(sensorController));
router.get('/sensors/:category', sensorController.getSensorCategory.bind(sensorController));
router.get('/sensors/:category/history', sensorController.getSensorHistory.bind(sensorController));

// Weather routes
router.get('/weather/current', weatherController.getCurrentWeather.bind(weatherController));
router.get('/weather/forecast', weatherController.getForecast.bind(weatherController));

// Camera routes
router.get('/cameras', cameraController.listCameras.bind(cameraController));
router.get('/cameras/:id', cameraController.getCameraDetails.bind(cameraController));
router.get('/cameras/:id/stream', cameraController.getCameraStream.bind(cameraController));

export default router;
