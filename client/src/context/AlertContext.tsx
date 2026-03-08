/**
 * AlertContext - Unified notification system
 *
 * This context handles ALL notifications/alerts in the app:
 * - Server alerts (wind, battery, custom alerts)
 * - Local alerts (anchor alarm, depth alarm)
 *
 * All notifications go through one system for consistent:
 * - Stacking (ordered by time)
 * - Severity-based styling
 * - Sound handling
 * - Dismiss/snooze callbacks
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './SettingsContext';
import { wsService } from '../services/websocket';
import type { AlertDefinition, TriggeredAlert, AlertSettings, AlertSeverity } from '../types/alerts';

// Unified notification type
export interface Notification {
  id: string;
  message: string;
  severity: AlertSeverity;
  triggeredAt: Date;
  // For server alerts, this links back to the definition
  alertId?: string;
  // Custom dismiss callback for local notifications
  onDismiss?: () => void;
  // Snooze duration in minutes (0 = no snooze, just dismiss)
  snoozeDurationMinutes?: number;
  // Tone to play
  tone?: string;
  // Source of the notification
  source: 'server' | 'local';
}

interface AlertContextType {
  // Unified notifications list (sorted by time, newest last)
  notifications: Notification[];

  // Push a local notification (returns dismiss function)
  pushNotification: (notification: Omit<Notification, 'id' | 'triggeredAt' | 'source'>) => string;
  // Clear a local notification by ID
  clearNotification: (id: string) => void;
  // Update a notification (for changing message, etc.)
  updateNotification: (id: string, updates: Partial<Omit<Notification, 'id' | 'source'>>) => void;

  // Server alert actions
  dismissAlert: (alertId: string) => void;
  snoozeAlert: (alertId: string, minutes?: number) => void;

  // Alert definition management (for settings UI)
  triggeredAlerts: TriggeredAlert[];
  updateAlert: (alert: AlertDefinition) => void;
  deleteAlert: (alertId: string) => void;
  createAlert: (alert: Omit<AlertDefinition, 'id'>) => void;
  toggleAlert: (alertId: string, enabled: boolean) => void;
  setGlobalEnabled: (enabled: boolean) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { alertSettings, setAlertSettings } = useSettings();
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);

  // Counter for generating unique local notification IDs
  const notificationIdCounter = useRef(0);

  // Combine server and local notifications, sorted by time
  const notifications: Notification[] = React.useMemo(() => {
    // Convert server alerts to notifications
    const serverNotifications: Notification[] = triggeredAlerts
      .filter((alert) => {
        // Filter out snoozed alerts
        if (alert.snoozedUntil) {
          const snoozedUntilDate = alert.snoozedUntil instanceof Date
            ? alert.snoozedUntil
            : new Date(alert.snoozedUntil);
          return new Date() >= snoozedUntilDate;
        }
        return true;
      })
      .map((alert) => {
        const definition = alertSettings.alerts.find((a) => a.id === alert.alertId);
        return {
          id: `server_${alert.alertId}`,
          message: alert.message,
          severity: definition?.severity || alert.severity || 'warning',
          triggeredAt: new Date(alert.triggeredAt),
          alertId: alert.alertId,
          snoozeDurationMinutes: definition?.snoozeDurationMinutes || 0,
          // Use tone from triggered alert (for special alarms), fall back to definition
          tone: alert.tone || definition?.tone,
          source: 'server' as const,
        };
      });

    // Combine and sort by time (oldest first, so they stack top to bottom)
    return [...serverNotifications, ...localNotifications]
      .sort((a, b) => a.triggeredAt.getTime() - b.triggeredAt.getTime());
  }, [triggeredAlerts, localNotifications, alertSettings.alerts]);

  // Listen for server alert events
  useEffect(() => {
    const handleAlertTriggered = (event: { alert: TriggeredAlert }) => {
      const alert = event.alert;
      if (!alert) return;

      setTriggeredAlerts((prev) => {
        const existing = prev.find((t) => t.alertId === alert.alertId);
        if (existing) {
          return prev.map((t) => (t.alertId === alert.alertId ? alert : t));
        }
        return [...prev, alert];
      });
    };

    const handleAlertCleared = (event: { alertId: string }) => {
      setTriggeredAlerts((prev) => prev.filter((t) => t.alertId !== event.alertId));
    };

    const handleAlertSnoozed = (event: { alertId: string; snoozedUntil: string }) => {
      setTriggeredAlerts((prev) =>
        prev.map((t) =>
          t.alertId === event.alertId ? { ...t, snoozedUntil: new Date(event.snoozedUntil) } : t
        )
      );
    };

    const handleAlertsSync = (event: { alerts: TriggeredAlert[] }) => {
      setTriggeredAlerts(event.alerts || []);
    };

    const handleAlertSettingsSync = (event: { settings: AlertSettings }) => {
      if (event.settings) {
        setAlertSettings(event.settings);
      }
    };

    wsService.on('alert_triggered', handleAlertTriggered);
    wsService.on('alert_cleared', handleAlertCleared);
    wsService.on('alert_snoozed', handleAlertSnoozed);
    wsService.on('alerts_sync', handleAlertsSync);
    wsService.on('alert_settings_sync', handleAlertSettingsSync);

    return () => {
      wsService.off('alert_triggered', handleAlertTriggered);
      wsService.off('alert_cleared', handleAlertCleared);
      wsService.off('alert_snoozed', handleAlertSnoozed);
      wsService.off('alerts_sync', handleAlertsSync);
      wsService.off('alert_settings_sync', handleAlertSettingsSync);
    };
  }, [setAlertSettings]);

  // Clear custom triggered alerts when global is disabled (keep special alarms like depth/anchor)
  useEffect(() => {
    if (!alertSettings.globalEnabled) {
      setTriggeredAlerts((prev) => prev.filter((t) => t.alertId.startsWith('special_')));
    }
  }, [alertSettings.globalEnabled]);

  // Push a local notification
  const pushNotification = useCallback((notification: Omit<Notification, 'id' | 'triggeredAt' | 'source'>): string => {
    const id = `local_${++notificationIdCounter.current}_${Date.now()}`;
    const newNotification: Notification = {
      ...notification,
      id,
      triggeredAt: new Date(),
      source: 'local',
    };

    setLocalNotifications((prev) => {
      // Check for duplicate by message (don't add if same message already exists)
      const existing = prev.find((n) => n.message === notification.message);
      if (existing) {
        // Update existing instead of adding duplicate
        return prev.map((n) => n.message === notification.message ? { ...n, triggeredAt: new Date() } : n);
      }
      return [...prev, newNotification];
    });

    return id;
  }, []);

  // Clear a local notification
  const clearNotification = useCallback((id: string) => {
    setLocalNotifications((prev) => {
      const notification = prev.find((n) => n.id === id);
      if (notification?.onDismiss) {
        notification.onDismiss();
      }
      return prev.filter((n) => n.id !== id);
    });
  }, []);

  // Update a notification
  const updateNotification = useCallback((id: string, updates: Partial<Omit<Notification, 'id' | 'source'>>) => {
    setLocalNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, ...updates } : n)
    );
  }, []);

  // Dismiss a server alert
  const dismissAlert = useCallback((alertId: string) => {
    wsService.emit('alert_dismiss', { alertId });
    setTriggeredAlerts((prev) => prev.filter((t) => t.alertId !== alertId));
  }, []);

  // Snooze a server alert
  const snoozeAlert = useCallback((alertId: string, minutes?: number) => {
    wsService.emit('alert_snooze', { alertId, minutes });
  }, []);

  // Alert definition management
  const updateAlert = useCallback((updatedAlert: AlertDefinition) => {
    wsService.emit('alert_update', updatedAlert);
    setAlertSettings({
      ...alertSettings,
      alerts: alertSettings.alerts.map((a) =>
        a.id === updatedAlert.id ? updatedAlert : a
      ),
    });
  }, [alertSettings, setAlertSettings]);

  const deleteAlert = useCallback((alertId: string) => {
    wsService.emit('alert_delete', { alertId });
    setAlertSettings({
      ...alertSettings,
      alerts: alertSettings.alerts.filter((a) => a.id !== alertId),
    });
    dismissAlert(alertId);
  }, [alertSettings, setAlertSettings, dismissAlert]);

  const createAlert = useCallback((alert: Omit<AlertDefinition, 'id'>) => {
    const tempId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newAlert: AlertDefinition = { ...alert, id: tempId };
    wsService.emit('alert_update', newAlert);
    setAlertSettings({
      ...alertSettings,
      alerts: [...alertSettings.alerts, newAlert],
    });
  }, [alertSettings, setAlertSettings]);

  const toggleAlert = useCallback((alertId: string, enabled: boolean) => {
    const alert = alertSettings.alerts.find((a) => a.id === alertId);
    if (alert) {
      updateAlert({ ...alert, enabled });
    }
    if (!enabled) {
      dismissAlert(alertId);
    }
  }, [alertSettings.alerts, updateAlert, dismissAlert]);

  const setGlobalEnabled = useCallback((enabled: boolean) => {
    wsService.emit('alert_global_enable', { enabled });
    setAlertSettings({
      ...alertSettings,
      globalEnabled: enabled,
    });
  }, [alertSettings, setAlertSettings]);

  const value: AlertContextType = {
    notifications,
    pushNotification,
    clearNotification,
    updateNotification,
    dismissAlert,
    snoozeAlert,
    triggeredAlerts,
    updateAlert,
    deleteAlert,
    createAlert,
    toggleAlert,
    setGlobalEnabled,
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
};
