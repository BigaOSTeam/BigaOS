# Boat OS - Intelligent Boat Automation System

A comprehensive boat monitoring and automation system built with Node.js, Express, React, and WebSocket communication. This is the development version with dummy sensor data for testing before deployment to the Raspberry Pi 5.

## Features

- **Real-time Sensor Monitoring** - Track GPS, depth, speed, wind, battery, and more
- **Intelligent State Detection** - Automatically detects boat states (Anchored, Sailing, Motoring, In Marina, Drifting)
- **State-Based UI** - Dashboard adapts to current boat activity
- **WebSocket Communication** - Real-time data streaming to connected clients
- **REST API** - Complete API for sensor data, state management, weather, and cameras
- **Dummy Data Generator** - Realistic simulated sensor data for development

## Project Structure

```
boat-os/
├── server/                 # Backend Express server
│   ├── src/
│   │   ├── controllers/   # API controllers
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic & dummy data
│   │   ├── types/         # TypeScript type definitions
│   │   ├── websocket/     # WebSocket server
│   │   └── index.ts       # Server entry point
│   └── package.json
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── layout/   # Layout components
│   │   │   ├── views/    # State-based views
│   │   │   └── widgets/  # Reusable widget components
│   │   ├── services/     # API & WebSocket clients
│   │   ├── types/        # TypeScript types
│   │   ├── App.tsx       # Main app component
│   │   └── main.tsx      # Entry point
│   └── package.json
│
├── HARDWARE.md            # Hardware specifications
├── SOFTWARE_SPEC.md       # Complete software specification
└── README.md              # This file
```

## Prerequisites

- **Node.js** 20+ LTS
- **npm** or **yarn**

## Installation & Setup

### 1. Install Dependencies

**Install server dependencies:**
```bash
cd server
npm install
```

**Install client dependencies:**
```bash
cd ../client
npm install
```

### 2. Configure Environment Variables

The server uses default values, but you can create a `.env` file in the `server/` directory:

```bash
cd server
cp .env.example .env
```

Edit `.env` if needed:
```env
NODE_ENV=development
PORT=3000
WS_PORT=3001
LOG_LEVEL=info
```

## Running the Application

You have two options for running the application:

### Option 1: Run Both Server and Client Separately

**Terminal 1 - Start the server:**
```bash
cd server
npm run dev
```

The server will start on `http://localhost:3000`

**Terminal 2 - Start the client:**
```bash
cd client
npm run dev
```

The client will start on `http://localhost:5173`

### Option 2: Production Build

**Build the client:**
```bash
cd client
npm run build
```

**Build and start the server:**
```bash
cd ../server
npm run build
npm start
```

## Accessing the Application

Once both are running:

1. Open your browser to **http://localhost:5173** (development) or **http://localhost:3000** (production)
2. You should see the Boat OS dashboard with real-time updating sensor data

## API Endpoints

### State Management
- `GET /api/state` - Get current boat state
- `POST /api/state/override` - Manually override state
- `DELETE /api/state/override` - Cancel manual override
- `GET /api/state/history` - Get state history

### Sensors
- `GET /api/sensors` - Get all current sensor values
- `GET /api/sensors/:category` - Get specific sensor category (navigation, environment, electrical, propulsion)
- `GET /api/sensors/:category/history` - Get sensor history

### Weather
- `GET /api/weather/current` - Get current weather
- `GET /api/weather/forecast` - Get weather forecast

### Cameras
- `GET /api/cameras` - List all cameras
- `GET /api/cameras/:id` - Get camera details
- `GET /api/cameras/:id/stream` - Get camera stream URL

### Health Check
- `GET /health` - Server health status

## WebSocket Events

### Client → Server
```javascript
// Subscribe to sensor updates
socket.emit('subscribe', { paths: ['navigation.position', 'environment.depth.*'] });

// Send control command
socket.emit('control', { type: 'set_state', state: 'ANCHORED' });
```

### Server → Client
```javascript
// Sensor data updates (every second)
socket.on('sensor_update', (data) => {
  console.log('Sensor data:', data);
});

// State change notifications
socket.on('state_change', (data) => {
  console.log('State changed to:', data.currentState);
});

// System notifications
socket.on('notification', (data) => {
  console.log('Notification:', data);
});
```

## Boat States

The system automatically detects and displays 5 different boat states:

1. **⚓ ANCHORED** - Anchor is deployed and boat is stationary
2. **⛵ SAILING** - Moving under sail (motor off)
3. **🚤 MOTORING** - Moving with motor running
4. **🏠 IN MARINA** - Stationary in marina (no anchor)
5. **🌊 DRIFTING** - No anchor, no motor, minimal speed

Each state has a customized dashboard showing relevant widgets and information.

## Key Components

### Server Components

- **dummy-data.service.ts** - Generates realistic sensor data based on current boat state
- **state.controller.ts** - Manages boat state and state transitions
- **sensor.controller.ts** - Provides sensor data endpoints
- **websocket-server.ts** - Handles real-time WebSocket communication

### Client Components

- **App.tsx** - Main application component with WebSocket connection
- **StateIndicator.tsx** - Displays current boat state with manual override controls
- **DashboardView.tsx** - Renders state-appropriate view
- **Widgets/** - Reusable instrument components (depth, speed, compass, etc.)
- **Views/** - State-specific dashboard layouts

## Development Features

### Dummy Data Generator

The `dummy-data.service.ts` generates realistic sensor data that changes based on the current boat state:

- **Anchored**: Low speed (~0.1 kt), small variations in heading
- **Sailing**: Medium speed (~5.5 kt), heel angle 10-20°, wind data
- **Motoring**: Steady speed (~4.8 kt), motor running, battery discharge
- **In Marina**: Virtually stationary, minimal movement
- **Drifting**: Low speed with random heading changes

### State Transitions

You can manually change boat states using the emoji buttons in the State Indicator card. The dummy data will automatically adjust to reflect the new state.

## Next Steps (Raspberry Pi Deployment)

When you're ready to deploy to the Raspberry Pi 5:

1. **Install SignalK Server** - For real marine sensor data
2. **Set up CAN Bus** - Connect ESP32 sensor nodes
3. **Configure Hardware** - Follow HARDWARE.md for wiring
4. **Replace Dummy Data** - Swap `dummy-data.service.ts` with real SignalK integration
5. **Install Camera System** - Set up IP cameras and FFmpeg transcoding
6. **Configure Weather API** - Add Windy API key for real weather data

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Verify Node.js version (20+ required)
- Check for errors in console output

### Client won't connect to server
- Verify server is running on port 3000
- Check browser console for WebSocket errors
- Ensure CORS is not blocking requests

### No sensor data updating
- Check WebSocket connection status (indicator in header)
- Open browser dev tools and check Network → WS tab
- Verify server console shows "Client connected"

### TypeScript errors
- Run `npm install` in both server and client directories
- Check TypeScript version (5.3+ required)

## Technologies Used

### Backend
- Node.js 20+
- Express.js - Web server
- Socket.io - WebSocket communication
- TypeScript - Type safety

### Frontend
- React 18 - UI framework
- TypeScript - Type safety
- Vite - Build tool and dev server
- Socket.io-client - WebSocket client
- Axios - HTTP client

## License

ISC

## Author

Boat OS Development Team

---

**Current Status**: Development version with dummy data
**Target Deployment**: Raspberry Pi 5 on 24ft sailboat
**Next Phase**: Hardware integration and SignalK setup
# BoatOS
# BoatOS
# BoatOS
# BigaOS
