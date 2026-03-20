import { Request, Response } from 'express';
import { dummyDataService } from '../services/dummy-data.service';
import db from '../database/database';

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

    const validCategories = ['navigation', 'environment', 'electrical', 'propulsion', 'tanks'];

    if (!validCategories.includes(category)) {
      return res.status(404).json({ error: 'Sensor category not found' });
    }

    res.json(sensorData[category as keyof typeof sensorData]);
  }

  // GET /api/sensors/:category/history - Get sensor history from database
  getSensorHistory(req: Request, res: Response) {
    const { category } = req.params;
    const minutes = parseInt(req.query.minutes as string) || 60;
    const sensor = req.query.sensor as string;

    try {
      if (sensor) {
        // Get specific sensor history
        const history = db.getSensorHistory(category, sensor, minutes * 12); // Approx 12 readings per minute (every 5 sec)
        res.json(history);
      } else {
        // Get all sensors for this category in the timeframe
        const history = db.getRecentSensorData(minutes)
          .filter((row: any) => row.category === category);
        res.json(history);
      }
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      res.status(500).json({ error: 'Failed to fetch sensor history' });
    }
  }

  // GET /api/sensors/history/:category/:sensor - Get specific sensor history
  getSpecificSensorHistory(req: Request, res: Response) {
    const { category, sensor } = req.params;
    const minutes = parseInt(req.query.minutes as string) || 60;

    try {
      const history = db.getSensorHistoryByTime(category, sensor, minutes);
      res.json(history);
    } catch (error) {
      console.error('Error fetching sensor history:', error);
      res.status(500).json({ error: 'Failed to fetch sensor history' });
    }
  }
  // POST /api/sensors/history/batch - Get multiple sensor histories in one call
  getHistoryBatch(req: Request, res: Response) {
    const { category, sensors, minutes: mins } = req.body;
    const minutes = parseInt(mins) || 60;

    if (!category || !sensors || !Array.isArray(sensors)) {
      return res.status(400).json({ error: 'category and sensors[] required' });
    }

    try {
      const result = db.getSensorHistoryBatch(category, sensors, minutes);
      res.json(result);
    } catch (error) {
      console.error('Error fetching batch history:', error);
      res.status(500).json({ error: 'Failed to fetch sensor history' });
    }
  }
}

export const sensorController = new SensorController();
