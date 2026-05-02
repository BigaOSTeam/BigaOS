/**
 * TankContext — client-side tank list + calibration state.
 *
 * Server is the source of truth. We just mirror the tank list via
 * `tanks_sync` and surface CRUD calls over WebSocket.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { TankConfig, TankReading } from '../types/tanks';

interface TankContextType {
  tanks: TankConfig[];
  /** Latest readings keyed by tank id, sourced from sensor_update broadcasts. */
  readings: Record<string, TankReading>;
  saveTank: (tank: TankConfig) => void;
  deleteTank: (tankId: string) => void;
  captureCalibrationPoint: (tankId: string, liters: number) => void;
  clearCalibration: (tankId: string) => void;
  /**
   * Most recent capture acknowledgement from the server.
   * Wizard subscribers listen for this to know the captured rawVolts.
   */
  lastCapture: { tankId: string; rawVolts: number | null; tank: TankConfig | null } | null;
}

const TankContext = createContext<TankContextType | null>(null);

export const TankProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tanks, setTanks] = useState<TankConfig[]>([]);
  const [readings, setReadings] = useState<Record<string, TankReading>>({});
  const [lastCapture, setLastCapture] = useState<TankContextType['lastCapture']>(null);

  useEffect(() => {
    const handleSync = (data: { tanks: TankConfig[] }) => {
      if (Array.isArray(data?.tanks)) setTanks(data.tanks);
    };
    const handleCaptured = (data: { tankId: string; rawVolts: number | null; tank: TankConfig | null }) => {
      setLastCapture(data);
    };
    const handleSensorUpdate = (msg: { data?: { tanks?: Record<string, TankReading> } }) => {
      const t = msg?.data?.tanks;
      if (t) setReadings(t);
    };

    wsService.on('tanks_sync', handleSync);
    wsService.on('tank_calibration_captured', handleCaptured);
    wsService.on('sensor_update', handleSensorUpdate);

    // Ask for the current list right away (initial sync also fires on connect,
    // but this covers re-mounts within an existing session).
    wsService.emit('get_tanks');

    return () => {
      wsService.off('tanks_sync', handleSync);
      wsService.off('tank_calibration_captured', handleCaptured);
      wsService.off('sensor_update', handleSensorUpdate);
    };
  }, []);

  const saveTank = useCallback((tank: TankConfig) => {
    wsService.emit('tank_save', tank);
  }, []);

  const deleteTank = useCallback((tankId: string) => {
    wsService.emit('tank_delete', { tankId });
  }, []);

  const captureCalibrationPoint = useCallback((tankId: string, liters: number) => {
    wsService.emit('tank_calibration_capture', { tankId, liters });
  }, []);

  const clearCalibration = useCallback((tankId: string) => {
    wsService.emit('tank_calibration_clear', { tankId });
  }, []);

  return (
    <TankContext.Provider value={{ tanks, readings, saveTank, deleteTank, captureCalibrationPoint, clearCalibration, lastCapture }}>
      {children}
    </TankContext.Provider>
  );
};

export function useTanks(): TankContextType {
  const ctx = useContext(TankContext);
  if (!ctx) throw new Error('useTanks must be used within a TankProvider');
  return ctx;
}
