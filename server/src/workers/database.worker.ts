/**
 * Database Worker
 *
 * Runs SQLite database operations in a separate thread to avoid blocking the main event loop.
 * Batches sensor data writes for optimal performance.
 */

import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Worker-local database instance
let db: Database.Database | null = null;

// Batching state
interface SensorDataPoint {
  category: string;
  sensorName: string;
  value: number;
  unit: string | null;
  timestamp: number;
}

const sensorDataBuffer: SensorDataPoint[] = [];
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 1000; // Flush every second for real-time data

// Prepared statements (cached for performance)
let insertSensorStmt: Database.Statement | null = null;
let insertStateStmt: Database.Statement | null = null;
let insertEventStmt: Database.Statement | null = null;

/**
 * Initialize database connection
 */
function initialize(dbPath: string): void {
  try {
    // Create data directory if it doesn't exist
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Connect to database
    db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Load and execute schema
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, 'utf8');
      db.exec(schema);
    }

    // Prepare statements for frequent operations
    insertSensorStmt = db.prepare(`
      INSERT INTO sensor_data (category, sensor_name, value, unit, timestamp)
      VALUES (?, ?, ?, ?, datetime(? / 1000, 'unixepoch'))
    `);

    insertStateStmt = db.prepare(`
      INSERT INTO state_history (state, reason, override_by)
      VALUES (?, ?, ?)
    `);

    insertEventStmt = db.prepare(`
      INSERT INTO events (type, category, message, details)
      VALUES (?, ?, ?, ?)
    `);

    console.log('[DB Worker] Database initialized successfully');
  } catch (error) {
    console.error('[DB Worker] Database initialization failed:', error);
    throw error;
  }
}

/**
 * Flush sensor data buffer to database using a transaction
 */
function flushSensorData(): number {
  if (!db || !insertSensorStmt || sensorDataBuffer.length === 0) {
    return 0;
  }

  const count = sensorDataBuffer.length;

  try {
    // Use transaction for batch insert (much faster)
    const insertMany = db.transaction((data: SensorDataPoint[]) => {
      for (const point of data) {
        insertSensorStmt!.run(
          point.category,
          point.sensorName,
          point.value,
          point.unit,
          point.timestamp
        );
      }
    });

    insertMany(sensorDataBuffer);
    sensorDataBuffer.length = 0; // Clear buffer

    return count;
  } catch (error) {
    console.error('[DB Worker] Error flushing sensor data:', error);
    sensorDataBuffer.length = 0; // Clear buffer even on error to prevent memory growth
    return 0;
  }
}

/**
 * Add sensor data to buffer (will be batched)
 */
function addSensorData(category: string, sensorName: string, value: number, unit: string | null): void {
  sensorDataBuffer.push({
    category,
    sensorName,
    value,
    unit,
    timestamp: Date.now()
  });

  // Flush if buffer is full
  if (sensorDataBuffer.length >= BATCH_SIZE) {
    flushSensorData();
  }
}

/**
 * Add state history (immediate write)
 */
function addStateHistory(state: string, reason: string | null, overrideBy: string | null): void {
  if (!db || !insertStateStmt) return;

  try {
    insertStateStmt.run(state, reason, overrideBy);
  } catch (error) {
    console.error('[DB Worker] Error adding state history:', error);
  }
}

/**
 * Add event (immediate write)
 */
function addEvent(type: string, category: string, message: string, details: any): void {
  if (!db || !insertEventStmt) return;

  try {
    insertEventStmt.run(type, category, message, details ? JSON.stringify(details) : null);
  } catch (error) {
    console.error('[DB Worker] Error adding event:', error);
  }
}

/**
 * Execute a read query
 */
function query(sql: string, params: any[]): any[] {
  if (!db) return [];

  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (error) {
    console.error('[DB Worker] Query error:', error);
    return [];
  }
}

/**
 * Execute a read query returning single row
 */
function queryOne(sql: string, params: any[]): any {
  if (!db) return null;

  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  } catch (error) {
    console.error('[DB Worker] Query error:', error);
    return null;
  }
}

