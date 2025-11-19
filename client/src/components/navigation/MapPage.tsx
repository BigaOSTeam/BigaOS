import React, { useState, useEffect } from 'react';
import { ChartView } from './ChartView';
import { SensorData } from '../../types';
import { wsService } from '../../services/websocket';
import { sensorAPI } from '../../services/api';

interface MapPageProps {
  onClose?: () => void;
}

export const MapPage: React.FC<MapPageProps> = ({ onClose }) => {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);

  useEffect(() => {
    // Fetch initial data
    const fetchData = async () => {
      try {
        const response = await sensorAPI.getAllSensors();
        setSensorData(response.data);
      } catch (error) {
        console.error('Failed to fetch sensor data:', error);
      }
    };

    fetchData();

    // Listen for sensor updates via WebSocket
    const handleSensorUpdate = (data: any) => {
      if (data.data) {
        setSensorData(data.data);
      }
    };

    wsService.on('sensor_update', handleSensorUpdate);

    return () => {
      wsService.off('sensor_update', handleSensorUpdate);
    };
  }, []);

  if (!sensorData) {
    return (
      <div style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0a1929'
      }}>
        <div style={{ fontSize: '1.5rem' }}>Loading map...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#0a1929' }}>
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: 'rgba(10, 25, 41, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🗺️ Navigation Chart</h1>
          <div style={{
            padding: '0.375rem 0.75rem',
            background: 'rgba(79, 195, 247, 0.2)',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#4fc3f7'
          }}>
            OpenSeaMap
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem' }}
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Map */}
      <div style={{
        position: 'absolute',
        top: '60px',
        left: 0,
        right: 0,
        bottom: 0
      }}>
        <ChartView
          position={sensorData.navigation.position}
          heading={sensorData.navigation.headingMagnetic}
          speed={sensorData.navigation.speedOverGround}
          depth={sensorData.environment.depth.belowTransducer}
        />
      </div>
    </div>
  );
};
