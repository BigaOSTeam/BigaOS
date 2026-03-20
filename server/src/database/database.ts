import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = './data/bigaos.db') {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and create schema
   */
  initialize(): void {
    try {
      // Create data directory if it doesn't exist
      const dataDir = join(process.cwd(), 'data');
      const fs = require('fs');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Connect to database
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Load and execute schema
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      this.db.exec(schema);

      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('Database connection closed');
    }
  }

  // ==================== SENSOR DATA ====================

  /**
   * Add sensor reading
   */
  addSensorData(category: string, sensorName: string, value: number, unit?: string): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO sensor_data (category, sensor_name, value, unit)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(category, sensorName, value, unit || null);
  }

  /**
   * Get sensor history
   */
  getSensorHistory(category: string, sensorName: string, limit: number = 100): any[] {
    const stmt = this.getDb().prepare(`
      SELECT * FROM sensor_data
      WHERE category = ? AND sensor_name = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(category, sensorName, limit);
  }

  /**
   * Get sensor history filtered by time window
   */
  getSensorHistoryByTime(category: string, sensorName: string, minutes: number): any[] {
    const stmt = this.getDb().prepare(`
      SELECT * FROM sensor_data
      WHERE category = ? AND sensor_name = ?
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      ORDER BY timestamp ASC
    `);
    return stmt.all(category, sensorName, minutes);
  }

  /**
   * Get history for multiple sensors in one call
   */
  getSensorHistoryBatch(category: string, sensorNames: string[], minutes: number): Record<string, any[]> {
    const stmt = this.getDb().prepare(`
      SELECT * FROM sensor_data
      WHERE category = ? AND sensor_name = ?
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      ORDER BY timestamp ASC
    `);
    const result: Record<string, any[]> = {};
    for (const name of sensorNames) {
      result[name] = stmt.all(category, name, minutes);
    }
    return result;
  }

  /**
   * Get recent sensor data for all sensors
   */
  getRecentSensorData(minutes: number = 60): any[] {
    const stmt = this.getDb().prepare(`
      SELECT * FROM sensor_data
      WHERE timestamp >= datetime('now', '-' || ? || ' minutes')
      ORDER BY timestamp DESC
    `);
    return stmt.all(minutes);
  }

  // ==================== EVENTS ====================

  /**
   * Add event/notification
   */
  addEvent(type: string, category: string, message: string, details?: any): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO events (type, category, message, details)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(type, category, message, details ? JSON.stringify(details) : null);
  }

  /**
   * Get events
   */
  getEvents(limit: number = 100, acknowledged: boolean | null = null): any[] {
    let query = `
      SELECT * FROM events
      WHERE 1=1
    `;
    const params: any[] = [];

    if (acknowledged !== null) {
      query += ` AND acknowledged = ?`;
      params.push(acknowledged ? 1 : 0);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.getDb().prepare(query);
    return stmt.all(...params);
  }

  /**
   * Acknowledge event
   */
  acknowledgeEvent(id: number): void {
    const stmt = this.getDb().prepare(`
      UPDATE events SET acknowledged = 1 WHERE id = ?
    `);
    stmt.run(id);
  }

  // ==================== SETTINGS ====================

  /**
   * Get setting value
   */
  getSetting(key: string): string | null {
    const stmt = this.getDb().prepare(`
      SELECT value FROM settings WHERE key = ?
    `);
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  /**
   * Set setting value
   */
  setSetting(key: string, value: string, description?: string): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO settings (key, value, description, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = COALESCE(excluded.description, description),
        updated_at = datetime('now')
    `);
    stmt.run(key, value, description || null);
  }

  /**
   * Get all settings
   */
  getAllSettings(): any[] {
    const stmt = this.getDb().prepare(`SELECT * FROM settings ORDER BY key`);
    return stmt.all();
  }

  // ==================== MAINTENANCE LOG ====================

  /**
   * Add maintenance item
   */
  addMaintenanceItem(item: string, description: string, category: string, dueDate?: string): number {
    const stmt = this.getDb().prepare(`
      INSERT INTO maintenance_log (item, description, category, due_date)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(item, description, category, dueDate || null);
    return result.lastInsertRowid as number;
  }

  /**
   * Get maintenance items
   */
  getMaintenanceItems(status?: string): any[] {
    let query = `SELECT * FROM maintenance_log WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY due_date ASC, created_at DESC`;

    const stmt = this.getDb().prepare(query);
    return stmt.all(...params);
  }

  /**
   * Update maintenance item status
   */
  updateMaintenanceStatus(id: number, status: string, completedDate?: string, notes?: string): void {
    const stmt = this.getDb().prepare(`
      UPDATE maintenance_log
      SET status = ?,
          completed_date = ?,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, completedDate || null, notes || null, id);
  }

  // ==================== TRIP LOG ====================

  /**
   * Start new trip
   */
  startTrip(startLocation: string, startLat: number, startLon: number, crew?: string[]): number {
    const stmt = this.getDb().prepare(`
      INSERT INTO trip_log (start_time, start_location, start_lat, start_lon, crew)
      VALUES (datetime('now'), ?, ?, ?, ?)
    `);
    const result = stmt.run(startLocation, startLat, startLon, crew ? JSON.stringify(crew) : null);
    return result.lastInsertRowid as number;
  }

  /**
   * End trip
   */
  endTrip(
    id: number,
    endLocation: string,
    endLat: number,
    endLon: number,
    distanceNm: number,
    maxSpeedKt: number,
    avgSpeedKt: number,
    notes?: string,
    weatherSummary?: string
  ): void {
    const stmt = this.getDb().prepare(`
      UPDATE trip_log
      SET end_time = datetime('now'),
          end_location = ?,
          end_lat = ?,
          end_lon = ?,
          distance_nm = ?,
          max_speed_kt = ?,
          avg_speed_kt = ?,
          duration_hours = (julianday(datetime('now')) - julianday(start_time)) * 24,
          notes = ?,
          weather_summary = ?
      WHERE id = ?
    `);
    stmt.run(endLocation, endLat, endLon, distanceNm, maxSpeedKt, avgSpeedKt, notes || null, weatherSummary || null, id);
  }

  /**
   * Get trip log
   */
  getTripLog(limit: number = 50): any[] {
    const stmt = this.getDb().prepare(`
      SELECT * FROM trip_log
      ORDER BY start_time DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  // ==================== CLEANUP ====================

  /**
   * Clean up old sensor data
   */
  cleanupOldData(daysToKeep: number = 30): void {
    const stmt = this.getDb().prepare(`
      DELETE FROM sensor_data
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(daysToKeep);
    console.log(`Cleaned up ${result.changes} old sensor records`);
  }

  /**
   * Get database statistics
   */
  getStats(): any {
    const stats: any = {};

    const queries = {
      sensorDataCount: 'SELECT COUNT(*) as count FROM sensor_data',
      eventsCount: 'SELECT COUNT(*) as count FROM events',
      unacknowledgedEvents: 'SELECT COUNT(*) as count FROM events WHERE acknowledged = 0',
      maintenanceCount: 'SELECT COUNT(*) as count FROM maintenance_log',
      tripCount: 'SELECT COUNT(*) as count FROM trip_log',
      dbSize: "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"
    };

    for (const [key, query] of Object.entries(queries)) {
      const result = this.getDb().prepare(query).get() as any;
      stats[key] = result.count || result.size || 0;
    }

    return stats;
  }
}

// Export singleton instance
export const db = new DatabaseService(
  process.env.DATABASE_PATH || './data/bigaos.db'
);

export default db;
