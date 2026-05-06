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
    // synchronous=NORMAL is safe under WAL (transactions are durable across
    // crashes; only the very last commit can be lost on power loss) and is
    // dramatically faster than the default FULL when writing 10+ rows/s.
    db.pragma('synchronous = NORMAL');
    // Wait up to 5 s on a locked DB instead of immediately throwing
    // SQLITE_BUSY. Matters because there's still a separate main-thread DB
    // connection from `database.ts` that occasionally writes the same file.
    db.pragma('busy_timeout = 5000');

    // Load and execute schema
    const schemaPath = join(__dirname, '..', 'database', 'schema.sql');
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, 'utf8');
      db.exec(schema);
    }

    // Migrations for existing databases
    try { db.exec(`ALTER TABLE clients ADD COLUMN client_type TEXT DEFAULT 'display'`); } catch { /* column already exists */ }

    // Migrations: create switches table if it doesn't exist (for databases created before this feature)
    db.exec(`
      CREATE TABLE IF NOT EXISTS switches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'lightbulb',
        target_client_id TEXT NOT NULL,
        device_type TEXT NOT NULL DEFAULT 'rpi4b',
        relay_type TEXT NOT NULL DEFAULT 'active-low',
        startup_behavior TEXT NOT NULL DEFAULT 'keep-state',
        gpio_pin INTEGER NOT NULL,
        state INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(target_client_id, gpio_pin)
      )
    `);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_switches_target ON switches(target_client_id)`); } catch { /* already exists */ }

    // Migrations: create buttons table if it doesn't exist (physical GPIO inputs)
    db.exec(`
      CREATE TABLE IF NOT EXISTS buttons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_client_id TEXT NOT NULL,
        device_type TEXT NOT NULL DEFAULT 'rpi4b',
        gpio_pin INTEGER NOT NULL,
        pull TEXT NOT NULL DEFAULT 'up',
        trigger TEXT NOT NULL DEFAULT 'falling',
        debounce_ms INTEGER NOT NULL DEFAULT 50,
        enabled INTEGER NOT NULL DEFAULT 1,
        action_json TEXT NOT NULL,
        overlay_enabled INTEGER NOT NULL DEFAULT 0,
        overlay_edge TEXT NOT NULL DEFAULT 'bottom',
        overlay_percent INTEGER NOT NULL DEFAULT 50,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_client_id, gpio_pin)
      )
    `);
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_buttons_source ON buttons(source_client_id)`); } catch { /* already exists */ }
    // Migrations for older DBs that already have a buttons table
    try { db.exec(`ALTER TABLE buttons ADD COLUMN overlay_enabled INTEGER NOT NULL DEFAULT 0`); } catch { /* column exists */ }
    try { db.exec(`ALTER TABLE buttons ADD COLUMN overlay_edge TEXT NOT NULL DEFAULT 'bottom'`); } catch { /* column exists */ }
    try { db.exec(`ALTER TABLE buttons ADD COLUMN overlay_percent INTEGER NOT NULL DEFAULT 50`); } catch { /* column exists */ }

    // Prepare statements for frequent operations
    insertSensorStmt = db.prepare(`
      INSERT INTO sensor_data (category, sensor_name, value, unit, timestamp)
      VALUES (?, ?, ?, ?, datetime(? / 1000, 'unixepoch'))
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
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * Execute a read query returning single row
 */
function queryOne(sql: string, params: any[]): any {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

/**
 * Execute a write statement
 */
function execute(sql: string, params: any[]): { changes: number; lastInsertRowid: number } {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  const result = stmt.run(...params);
  return {
    changes: result.changes,
    lastInsertRowid: Number(result.lastInsertRowid)
  };
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
// Daily sensor-data cleanup. Without this, sensor_data grows by ~10 rows/s
// forever and eventually fills the disk.
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
// Weekly WAL checkpoint. WAL grows on every write and is normally checkpointed
// automatically, but a continuous reader (any open prepared statement) can
// pin the WAL — this guarantees we truncate it periodically.
let walCheckpointInterval: ReturnType<typeof setInterval> | null = null;
const CLEANUP_DAYS_TO_KEEP = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WAL_CHECKPOINT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function runWalCheckpoint(): void {
  if (!db) return;
  try {
    const result = db.pragma('wal_checkpoint(TRUNCATE)') as any;
    console.log('[DB Worker] WAL checkpoint:', result);
  } catch (err) {
    console.error('[DB Worker] WAL checkpoint failed:', err);
  }
}

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
          // Start periodic flush (silent)
          flushInterval = setInterval(() => {
            flushSensorData();
          }, FLUSH_INTERVAL);
          // Daily sensor-data cleanup (offset 1 hour after start so we don't
          // hammer the disk during boot).
          cleanupInterval = setInterval(() => {
            cleanupOldData(CLEANUP_DAYS_TO_KEEP);
          }, CLEANUP_INTERVAL_MS);
          cleanupInterval.unref();
          // Weekly WAL truncate.
          walCheckpointInterval = setInterval(runWalCheckpoint, WAL_CHECKPOINT_INTERVAL_MS);
          walCheckpointInterval.unref();
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
          if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
          }
          if (walCheckpointInterval) {
            clearInterval(walCheckpointInterval);
            walCheckpointInterval = null;
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
