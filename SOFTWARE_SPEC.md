# Boat OS - Software Specification

## Executive Summary

This document provides a complete software specification for the Boat OS intelligent automation system running on a Raspberry Pi 5. The system provides real-time monitoring, control, and intelligent automation for a 24ft sailboat with electric motor.

**Key Features:**
- Intelligent boat state detection (Anchored, Sailing, Motoring, In Marina, Drifting)
- Event-driven automation system with pre-built smart automations
- Unified responsive web interface accessible from any device
- Real-time sensor monitoring via SignalK
- CAN bus sensor network integration
- Camera feed management
- Weather integration (Windy API)
- Maintenance tracking and logbook

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Devices                           │
│  (Helm Displays, Phones, Tablets - Browser-based UI)        │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/WebSocket
                        │
┌───────────────────────┴─────────────────────────────────────┐
│              Raspberry Pi 5 (Node.js Backend)               │
│                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Express Server │  │ Automation      │  │ State        │ │
│  │ (REST API)     │  │ Engine          │  │ Machine      │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ WebSocket      │  │ Event Bus       │  │ Weather      │ │
│  │ Server         │  │ (Pub/Sub)       │  │ Service      │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Camera         │  │ SignalK         │  │ Database     │ │
│  │ Service        │  │ Client          │  │ (SQLite)     │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
└────────────────────────┬──────────────┬────────────────────┘
                         │              │
                         │              │ SignalK WebSocket
                         │              │
                ┌────────┴──────┐  ┌────┴──────────────┐
                │ SocketCAN     │  │ SignalK Server    │
                │ (CAN Bus)     │  │ (Separate Process)│
                └───────┬───────┘  └───────────────────┘
                        │
                        │
            ┌───────────┴────────────┐
            │   CAN Bus Network      │
            │   (ESP32 Sensor Nodes) │
            └────────────────────────┘
