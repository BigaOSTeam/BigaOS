# Quick Start Guide

Get Boat OS running in 5 minutes!

## Step 1: Install Dependencies

From the root directory:

```bash
npm run install:all
```

This will install dependencies for both server and client.

## Step 2: Start Development Servers

Open **two terminal windows**:

**Terminal 1 - Backend:**
```bash
npm run dev:server
```

You should see:
```
🚤 Boat OS Server Started
📡 REST API: http://localhost:3000
🔌 WebSocket: ws://localhost:3000
💚 Health: http://localhost:3000/health
```

**Terminal 2 - Frontend:**
```bash
npm run dev:client
```

You should see:
```
  VITE v5.0.8  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

## Step 3: Open Your Browser

Navigate to: **http://localhost:5173**

You should see the Boat OS dashboard with:
- Current boat state indicator (Drifting by default)
- Real-time sensor widgets updating every second
- Connection status indicator (should show "Connected")

## Step 4: Test State Changes

Click on the emoji buttons in the State Indicator card to change boat states:
- ⚓ Anchored
- ⛵ Sailing
- 🚤 Motoring
- 🏠 In Marina
- 🌊 Drifting

Watch how the dashboard adapts to show relevant information for each state!

## What's Happening?

1. **Backend** generates realistic dummy sensor data
2. **WebSocket** streams data to frontend every second
3. **Frontend** displays state-appropriate widgets
4. **Sensor data** changes based on current boat state

## Testing the API

You can test the REST API directly:

```bash
# Get current state
curl http://localhost:3000/api/state

# Get all sensor data
curl http://localhost:3000/api/sensors

# Get weather forecast
curl http://localhost:3000/api/weather/forecast

# Get camera list
curl http://localhost:3000/api/cameras

# Health check
curl http://localhost:3000/health
```

## Next Steps

- Explore different boat states and their dashboards
- Check out the API endpoints in the README
- Review the code structure
- When ready, move to Raspberry Pi 5 and integrate real sensors!

## Troubleshooting

**Port already in use?**
- Server default: 3000
- Client default: 5173
- Close other applications using these ports

**Dependencies failed to install?**
- Ensure Node.js 20+ is installed: `node --version`
- Try deleting `node_modules` and `package-lock.json`, then reinstall

**Can't connect to server?**
- Make sure server is running (Terminal 1)
- Check browser console for errors
- Verify http://localhost:3000/health returns a response

**Sensor data not updating?**
- Check connection status indicator (top right)
- Open browser DevTools → Network → WS tab
- Look for active WebSocket connection

---

Enjoy exploring Boat OS! 🚤⚓⛵
