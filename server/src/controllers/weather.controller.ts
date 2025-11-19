import { Request, Response } from 'express';
import { dummyDataService } from '../services/dummy-data.service';

export class WeatherController {
  // GET /api/weather/current - Get current weather
  getCurrentWeather(req: Request, res: Response) {
    const weatherData = dummyDataService.generateWeatherData();
    res.json(weatherData.current);
  }

  // GET /api/weather/forecast - Get weather forecast
  getForecast(req: Request, res: Response) {
    const weatherData = dummyDataService.generateWeatherData();
    res.json({ forecast: weatherData.forecast });
  }
}

export const weatherController = new WeatherController();
