import React, { useState, useEffect } from 'react';
import { BoatState, SensorData, BoatStateData } from './types';
import { StateIndicator } from './components/layout/StateIndicator';
import { DashboardView } from './components/views/DashboardView';
import { MapPage } from './components/navigation/MapPage';
import { wsService } from './services/websocket';
import { sensorAPI, stateAPI } from './services/api';
import './styles/globals.css';

type ViewMode = 'dashboard' | 'map';

function App() {
  const [boatState, setBoatState] = useState<BoatState>(BoatState.DRIFTING);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

  useEffect(() => {
    // Connect WebSocket
    wsService.connect();

    // Listen for sensor updates
    wsService.on('sensor_update', (data: any) => {
      if (data.data) {
        setSensorData(data.data);
      }
      setConnectionStatus('connected');
    });

    // Listen for state changes
    wsService.on('state_change', (data: any) => {
      if (data.currentState) {
        setBoatState(data.currentState);
      }
    });

    wsService.on('connect', () => {
      setConnectionStatus('connected');
    });

    wsService.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    // Initial data fetch
    fetchInitialData();

    return () => {
      wsService.disconnect();
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const [stateResponse, sensorResponse] = await Promise.all([
        stateAPI.getCurrentState(),
        sensorAPI.getAllSensors()
      ]);

      setBoatState(stateResponse.data.currentState);
      setSensorData(sensorResponse.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      setLoading(false);
    }
  };

  const handleStateChange = async (newState: BoatState) => {
    try {
      await stateAPI.overrideState(newState, 'Manual override from UI');
      setBoatState(newState);
    } catch (error) {
      console.error('Failed to change state:', error);
    }
  };

  if (loading || !sensorData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '1.5rem'
      }}>
        Loading Boat OS...
      </div>
    );
  }

  // Show map view
  if (viewMode === 'map') {
    return <MapPage onClose={() => setViewMode('dashboard')} />;
  }

  // Show dashboard view
  return (
    <div style={{ minHeight: '100vh', padding: '1rem' }}>
      <div className="container">
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            🚤 Boat OS
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Map Button */}
            <button
              onClick={() => setViewMode('map')}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              🗺️ Chart
            </button>

            {/* Connection Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: connectionStatus === 'connected' ? 'rgba(102, 187, 106, 0.2)' : 'rgba(239, 83, 80, 0.2)',
              borderRadius: '8px',
              fontSize: '0.875rem'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: connectionStatus === 'connected' ? '#66bb6a' : '#ef5350'
              }} />
              {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>

        {/* State Indicator */}
        <StateIndicator state={boatState} onStateChange={handleStateChange} />

        {/* Dashboard */}
        <DashboardView state={boatState} sensorData={sensorData} />

        {/* System Info */}
        <div className="card" style={{ marginTop: '1.5rem', opacity: 0.6, fontSize: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <strong>Position:</strong> {sensorData.navigation.position.latitude.toFixed(4)}°,{' '}
              {sensorData.navigation.position.longitude.toFixed(4)}°
            </div>
            <div>
              <strong>COG:</strong> {sensorData.navigation.courseOverGround.toFixed(0)}°
            </div>
            <div>
              <strong>SOG:</strong> {sensorData.navigation.speedOverGround.toFixed(1)} kt
            </div>
            <div>
              <strong>System:</strong> All sensors operational
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
