/**
 * Route Worker Service
 *
 * Manages a worker thread for route calculations to avoid blocking the main thread.
 * Uses GeoTIFF navigation data for water detection.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';

type RouteFailureReason =
  | 'START_ON_LAND'
  | 'END_ON_LAND'
  | 'NO_PATH_FOUND'
  | 'DISTANCE_TOO_LONG'
  | 'NARROW_CHANNEL'
  | 'MAX_ITERATIONS';

interface RouteResult {
  success: boolean;
  waypoints: Array<{ lat: number; lon: number }>;
  distance: number;
  failureReason?: RouteFailureReason;
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
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly RESTART_DELAY_MS = 1000;

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    const dataDir = path.join(__dirname, '..', 'data', 'navigation-data');

    // Check if navigation data exists
    if (!fs.existsSync(dataDir)) {
      console.warn('[RouteWorker] Navigation data not found, worker will not be initialized');
      this.initializing = false;
      return;
    }

    // Check for any .tif files
    const files = fs.readdirSync(dataDir);
    const hasTifFiles = files.some(f => f.endsWith('.tif') || f.endsWith('.tiff'));

    if (!hasTifFiles) {
      console.warn('[RouteWorker] No GeoTIFF files found, worker will not be initialized');
      this.initializing = false;
      return;
    }

    try {
      await this.startWorker();
      this.initialized = true;
      this.restartAttempts = 0; // Reset on successful init
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
      const workerPath = path.join(__dirname, '..', 'workers', 'route-calculation.worker.ts');

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
        for (const [, pending] of this.pendingRequests) {
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

        // Auto-restart worker if it crashed unexpectedly
        if (code !== 0 && this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
          this.restartAttempts++;
          console.log(`[RouteWorker] Attempting restart ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS}...`);
          setTimeout(() => {
            this.initializing = false;
            this.initialize().catch(err => {
              console.error('[RouteWorker] Restart failed:', err);
            });
          }, this.RESTART_DELAY_MS);
        }
      });

      // Initialize the worker
      const initId = `init-${Date.now()}`;
      this.pendingRequests.set(initId, { resolve: () => resolve(), reject });

      this.worker.postMessage({
        type: 'init',
        id: initId
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
    maxIterations: number = 2000000
  ): Promise<RouteResult> {
    if (!this.initialized || !this.worker) {
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

      // Allow up to 3 minutes for complex route calculations
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Route calculation timeout'));
        }
      }, 180000);
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

  /**
   * Reinitialize the worker (called after new navigation data is downloaded)
   */
  async reinitialize(): Promise<void> {
    console.log('[RouteWorker] Reinitializing worker with new data...');
    await this.terminate();
    this.initialized = false;
    this.initializing = false;
    await this.initialize();
  }
}

export const routeWorkerService = new RouteWorkerService();
