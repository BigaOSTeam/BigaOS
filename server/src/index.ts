import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer, Server as HttpServer } from 'http';
import dotenv from 'dotenv';
import db from './database/database';
import { sdNotifyReady, sdNotifyWatchdog, sdNotifyStopping } from './utils/sd-notify';

// Everything heavy (REST routes, services, the plugin system, WebSocket) is
// imported DYNAMICALLY in initializeSubsystems(), after the HTTP server is
// already listening. Kiosk clients boot in parallel with the server: the page
// must be servable within seconds of process start, or Chromium shows its
// "can't connect" error page and someone has to walk over and press retry.
// Only cheap modules may be imported at the top of this file.

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

// ── Startup state ─────────────────────────────────────────────────
// The HTTP server comes up first; subsystems initialize behind it.
// /health reports the phase so clients can show "starting…" instead of
// treating the boot window as an outage.
type StartupPhase = 'starting' | 'services' | 'plugins' | 'ready';
let startupPhase: StartupPhase = 'starting';

// REST routes are mounted late (dynamic import). Until then /api answers 503
// with starting:true so clients know to retry rather than report an error.
let apiRouter: express.Router | null = null;

// Subsystem references, filled in as each one comes up. Shutdown must cope
// with any prefix of this being initialized (power can drop mid-boot).
interface Subsystems {
  dbWorker?: { terminate(): Promise<void> };
  routeWorkerService?: { terminate(): Promise<void> };
  dataController?: { stop(): Promise<void> };
  wsServer?: {
    stop(): void;
    broadcastSystemShuttingDown(): void;
    broadcastSystemUpdating(): void;
    broadcastUpdateAvailable(v: string): void;
    initialize(): Promise<void>;
  };
  updateService?: { stop(): void };
}
const subsystems: Subsystems = {};

/**
 * Phase 1 — get the HTTP server listening as fast as possible.
 * Static client assets, /health, and the SPA fallback are all live here;
 * /api returns 503 starting:true until phase 2 mounts the real router.
 */
