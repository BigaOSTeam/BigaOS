import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChartView } from './ChartView';
import { SensorData, GeoPosition } from '../../types';
import { wsService } from '../../services/websocket';
import { sensorAPI, navigationAPI } from '../../services/api';
import { usePlugins } from '../../context/PluginContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { degToRad, TWO_PI } from '../../utils/angle';

interface MapPageProps {
  onClose?: () => void;
  onOpenSettings?: () => void;
}

export const MapPage: React.FC<MapPageProps> = ({ onClose, onOpenSettings }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const { isDemoActive: demoMode } = usePlugins();

  // Dummy drive mode state - controlled position when in demo mode
  const [dummyLat, setDummyLat] = useState(43.45); // Default: Adriatic Sea, west of Split
  const [dummyLon, setDummyLon] = useState(16.20); // In the water, off Croatian coast
  const [dummyHeading, setDummyHeading] = useState(0);
  const [dummySpeed, setDummySpeed] = useState(0); // in knots
  const [demoValuesLoaded, setDemoValuesLoaded] = useState(false); // Flag to prevent overwriting server values
  const keysPressed = useRef<Set<string>>(new Set());
  const lastUpdateRef = useRef<number>(Date.now());

  // Fetch sensor data on mount
  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        const response = await sensorAPI.getAllSensors();
        setSensorData(response.data);
      } catch (error) {
        console.error('Failed to fetch sensor data:', error);
      }
    };

    fetchSensorData();

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

  // Fetch demo navigation values from server on mount (when in demo mode)
  useEffect(() => {
    if (!demoMode) return;

    const fetchDemoNavigation = async () => {
      try {
        const demoResponse = await navigationAPI.getDemoNavigation();
        if (demoResponse.data.navigation) {
          setDummyLat(demoResponse.data.navigation.latitude);
          setDummyLon(demoResponse.data.navigation.longitude);
          setDummyHeading(demoResponse.data.navigation.heading);
          setDummySpeed(demoResponse.data.navigation.speed);
        }
      } catch (error) {
        console.error('Failed to fetch demo navigation:', error);
      } finally {
        // Mark that initial values are loaded, now safe to sync back to server
        setDemoValuesLoaded(true);
      }
    };

    fetchDemoNavigation();
  }, [demoMode]);

  // Handle keyboard input for demo mode navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!demoMode) return;

    // Don't capture keys when user is typing in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    keysPressed.current.add(e.key.toLowerCase());
    isDrivingRef.current = true;

    // Speed control with W/S keys
    if (e.key.toLowerCase() === 'w') {
      e.preventDefault();
      setDummySpeed(prev => Math.min(prev + 1, 30)); // Max 30 knots
    }
    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      setDummySpeed(prev => Math.max(prev - 1, 0)); // Min 0 knots
    }
  }, [demoMode]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysPressed.current.delete(e.key.toLowerCase());
  }, []);

  // Heading control with WASD (continuous while key is held)
  useEffect(() => {
    if (!demoMode) return;

    const interval = setInterval(() => {
      const keys = keysPressed.current;
      const turnRate = degToRad(3); // 3 degrees per tick in radians

      if (keys.has('a')) {
        setDummyHeading(prev => (prev - turnRate + TWO_PI) % TWO_PI);
      }
      if (keys.has('d')) {
        setDummyHeading(prev => (prev + turnRate) % TWO_PI);
      }
    }, 50); // 20 times per second

    return () => clearInterval(interval);
  }, [demoMode]);

  // Update position based on speed and heading (local calculation)
  useEffect(() => {
    if (!demoMode) return;

    // If speed is 0, still need to run the interval to send updates to server
    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateRef.current) / 1000; // seconds
      lastUpdateRef.current = now;

      if (dummySpeed > 0) {
        // Convert speed from knots to degrees per second
        // 1 knot = 1.852 km/h = 0.0005144 km/s
        // At equator, 1 degree of lat ≈ 111 km
        // So 1 knot ≈ 0.0005144 / 111 ≈ 0.00000463 degrees/second
        const speedInDegreesPerSecond = dummySpeed * 0.00000463;

        // Calculate movement (heading is already in radians)
        const deltaLat = Math.cos(dummyHeading) * speedInDegreesPerSecond * deltaTime;
        const deltaLon = Math.sin(dummyHeading) * speedInDegreesPerSecond * deltaTime / Math.cos((dummyLat * Math.PI) / 180);

        setDummyLat(prev => prev + deltaLat);
        setDummyLon(prev => prev + deltaLon);
      }
    }, 100); // Update position 10 times per second

    return () => clearInterval(interval);
  }, [demoMode, dummySpeed, dummyHeading, dummyLat]);

  // Sync demo values to server via WebSocket (throttled)
  const lastServerUpdateRef = useRef<number>(0);
  const isDrivingRef = useRef<boolean>(false);
  useEffect(() => {
    if (!demoMode) return;
    // Don't sync until we've loaded initial values from server
    if (!demoValuesLoaded) return;
    // Only sync if this client is actively driving
    if (!isDrivingRef.current) return;

    const now = Date.now();
    // Throttle server updates to max 5 times per second
    if (now - lastServerUpdateRef.current < 200) return;
    lastServerUpdateRef.current = now;

    // Send via WebSocket control command (server broadcasts to all clients)
    wsService.emit('control', {
      type: 'demo_navigation',
      latitude: dummyLat,
      longitude: dummyLon,
      heading: dummyHeading,
      speed: dummySpeed,
    });
  }, [demoMode, dummyLat, dummyLon, dummyHeading, dummySpeed, demoValuesLoaded]);

  // Listen for demo navigation sync from other clients
  useEffect(() => {
    if (!demoMode) return;

    const handleDemoNavSync = (data: { latitude: number; longitude: number; heading: number; speed: number }) => {
      // Only apply if this client is not actively driving
      if (isDrivingRef.current) return;
      setDummyLat(data.latitude);
      setDummyLon(data.longitude);
      setDummyHeading(data.heading);
      setDummySpeed(data.speed);
    };

    wsService.on('demo_navigation_sync', handleDemoNavSync);
    return () => {
      wsService.off('demo_navigation_sync', handleDemoNavSync);
    };
  }, [demoMode]);

  // Add/remove keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Wait for sensor data and (if in demo mode) for demo values to load from server
  if (!sensorData || (demoMode && !demoValuesLoaded)) {
    return (
      <div style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: theme.colors.bgPrimary
      }}>
        <div style={{ fontSize: '1.5rem' }}>{t('chart.loading_map')}</div>
      </div>
    );
  }

  // Build demo position as GeoPosition type
  const demoPosition: GeoPosition = {
    latitude: dummyLat,
    longitude: dummyLon,
    timestamp: new Date(),
  };

  // Use demo values when in demo mode, otherwise use real sensor data
  const position = demoMode ? demoPosition : sensorData.navigation.position;
  const heading = demoMode ? dummyHeading : sensorData.navigation.heading;
  const speed = demoMode ? dummySpeed : sensorData.navigation.speedOverGround;

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: theme.colors.bgPrimary }}>
      {/* Full screen map */}
      <ChartView
        position={position}
        heading={heading}
        speed={speed}
        depth={sensorData.environment.depth.belowTransducer}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />

      {/* Demo mode controls hint */}
      {demoMode && (
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.7)',
          color: '#fff',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          zIndex: 1000,
          whiteSpace: 'nowrap',
        }}>
          {t('chart.navigate', { speed: dummySpeed })}
        </div>
      )}
    </div>
  );
};
