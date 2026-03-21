import { Router, Request, Response } from 'express';
import { dbWorker } from '../services/database-worker.service';
import { wsServerInstance } from '../websocket/websocket-server';

const router = Router();

// GET /api/clients - list all clients
router.get('/', async (_req: Request, res: Response) => {
  try {
    const clients = await dbWorker.getAllClients();
    const onlineIds = wsServerInstance
      ? wsServerInstance.getOnlineClientIds(clients.map((c: any) => c.id))
      : [];
    res.json({ clients, onlineIds });
  } catch (error) {
    console.error('[Clients API] Failed to get clients:', error);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

// GET /api/clients/:id - get a single client
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const client = await dbWorker.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ client });
  } catch (error) {
    console.error('[Clients API] Failed to get client:', error);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

// POST /api/clients - register a new client
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, name, userAgent, clientType } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    await dbWorker.registerClient(id, name, userAgent, clientType);
    const client = await dbWorker.getClient(id);
    res.status(201).json({ client });
  } catch (error) {
    console.error('[Clients API] Failed to register client:', error);
    res.status(500).json({ error: 'Failed to register client' });
  }
});

// PUT /api/clients/:id - update client name
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const existing = await dbWorker.getClient(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }
    await dbWorker.updateClientName(req.params.id, name);
    const client = await dbWorker.getClient(req.params.id);
    res.json({ client });
  } catch (error) {
    console.error('[Clients API] Failed to update client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// GET /api/clients/:id/settings - get all settings for a client
router.get('/:id/settings', async (req: Request, res: Response) => {
  try {
    const existing = await dbWorker.getClient(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const rows = await dbWorker.getAllClientSettings(req.params.id);
    const settings: Record<string, any> = {};
    for (const r of rows) {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    }
    res.json({ settings });
  } catch (error) {
    console.error('[Clients API] Failed to get client settings:', error);
    res.status(500).json({ error: 'Failed to get client settings' });
  }
});

// DELETE /api/clients/:id - delete client and its settings
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await dbWorker.getClient(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }
    await dbWorker.deleteClient(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Clients API] Failed to delete client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
