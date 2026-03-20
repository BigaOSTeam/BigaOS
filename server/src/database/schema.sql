-- Biga OS Database Schema
-- SQLite database for boat automation system

-- Sensor Data History
-- Stores sensor readings with timestamps
CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL, -- navigation, environment, electrical, propulsion
    sensor_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_category ON sensor_data(category);
CREATE INDEX IF NOT EXISTS idx_sensor_name ON sensor_data(sensor_name);
CREATE INDEX IF NOT EXISTS idx_sensor_lookup ON sensor_data(category, sensor_name, timestamp);

-- Events/Notifications
-- System events and notifications
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- info, warning, error, critical
    category TEXT NOT NULL, -- system, sensor, state, automation
    message TEXT NOT NULL,
    details TEXT, -- JSON string with additional data
    acknowledged BOOLEAN DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_acknowledged ON events(acknowledged);

-- System Settings
-- Key-value store for system configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance Log
-- Track maintenance tasks and schedules
CREATE TABLE IF NOT EXISTS maintenance_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item TEXT NOT NULL,
    description TEXT,
    category TEXT, -- engine, electrical, hull, rigging, etc.
    status TEXT DEFAULT 'pending', -- pending, completed, overdue
    due_date DATE,
    completed_date DATE,
    hours_since_last INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_log(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_due ON maintenance_log(due_date);

-- Trip Log / Logbook
-- Record trips and passages
CREATE TABLE IF NOT EXISTS trip_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    start_location TEXT,
    end_location TEXT,
    start_lat REAL,
    start_lon REAL,
    end_lat REAL,
    end_lon REAL,
    distance_nm REAL,
    max_speed_kt REAL,
    avg_speed_kt REAL,
    duration_hours REAL,
    notes TEXT,
    weather_summary TEXT,
    crew TEXT -- JSON array of crew names
);

CREATE INDEX IF NOT EXISTS idx_trip_start ON trip_log(start_time DESC);

-- Weather Cache
-- Stores fetched weather data for offline use
CREATE TABLE IF NOT EXISTS weather_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    data TEXT NOT NULL, -- JSON blob with full forecast
    fetched_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_location ON weather_cache(lat, lon);
CREATE INDEX IF NOT EXISTS idx_weather_expires ON weather_cache(expires_at);

-- Clients
-- Registered browser/device instances
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    user_agent TEXT,
    client_type TEXT DEFAULT 'display',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Client-Specific Settings
-- Per-client key-value store (mirrors settings table structure)
CREATE TABLE IF NOT EXISTS client_settings (
    client_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, key),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_settings_client ON client_settings(client_id);

-- Database Metadata
-- Track schema version and migrations
CREATE TABLE IF NOT EXISTS db_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial metadata
INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('created_at', datetime('now'));
INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('app_name', 'Biga OS');

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value, description)
VALUES ('data_retention_days', '30', 'Number of days to retain sensor data');

INSERT OR IGNORE INTO settings (key, value, description)
VALUES ('notification_level', 'warning', 'Minimum notification level to display');
