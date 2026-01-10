# Biga OS

Boat monitoring and automation system for Raspberry Pi 5.

## Quick Start

```bash
# Install dependencies
npm run install:all

# Start development (run in separate terminals)
npm run dev:server   # Backend on http://localhost:3000
npm run dev:client   # Frontend on http://localhost:5173
```

## Project Structure

```
server/     # Express + Socket.io backend
client/     # React + Vite frontend
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install all dependencies |
| `npm run dev:server` | Start server in dev mode |
| `npm run dev:client` | Start client in dev mode |
| `npm run build` | Build for production |
| `npm start` | Run production server |

## Raspberry Pi Deployment

```bash
./setup-raspberry-pi.sh
```

Then:
```bash
sudo systemctl start bigaos
sudo systemctl status bigaos
```

Access at `http://<raspberry-pi-ip>:3000`

## API

- `GET /api/sensors` - All sensor data
- `GET /api/state` - Current boat state
- `GET /health` - Server health

WebSocket events: `sensor_update`, `state_change`, `notification`

## Requirements

- Node.js 20+
