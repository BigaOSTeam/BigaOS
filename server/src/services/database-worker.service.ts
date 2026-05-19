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
  // Restart book-keeping. Mirrors RouteWorkerService — but with no hard
  // restart cap, since every WS handler depends on the DB. Instead use
  // exponential backoff and a stable-uptime-resets-counter rule so we
  // recover from transient blips but don't hot-loop.
  private restartAttempts = 0;
  private readonly MAX_RESTART_DELAY_MS = 30_000;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDbPath: string = '';
  private stableUptimeTimer: ReturnType<typeof setTimeout> | null = null;
  private terminating = false;
  private static readonly MAX_PENDING = 1000;

  /**
   * Initialize the database worker
   */
  async initialize(dbPath?: string): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;
    this.lastDbPath = dbPath || process.env.DATABASE_PATH || './data/bigaos.db';

    try {
      await this.startWorker(this.lastDbPath);
      this.initialized = true;
      console.log('[DatabaseWorker] Worker initialized successfully');
      // After 60 s of stable operation, reset the restart counter so a
      // transient crash months later doesn't inherit yesterday's backoff.
      if (this.stableUptimeTimer) clearTimeout(this.stableUptimeTimer);
      this.stableUptimeTimer = setTimeout(() => {
        if (this.restartAttempts > 0) {
          console.log('[DatabaseWorker] Stable for 60s, resetting restart counter');
          this.restartAttempts = 0;
        }
      }, 60_000);
      this.stableUptimeTimer.unref();
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
        // Reject any in-flight requests so callers don't hang for 30 s.
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Database worker exited'));
        }
        this.pendingRequests.clear();
        if (this.stableUptimeTimer) {
          clearTimeout(this.stableUptimeTimer);
          this.stableUptimeTimer = null;
        }
        // Auto-restart unless we're shutting down on purpose.
        if (!this.terminating) {
          this.scheduleRestart();
        }
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
    // Cap pending so a wedged worker plus a flood of incoming queries
    // doesn't grow the map without bound while we wait for the 30 s
    // timeouts to fire.
    if (this.pendingRequests.size >= DatabaseWorkerService.MAX_PENDING) {
      throw new Error(`Database worker overloaded (${this.pendingRequests.size} pending)`);
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
   * Schedule a worker restart with exponential backoff.
   * 1s → 2s → 4s → 8s → 16s → 30s (capped).
   */
  private scheduleRestart(): void {
    if (this.terminating || this.restartTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.restartAttempts), this.MAX_RESTART_DELAY_MS);
    this.restartAttempts++;
    console.log(`[DatabaseWorker] Restarting in ${delay}ms (attempt ${this.restartAttempts})`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.initializing = false;
      this.initialize(this.lastDbPath).catch((err) => {
        console.error('[DatabaseWorker] Restart failed:', err);
        // Re-schedule — never give up entirely. Without the DB the WS handlers
        // can't function, so we have to keep trying.
        this.scheduleRestart();
      });
    }, delay);
    this.restartTimer.unref();
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

  // ==================== CLIENTS ====================

  async registerClient(id: string, name: string, userAgent?: string, clientType?: string): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO clients (id, name, user_agent, client_type, created_at, last_seen_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now')) ON CONFLICT(id) DO UPDATE SET name = excluded.name, user_agent = excluded.user_agent, client_type = COALESCE(excluded.client_type, clients.client_type), last_seen_at = datetime('now')`,
      params: [id, name, userAgent || null, clientType || 'display']
    });
  }

  async updateClientLastSeen(id: string): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE clients SET last_seen_at = datetime('now') WHERE id = ?`,
      params: [id]
    });
  }

  async getClient(id: string): Promise<any | null> {
    const result = await this.send('queryOne', {
      sql: `SELECT id, name, user_agent, client_type, created_at, last_seen_at FROM clients WHERE id = ?`,
      params: [id]
    });
    return result || null;
  }

  async getAllClients(): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT id, name, user_agent, client_type, created_at, last_seen_at FROM clients ORDER BY last_seen_at DESC`,
      params: []
    });
  }

  async updateClientName(id: string, name: string): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE clients SET name = ? WHERE id = ?`,
      params: [name, id]
    });
  }

  async updateClient(id: string, fields: { name?: string; clientType?: string }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
    if (fields.clientType !== undefined) { sets.push('client_type = ?'); params.push(fields.clientType); }
    if (sets.length === 0) return;
    params.push(id);
    await this.send('execute', {
      sql: `UPDATE clients SET ${sets.join(', ')} WHERE id = ?`,
      params,
    });
  }

  async deleteClient(id: string): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM clients WHERE id = ?`,
      params: [id]
    });
  }

  // ==================== CLIENT SETTINGS ====================

  async getClientSetting(clientId: string, key: string): Promise<string | null> {
    const result = await this.send('queryOne', {
      sql: `SELECT value FROM client_settings WHERE client_id = ? AND key = ?`,
      params: [clientId, key]
    });
    return result?.value || null;
  }

  async setClientSetting(clientId: string, key: string, value: string): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO client_settings (client_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(client_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      params: [clientId, key, value]
    });
  }

  async getAllClientSettings(clientId: string): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT key, value FROM client_settings WHERE client_id = ? ORDER BY key`,
      params: [clientId]
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

  // ==================== WEATHER CACHE ====================

  /**
   * Get cached weather data for a location
   */
  async getWeatherCache(lat: number, lon: number): Promise<{ data: string; fetched_at: string; expires_at: string } | null> {
    const result = await this.send('queryOne', {
      sql: `SELECT data, fetched_at, expires_at FROM weather_cache WHERE lat = ? AND lon = ? AND expires_at > datetime('now')`,
      params: [lat, lon]
    });
    return result || null;
  }

  /**
   * Set cached weather data for a location
   */
  async setWeatherCache(lat: number, lon: number, data: string, fetchedAt: string, expiresAt: string): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO weather_cache (lat, lon, data, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(lat, lon) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      params: [lat, lon, data, fetchedAt, expiresAt]
    });
  }

  /**
   * Clear expired weather cache entries
   */
  async clearExpiredWeatherCache(): Promise<number> {
    const result = await this.send('execute', {
      sql: `DELETE FROM weather_cache WHERE expires_at < datetime('now')`,
      params: []
    });
    return result.changes || 0;
  }

  /**
   * Clear all weather cache entries
   */
  async clearAllWeatherCache(): Promise<number> {
    const result = await this.send('execute', {
      sql: `DELETE FROM weather_cache`,
      params: []
    });
    return result.changes || 0;
  }

  /**
   * Get weather cache count (for stats)
   */
  async getWeatherCacheCount(): Promise<number> {
    const result = await this.send('queryOne', {
      sql: `SELECT COUNT(*) as count FROM weather_cache`,
      params: []
    });
    return result?.count || 0;
  }

  // ==================== SWITCHES ====================

  async getAllSwitches(): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT id, name, icon, target_client_id, device_type, relay_type, startup_behavior, gpio_pin, state, created_at, updated_at FROM switches ORDER BY name`,
      params: []
    });
  }

  async getSwitchesForClient(clientId: string): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT id, name, icon, target_client_id, device_type, relay_type, startup_behavior, gpio_pin, state, created_at, updated_at FROM switches WHERE target_client_id = ? ORDER BY gpio_pin`,
      params: [clientId]
    });
  }

  async createSwitch(id: string, name: string, icon: string, targetClientId: string, deviceType: string, relayType: string, startupBehavior: string, gpioPin: number): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO switches (id, name, icon, target_client_id, device_type, relay_type, startup_behavior, gpio_pin, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
      params: [id, name, icon, targetClientId, deviceType, relayType, startupBehavior, gpioPin]
    });
  }

  async updateSwitch(id: string, fields: { name?: string; icon?: string; targetClientId?: string; deviceType?: string; relayType?: string; startupBehavior?: string; gpioPin?: number }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
    if (fields.icon !== undefined) { sets.push('icon = ?'); params.push(fields.icon); }
    if (fields.targetClientId !== undefined) { sets.push('target_client_id = ?'); params.push(fields.targetClientId); }
    if (fields.deviceType !== undefined) { sets.push('device_type = ?'); params.push(fields.deviceType); }
    if (fields.relayType !== undefined) { sets.push('relay_type = ?'); params.push(fields.relayType); }
    if (fields.startupBehavior !== undefined) { sets.push('startup_behavior = ?'); params.push(fields.startupBehavior); }
    if (fields.gpioPin !== undefined) { sets.push('gpio_pin = ?'); params.push(fields.gpioPin); }
    if (sets.length === 0) return;
    sets.push('updated_at = datetime(\'now\')');
    params.push(id);
    await this.send('execute', {
      sql: `UPDATE switches SET ${sets.join(', ')} WHERE id = ?`,
      params,
    });
  }

  async updateSwitchState(id: string, state: number): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE switches SET state = ?, updated_at = datetime('now') WHERE id = ?`,
      params: [state, id]
    });
  }

  async deleteSwitch(id: string): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM switches WHERE id = ?`,
      params: [id]
    });
  }

  async resetSwitchStatesByStartupBehavior(behavior: string, state: number): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE switches SET state = ?, updated_at = datetime('now') WHERE startup_behavior = ?`,
      params: [state, behavior]
    });
  }

  async deleteAllSwitches(): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM switches`,
      params: []
    });
  }

  // ==================== BUTTONS ====================

  async getAllButtons(): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT id, name, source_client_id, device_type, gpio_pin, pull, trigger, debounce_ms, enabled, action_json, overlay_enabled, overlay_edge, overlay_percent, created_at, updated_at FROM buttons ORDER BY name`,
      params: []
    });
  }

  async getButtonsForClient(clientId: string): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT id, name, source_client_id, device_type, gpio_pin, pull, trigger, debounce_ms, enabled, action_json, overlay_enabled, overlay_edge, overlay_percent, created_at, updated_at FROM buttons WHERE source_client_id = ? ORDER BY gpio_pin`,
      params: [clientId]
    });
  }

  async createButton(
    id: string,
    name: string,
    sourceClientId: string,
    deviceType: string,
    gpioPin: number,
    pull: string,
    trigger: string,
    debounceMs: number,
    enabled: number,
    actionJson: string,
    overlayEnabled: number,
    overlayEdge: string,
    overlayPercent: number,
  ): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO buttons (id, name, source_client_id, device_type, gpio_pin, pull, trigger, debounce_ms, enabled, action_json, overlay_enabled, overlay_edge, overlay_percent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      params: [id, name, sourceClientId, deviceType, gpioPin, pull, trigger, debounceMs, enabled, actionJson, overlayEnabled, overlayEdge, overlayPercent],
    });
  }

  async updateButton(
    id: string,
    fields: {
      name?: string;
      sourceClientId?: string;
      deviceType?: string;
      gpioPin?: number;
      pull?: string;
      trigger?: string;
      debounceMs?: number;
      enabled?: number;
      actionJson?: string;
      overlayEnabled?: number;
      overlayEdge?: string;
      overlayPercent?: number;
    }
  ): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
    if (fields.sourceClientId !== undefined) { sets.push('source_client_id = ?'); params.push(fields.sourceClientId); }
    if (fields.deviceType !== undefined) { sets.push('device_type = ?'); params.push(fields.deviceType); }
    if (fields.gpioPin !== undefined) { sets.push('gpio_pin = ?'); params.push(fields.gpioPin); }
    if (fields.pull !== undefined) { sets.push('pull = ?'); params.push(fields.pull); }
    if (fields.trigger !== undefined) { sets.push('trigger = ?'); params.push(fields.trigger); }
    if (fields.debounceMs !== undefined) { sets.push('debounce_ms = ?'); params.push(fields.debounceMs); }
    if (fields.enabled !== undefined) { sets.push('enabled = ?'); params.push(fields.enabled); }
    if (fields.actionJson !== undefined) { sets.push('action_json = ?'); params.push(fields.actionJson); }
    if (fields.overlayEnabled !== undefined) { sets.push('overlay_enabled = ?'); params.push(fields.overlayEnabled); }
    if (fields.overlayEdge !== undefined) { sets.push('overlay_edge = ?'); params.push(fields.overlayEdge); }
    if (fields.overlayPercent !== undefined) { sets.push('overlay_percent = ?'); params.push(fields.overlayPercent); }
    if (sets.length === 0) return;
    sets.push('updated_at = datetime(\'now\')');
    params.push(id);
    await this.send('execute', {
      sql: `UPDATE buttons SET ${sets.join(', ')} WHERE id = ?`,
      params,
    });
  }

  async deleteButton(id: string): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM buttons WHERE id = ?`,
      params: [id],
    });
  }

  async deleteAllButtons(): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM buttons`,
      params: [],
    });
  }

  // ==================== CONFIG IMPORT/EXPORT ====================

  /**
   * Wipe every key in the global settings table. Used by config import
   * before applying the imported settings; ensures the imported bundle is
   * the entire source of truth, not a diff applied on top of stale state.
   */
  async deleteAllSettings(): Promise<void> {
    await this.send('execute', {
      sql: `DELETE FROM settings`,
      params: [],
    });
  }

  // ==================== LOGBOOK ====================
  //
  // All values stored in STANDARD units: m/s for speeds, radians for course,
  // meters for distance, decimal degrees for lat/lon, epoch-ms for timestamps.

  /**
   * Append a trackpoint. Same-ms duplicates are silently ignored (ts is the
   * primary key); this can only happen if two sensor packets arrive in the
   * same millisecond, in which case we keep the first.
   */
  async logbookInsertTrackpoint(
    ts: number,
    lat: number,
    lon: number,
    sog: number | null,
    cog: number | null,
    segmentId: number | null
  ): Promise<void> {
    await this.send('execute', {
      sql: `INSERT OR IGNORE INTO logbook_trackpoint (ts, lat, lon, sog, cog, segment_id) VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ts, lat, lon, sog, cog, segmentId],
    });
  }

  /**
   * Open a new segment. Returns the new segment id so the recording service
   * can tag subsequent trackpoints to it.
   */
  async logbookOpenSegment(
    dayDate: string,
    startedAt: number,
    startLat: number,
    startLon: number
  ): Promise<number> {
    const result = await this.send('execute', {
      sql: `INSERT INTO logbook_segment (day_date, started_at, start_lat, start_lon) VALUES (?, ?, ?, ?)`,
      params: [dayDate, startedAt, startLat, startLon],
    });
    return result.lastInsertRowid;
  }

  /**
   * Close a segment with its computed summary.
   */
  async logbookCloseSegment(
    id: number,
    endedAt: number,
    distanceM: number,
    avgSog: number,
    maxSog: number,
    endLat: number,
    endLon: number,
    pointCount: number
  ): Promise<void> {
    await this.send('execute', {
      sql: `UPDATE logbook_segment SET ended_at = ?, distance_m = ?, avg_sog = ?, max_sog = ?, end_lat = ?, end_lon = ?, point_count = ? WHERE id = ?`,
      params: [endedAt, distanceM, avgSog, maxSog, endLat, endLon, pointCount, id],
    });
  }

  /**
   * Find a segment that is still open (ended_at IS NULL) — used on startup
   * to resume or finalize whatever was in progress when the server stopped.
   */
  async logbookGetOpenSegment(): Promise<any | null> {
    const result = await this.send('queryOne', {
      sql: `SELECT id, day_date, started_at, start_lat, start_lon FROM logbook_segment WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      params: [],
    });
    return result || null;
  }

  /**
   * Get the trackpoints belonging to a segment, in chronological order.
   * Used to reconstruct an open segment's summary on reboot.
   */
  async logbookGetSegmentTrackpoints(segmentId: number): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT ts, lat, lon, sog, cog FROM logbook_trackpoint WHERE segment_id = ? ORDER BY ts ASC`,
      params: [segmentId],
    });
  }

  /**
   * Create the day row if it doesn't exist yet, and bump first/last segment
   * timestamps so list queries don't need to GROUP-aggregate to find the
   * day's bounds.
   */
  async logbookTouchDay(dayDate: string, segmentAt: number): Promise<void> {
    await this.send('execute', {
      sql: `INSERT INTO logbook_day (date, first_segment_at, last_segment_at) VALUES (?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              first_segment_at = MIN(first_segment_at, excluded.first_segment_at),
              last_segment_at  = MAX(last_segment_at,  excluded.last_segment_at)`,
      params: [dayDate, segmentAt, segmentAt],
    });
  }

  /**
   * List days with rolled-up summary stats. Only closed segments contribute
   * to totals so an open segment doesn't inflate the figures mid-trip.
   */
  async logbookListDays(from?: string, to?: string, limit: number = 365): Promise<any[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (from) { where.push('d.date >= ?'); params.push(from); }
    if (to)   { where.push('d.date <= ?'); params.push(to);   }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);
    return this.send('query', {
      sql: `SELECT
              d.date,
              d.title,
              d.note,
              d.first_segment_at,
              d.last_segment_at,
              COALESCE(SUM(CASE WHEN s.ended_at IS NOT NULL THEN s.distance_m END), 0) AS distance_m,
              COALESCE(SUM(CASE WHEN s.ended_at IS NOT NULL THEN s.ended_at - s.started_at END), 0) AS underway_ms,
              COALESCE(MAX(CASE WHEN s.ended_at IS NOT NULL THEN s.max_sog END), 0) AS max_sog,
              COUNT(s.id) AS segment_count
            FROM logbook_day d
            LEFT JOIN logbook_segment s ON s.day_date = d.date
            ${whereSql}
            GROUP BY d.date
            ORDER BY d.date DESC
            LIMIT ?`,
      params,
    });
  }

  /**
   * Get a single day row plus all its segments.
   */
  async logbookGetDay(date: string): Promise<{ day: any | null; segments: any[] }> {
    const day = await this.send('queryOne', {
      sql: `SELECT date, title, note, first_segment_at, last_segment_at FROM logbook_day WHERE date = ?`,
      params: [date],
    });
    if (!day) return { day: null, segments: [] };
    const segments = await this.send('query', {
      sql: `SELECT id, started_at, ended_at, distance_m, avg_sog, max_sog, start_lat, start_lon, end_lat, end_lon, point_count FROM logbook_segment WHERE day_date = ? ORDER BY started_at ASC`,
      params: [date],
    });
    return { day, segments };
  }

  /**
   * Get all trackpoints for a day (used for replay).
   */
  async logbookGetDayTrack(date: string): Promise<any[]> {
    return this.send('query', {
      sql: `SELECT t.ts, t.lat, t.lon, t.sog, t.cog, t.segment_id
            FROM logbook_trackpoint t
            JOIN logbook_segment s ON s.id = t.segment_id
            WHERE s.day_date = ?
            ORDER BY t.ts ASC`,
      params: [date],
    });
  }

  /**
   * Update a day's title and/or note. Pass null to clear a field; omit to
   * leave it unchanged. Creates the row if missing so the user can annotate
   * a day that has no segments yet.
   */
  async logbookUpdateDay(date: string, fields: { title?: string | null; note?: string | null }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
    if (fields.note !== undefined)  { sets.push('note = ?');  params.push(fields.note); }
    if (sets.length === 0) return;
    await this.send('execute', {
      sql: `INSERT OR IGNORE INTO logbook_day (date) VALUES (?)`,
      params: [date],
    });
    params.push(date);
    await this.send('execute', {
      sql: `UPDATE logbook_day SET ${sets.join(', ')} WHERE date = ?`,
      params,
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
    this.terminating = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.stableUptimeTimer) {
      clearTimeout(this.stableUptimeTimer);
      this.stableUptimeTimer = null;
    }
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