```

### Technology Stack

#### Backend (Raspberry Pi 5)
- **Runtime:** Node.js 20+ LTS
- **Language:** TypeScript 5+
- **Framework:** Express.js
- **Real-time:** Socket.io (WebSocket library)
- **State Machine:** XState (for boat state management)
- **Rule Engine:** json-rules-engine (for automation rules)
- **Database:** SQLite3 with better-sqlite3 driver
- **CAN Interface:** socketcan (Node.js CAN bus library)
- **SignalK:** @signalk/client (SignalK JavaScript client)
- **Scheduling:** node-cron (for time-based triggers)
- **Video:** fluent-ffmpeg (camera stream transcoding)
- **HTTP Client:** axios (for weather APIs)

#### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **State Management:** Zustand (lightweight state)
- **Data Fetching:** TanStack Query (React Query)
- **WebSocket:** Socket.io-client
- **Layout System:** React Grid Layout (drag-and-drop widgets)
- **Charts:** Leaflet.js (navigation) + Recharts (data visualization)
- **UI Components:** Headless UI + Tailwind CSS
- **Icons:** Lucide React (icon library)
- **PWA:** Vite PWA plugin (installable web app)

#### SignalK Server
- **Installation:** Via npm (@signalk/server)
- **Plugins:** Custom CAN-to-SignalK plugin
- **Configuration:** JSON configuration files

## Project Structure

```
boat-os/
├── server/                              # Backend application
│   ├── src/
│   │   ├── index.ts                     # Application entry point
│   │   ├── config/
│   │   │   ├── config.ts                # Configuration management
│   │   │   └── constants.ts             # Application constants
│   │   ├── core/
│   │   │   ├── state-machine.ts         # Boat state machine (XState)
│   │   │   ├── automation-engine.ts     # Rule engine wrapper
│   │   │   ├── event-bus.ts             # Event emitter (pub/sub)
│   │   │   └── scheduler.ts             # Cron job scheduler
│   │   ├── services/
│   │   │   ├── signalk/
│   │   │   │   ├── signalk-client.ts    # SignalK connection
│   │   │   │   ├── signalk-subscriber.ts # Subscribe to paths
│   │   │   │   └── signalk-publisher.ts  # Publish data
│   │   │   ├── can/
│   │   │   │   ├── can-service.ts       # SocketCAN interface
│   │   │   │   ├── can-parser.ts        # Parse CAN frames
│   │   │   │   └── can-protocol.ts      # PGN definitions
│   │   │   ├── camera/
│   │   │   │   ├── camera-service.ts    # Camera management
│   │   │   │   ├── stream-manager.ts    # RTSP → HLS transcoding
│   │   │   │   └── camera-config.ts     # Camera configuration
│   │   │   ├── weather/
│   │   │   │   ├── weather-service.ts   # Weather API client
│   │   │   │   ├── windy-api.ts         # Windy API integration
│   │   │   │   └── forecast-parser.ts   # Parse forecast data
│   │   │   ├── gps-service.ts           # GPS position tracking
│   │   │   ├── sensor-fusion.ts         # Combine sensor data
│   │   │   └── device-manager.ts        # Track connected displays
│   │   ├── automations/
│   │   │   ├── automation-registry.ts   # Register all automations
│   │   │   ├── anchor-automation.ts     # Anchor drop/alarm logic
│   │   │   ├── sailing-automation.ts    # Sailing mode automation
│   │   │   ├── motoring-automation.ts   # Motoring mode automation
│   │   │   ├── marina-automation.ts     # Marina mode automation
│   │   │   ├── weather-monitoring.ts    # Weather warnings
│   │   │   ├── battery-monitoring.ts    # Battery alerts
│   │   │   ├── heel-monitoring.ts       # Heel angle warnings
│   │   │   └── custom-rules.ts          # User-defined rules
│   │   ├── controllers/
│   │   │   ├── state.controller.ts      # Boat state endpoints
│   │   │   ├── automation.controller.ts # Automation CRUD
│   │   │   ├── sensor.controller.ts     # Sensor data endpoints
│   │   │   ├── control.controller.ts    # Device control (winch, motor)
│   │   │   ├── camera.controller.ts     # Camera endpoints
│   │   │   ├── weather.controller.ts    # Weather endpoints
│   │   │   ├── device.controller.ts     # Display device management
│   │   │   ├── maintenance.controller.ts # Maintenance tracking
│   │   │   └── log.controller.ts        # Logbook entries
│   │   ├── routes/
│   │   │   ├── index.ts                 # Route registration
│   │   │   ├── state.routes.ts          # /api/state routes
│   │   │   ├── automation.routes.ts     # /api/automations routes
│   │   │   ├── sensor.routes.ts         # /api/sensors routes
│   │   │   ├── control.routes.ts        # /api/control routes
│   │   │   ├── camera.routes.ts         # /api/cameras routes
│   │   │   ├── weather.routes.ts        # /api/weather routes
│   │   │   ├── device.routes.ts         # /api/devices routes
│   │   │   ├── maintenance.routes.ts    # /api/maintenance routes
│   │   │   └── log.routes.ts            # /api/logs routes
│   │   ├── websocket/
│   │   │   ├── websocket-server.ts      # Socket.io setup
│   │   │   ├── handlers/
│   │   │   │   ├── data-handler.ts      # Stream sensor data
│   │   │   │   ├── command-handler.ts   # Handle control commands
│   │   │   │   ├── notification-handler.ts # Push notifications
│   │   │   │   └── device-handler.ts    # Device registration
│   │   │   └── middleware/
│   │   │       └── auth.middleware.ts   # WebSocket authentication
│   │   ├── database/
│   │   │   ├── database.ts              # SQLite connection
│   │   │   ├── schema.sql               # Database schema
│   │   │   ├── migrations/              # Schema migrations
│   │   │   │   ├── 001_initial.sql
│   │   │   │   └── 002_add_automations.sql
│   │   │   ├── models/
│   │   │   │   ├── log-entry.model.ts   # Logbook entries
│   │   │   │   ├── maintenance.model.ts  # Maintenance tasks
│   │   │   │   ├── automation.model.ts   # Automation rules
│   │   │   │   ├── state-history.model.ts # State transitions
│   │   │   │   └── device.model.ts       # Display devices
│   │   │   └── repositories/
│   │   │       ├── log.repository.ts
│   │   │       ├── maintenance.repository.ts
│   │   │       ├── automation.repository.ts
│   │   │       ├── state.repository.ts
│   │   │       └── device.repository.ts
│   │   ├── middleware/
│   │   │   ├── error-handler.ts         # Global error handling
│   │   │   ├── logger.ts                # Request logging
│   │   │   └── cors.ts                  # CORS configuration
│   │   ├── types/
│   │   │   ├── boat-state.types.ts      # State machine types
│   │   │   ├── sensor.types.ts          # Sensor data types
│   │   │   ├── automation.types.ts      # Automation types
│   │   │   ├── signalk.types.ts         # SignalK types
│   │   │   └── can.types.ts             # CAN message types
│   │   └── utils/
│   │       ├── logger.ts                # Winston logger
│   │       ├── geo-utils.ts             # GPS calculations
│   │       ├── time-utils.ts            # Time/date utilities
│   │       └── validation.ts            # Input validation
│   ├── tests/
│   │   ├── unit/                        # Unit tests
│   │   └── integration/                 # Integration tests
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example                     # Environment variables
│
├── client/                              # Frontend application
│   ├── public/
│   │   ├── manifest.json                # PWA manifest
│   │   └── icons/                       # PWA icons
│   ├── src/
│   │   ├── App.tsx                      # Root component
│   │   ├── main.tsx                     # Entry point
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx        # Main layout wrapper
│   │   │   │   ├── StateIndicator.tsx   # Boat state display
│   │   │   │   ├── Navigation.tsx       # Top navigation
│   │   │   │   ├── WidgetGrid.tsx       # Drag-drop widget grid
│   │   │   │   ├── QuickActions.tsx     # Context-aware actions
│   │   │   │   └── NotificationPanel.tsx # Alerts/notifications
│   │   │   ├── widgets/                 # Reusable widget components
│   │   │   │   ├── DepthGauge.tsx
│   │   │   │   ├── SpeedLog.tsx
│   │   │   │   ├── WindInstrument.tsx
│   │   │   │   ├── Compass.tsx
│   │   │   │   ├── HeelIndicator.tsx
│   │   │   │   ├── CameraFeed.tsx
│   │   │   │   ├── ThrottleControl.tsx
│   │   │   │   ├── WinchControl.tsx
│   │   │   │   ├── BatteryStatus.tsx
│   │   │   │   ├── TemperatureDisplay.tsx
│   │   │   │   ├── WeatherCard.tsx
│   │   │   │   ├── GPSPosition.tsx
│   │   │   │   └── AnchorAlarm.tsx
│   │   │   ├── views/                   # State-based view templates
│   │   │   │   ├── AnchoredView.tsx     # Anchored state layout
│   │   │   │   ├── SailingView.tsx      # Sailing state layout
│   │   │   │   ├── MotoringView.tsx     # Motoring state layout
│   │   │   │   ├── MarinaView.tsx       # Marina state layout
│   │   │   │   └── DriftingView.tsx     # Drifting state layout
│   │   │   ├── navigation/
│   │   │   │   ├── ChartView.tsx        # Leaflet map component
│   │   │   │   ├── WaypointManager.tsx  # Waypoint CRUD
│   │   │   │   └── RouteDisplay.tsx     # Route visualization
│   │   │   ├── cameras/
│   │   │   │   ├── CameraGrid.tsx       # Multi-camera view
│   │   │   │   ├── SingleCamera.tsx     # Full-screen camera
│   │   │   │   └── CameraSelector.tsx   # Camera picker
│   │   │   ├── automation/
│   │   │   │   ├── AutomationList.tsx   # List all rules
│   │   │   │   ├── RuleBuilder.tsx      # Visual rule creator
│   │   │   │   ├── RuleEditor.tsx       # Edit existing rule
│   │   │   │   └── TriggerConfig.tsx    # Configure triggers
│   │   │   ├── maintenance/
│   │   │   │   ├── MaintenanceList.tsx  # Maintenance tasks
│   │   │   │   ├── MaintenanceForm.tsx  # Add/edit task
│   │   │   │   ├── Logbook.tsx          # Logbook entries
│   │   │   │   └── LogEntry.tsx         # Single log entry
│   │   │   ├── settings/
│   │   │   │   ├── LayoutCustomizer.tsx # Widget customization
│   │   │   │   ├── DeviceSettings.tsx   # Display configuration
│   │   │   │   ├── SensorCalibration.tsx # Sensor calibration
│   │   │   │   └── SystemStatus.tsx     # System health
│   │   │   └── common/
│   │   │       ├── Button.tsx           # Reusable button
│   │   │       ├── Card.tsx             # Card container
│   │   │       ├── Modal.tsx            # Modal dialog
│   │   │       ├── Gauge.tsx            # Generic gauge
│   │   │       └── LoadingSpinner.tsx   # Loading indicator
│   │   ├── hooks/
│   │   │   ├── useBoatState.ts          # Current boat state
│   │   │   ├── useSensorData.ts         # Real-time sensor data
│   │   │   ├── useAutomations.ts        # Automation rules
│   │   │   ├── useWeather.ts            # Weather data
│   │   │   ├── useCameras.ts            # Camera streams
│   │   │   ├── useLayout.ts             # Widget layout
│   │   │   ├── useWebSocket.ts          # WebSocket connection
│   │   │   ├── useNotifications.ts      # Notification system
│   │   │   └── useDeviceInfo.ts         # Device identification
│   │   ├── stores/
│   │   │   ├── boatStore.ts             # Boat state & sensors
│   │   │   ├── uiStore.ts               # UI preferences
│   │   │   ├── automationStore.ts       # Automation state
│   │   │   └── notificationStore.ts     # Notifications
│   │   ├── services/
│   │   │   ├── api.ts                   # Axios API client
│   │   │   ├── websocket.ts             # WebSocket client
│   │   │   └── storage.ts               # Local storage wrapper
│   │   ├── utils/
│   │   │   ├── formatting.ts            # Format values
│   │   │   ├── units.ts                 # Unit conversions
│   │   │   └── calculations.ts          # Math utilities
│   │   ├── types/
│   │   │   ├── index.ts                 # Shared types
│   │   │   └── api.types.ts             # API response types
│   │   └── styles/
│   │       ├── globals.css              # Global styles
│   │       └── tailwind.css             # Tailwind imports
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── index.html
│
├── signalk/                             # SignalK configuration
│   ├── plugins/
│   │   └── can-to-signalk/              # Custom CAN decoder plugin
│   │       ├── index.js
│   │       ├── plugin.json
│   │       └── pgn-mappings.json
│   └── settings.json                    # SignalK settings
│
├── config/                              # Configuration files
│   ├── default-automations.json         # Pre-built automation rules
│   ├── state-thresholds.json            # State detection parameters
│   ├── widget-presets.json              # Pre-built widget layouts
│   ├── camera-config.json               # Camera definitions
│   └── sensor-mapping.json              # CAN PGN to sensor mapping
│
├── docs/                                # Documentation
│   ├── API.md                           # API documentation
│   ├── STATE_MACHINE.md                 # State machine details
│   ├── AUTOMATION_GUIDE.md              # Creating automations
│   ├── DEPLOYMENT.md                    # Deployment guide
│   └── DEVELOPMENT.md                   # Development setup
│
├── scripts/                             # Utility scripts
│   ├── setup-pi.sh                      # Initial Pi 5 setup
│   ├── install-signalk.sh               # Install SignalK server
│   ├── setup-can.sh                     # Configure CAN interface
│   ├── deploy.sh                        # Deploy application
│   └── backup.sh                        # Backup configuration
│
├── .gitignore
├── README.md
├── package.json                         # Root package.json (workspace)
└── docker-compose.yml                   # Optional Docker setup
```

## Core Systems

### 1. Boat State Machine

The state machine is the heart of the intelligent automation system. It continuously monitors sensor inputs and determines the current boat state.

#### State Definitions

```typescript
enum BoatState {
  ANCHORED = 'ANCHORED',
  IN_MARINA = 'IN_MARINA',
  MOTORING = 'MOTORING',
  SAILING = 'SAILING',
  DRIFTING = 'DRIFTING'
}

