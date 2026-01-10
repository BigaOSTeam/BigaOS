/**
 * Route Worker Service
 *
 * Manages a worker thread for route calculations to avoid blocking the main thread.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

interface RouteResult {
  success: boolean;
  waypoints: Array<{ lat: number; lon: number }>;
  distance: number;
}

interface PendingRequest {
  resolve: (result: RouteResult) => void;
  reject: (error: Error) => void;
}

class RouteWorkerService {
  private worker: Worker | null = null;
  private initialized = false;
  private initializing = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private shpPath: string = '';

  /**
   * Initialize the worker with the shapefile path
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    const dataDir = path.join(__dirname, '..', 'data');

    // Find shapefile path
    let shpPath = path.join(dataDir, 'oceans-seas', 'water_polygons.shp');
    if (!fs.existsSync(shpPath)) {
      shpPath = path.join(dataDir, 'water-polygons-split-4326', 'water_polygons.shp');
    }

    if (!fs.existsSync(shpPath)) {
      console.warn('[RouteWorker] Shapefile not found, worker will not be initialized');
      this.initializing = false;
      return;
    }

    this.shpPath = shpPath;

    try {
      await this.startWorker();
      this.initialized = true;
      console.log('[RouteWorker] Worker initialized successfully');
    } catch (error) {
      console.error('[RouteWorker] Failed to initialize worker:', error);
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Start the worker thread
   */
  private async startWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use ts-node to run TypeScript worker directly in dev
      const workerPath = path.join(__dirname, '..', 'workers', 'route-calculation.worker.ts');

      // Check if we're running compiled JS or TS
      const isCompiled = __filename.endsWith('.js');
      const actualWorkerPath = isCompiled
        ? workerPath.replace('.ts', '.js')
        : workerPath;

      this.worker = new Worker(actualWorkerPath, {
        execArgv: isCompiled ? [] : ['-r', 'ts-node/register']
      });

      this.worker.on('message', (message: { id: string; success: boolean; result?: RouteResult; error?: string }) => {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.success) {
            if (message.result) {
              pending.resolve(message.result);
            } else {
              pending.resolve({ success: true, waypoints: [], distance: 0 });
            }
          } else {
            pending.reject(new Error(message.error || 'Worker error'));
          }
        }
      });

      this.worker.on('error', (error) => {
        console.error('[RouteWorker] Worker error:', error);
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(error);
        }
        this.pendingRequests.clear();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`[RouteWorker] Worker exited with code ${code}`);
        }
        this.initialized = false;
        this.worker = null;
      });

      // Initialize the worker with shapefile path
      const initId = `init-${Date.now()}`;
      this.pendingRequests.set(initId, { resolve: () => resolve(), reject });

      this.worker.postMessage({
        type: 'init',
        id: initId,
        data: { shpPath: this.shpPath }
      });
    });
  }

  /**
   * Find a water route using the worker thread
   */
  async findWaterRoute(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    maxIterations: number = 10000
  ): Promise<RouteResult> {
    if (!this.initialized || !this.worker) {
      // Fallback: return direct route if worker not available
      console.warn('[RouteWorker] Worker not available, returning direct route');
      const distance = this.calculateDistance(startLat, startLon, endLat, endLon);
      return {
        success: false,
        waypoints: [
          { lat: startLat, lon: startLon },
          { lat: endLat, lon: endLon }
        ],
        distance
      };
    }

    return new Promise((resolve, reject) => {
      const id = `route-${++this.requestCounter}`;
      this.pendingRequests.set(id, { resolve, reject });

      this.worker!.postMessage({
        type: 'findRoute',
        id,
        data: { startLat, startLon, endLat, endLon, maxIterations }
      });

      // Timeout after 120 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Route calculation timeout'));
        }
      }, 120000);
    });
  }

  /**
   * Calculate distance between two points (fallback)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if the worker is ready
   */
  isReady(): boolean {
    return this.initialized && this.worker !== null;
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

export const routeWorkerService = new RouteWorkerService();
