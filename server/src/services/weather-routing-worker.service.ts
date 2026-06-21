/**
 * Weather Routing Worker Service
 *
 * Manages the isochrone optimizer worker thread (mirrors route-worker.service).
 * The heavy I/O — building the WeatherField — happens on the main thread before
 * calling optimize(); the worker only does CPU-bound optimization on the
 * already-fetched field, so a best-window scan is cheap.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { WeatherField } from '../workers/lib/weather-sample';
import { PolarParams } from './polar';
import { WeatherRouteResult, RankedDeparture } from '../types/weather-route.types';

export interface OptimizeParams {
  start: { lat: number; lon: number };
  end: { lat: number; lon: number };
  weatherField: WeatherField;
  polar: PolarParams;
  departures: number[];
  constraints: { minSafeDepth?: number; maxWindKn?: number; maxWaveM?: number };
  fallbackPath?: Array<{ lat: number; lon: number }>;
}

type OptimizeResponse = WeatherRouteResult & { departures?: RankedDeparture[] };

interface PendingRequest {
  resolve: (result: OptimizeResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class WeatherRoutingWorkerService {
  private worker: Worker | null = null;
  private initialized = false;
  private initializing = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private restartAttempts = 0;
  private readonly MAX_RESTART_ATTEMPTS = 3;
  private readonly RESTART_DELAY_MS = 1000;

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    // Same data the route worker needs — water mask GeoTIFFs.
    const dataDir = path.join(__dirname, '..', 'data', 'navigation-data');
    if (!fs.existsSync(dataDir)) {
      console.warn('[WeatherRouteWorker] Navigation data not found, worker will not be initialized');
      this.initializing = false;
      return;
    }
    const files = fs.readdirSync(dataDir);
    if (!files.some((f) => f.endsWith('.tif') || f.endsWith('.tiff'))) {
      console.warn('[WeatherRouteWorker] No GeoTIFF files found, worker will not be initialized');
      this.initializing = false;
      return;
    }

    try {
      await this.startWorker();
      this.initialized = true;
      this.restartAttempts = 0;
      console.log('[WeatherRouteWorker] Worker initialized successfully');
    } catch (error) {
      console.error('[WeatherRouteWorker] Failed to initialize worker:', error);
    } finally {
      this.initializing = false;
    }
  }

  private async startWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, '..', 'workers', 'weather-routing.worker.ts');
      const isCompiled = __filename.endsWith('.js');
      const actualWorkerPath = isCompiled ? workerPath.replace('.ts', '.js') : workerPath;

      this.worker = new Worker(actualWorkerPath, {
        execArgv: isCompiled ? [] : ['-r', 'ts-node/register'],
      });

      this.worker.on('message', (message: { id: string; success: boolean; result?: OptimizeResponse; error?: string }) => {
        const pending = this.pendingRequests.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id);
        if (message.success) {
          // The `init` reply carries no result (its pending.resolve ignores the
          // arg); `optimize` replies always include one.
          pending.resolve(message.result as OptimizeResponse);
        } else {
          pending.reject(new Error(message.error || 'Weather routing worker error'));
        }
      });

      this.worker.on('error', (error) => {
        console.error('[WeatherRouteWorker] Worker error:', error);
        for (const [, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pendingRequests.clear();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) console.warn(`[WeatherRouteWorker] Worker exited with code ${code}`);
        this.initialized = false;
        this.worker = null;
        if (code !== 0 && this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
          this.restartAttempts++;
          console.log(`[WeatherRouteWorker] Attempting restart ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS}...`);
          setTimeout(() => {
            this.initializing = false;
            this.initialize().catch((err) => console.error('[WeatherRouteWorker] Restart failed:', err));
          }, this.RESTART_DELAY_MS);
        }
      });

      const initId = `init-${Date.now()}`;
      this.pendingRequests.set(initId, { resolve: () => resolve(), reject, timer: setTimeout(() => {}, 0) });
      this.worker.postMessage({ type: 'init', id: initId });
    });
  }

  isReady(): boolean {
    return this.initialized && this.worker !== null;
  }

  /**
   * Run the optimizer. Cancels (sends a `cancel` message) if the signal aborts —
   * the worker stops the search and returns the best path found so far.
   */
  async optimize(params: OptimizeParams, signal?: AbortSignal): Promise<OptimizeResponse> {
    if (!this.initialized || !this.worker) {
      throw new Error('Weather routing worker not available');
    }
    const worker = this.worker;

    const id = `wroute-${++this.requestCounter}`;
    // Scale the timeout with the number of departures scanned.
    const timeoutMs = Math.min(300000, 60000 + params.departures.length * 20000);

    return new Promise<OptimizeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          worker.postMessage({ type: 'cancel', id });
          reject(new Error('Weather route optimization timeout'));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      if (signal) {
        if (signal.aborted) {
          worker.postMessage({ type: 'cancel', id });
        } else {
          signal.addEventListener('abort', () => worker.postMessage({ type: 'cancel', id }), { once: true });
        }
      }

      worker.postMessage({ type: 'optimize', id, data: params });
    });
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }

  async reinitialize(): Promise<void> {
    console.log('[WeatherRouteWorker] Reinitializing worker with new data...');
    await this.terminate();
    this.initialized = false;
    this.initializing = false;
    await this.initialize();
  }
}

export const weatherRoutingWorkerService = new WeatherRoutingWorkerService();
