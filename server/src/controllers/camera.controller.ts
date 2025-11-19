import { Request, Response } from 'express';
import { dummyDataService } from '../services/dummy-data.service';

export class CameraController {
  // GET /api/cameras - List all cameras
  listCameras(req: Request, res: Response) {
    const cameras = dummyDataService.generateCameraList();
    res.json(cameras);
  }

  // GET /api/cameras/:id - Get camera details
  getCameraDetails(req: Request, res: Response) {
    const { id } = req.params;
    const cameras = dummyDataService.generateCameraList();
    const camera = cameras.find(c => c.id === id);

    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    res.json(camera);
  }

  // GET /api/cameras/:id/stream - Get camera stream URL
  getCameraStream(req: Request, res: Response) {
    const { id } = req.params;

    // In a real system, this would return the actual HLS stream
    res.json({
      streamUrl: `/streams/${id}/stream.m3u8`,
      message: 'Dummy stream URL - actual camera integration pending'
    });
  }
}

export const cameraController = new CameraController();
