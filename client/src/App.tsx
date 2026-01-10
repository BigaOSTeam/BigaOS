import { useState, useEffect, useCallback, useRef } from 'react';
import { SensorData } from './types';
import { ViewType } from './types/dashboard';
import { Dashboard } from './components/dashboard';
import { MapPage } from './components/navigation/MapPage';
import { WindView } from './components/views/WindView';
import { DepthView } from './components/views/DepthView';
import { SettingsView } from './components/views/SettingsView';
import { SpeedView } from './components/views/SpeedView';
import { HeadingView } from './components/views/HeadingView';
import { COGView } from './components/views/COGView';
import { PositionView } from './components/views/PositionView';
import { BatteryView } from './components/views/BatteryView';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { wsService } from './services/websocket';
import { sensorAPI } from './services/api';
import './styles/globals.css';

type ActiveView = 'dashboard' | ViewType;

// Inner app component that uses settings context
function AppContent() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [, forceUpdate] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const wasOfflineRef = useRef<boolean | null>(null);
  const { setCurrentDepth } = useSettings();
  const repaintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Force a repaint periodically to recover from rendering freezes
  const forceRepaint = useCallback(() => {
    // Trigger a minimal re-render
    forceUpdate(n => n + 1);

    // Also force browser repaint by toggling a style
    const root = document.getElementById('root');
    if (root) {
      root.style.transform = 'translateZ(1px)';
      requestAnimationFrame(() => {
        root.style.transform = 'translateZ(0)';
      });
    }
  }, []);

  // Set up periodic repaint check (every 3 seconds)
  useEffect(() => {
    repaintIntervalRef.current = setInterval(forceRepaint, 3000);
    return () => {
      if (repaintIntervalRef.current) {
        clearInterval(repaintIntervalRef.current);
      }
    };
  }, [forceRepaint]);

  useEffect(() => {
    wsService.connect();

    wsService.on('sensor_update', (data: any) => {
      if (data.data) {
        setSensorData(data.data);
        // Update current depth for alarm checking
        if (data.data.environment?.depth?.belowTransducer !== undefined) {
          setCurrentDepth(data.data.environment.depth.belowTransducer);
        }
      }
      setConnectionStatus('connected');
    });

    wsService.on('connect', () => {
      setConnectionStatus('connected');
    });

    wsService.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    // Listen for connectivity changes from server
    wsService.on('connectivity_change', (data: { online: boolean }) => {
      const isOnline = data.online;

      // Detect transition from offline to online
      if (wasOfflineRef.current === true && isOnline) {
        // Show "ONLINE" banner briefly
        setShowOnlineBanner(true);
        setTimeout(() => setShowOnlineBanner(false), 3000);
      }

      wasOfflineRef.current = !isOnline;
      setIsOfflineMode(!isOnline);
    });

    fetchInitialData();

    return () => {
      wsService.disconnect();
    };
  }, [setCurrentDepth]);

  const fetchInitialData = async () => {
    try {
      const sensorResponse = await sensorAPI.getAllSensors();
      setSensorData(sensorResponse.data);
      // Update depth in settings context
      if (sensorResponse.data.environment?.depth?.belowTransducer !== undefined) {
        setCurrentDepth(sensorResponse.data.environment.depth.belowTransducer);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      setLoading(false);
    }
  };

  const handleNavigate = (view: ViewType) => {
    setActiveView(view);
  };

  const handleBack = () => {
    setActiveView('dashboard');
  };

  if (loading || !sensorData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0a1929',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: '1.5rem' }}>Loading...</div>
      </div>
    );
  }

  // Demo mode indicator
  const DemoModeBanner = () => {
    const { demoMode } = useSettings();
    if (!demoMode) return null;
    return (
      <div style={{
        position: 'fixed',
        top: '4px',
        right: '4px',
        background: 'rgba(245, 158, 11, 0.85)',
        color: '#000',
        padding: '2px 6px',
        fontSize: '9px',
        fontWeight: 600,
        zIndex: 10000,
        borderRadius: '3px',
        opacity: 0.8,
      }}>
        DEMO
      </div>
    );
  };

  // Connectivity status indicator (offline/online)
  const ConnectivityBanner = () => {
    // Show green "ONLINE" banner briefly when coming back online
    if (showOnlineBanner) {
      return (
        <div style={{
          position: 'fixed',
          top: '4px',
          right: '50px',
          background: 'rgba(34, 197, 94, 0.9)',
          color: '#fff',
          padding: '2px 6px',
          fontSize: '9px',
          fontWeight: 600,
          zIndex: 10000,
          borderRadius: '3px',
          animation: 'fadeOut 3s ease-in-out forwards',
        }}>
          ONLINE
          <style>
            {`
              @keyframes fadeOut {
                0% { opacity: 1; }
                70% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}
          </style>
        </div>
      );
    }

    // Show red "OFFLINE" banner when offline
    if (isOfflineMode) {
      return (
        <div style={{
          position: 'fixed',
          top: '4px',
          right: '50px',
          background: 'rgba(239, 68, 68, 0.85)',
          color: '#fff',
          padding: '2px 6px',
          fontSize: '9px',
          fontWeight: 600,
          zIndex: 10000,
          borderRadius: '3px',
          opacity: 0.8,
        }}>
          OFFLINE
        </div>
      );
    }

    return null;
  };

  // Disconnection warning overlay
  const DisconnectionWarning = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        fontSize: '4rem',
        marginBottom: '1rem',
        animation: 'pulse 1.5s infinite',
      }}>
        ⚠️
      </div>
      <div style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        color: '#ef5350',
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
      }}>
        Connection Lost
      </div>
      <div style={{
        fontSize: '1rem',
        color: '#999',
        marginTop: '1rem',
      }}>
        Attempting to reconnect...
      </div>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
          }
        `}
      </style>
    </div>
  );

  // Render full-screen views
  if (activeView === 'chart') {
    return (
      <>
        <MapPage onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'wind') {
    return (
      <>
        <WindView sensorData={sensorData} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'depth') {
    return (
      <>
        <DepthView depth={sensorData.environment.depth.belowTransducer} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'settings') {
    return (
      <>
        <SettingsView onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'speed') {
    return (
      <>
        <SpeedView speed={sensorData.navigation.speedOverGround} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'heading') {
    return (
      <>
        <HeadingView heading={sensorData.navigation.headingMagnetic} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'cog') {
    return (
      <>
        <COGView cog={sensorData.navigation.courseOverGround} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'position') {
    return (
      <>
        <PositionView position={sensorData.navigation.position} onClose={handleBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'battery') {
    return (
      <>
        <BatteryView
          voltage={sensorData.electrical.battery.voltage}
          current={sensorData.electrical.battery.current}
          temperature={sensorData.electrical.battery.temperature}
          stateOfCharge={sensorData.electrical.battery.stateOfCharge}
          onClose={handleBack}
        />
        <DemoModeBanner />
        <ConnectivityBanner />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  // Default: Dashboard view
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0a1929',
      color: '#e0e0e0',
      overflow: 'hidden',
    }}>
      <Dashboard sensorData={sensorData} onNavigate={handleNavigate} />
      <DemoModeBanner />
      <ConnectivityBanner />
      {connectionStatus === 'disconnected' && <DisconnectionWarning />}
    </div>
  );
}

// Main App component with providers
function App() {
  return (
    <SettingsProvider>
      <ConfirmDialogProvider>
        <AppContent />
      </ConfirmDialogProvider>
    </SettingsProvider>
  );
}

export default App;
