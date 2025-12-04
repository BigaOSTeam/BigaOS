import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { wsService } from '../services/websocket';

export type SpeedUnit = 'kt' | 'km/h' | 'mph' | 'm/s';
export type DepthUnit = 'm' | 'ft';
export type DistanceUnit = 'nm' | 'km' | 'mi';

export const speedConversions: Record<SpeedUnit, { factor: number; label: string }> = {
  'kt': { factor: 1, label: 'kt' },
  'km/h': { factor: 1.852, label: 'km/h' },
  'mph': { factor: 1.15078, label: 'mph' },
  'm/s': { factor: 0.514444, label: 'm/s' }
};

export const depthConversions: Record<DepthUnit, { factor: number; label: string }> = {
  'm': { factor: 1, label: 'm' },
  'ft': { factor: 3.28084, label: 'ft' }
};

export const distanceConversions: Record<DistanceUnit, { factor: number; label: string }> = {
  'nm': { factor: 1, label: 'nm' },
  'km': { factor: 1.852, label: 'km' },
  'mi': { factor: 1.15078, label: 'mi' }
};

export interface DepthHistoryPoint {
  timestamp: number;
  depth: number; // Always stored in meters
}

interface SettingsContextType {
  // Units
  speedUnit: SpeedUnit;
  depthUnit: DepthUnit;
  distanceUnit: DistanceUnit;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setDepthUnit: (unit: DepthUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;

  // Depth alarm
  depthAlarm: number | null; // Stored in current unit
  depthAlarmMeters: number | null; // Computed in meters
  setDepthAlarm: (depth: number | null) => void;
  soundAlarmEnabled: boolean;
  setSoundAlarmEnabled: (enabled: boolean) => void;
  isDepthAlarmTriggered: boolean;

  // Depth history (local only - not synced)
  depthHistory: DepthHistoryPoint[];
  addDepthReading: (depth: number) => void;

  // Conversion helpers
  convertSpeed: (speedInKnots: number) => number;
  convertDepth: (depthInMeters: number) => number;
  convertDistance: (distanceInNm: number) => number;

  // Current depth for alarm checking
  currentDepth: number;
  setCurrentDepth: (depth: number) => void;

  // Sync status
  isSynced: boolean;
}

const DEPTH_HISTORY_MAX_POINTS = 300; // 5 minutes at 1 reading/second
const DEPTH_HISTORY_INTERVAL = 1000; // 1 second between readings

const defaultSettings = {
  speedUnit: 'kt' as SpeedUnit,
  depthUnit: 'm' as DepthUnit,
  distanceUnit: 'nm' as DistanceUnit,
  depthAlarm: null as number | null,
  soundAlarmEnabled: false,
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>(defaultSettings.speedUnit);
  const [depthUnit, setDepthUnitState] = useState<DepthUnit>(defaultSettings.depthUnit);
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>(defaultSettings.distanceUnit);
  const [depthAlarm, setDepthAlarmState] = useState<number | null>(defaultSettings.depthAlarm);
  const [soundAlarmEnabled, setSoundAlarmEnabledState] = useState<boolean>(defaultSettings.soundAlarmEnabled);
  const [depthHistory, setDepthHistory] = useState<DepthHistoryPoint[]>([]);
  const [currentDepth, setCurrentDepth] = useState<number>(10);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const lastDepthReadingTime = useRef<number>(0);
  const isApplyingServerSettings = useRef<boolean>(false);

  // Listen for settings from server
  useEffect(() => {
    // Initial settings sync from server
    const handleSettingsSync = (data: { settings: Record<string, any> }) => {
      console.log('Received settings sync:', data.settings);
      isApplyingServerSettings.current = true;

      if (data.settings.speedUnit) {
        setSpeedUnitState(data.settings.speedUnit);
      }
      if (data.settings.depthUnit) {
        setDepthUnitState(data.settings.depthUnit);
      }
      if (data.settings.distanceUnit) {
        setDistanceUnitState(data.settings.distanceUnit);
      }
      if (data.settings.depthAlarm !== undefined) {
        setDepthAlarmState(data.settings.depthAlarm);
      }
      if (data.settings.soundAlarmEnabled !== undefined) {
        setSoundAlarmEnabledState(data.settings.soundAlarmEnabled);
      }

      isApplyingServerSettings.current = false;
      setIsSynced(true);
    };

    // Individual setting changed (from another device)
    const handleSettingsChanged = (data: { key: string; value: any }) => {
      console.log('Received settings change:', data.key, data.value);
      isApplyingServerSettings.current = true;

      switch (data.key) {
        case 'speedUnit':
          setSpeedUnitState(data.value);
          break;
        case 'depthUnit':
          setDepthUnitState(data.value);
          break;
        case 'distanceUnit':
          setDistanceUnitState(data.value);
          break;
        case 'depthAlarm':
          setDepthAlarmState(data.value);
          break;
        case 'soundAlarmEnabled':
          setSoundAlarmEnabledState(data.value);
          break;
      }

      isApplyingServerSettings.current = false;
    };

    wsService.on('settings_sync', handleSettingsSync);
    wsService.on('settings_changed', handleSettingsChanged);

    // Request settings on mount
    wsService.emit('get_settings', {});

    return () => {
      wsService.off('settings_sync', handleSettingsSync);
      wsService.off('settings_changed', handleSettingsChanged);
    };
  }, []);

  // Helper to send setting update to server
  const updateServerSetting = useCallback((key: string, value: any) => {
    if (!isApplyingServerSettings.current) {
      wsService.emit('settings_update', { key, value });
    }
  }, []);

  // Setters that sync to server
  const setSpeedUnit = useCallback((unit: SpeedUnit) => {
    setSpeedUnitState(unit);
    updateServerSetting('speedUnit', unit);
  }, [updateServerSetting]);

  const setDepthUnit = useCallback((unit: DepthUnit) => {
    setDepthUnitState(unit);
    updateServerSetting('depthUnit', unit);
    // Reset depth alarm when unit changes to avoid confusion
    setDepthAlarmState(null);
    updateServerSetting('depthAlarm', null);
  }, [updateServerSetting]);

  const setDistanceUnit = useCallback((unit: DistanceUnit) => {
    setDistanceUnitState(unit);
    updateServerSetting('distanceUnit', unit);
  }, [updateServerSetting]);

  const setDepthAlarm = useCallback((depth: number | null) => {
    setDepthAlarmState(depth);
    updateServerSetting('depthAlarm', depth);
  }, [updateServerSetting]);

  const setSoundAlarmEnabled = useCallback((enabled: boolean) => {
    setSoundAlarmEnabledState(enabled);
    updateServerSetting('soundAlarmEnabled', enabled);
  }, [updateServerSetting]);

  // Convert alarm threshold to meters
  const depthAlarmMeters = depthAlarm !== null
    ? (depthUnit === 'ft' ? depthAlarm / depthConversions.ft.factor : depthAlarm)
    : null;

  // Check if alarm is triggered
  const isDepthAlarmTriggered = depthAlarmMeters !== null && currentDepth < depthAlarmMeters;

  // Add depth reading to history (local only)
  const addDepthReading = useCallback((depth: number) => {
    const now = Date.now();
    if (now - lastDepthReadingTime.current >= DEPTH_HISTORY_INTERVAL) {
      lastDepthReadingTime.current = now;
      setDepthHistory(prev => {
        const newHistory = [...prev, { timestamp: now, depth }];
        if (newHistory.length > DEPTH_HISTORY_MAX_POINTS) {
          return newHistory.slice(-DEPTH_HISTORY_MAX_POINTS);
        }
        return newHistory;
      });
    }
    setCurrentDepth(depth);
  }, []);

  // Conversion helpers
  const convertSpeed = useCallback((speedInKnots: number) => {
    return speedInKnots * speedConversions[speedUnit].factor;
  }, [speedUnit]);

  const convertDepth = useCallback((depthInMeters: number) => {
    return depthInMeters * depthConversions[depthUnit].factor;
  }, [depthUnit]);

  const convertDistance = useCallback((distanceInNm: number) => {
    return distanceInNm * distanceConversions[distanceUnit].factor;
  }, [distanceUnit]);

  const value: SettingsContextType = {
    speedUnit,
    depthUnit,
    distanceUnit,
    setSpeedUnit,
    setDepthUnit,
    setDistanceUnit,
    depthAlarm,
    depthAlarmMeters,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    depthHistory,
    addDepthReading,
    convertSpeed,
    convertDepth,
    convertDistance,
    currentDepth,
    setCurrentDepth,
    isSynced,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
