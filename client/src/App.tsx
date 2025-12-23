import { useState, useEffect } from 'react';
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
  const { addDepthReading, setCurrentDepth } = useSettings();

  useEffect(() => {
    wsService.connect();

    wsService.on('sensor_update', (data: any) => {
      if (data.data) {
        setSensorData(data.data);
        // Update depth readings in settings context
        if (data.data.environment?.depth?.belowTransducer !== undefined) {
          addDepthReading(data.data.environment.depth.belowTransducer);
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

    fetchInitialData();

    return () => {
      wsService.disconnect();
    };
  }, [addDepthReading]);

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
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'wind') {
    return (
      <>
        <WindView sensorData={sensorData} onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'depth') {
    return (
      <>
        <DepthView depth={sensorData.environment.depth.belowTransducer} onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'settings') {
    return (
      <>
        <SettingsView onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'speed') {
    return (
      <>
        <SpeedView speed={sensorData.navigation.speedOverGround} onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'heading') {
    return (
      <>
        <HeadingView heading={sensorData.navigation.headingMagnetic} onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'cog') {
    return (
      <>
        <COGView cog={sensorData.navigation.courseOverGround} onClose={handleBack} />
        {connectionStatus === 'disconnected' && <DisconnectionWarning />}
      </>
    );
  }

  if (activeView === 'position') {
    return (
      <>
        <PositionView position={sensorData.navigation.position} onClose={handleBack} />
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
      {connectionStatus === 'disconnected' && <DisconnectionWarning />}
    </div>
  );
}

// Main App component with SettingsProvider
function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

export default App;