interface StateInputs {
  anchorChainOut: boolean;
  gpsSpeed: number;              // Knots
  motorRunning: boolean;
  gpsPosition: GeoPosition;
  depthBelowTransducer: number;
  timeInState: number;           // Seconds
}

interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp: Date;
}
```

#### State Detection Algorithm

```typescript
/**
 * Determine boat state from sensor inputs
 * Uses hysteresis to prevent rapid state transitions
 */
function detectBoatState(
  inputs: StateInputs,
  currentState: BoatState,
  thresholds: StateThresholds
): BoatState {

  // Anchored: Chain out + low speed
  if (inputs.anchorChainOut && inputs.gpsSpeed < thresholds.anchoredMaxSpeed) {
    return BoatState.ANCHORED;
  }

  // In Marina: Stationary + no chain + (optional) geo-fence
  if (!inputs.anchorChainOut &&
      inputs.gpsSpeed < thresholds.marinaMaxSpeed &&
      inputs.timeInState > 300) {  // 5 min stationary
    if (isInMarinaGeofence(inputs.gpsPosition)) {
      return BoatState.IN_MARINA;
    }
    // Could also be in marina even without geo-fence if very still
    if (inputs.gpsSpeed < 0.1) {
      return BoatState.IN_MARINA;
    }
  }

  // Motoring: Moving + motor on
  if (inputs.gpsSpeed > thresholds.motoringMinSpeed &&
      inputs.motorRunning) {
    return BoatState.MOTORING;
  }

  // Sailing: Moving + motor off
  if (inputs.gpsSpeed > thresholds.sailingMinSpeed &&
      !inputs.motorRunning) {
    return BoatState.SAILING;
  }

  // Drifting: Default state
  return BoatState.DRIFTING;
}
```

#### Default Thresholds

```json
{
  "anchoredMaxSpeed": 0.5,
  "marinaMaxSpeed": 0.2,
  "motoringMinSpeed": 1.0,
  "sailingMinSpeed": 1.0,
  "stateTransitionDelay": 10
}
```

#### State Transitions

State transitions trigger events on the event bus:

```typescript
// Event published when state changes
interface StateChangeEvent {
  type: 'state_change';
  previousState: BoatState;
  newState: BoatState;
  timestamp: Date;
  inputs: StateInputs;
}
```

Automations subscribe to these events to trigger actions.

#### Manual Override

Users can manually override the detected state:

```typescript
interface StateOverride {
  state: BoatState;
  reason: string;
  expiresAt?: Date;  // Optional: auto-revert after time
}
```

Manual overrides persist until:
- Sensor data strongly contradicts the override
- User cancels override
- Optional expiration time reached

### 2. Event Bus System

The event bus enables loose coupling between system components using pub/sub pattern.

#### Event Types

```typescript
type SystemEvent =
  | StateChangeEvent
  | SensorUpdateEvent
  | ControlCommandEvent
  | AlarmEvent
  | NotificationEvent
  | AutomationTriggeredEvent;

