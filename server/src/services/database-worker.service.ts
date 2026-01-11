/**
 * Database Worker Service
 *
 * Manages a worker thread for database operations to avoid blocking the main thread.
 * Provides async API matching the original DatabaseService interface.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

class DatabaseWorkerService {
  private worker: Worker | null = null;
  private initialized = false;
  private initializing = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

  /**
   * Initialize the database worker
   */
  async initialize(dbPath?: string): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      await this.startWorker(dbPath || process.env.DATABASE_PATH || './data/bigaos.db');
      this.initialized = true;
      console.log('[DatabaseWorker] Worker initialized successfully');
    } catch (error) {
      console.error('[DatabaseWorker] Failed to initialize worker:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Start the worker thread
   */
  private async startWorker(dbPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, '..', 'workers', 'database.worker.ts');

      // Check if we're running compiled JS or TS
      const isCompiled = __filename.endsWith('.js');
      const actualWorkerPath = isCompiled
        ? workerPath.replace('.ts', '.js')
        : workerPath;

      this.worker = new Worker(actualWorkerPath, {
        execArgv: isCompiled ? [] : ['-r', 'ts-node/register']
      });

      this.worker.on('message', (message: { id: string; success: boolean; result?: any; error?: string }) => {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.success) {
            pending.resolve(message.result);
          } else {
            pending.reject(new Error(message.error || 'Worker error'));
          }
        }
      });

      this.worker.on('error', (error) => {
        console.error('[DatabaseWorker] Worker error:', error);
        for (const [, pending] of this.pendingRequests) {
          pending.reject(error);
        }
        this.pendingRequests.clear();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`[DatabaseWorker] Worker exited with code ${code}`);
        }
        this.initialized = false;
        this.worker = null;
      });

      // Initialize the worker with database path
      const initId = `init-${Date.now()}`;
      this.pendingRequests.set(initId, { resolve: () => resolve(), reject });

      this.worker.postMessage({
        type: 'init',
        id: initId,
        data: { dbPath }
      });
    });
  }

  /**
   * Send a message to the worker and wait for response
   */
  private async send(type: string, data?: any): Promise<any> {
    if (!this.initialized || !this.worker) {
      throw new Error('Database worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const id = `${type}-${++this.requestCounter}`;
      this.pendingRequests.set(id, { resolve, reject });

      this.worker!.postMessage({ type, id, data });

      // Timeout after 30 seconds for queries
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Database operation timeout: ${type}`));
        }
      }, 30000);
    });
  }

  /**
   * Send a fire-and-forget message (no response needed)
   */
  private sendAsync(type: string, data?: any): void {
    if (!this.initialized || !this.worker) {
      console.warn('[DatabaseWorker] Worker not initialized, dropping message:', type);
      return;
    }

    const id = `${type}-${++this.requestCounter}`;
    // Don't track these requests - fire and forget
    this.worker.postMessage({ type, id, data });
  }

  // ==================== SENSOR DATA ====================

  /**
   * Add sensor reading (fire-and-forget, batched in worker)
   */
  addSensorData(category: string, sensorName: string, value: number, unit?: string): void {
    this.sendAsync('addSensorData', { category, sensorName, value, unit: unit || null });
  }

  /**
   * Add multiple sensor readings at once
   */
  addSensorDataBatch(readings: Array<{ category: string; sensorName: string; value: number; unit?: string }>): void {
    this.sendAsync('addSensorDataBatch', { readings });
  }

  /**
   * Get sensor history
   */
  async getSensorHistory(category: string, sensorName: string, limit: number = 100): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT * FROM sensor_data WHERE category = ? AND sensor_name = ? ORDER BY timestamp DESC LIMIT ?`,
      params: [category, sensorName, limit]
    });
  }

  /**
   * Get recent sensor data for all sensors
   */
  async getRecentSensorData(minutes: number = 60): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT * FROM sensor_data WHERE timestamp >= datetime('now', '-' || ? || ' minutes') ORDER BY timestamp DESC`,
      params: [minutes]
    });
  }

  // ==================== STATE HISTORY ====================

  /**
   * Add state change to history
   */
  addStateHistory(state: string, reason?: string, overrideBy?: string): void {
    this.sendAsync('addStateHistory', { state, reason: reason || null, overrideBy: overrideBy || null });
  }

  /**
   * Get state history
   */
  async getStateHistory(limit: number = 100): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT * FROM state_history ORDER BY timestamp DESC LIMIT ?`,
      params: [limit]
    });
  }

  // ==================== EVENTS ====================

  /**
   * Add event/notification
   */
  addEvent(type: string, category: string, message: string, details?: any): void {
    this.sendAsync('addEvent', { type, category, message, details });
  }

  /**
   * Get events
   */
  async getEvents(limit: number = 100, acknowledged: boolean | null = null): Promise<any[]> {
    let sql = `SELECT * FROM events WHERE 1=1`;
    const params: any[] = [];

    if (acknowledged !== null) {
      sql += ` AND acknowledged = ?`;
      params.push(acknowledged ? 1 : 0);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return this.send('query', { sql, params });
  }

  /**
   * Acknowledge event
   */
  async acknowledgeEvent(id: number): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE events SET acknowledged = 1 WHERE id = ?`,
      params: [id]
    });
  }

  // ==================== SETTINGS ====================

  /**
   * Get setting value
   */
  async getSetting(key: string): Promise<string | null> {
    const result = await this.send('queryOne', {
      sql: `SELECT value FROM settings WHERE key = ?`,
      params: [key]
    });
    return result?.value || null;
  }

  /**
   * Set setting value
   */
  async setSetting(key: string, value: string, description?: string): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO settings (key, value, description, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = COALESCE(excluded.description, description), updated_at = datetime('now')`,
      params: [key, value, description || null]
    });
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT * FROM settings ORDER BY key`,
      params: []
    });
  }

  // ==================== MAINTENANCE LOG ====================

  /**
   * Add maintenance item
   */
  async addMaintenanceItem(item: string, description: string, category: string, dueDate?: string): Promise<number> {
    const result = await this.send('execute', {
      sql: `INSERT INTO maintenance_log (item, description, category, due_date) VALUES (?, ?, ?, ?)`,
      params: [item, description, category, dueDate || null]
    });
    return result.lastInsertRowid;
  }

  /**
   * Get maintenance items
   */
  async getMaintenanceItems(status?: string): Promise<any[]> {
    let sql = `SELECT * FROM maintenance_log WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY due_date ASC, created_at DESC`;

    return this.send('query', { sql, params });
  }

  /**
   * Update maintenance item status
   */
  async updateMaintenanceStatus(id: number, status: string, completedDate?: string, notes?: string): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE maintenance_log SET status = ?, completed_date = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`,
      params: [status, completedDate || null, notes || null, id]
    });
  }

  // ==================== TRIP LOG ====================

  /**
   * Start new trip
   */
  async startTrip(startLocation: string, startLat: number, startLon: number, crew?: string[]): Promise<number> {
    const result = await this.send('execute', {
      sql: `INSERT INTO trip_log (start_time, start_location, start_lat, start_lon, crew) VALUES (datetime('now'), ?, ?, ?, ?)`,
      params: [startLocation, startLat, startLon, crew ? JSON.stringify(crew) : null]
    });
    return result.lastInsertRowid;
  }

  /**
   * End trip
   */
  async endTrip(
    id: number,
    endLocation: string,
    endLat: number,
    endLon: number,
    distanceNm: number,
    maxSpeedKt: number,
    avgSpeedKt: number,
    notes?: string,
    weatherSummary?: string
  ): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE trip_log SET end_time = datetime('now'), end_location = ?, end_lat = ?, end_lon = ?, distance_nm = ?, max_speed_kt = ?, avg_speed_kt = ?, duration_hours = (julianday(datetime('now')) - julianday(start_time)) * 24, notes = ?, weather_summary = ? WHERE id = ?`,
      params: [endLocation, endLat, endLon, distanceNm, maxSpeedKt, avgSpeedKt, notes || null, weatherSummary || null, id]
    });
  }

  /**
   * Get trip log
   */
  async getTripLog(limit: number = 50): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT * FROM trip_log ORDER BY start_time DESC LIMIT ?`,
      params: [limit]
    });
  }

  // ==================== UTILITIES ====================

  /**
   * Flush pending writes
   */
  async flush(): Promise<number> {
    return this.send('flush', {});
  }

  /**
   * Clean up old sensor data
   */
  async cleanupOldData(daysToKeep: number = 30): Promise<number> {
    return this.send('cleanup', { daysToKeep });
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<any> {
    return this.send('getStats', {});
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.initialized && this.worker !== null;
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      // Flush and close gracefully
      try {
        await this.send('close', {});
      } catch {
        // Ignore errors during shutdown
      }
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

// Export singleton instance
export const dbWorker = new DatabaseWorkerService();

export default dbWorker;