/**
 * Execute a write statement
 */
function execute(sql: string, params: any[]): { changes: number; lastInsertRowid: number } {
  if (!db) return { changes: 0, lastInsertRowid: 0 };

  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid)
    };
  } catch (error) {
    console.error('[DB Worker] Execute error:', error);
    return { changes: 0, lastInsertRowid: 0 };
  }
}

/**
 * Clean up old sensor data
 */
function cleanupOldData(daysToKeep: number): number {
  if (!db) return 0;

  try {
    const stmt = db.prepare(`
      DELETE FROM sensor_data
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(daysToKeep);
    console.log(`[DB Worker] Cleaned up ${result.changes} old sensor records`);
    return result.changes;
  } catch (error) {
    console.error('[DB Worker] Cleanup error:', error);
    return 0;
  }
}

/**
 * Get database statistics
 */
function getStats(): any {
  if (!db) return {};

  const stats: any = {};

  const queries = {
    stateHistoryCount: 'SELECT COUNT(*) as count FROM state_history',
    sensorDataCount: 'SELECT COUNT(*) as count FROM sensor_data',
    eventsCount: 'SELECT COUNT(*) as count FROM events',
    unacknowledgedEvents: 'SELECT COUNT(*) as count FROM events WHERE acknowledged = 0',
    maintenanceCount: 'SELECT COUNT(*) as count FROM maintenance_log',
    tripCount: 'SELECT COUNT(*) as count FROM trip_log',
    dbSize: "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"
  };

  for (const [key, query] of Object.entries(queries)) {
    try {
      const result = db.prepare(query).get() as any;
      stats[key] = result?.count ?? result?.size ?? 0;
    } catch {
      stats[key] = 0;
    }
  }

  stats.pendingWrites = sensorDataBuffer.length;

  return stats;
}

/**
 * Close database connection
 */
function close(): void {
  // Flush any remaining data
  flushSensorData();

  if (db) {
    db.close();
    db = null;
    console.log('[DB Worker] Database connection closed');
  }
}

// Set up periodic flush
let flushInterval: ReturnType<typeof setInterval> | null = null;

// Message handler
if (parentPort) {
  parentPort.on('message', (message: {
    type: string;
    id: string;
    data?: any;
  }) => {
    try {
      let result: any = null;

      switch (message.type) {
        case 'init':
          initialize(message.data.dbPath);
          // Start periodic flush
          flushInterval = setInterval(() => {
            const flushed = flushSensorData();
            if (flushed > 0) {
              console.log(`[DB Worker] Periodic flush: ${flushed} records`);
            }
          }, FLUSH_INTERVAL);
          break;

        case 'addSensorData':
          addSensorData(
            message.data.category,
            message.data.sensorName,
            message.data.value,
            message.data.unit
          );
          break;

        case 'addSensorDataBatch':
          // Add multiple sensor readings at once
          for (const reading of message.data.readings) {
            addSensorData(
              reading.category,
              reading.sensorName,
              reading.value,
              reading.unit
            );
          }
          break;

        case 'addStateHistory':
          addStateHistory(
            message.data.state,
            message.data.reason,
            message.data.overrideBy
          );
          break;

        case 'addEvent':
          addEvent(
            message.data.type,
            message.data.category,
            message.data.message,
            message.data.details
          );
          break;

        case 'query':
          result = query(message.data.sql, message.data.params || []);
          break;

        case 'queryOne':
          result = queryOne(message.data.sql, message.data.params || []);
          break;

        case 'execute':
          result = execute(message.data.sql, message.data.params || []);
          break;

        case 'flush':
          result = flushSensorData();
          break;

        case 'cleanup':
          result = cleanupOldData(message.data.daysToKeep || 30);
          break;

        case 'getStats':
          result = getStats();
          break;

        case 'close':
          if (flushInterval) {
            clearInterval(flushInterval);
            flushInterval = null;
          }
          close();
          break;

        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }

      parentPort!.postMessage({ id: message.id, success: true, result });
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