interface SensorUpdateEvent {
  type: 'sensor_update';
  sensor: string;           // e.g., 'gps', 'depth', 'battery'
  path: string;             // SignalK path
  value: any;
  timestamp: Date;
}

interface ControlCommandEvent {
  type: 'control_command';
  device: string;           // e.g., 'winch', 'motor'
  command: string;          // e.g., 'up', 'down', 'stop'
  parameters?: any;
}

interface AlarmEvent {
  type: 'alarm';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: Date;
}
```

#### Usage Example

```typescript
// Publish event
eventBus.publish({
  type: 'state_change',
  previousState: BoatState.DRIFTING,
  newState: BoatState.ANCHORED,
  timestamp: new Date(),
  inputs: currentInputs
});

// Subscribe to events
eventBus.subscribe('state_change', (event: StateChangeEvent) => {
  if (event.newState === BoatState.ANCHORED) {
    triggerAnchorAutomation(event);
  }
});
```

### 3. Automation Engine

The automation engine processes rules and executes actions when conditions are met.

#### Rule Structure

```typescript
interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: RuleTrigger;
  conditions?: RuleCondition[];
  actions: RuleAction[];
  debounce?: number;        // Milliseconds to wait before triggering
  cooldown?: number;        // Milliseconds before can trigger again
}

type RuleTrigger =
  | { type: 'state_change'; states: BoatState[] }
  | { type: 'sensor'; path: string; condition: string }
  | { type: 'time'; cron: string }
  | { type: 'event'; eventType: string };

interface RuleCondition {
  path: string;             // e.g., 'sensors.battery.voltage'
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  value: any;
}

type RuleAction =
  | { type: 'show_view'; viewId: string }
  | { type: 'show_camera'; cameraId: string }
  | { type: 'send_notification'; notification: NotificationConfig }
  | { type: 'log_event'; message: string }
  | { type: 'set_alarm'; alarm: AlarmConfig }
  | { type: 'control_device'; device: string; command: string }
  | { type: 'fetch_weather'; }
  | { type: 'run_script'; scriptId: string };
```

#### Example: Anchor Drop Automation

```json
{
  "id": "anchor-drop-automation",
  "name": "Anchor Drop Automation",
  "description": "Triggered when anchor is deployed",
  "enabled": true,
  "trigger": {
    "type": "state_change",
    "states": ["ANCHORED"]
  },
  "actions": [
    {
      "type": "log_event",
      "message": "Anchor dropped at ${gps.position}"
    },
    {
      "type": "show_camera",
      "cameraId": "anchor-camera"
    },
    {
      "type": "set_alarm",
      "alarm": {
        "type": "anchor_drag",
        "radius": "${depth * 5 + 10}"
      }
    },
    {
      "type": "send_notification",
      "notification": {
        "title": "Anchor Dropped",
        "message": "Anchor alarm set - radius ${alarm.radius}m"
      }
    }
  ]
}
```

#### Pre-Built Automations

The system includes these pre-built automations:

1. **Anchor Drop Automation**
   - Trigger: State → ANCHORED
   - Actions: Show anchor camera, set alarm, log position

2. **Anchor Drag Alarm**
   - Trigger: Distance from anchor > radius
   - Actions: Sound alarm, send notification, highlight on chart

3. **Sailing Mode Automation**
   - Trigger: State → SAILING
   - Actions: Show sailing dashboard, fetch weather forecast

4. **Heel Angle Warning**
   - Trigger: Heel > 20° AND wind forecast increasing
   - Actions: Suggest reefing, show weather warning

5. **Battery Low Warning**
   - Trigger: Battery voltage < 11.5V for 60 seconds
   - Actions: Show critical alert, suggest charging

6. **High Temperature Warning**
   - Trigger: Engine room temp > 40°C
   - Actions: Alert, turn on fan (if automated)

7. **Weather Warning**
   - Trigger: Wind forecast > 25kt in next 6 hours
   - Actions: Notification with forecast details

#### Visual Rule Builder

The UI includes a visual rule builder for creating custom automations:

```
┌─────────────────────────────────────┐
│  Create New Automation              │
├─────────────────────────────────────┤
│  Name: [My Custom Rule          ]   │
│                                     │
│  WHEN (Trigger)                     │
│  ┌─────────────────────────────┐   │
│  │ [State Changes ▼]           │   │
│  │ To: [x] Anchored [ ] Sailing│   │
│  └─────────────────────────────┘   │
│                                     │
│  AND IF (Conditions)                │
│  ┌─────────────────────────────┐   │
│  │ [Sensor ▼] [depth]          │   │
│  │ [is less than ▼] [5] meters │   │
│  │ [+ Add Condition]           │   │
│  └─────────────────────────────┘   │
│                                     │
│  THEN DO (Actions)                  │
│  ┌─────────────────────────────┐   │
│  │ 1. [Show Notification ▼]    │   │
│  │    Title: [Shallow Water]   │   │
│  │    Message: [Depth < 5m]    │   │
│  │                             │   │
│  │ 2. [Show Camera ▼]          │   │
│  │    Camera: [Anchor Cam ▼]   │   │
│  │                             │   │
│  │ [+ Add Action]              │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Cancel]  [Save Automation]        │
└─────────────────────────────────────┘
```

### 4. SignalK Integration

SignalK serves as the central data hub for all marine data.

#### SignalK Paths Used

```
navigation.position                     // GPS position
navigation.courseOverGroundTrue         // COG from GPS
navigation.speedOverGround              // SOG from GPS
navigation.headingMagnetic              // Magnetic heading from compass
navigation.headingTrue                  // True heading (mag + variation)
navigation.attitude.roll                // Heel angle from IMU
navigation.attitude.pitch               // Pitch angle from IMU

environment.depth.belowTransducer       // Depth from sounder
environment.wind.speedApparent          // Apparent wind speed
environment.wind.angleApparent          // Apparent wind angle
environment.wind.speedTrue              // True wind speed (calculated)
environment.wind.angleTrue              // True wind angle (calculated)
environment.inside.engineRoom.temperature
environment.inside.cabin.temperature
environment.inside.batteryCompartment.temperature
environment.outside.temperature

electrical.batteries.house.voltage
electrical.batteries.house.current
electrical.batteries.house.temperature
electrical.batteries.house.capacity.stateOfCharge

