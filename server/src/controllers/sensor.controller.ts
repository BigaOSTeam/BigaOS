import { Request, Response } from 'express';
import { dummyDataService } from '../services/dummy-data.service';

export class SensorController {
  // GET /api/sensors - Get all current sensor values
  getAllSensors(req: Request, res: Response) {
    const sensorData = dummyDataService.generateSensorData();
    res.json(sensorData);
  }

  // GET /api/sensors/:category - Get specific sensor category
  getSensorCategory(req: Request, res: Response) {
    const { category } = req.params;
    const sensorData = dummyDataService.generateSensorData();

    const validCategories = ['navigation', 'environment', 'electrical', 'propulsion'];

    if (!validCategories.includes(category)) {
      return res.status(404).json({ error: 'Sensor category not found' });
    }

    res.json(sensorData[category as keyof typeof sensorData]);
  }

  // GET /api/sensors/:category/history - Get sensor history (dummy data)
  getSensorHistory(req: Request, res: Response) {
    const { category } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Generate dummy historical data
    const history = Array.from({ length: limit }, (_, i) => {
      const timestamp = new Date(Date.now() - i * 1000);
      return {
        timestamp,
        value: Math.random() * 100,
        category
      };
    });

    res.json(history);
  }
}

export const sensorController = new SensorController();
