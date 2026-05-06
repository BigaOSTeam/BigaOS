import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer } from 'http';
import dotenv from 'dotenv';
import routes from './routes';
import { updateService } from './services/update.service';
import { WebSocketServer, setWsServerInstance } from './websocket/websocket-server';
import db from './database/database';
import { dbWorker } from './services/database-worker.service';
import { waterDetectionService } from './services/water-detection.service';
import { routeWorkerService } from './services/route-worker.service';
import { DataController } from './services/data.controller';
import { initializeLanguages } from './i18n/lang';
import { sdNotifyReady, sdNotifyWatchdog, sdNotifyStopping } from './utils/sd-notify';

// Load environment variables
dotenv.config();

// Last-resort safety net. A throw deep inside a plugin's setInterval, an
// unhandled rejection in a sensor handler, etc. should NOT silently corrupt
// in-memory state — log loudly and let systemd restart us cleanly.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  // Give logs a moment to flush, then exit so systemd restarts us.
  setTimeout(() => process.exit(1), 500);
});
process.on('unhandledRejection', (reason) => {
  // Don't crash on these — too easy for a stray promise to take the boat
  // offline. Log and keep running; the originating handler should have
  // caught it.
  console.error('[unhandledRejection]', reason);
});

// Initialize synchronous database (for backwards compatibility with routes)
try {
  db.initialize();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

// Async initialization function
async function startServer() {
  // Initialize database worker (MUST complete before WebSocket server starts)
  try {
    await dbWorker.initialize();
    console.log('[Server] Database worker initialized');
  } catch (error) {
    console.error('Failed to initialize database worker:', error);
    process.exit(1);
  }

  // Initialize water detection service (async, non-blocking)
  waterDetectionService.initialize().catch(error => {
    console.error('Failed to initialize water detection service:', error);
  });

  // Initialize route worker (async, non-blocking) - runs pathfinding in separate thread
  routeWorkerService.initialize().catch(error => {
    console.error('Failed to initialize route worker:', error);
  });

  // Initialize i18n translations
  initializeLanguages();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.use('/api', routes);

  // Serve client build in production
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Health check endpoint
  app.get('/health', (req, res) => {
    const dbStats = db.getStats();
    res.json({
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      database: {
        connected: true,
        ...dbStats
      }
    });
  });

  // SPA fallback - serve index.html for non-API routes.
  // Generous rate limit so unrelated abusers can't pin one process on
  // serving index.html, but loose enough that normal SPA load + reload
  // bursts pass through unharmed.
  const spaFallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
  });
  app.use(spaFallbackLimiter, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      res.status(404).json({ error: 'Endpoint not found' });
    } else {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  const httpServer = createServer(app);

  // Initialize DataController (central data hub + plugin system)
  const dataController = DataController.getInstance();
  try {
    await dataController.initialize();
    console.log('[Server] DataController initialized (with plugin system)');
  } catch (error) {
    console.error('Failed to initialize DataController:', error);
    // Continue without DataController - fallback to legacy behavior
  }

  // Initialize WebSocket server (now safe because dbWorker is ready)
  const wsServer = new WebSocketServer(httpServer);
  setWsServerInstance(wsServer);

  // Connect WebSocket to DataController
  try {
    await wsServer.initialize();
    console.log('[Server] WebSocket connected to DataController');
  } catch (error) {
    console.error('Failed to connect WebSocket to DataController:', error);
  }

  // Initialize update service
  updateService.setUpdateCallback(() => wsServer.broadcastSystemUpdating());
  updateService.setUpdateAvailableCallback((v) => wsServer.broadcastUpdateAvailable(v));
  updateService.start();

  // Start server
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('🚤 Biga OS Server Started');
    console.log(`📡 REST API: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`🌐 Network access enabled on all interfaces`);
    // Tell systemd we're ready (Type=notify) and start the watchdog ping.
    // No-op when not running under systemd.
    sdNotifyReady();
    sdNotifyWatchdog();
  });

  return { httpServer, wsServer };
}

// Start the server
const serverPromise = startServer();

// Track whether a reboot or update is already in progress
// so we don't show the shutdown overlay on top of them
let systemActionInProgress = false;
export function markSystemActionInProgress() { systemActionInProgress = true; }

// Graceful shutdown
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);
  sdNotifyStopping();

  // Hard cap: if anything below hangs (a closeAllConnections that doesn't,
  // a worker that won't terminate), exit anyway so systemd doesn't have to
  // SIGKILL us with the SQLite WAL still hot.
  const hardExit = setTimeout(() => {
    console.error('[Shutdown] Timed out, forcing exit');
    process.exit(1);
  }, 10000);
  hardExit.unref();

  try {
    const { httpServer, wsServer } = await serverPromise;
    if (!systemActionInProgress) {
      try { wsServer.broadcastSystemShuttingDown(); } catch (e) { console.error('[Shutdown] broadcast failed:', e); }
    }
    try { updateService.stop(); } catch (e) { console.error('[Shutdown] updateService.stop failed:', e); }
    try { wsServer.stop(); } catch (e) { console.error('[Shutdown] wsServer.stop failed:', e); }
    try { await DataController.getInstance().stop(); } catch (e) { console.error('[Shutdown] DataController.stop failed:', e); }
    try { await routeWorkerService.terminate(); } catch (e) { console.error('[Shutdown] routeWorker.terminate failed:', e); }
    try { await dbWorker.terminate(); } catch (e) { console.error('[Shutdown] dbWorker.terminate failed:', e); }
    try { db.close(); } catch (e) { console.error('[Shutdown] db.close failed:', e); }
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    // Force-close any lingering keepalive connections so httpServer.close resolves.
    try { (httpServer as any).closeAllConnections?.(); } catch {}
  } catch (err) {
    console.error('[Shutdown] Unexpected error:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