propulsion.motor.state                  // running/stopped
propulsion.motor.temperature
propulsion.motor.controlMode            // manual/throttle setting

steering.autopilot.state                // (future integration)
steering.autopilot.target.headingMagnetic

notifications.*                         // SignalK notifications/alarms
```

#### Custom SignalK Plugin: CAN-to-SignalK

This plugin reads CAN frames from SocketCAN and publishes to SignalK paths:

```javascript
// Plugin structure
module.exports = function(app) {
  const plugin = {
    id: 'can-to-signalk',
    name: 'CAN Bus to SignalK Converter',

    start: function(options) {
      // Open SocketCAN connection
      const channel = can.createRawChannel('can0');

      // Listen for CAN frames
      channel.addListener('onMessage', (msg) => {
        const pgn = extractPGN(msg.id);
        const data = parseCANData(msg.data, pgn);

        // Publish to appropriate SignalK path
        const path = pgnToSignalKPath(pgn);
        app.handleMessage(plugin.id, {
          updates: [{
            values: [{
              path: path,
              value: data
            }]
          }]
        });
      });
    },

    stop: function() {
      // Close CAN channel
    }
  };

  return plugin;
};
```

#### CAN Protocol (PGN Definitions)

```typescript
// PGN to SignalK path mapping
const PGN_MAPPING = {
  127250: 'navigation.headingMagnetic',      // Vessel Heading
  129025: 'navigation.position',              // Position (GPS)
  129026: 'navigation.courseOverGroundTrue',  // COG & SOG
  128259: 'navigation.speedOverGround',       // Speed
  128267: 'environment.depth.belowTransducer', // Depth
  130310: 'environment.outside.temperature',   // Outside Temp
  130312: 'environment.inside.*.temperature',  // Inside Temp (varies)
  127508: 'electrical.batteries.*.voltage',    // Battery Status
  127489: 'propulsion.motor.state',            // Engine Parameters
  127257: 'navigation.attitude',               // Attitude (roll/pitch)
};
```

### 5. Camera Service

Manages camera streams and provides transcoding for browser compatibility.

#### Camera Configuration

```typescript
interface CameraConfig {
  id: string;
  name: string;
  location: string;
  rtspUrl: string;          // e.g., rtsp://192.168.3.21:554/stream
  username?: string;
  password?: string;
  resolution: string;       // e.g., '1920x1080'
  fps: number;
  enabled: boolean;
}
```

#### RTSP to HLS Transcoding

```typescript
/**
 * Transcode RTSP stream to HLS for browser playback
 */
function createHLSStream(camera: CameraConfig): string {
  const outputPath = `/tmp/hls/${camera.id}`;

  ffmpeg(camera.rtspUrl)
    .inputOptions([
      '-rtsp_transport tcp',
      '-use_wallclock_as_timestamps 1'
    ])
    .outputOptions([
      '-c:v copy',              // Copy video codec (no re-encode)
      '-c:a aac',               // Audio to AAC
      '-f hls',                 // HLS format
      '-hls_time 2',            // 2 second segments
      '-hls_list_size 5',       // Keep 5 segments in playlist
      '-hls_flags delete_segments' // Delete old segments
    ])
    .output(`${outputPath}/stream.m3u8`)
    .on('error', (err) => console.error('FFmpeg error:', err))
    .run();

  return `/api/cameras/${camera.id}/stream.m3u8`;
}
```

#### Camera API Endpoints

```
GET  /api/cameras              # List all cameras
GET  /api/cameras/:id          # Get camera details
GET  /api/cameras/:id/stream   # HLS stream (m3u8)
POST /api/cameras/:id/snapshot # Capture snapshot
PUT  /api/cameras/:id/ptz      # Pan/Tilt/Zoom (if supported)
```

### 6. Weather Service

Integrates with Windy API for weather forecasting.

#### Windy API Integration

```typescript
interface WindyForecast {
  location: GeoPosition;
  timestamp: Date;
  forecast: {
    time: Date;
    windSpeed: number;        // m/s
    windGust: number;         // m/s
    windDirection: number;    // degrees
    waveHeight: number;       // meters
    temperature: number;      // °C
    pressure: number;         // hPa
    precipitation: number;    // mm
  }[];
}

async function fetchWindyForecast(
  position: GeoPosition
): Promise<WindyForecast> {
  const response = await axios.get('https://api.windy.com/api/point-forecast/v2', {
    params: {
      lat: position.latitude,
      lon: position.longitude,
      model: 'gfs',
      parameters: 'wind,gust,waves,temp,pressure',
      key: process.env.WINDY_API_KEY
    }
  });

  return parseWindyResponse(response.data);
}
```

#### Weather Monitoring Automation

Continuously monitors weather and alerts on dangerous conditions:

```typescript
// Check weather every hour
cron.schedule('0 * * * *', async () => {
  const position = await getCurrentPosition();
  const forecast = await fetchWindyForecast(position);

  // Check next 6 hours
  const upcomingWeather = forecast.forecast.slice(0, 6);

  const dangerousConditions = upcomingWeather.some(f =>
    f.windSpeed > 12.5 ||  // 25 knots
    f.windGust > 15 ||     // 30 knots
    f.waveHeight > 2.5
  );

  if (dangerousConditions) {
    eventBus.publish({
      type: 'alarm',
      severity: 'warning',
      title: 'Weather Warning',
      message: `Strong winds expected: ${Math.max(...upcomingWeather.map(f => f.windGust * 1.944))}kt gusts`,
      source: 'weather_service',
      timestamp: new Date()
    });
  }
});
```

## API Specification

### REST API Endpoints

#### Boat State
```
GET    /api/state              # Get current boat state
POST   /api/state/override     # Manually override state
DELETE /api/state/override     # Cancel manual override
GET    /api/state/history      # Get state history
```

#### Sensors
```
GET    /api/sensors            # Get all current sensor values
GET    /api/sensors/:id        # Get specific sensor
GET    /api/sensors/:id/history # Get sensor history
```

#### Automations
```
GET    /api/automations        # List all automation rules
POST   /api/automations        # Create new rule
GET    /api/automations/:id    # Get rule details
PUT    /api/automations/:id    # Update rule
DELETE /api/automations/:id    # Delete rule
POST   /api/automations/:id/enable  # Enable rule
POST   /api/automations/:id/disable # Disable rule
```

#### Control
```
POST   /api/control/winch      # Control anchor winch
                               # Body: { command: 'up' | 'down' | 'stop' }
