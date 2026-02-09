import express from 'express';
import cors from 'cors';
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

// Load environment variables
dotenv.config();

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

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

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

  // SPA fallback - serve index.html for non-API routes
  app.use((req, res, next) => {
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

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize DataController (central data hub)
  const dataController = DataController.getInstance();
  try {
    await dataController.initialize();
    console.log('[Server] DataController initialized');
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
  updateService.start();

  // Start server
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('🚤 Biga OS Server Started');
    console.log(`📡 REST API: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`🌐 Network access enabled on all interfaces`);
  });

  return { httpServer, wsServer };
}

// Start the server
const serverPromise = startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  const { httpServer, wsServer } = await serverPromise;
  updateService.stop();
  wsServer.stop();
  DataController.getInstance().stop();
  await routeWorkerService.terminate();
  await dbWorker.terminate();
  db.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  const { httpServer, wsServer } = await serverPromise;
  updateService.stop();
  wsServer.stop();
  DataController.getInstance().stop();
  await routeWorkerService.terminate();
  await dbWorker.terminate();
  db.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