async function startServer(): Promise<HttpServer> {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Middleware
  app.use(cors());
  // gzip responses — big wins on JSON payloads like depth-contour GeoJSON
  // (can be >1 MB uncompressed, ~10× smaller on the wire). Tiles are already
  // compressed image formats, so compression skips them by content-type.
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes (late-bound — see initializeSubsystems)
  app.use('/api', (req, res, next) => {
    if (apiRouter) return apiRouter(req, res, next);
    res.status(503).json({ error: 'Server is starting', starting: true, phase: startupPhase });
  });

  // Serve client build in production
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Health check endpoint
  app.get('/health', (req, res) => {
    const dbStats = db.getStats();
    res.json({
      status: 'healthy',
      ready: startupPhase === 'ready',
      phase: startupPhase,
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

  await new Promise<void>((resolve) => {
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
      resolve();
    });
  });

  return httpServer;
}

/**
 * Phase 2 — initialize everything else behind the already-listening server.
 * Order matters: dbWorker before anything that persists, DataController
 * (plugin system) before the WebSocket server connects to it. The WebSocket
 * server attaches LAST, so a connected socket implies a fully-ready server —
 * clients treat "page loads but socket pending" as the starting state.
 */
async function initializeSubsystems(httpServer: HttpServer): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

  startupPhase = 'services';

  // Database worker (MUST complete before routes/WebSocket use it)
  const { dbWorker } = await import('./services/database-worker.service');
  subsystems.dbWorker = dbWorker;
  await dbWorker.initialize();
  console.log(`[Startup] Database worker initialized (${elapsed()})`);

  // i18n translations
  const { initializeLanguages } = await import('./i18n/lang');
  initializeLanguages();

  // Mount the real REST router
  apiRouter = (await import('./routes')).default;
  console.log(`[Startup] REST API mounted (${elapsed()})`);

  // Geo/overlay services (async, non-blocking, same as before): water mask,
  // depth tiles, heritage, seabed, chart packs, seamarks, route worker.
  import('./services/water-detection.service')
    .then(m => m.waterDetectionService.initialize())
    .catch(error => console.error('Failed to initialize water detection service:', error));
  import('./services/depth-tile.service')
    .then(m => m.depthTileService.initialize())
    .catch(error => console.error('Failed to initialize depth tile service:', error));
  import('./services/heritage.service')
    .then(m => m.heritageService.initialize())
    .catch(error => console.error('Failed to initialize heritage service:', error));
  import('./services/seabed.service')
    .then(m => m.seabedService.initialize())
    .catch(error => console.error('Failed to initialize seabed service:', error));
  import('./services/chart-pack.service')
    .then(m => m.chartPackService.initialize())
    .catch(error => console.error('Failed to initialize chart pack service:', error));
  import('./services/seamark.service')
    .then(m => m.seamarkService.initialize())
    .catch(error => console.error('Failed to initialize seamark service:', error));
  import('./services/route-worker.service')
    .then(m => {
      subsystems.routeWorkerService = m.routeWorkerService;
      return m.routeWorkerService.initialize();
    })
    .catch(error => console.error('Failed to initialize route worker:', error));

  startupPhase = 'plugins';

  // DataController (central data hub + plugin system) — the slowest part:
  // loading driver plugins pulls in heavyweight deps like canboatjs.
  const { DataController } = await import('./services/data.controller');
  const dataController = DataController.getInstance();
  subsystems.dataController = dataController;
  try {
    await dataController.initialize();
    console.log(`[Startup] DataController initialized with plugin system (${elapsed()})`);
  } catch (error) {
    console.error('Failed to initialize DataController:', error);
    // Continue without DataController - fallback to legacy behavior
  }

  // WebSocket server attaches last (see function doc above)
  const { WebSocketServer, setWsServerInstance } = await import('./websocket/websocket-server');
  const wsServer = new WebSocketServer(httpServer);
  subsystems.wsServer = wsServer;
  setWsServerInstance(wsServer);
  try {
    await wsServer.initialize();
    console.log(`[Startup] WebSocket connected to DataController (${elapsed()})`);
  } catch (error) {
    console.error('Failed to connect WebSocket to DataController:', error);
  }

  // Update service
  const { updateService } = await import('./services/update.service');
  subsystems.updateService = updateService;
  updateService.setUpdateCallback(() => wsServer.broadcastSystemUpdating());
  updateService.setUpdateAvailableCallback((v) => wsServer.broadcastUpdateAvailable(v));
  updateService.start();

  startupPhase = 'ready';
  console.log(`[Startup] All subsystems ready (${elapsed()})`);
}

// Start: HTTP first, everything else behind it. A subsystem failure logs
// loudly but does NOT kill the static server — a half-working UI that says
// what's wrong beats a kiosk error page.
const serverPromise = startServer();
serverPromise
  .then(httpServer => initializeSubsystems(httpServer))
  .catch(error => {
    console.error('[FATAL] Subsystem initialization failed:', error);
  });

// Track whether a reboot or update is already in progress
// so we don't show the shutdown overlay on top of them
let systemActionInProgress = false;
export function markSystemActionInProgress() { systemActionInProgress = true; }

// Graceful shutdown — must cope with a partially-initialized server
// (power can drop mid-boot); every ref in `subsystems` is optional.
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
    const httpServer = await serverPromise;
    const s = subsystems;
    if (s.wsServer && !systemActionInProgress) {
      try { s.wsServer.broadcastSystemShuttingDown(); } catch (e) { console.error('[Shutdown] broadcast failed:', e); }
    }
    if (s.updateService) {
      try { s.updateService.stop(); } catch (e) { console.error('[Shutdown] updateService.stop failed:', e); }
    }
    if (s.wsServer) {
      try { s.wsServer.stop(); } catch (e) { console.error('[Shutdown] wsServer.stop failed:', e); }
    }
    if (s.dataController) {
      try { await s.dataController.stop(); } catch (e) { console.error('[Shutdown] DataController.stop failed:', e); }
    }
    if (s.routeWorkerService) {
      try { await s.routeWorkerService.terminate(); } catch (e) { console.error('[Shutdown] routeWorker.terminate failed:', e); }
    }
    if (s.dbWorker) {
      try { await s.dbWorker.terminate(); } catch (e) { console.error('[Shutdown] dbWorker.terminate failed:', e); }
    }
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