POST   /api/control/motor      # Control motor throttle
                               # Body: { throttle: 0-100 }
POST   /api/control/lights     # Control lights (future)
```

#### Cameras
```
GET    /api/cameras            # List cameras
GET    /api/cameras/:id/stream # HLS stream (m3u8 file)
POST   /api/cameras/:id/snapshot # Capture image
```

#### Weather
```
GET    /api/weather/current    # Current weather at boat position
GET    /api/weather/forecast   # Forecast (next 48 hours)
```

#### Maintenance
```
GET    /api/maintenance        # List maintenance tasks
POST   /api/maintenance        # Create maintenance task
PUT    /api/maintenance/:id    # Update task
DELETE /api/maintenance/:id    # Delete task
POST   /api/maintenance/:id/complete # Mark task complete
```

#### Logbook
```
GET    /api/logs               # List logbook entries
POST   /api/logs               # Create log entry
GET    /api/logs/:id           # Get log entry
PUT    /api/logs/:id           # Update log entry
DELETE /api/logs/:id           # Delete log entry
```

#### Devices
```
GET    /api/devices            # List registered display devices
POST   /api/devices/register   # Register new device
PUT    /api/devices/:id/profile # Assign display profile
```

### WebSocket Events

#### Client → Server

```typescript
// Subscribe to sensor updates
{
  type: 'subscribe',
  paths: ['navigation.position', 'environment.depth.*']
}

// Send control command
{
  type: 'control',
  device: 'winch',
  command: 'up'
}

// Request state change
{
  type: 'set_state',
  state: 'ANCHORED',
  manual: true
}
```

#### Server → Client

```typescript
// Sensor data update
{
  type: 'sensor_update',
  path: 'navigation.position',
  value: { latitude: 47.6062, longitude: -122.3321 },
  timestamp: '2025-11-17T10:30:00Z'
}

// State change notification
{
  type: 'state_change',
  previousState: 'DRIFTING',
  newState: 'ANCHORED',
  timestamp: '2025-11-17T10:30:00Z'
}

// Alarm/notification
{
  type: 'notification',
  severity: 'warning',
  title: 'Anchor Drag Alert',
  message: 'Boat has moved 15m from anchor position',
  timestamp: '2025-11-17T10:30:00Z'
}

// Automation triggered
{
  type: 'automation_triggered',
  ruleId: 'anchor-drop-automation',
  ruleName: 'Anchor Drop Automation',
  timestamp: '2025-11-17T10:30:00Z'
}
```

## Database Schema

### SQLite Schema

```sql
-- State history
CREATE TABLE state_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL,
  previous_state TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  manual_override BOOLEAN DEFAULT 0,
  gps_position TEXT,
  sensor_data TEXT
);

-- Automation rules
CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT 1,
  trigger_config TEXT NOT NULL,  -- JSON
  conditions TEXT,                -- JSON
  actions TEXT NOT NULL,          -- JSON
  debounce INTEGER,
  cooldown INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Automation execution log
CREATE TABLE automation_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  trigger_data TEXT,
  success BOOLEAN,
  error_message TEXT,
  FOREIGN KEY (rule_id) REFERENCES automation_rules(id)
);

-- Logbook entries
CREATE TABLE logbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  entry_type TEXT,  -- 'departure', 'arrival', 'note', 'weather', 'maintenance'
  title TEXT,
  content TEXT,
  gps_position TEXT,
  weather_data TEXT,
  attachments TEXT  -- JSON array of file paths
);

-- Maintenance tasks
CREATE TABLE maintenance_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,  -- 'engine', 'electrical', 'rigging', 'hull', etc.
  due_date DATE,
  due_hours INTEGER,  -- Engine hours
  completed_at DATETIME,
  completed_hours INTEGER,
  recurring BOOLEAN DEFAULT 0,
  recurrence_interval INTEGER,  -- Days or hours
  priority TEXT,  -- 'low', 'medium', 'high', 'critical'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Registered devices (displays)
CREATE TABLE devices (
  id TEXT PRIMARY KEY,  -- Unique device ID
  name TEXT,
  type TEXT,  -- 'helm_display', 'tablet', 'phone'
  profile TEXT,  -- Display profile/layout assignment
  last_seen DATETIME,
  ip_address TEXT,
  user_agent TEXT
);

-- Anchor positions (history)
CREATE TABLE anchor_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  position TEXT NOT NULL,  -- JSON: {lat, lon}
  depth REAL,
  chain_length REAL,  -- Meters
  alarm_radius REAL,  -- Meters
  raised_at DATETIME,
  notes TEXT
);

-- Sensor calibration data
CREATE TABLE sensor_calibrations (
  sensor_id TEXT PRIMARY KEY,
  calibration_data TEXT,  -- JSON calibration parameters
  calibrated_at DATETIME,
  notes TEXT
);
```

## UI/UX Specification

### Layout System

The UI uses a flexible layout system that adapts to:
1. Current boat state (automatic context-aware layouts)
2. Device type (phone, tablet, helm display)
3. User customization (drag-and-drop widgets)

#### State-Based Automatic Layouts

**ANCHORED View:**
```
┌─────────────────────────────────────┐
│ State: ⚓ ANCHORED    [Menu] [≡]    │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │   Anchor Camera Feed         │  │
│  │   (Large - 60% screen)       │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │Depth │ │Alarm │ │Wind  │       │
│  │ 8.2m │ │ OK ✓ │ │ 8kt  │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  GPS: 47.6062°N, 122.3321°W        │
│  Chain: 25m | Radius: 50m          │
│                                     │
│  [Raise Anchor] [Settings]         │
└─────────────────────────────────────┘
```

**SAILING View:**
```
┌─────────────────────────────────────┐
│ State: ⛵ SAILING     [Menu] [≡]    │
├─────────────────────────────────────┤
│  ┌─────────┐  ┌──────────────────┐ │
│  │  Wind   │  │  Weather Forecast │ │
│  │   ↗     │  │  Next 6h: 12-18kt│ │
│  │  12kt   │  │  Gusts to 22kt   │ │
│  │  AWA 45°│  └──────────────────┘ │
│  └─────────┘                        │
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ SOG  │ │ COG  │ │Heel  │       │
│  │ 5.2kt│ │ 240° │ │ 15°  │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Chart View (Small)          │  │
│  │  [Expand for full chart]     │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

**MOTORING View:**
```
┌─────────────────────────────────────┐
│ State: 🚤 MOTORING   [Menu] [≡]    │
├─────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │   Throttle Control           │  │
│  │   ═══════●═══════            │  │
│  │      60%                     │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐       │
│  │Motor │ │Batt  │ │Temp  │       │
│  │ ON   │ │12.6V │ │ 32°C │       │
│  └──────┘ └──────┘ └──────┘       │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Chart View                  │  │
│  │  [Show route]                │  │
│  └──────────────────────────────┘  │
│                                     │
│  SOG: 4.8kt | COG: 180°            │
└─────────────────────────────────────┘
```

#### Widget Library

Reusable widget components:

1. **Depth Gauge** - Circular gauge showing depth
2. **Speed Log** - Digital/analog speed display
3. **Wind Instrument** - Apparent/true wind with direction
4. **Compass** - Heading display (digital/compass rose)
5. **Heel Indicator** - Roll angle visualization
6. **Battery Status** - Voltage, current, percentage
7. **Temperature Display** - Multi-location temps
8. **Camera Feed** - Live video stream
9. **Weather Card** - Current + forecast
10. **GPS Position** - Lat/lon display
11. **Anchor Alarm** - Status and settings
12. **Chart View** - Navigation chart
13. **Throttle Control** - Motor control
14. **Winch Control** - Anchor winch

### Navigation Structure

```
Main Menu
├─ Dashboard (state-aware)
├─ Navigation
│  ├─ Chart
│  ├─ Waypoints
│  └─ Route Planning
├─ Instruments
│  ├─ Wind
│  ├─ Depth & Speed
│  ├─ GPS & Compass
│  └─ All Instruments
├─ Cameras
│  ├─ Camera Grid (all)
│  ├─ Anchor Camera
│  ├─ Cockpit Camera
│  └─ Stern Camera
├─ Electrical
│  ├─ Battery Status
│  ├─ Consumption Graph
│  └─ History
├─ Control
│  ├─ Anchor Winch
│  ├─ Motor Throttle
│  └─ Lights (future)
├─ Automation
│  ├─ Active Rules
│  ├─ Create New Rule
│  └─ Rule Templates
├─ Logs & Maintenance
│  ├─ Logbook
│  ├─ Maintenance Tasks
│  └─ System Logs
└─ Settings
   ├─ Layout Customization
   ├─ Device Settings
   ├─ Sensor Calibration
   ├─ Boat State Settings
   ├─ Camera Configuration
   └─ System Status
```

### Responsive Design

The UI adapts to different screen sizes:

**Large Displays (Helm, 7"+):**
- Multi-column layouts
- Large instruments
- Full chart view
- Camera grid view

**Tablets (7-10"):**
- Single column with large widgets
- Swipeable views
- Collapsible sections

**Phones (< 7"):**
- Stack layout
- Bottom navigation
- Essential info prioritized
- Full-screen modals

### Touch Optimization

- Minimum touch target: 44×44 px
- Large buttons for critical controls
- Swipe gestures for navigation
- Long-press for contextual menus
- Haptic feedback (if supported)

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Basic system running with mock data

1. Set up project structure (monorepo with server + client)
2. Initialize TypeScript configuration
3. Set up Express server with basic routing
4. Create database schema and migrations
5. Build React app with routing
6. Implement WebSocket connection
7. Create boat state machine (with mock sensor data)
8. Build state indicator component
9. Deploy to Pi 5, access from phone

**Deliverable:** Can view boat state on phone, manually change state

### Phase 2: SignalK & CAN Integration (Week 2-3)
**Goal:** Real sensor data flowing through system

1. Install and configure SignalK server
2. Set up CAN interface on Pi 5 (SocketCAN)
3. Build SignalK client service
4. Create CAN-to-SignalK plugin
5. Define CAN protocol (PGN mappings)
6. Test one ESP32 → CAN → SignalK → UI
7. Build basic instrument widgets (depth, speed, GPS)
8. Implement sensor data caching

**Deliverable:** Real sensor data displayed in UI

### Phase 3: State Detection (Week 3-4)
**Goal:** Automatic boat state detection working

1. Implement state detection algorithm
2. Connect state machine to real sensor data
3. Add state transition logging to database
4. Build state history view
5. Implement manual state override
6. Test state detection in various scenarios
7. Tune detection thresholds

**Deliverable:** System automatically detects anchoring, sailing, motoring

### Phase 4: Automation Engine (Week 4-5)
**Goal:** Event-driven automations working

1. Implement event bus system
2. Build automation engine (rule processor)
3. Create pre-built automations (anchor, sailing, etc.)
4. Store rules in database
5. Build automation list UI
6. Implement enable/disable for rules
7. Test anchor drop automation end-to-end

**Deliverable:** Anchor drop triggers camera + alarm automatically

### Phase 5: Camera System (Week 5)
**Goal:** Camera feeds working

1. Set up WiFi network for cameras
2. Configure camera RTSP streams
3. Build camera service with FFmpeg transcoding
4. Create camera feed component
5. Implement camera grid view
6. Add camera API endpoints
7. Test camera automation (anchor → camera)

**Deliverable:** Can view camera feeds in UI

### Phase 6: Navigation & Charts (Week 6)
**Goal:** Chart view with position tracking

1. Integrate Leaflet.js
2. Add OpenSeaMap tile layer
3. Display boat position on chart
4. Implement waypoint management
5. Add route display
6. Build full-screen chart view
7. Add chart to state-based layouts

**Deliverable:** Navigation chart showing real-time position

### Phase 7: Weather Integration (Week 6-7)
**Goal:** Weather forecasts and warnings

1. Sign up for Windy API key
2. Implement weather service
3. Build weather widget
4. Create weather forecast view
5. Implement weather monitoring automation
6. Add weather warnings to notifications
7. Integrate with heel angle monitoring

**Deliverable:** Weather forecasts displayed, warnings work

### Phase 8: Electrical Monitoring (Week 7-8)
**Goal:** Battery monitoring working

1. Deploy ESP32 with INA226 sensors
2. Send battery data via CAN
3. Build battery status widget
4. Create electrical history graphs
5. Implement low battery automation
6. Add battery data to motoring view

**Deliverable:** Real-time battery monitoring

### Phase 9: Control Systems (Week 8-9)
**Goal:** Control motor and winch

1. Build motor control ESP32 node
2. Implement throttle control API
3. Create throttle control widget
4. Build anchor winch control ESP32 node
5. Implement winch control API
6. Create winch control widget with safety
7. Test controls from phone

**Deliverable:** Can control motor and winch from UI

### Phase 10: Visual Rule Builder (Week 9-10)
**Goal:** Users can create custom automations

1. Design rule builder UI
2. Implement trigger configuration
3. Build condition builder
4. Create action selector
5. Add rule validation
6. Implement save/update rules
7. Test creating custom rules

**Deliverable:** Can create custom automations via UI

### Phase 11: Layout Customization (Week 10)
**Goal:** Customizable widget layouts

1. Integrate React Grid Layout
2. Implement widget picker
3. Build layout editor UI
4. Save/load custom layouts per device
5. Create layout presets
6. Test drag-and-drop customization

**Deliverable:** Can customize dashboard layout

### Phase 12: Maintenance & Logging (Week 11)
**Goal:** Logbook and maintenance tracking

1. Build maintenance task CRUD
2. Create maintenance list UI
3. Implement due date reminders
4. Build logbook entry system
5. Add automatic log entries (state changes)
6. Create maintenance dashboard
7. Implement data export

**Deliverable:** Can track maintenance and log entries

### Phase 13: Polish & Testing (Week 12+)
**Goal:** Production-ready system

1. Performance optimization
2. Error handling and retry logic
3. Offline support (service worker)
4. System monitoring dashboard
5. Comprehensive testing
6. Documentation
7. Backup/restore functionality
8. Sea trials and refinement

**Deliverable:** Reliable, polished system ready for daily use

## Configuration Files

### Environment Variables (.env)

```bash
# Server
NODE_ENV=production
PORT=3000
WS_PORT=3001

# Database
DATABASE_PATH=/var/boatos/data/boatos.db

# SignalK
SIGNALK_HOST=localhost
SIGNALK_PORT=3002
SIGNALK_USE_TLS=false

# CAN Bus
CAN_INTERFACE=can0

# Weather
WINDY_API_KEY=your_windy_api_key_here

# Cameras
CAMERA_STREAM_PATH=/var/boatos/streams

# Logging
LOG_LEVEL=info
LOG_FILE=/var/boatos/logs/boatos.log
```

### State Thresholds (state-thresholds.json)

```json
{
  "anchoredMaxSpeed": 0.5,
  "marinaMaxSpeed": 0.2,
  "motoringMinSpeed": 1.0,
  "sailingMinSpeed": 1.0,
  "stateTransitionDelay": 10,
  "marinaGeofences": [
    {
      "name": "Home Marina",
      "center": {"lat": 47.6062, "lon": -122.3321},
      "radius": 100
    }
  ],
  "anchorAlarmDefaults": {
    "chainScopeRatio": 5,
    "safetyMargin": 10
  }
}
```

### Camera Configuration (camera-config.json)

```json
{
  "cameras": [
    {
      "id": "anchor-camera",
      "name": "Anchor Camera",
      "location": "Bow",
      "rtspUrl": "rtsp://192.168.3.21:554/stream",
      "username": "admin",
      "password": "camera123",
      "resolution": "1920x1080",
      "fps": 15,
      "enabled": true
    },
    {
      "id": "cockpit-camera",
      "name": "Cockpit Camera",
      "location": "Helm",
      "rtspUrl": "rtsp://192.168.3.22:554/stream",
      "username": "admin",
      "password": "camera123",
      "resolution": "1920x1080",
      "fps": 15,
      "enabled": true
    }
  ]
}
```

## Deployment

### Installation Script (setup-pi.sh)

```bash
#!/bin/bash
# Boat OS Installation Script for Raspberry Pi 5

echo "Installing Boat OS..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install dependencies
sudo apt install -y git sqlite3 can-utils ffmpeg

# Set up CAN interface
sudo ip link set can0 type can bitrate 250000
sudo ip link set up can0
# Make CAN interface persistent (add to /etc/network/interfaces)

# Install SignalK
sudo npm install -g --unsafe-perm signalk-server

# Clone Boat OS repository
cd /home/pi
git clone https://github.com/yourusername/boat-os.git
cd boat-os

# Install dependencies
npm install

# Build client
cd client && npm run build && cd ..

# Set up systemd services
sudo cp scripts/boatos.service /etc/systemd/system/
sudo systemctl enable boatos
sudo systemctl start boatos

echo "Boat OS installed! Access at http://localhost:3000"
```

### Systemd Service (boatos.service)

```ini
[Unit]
Description=Boat OS Server
After=network.target signalk.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/boat-os/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Development Setup

### Prerequisites
- Node.js 20+ LTS
- npm or yarn
- SQLite3
- Git

### Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/boat-os.git
cd boat-os

# Install dependencies
npm install

# Set up environment
cp server/.env.example server/.env
# Edit .env with your configuration

# Run database migrations
cd server && npm run migrate && cd ..

# Start development servers
npm run dev

# This starts:
# - Server on http://localhost:3000 (with hot reload)
# - Client on http://localhost:5173 (Vite dev server)
# - WebSocket on ws://localhost:3001
```

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Security Considerations

1. **Authentication:** Implement basic auth or token-based auth for production
2. **HTTPS:** Use HTTPS for production (Let's Encrypt certificate)
3. **Input Validation:** Validate all user inputs
4. **Rate Limiting:** Limit API requests to prevent abuse
5. **Camera Access:** Secure camera credentials
6. **Control Commands:** Implement confirmation for critical actions (winch, motor)
7. **Network Isolation:** Keep boat network isolated from internet

## Future Enhancements

1. **AIS Integration:** Show nearby vessels on chart
2. **Radar Integration:** Display radar overlay
3. **Autopilot Integration:** Control autopilot via NMEA
4. **Voice Control:** Alexa/Google Assistant integration
5. **Remote Access:** Secure remote monitoring via VPN
6. **Data Analytics:** Long-term performance analytics
7. **Mobile App:** Native iOS/Android apps
8. **Multi-Boat Support:** Manage multiple boats
9. **Cloud Sync:** Backup data to cloud
10. **AI Suggestions:** Machine learning for route optimization

---

**Document Version:** 1.0
**Last Updated:** 2025-11-17
**Ready for Implementation:** Yes

This specification provides everything needed to begin implementing the Boat OS software on the Raspberry Pi 5. Start with Phase 1 and build incrementally.
