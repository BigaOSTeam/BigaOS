import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAlerts, Notification } from '../../context/AlertContext';
import { AlertBanner } from './AlertBanner';
import { startRepeatingAlarm, ALERT_SOUNDS } from '../../utils/audio';
import { useSettings } from '../../context/SettingsContext';

export const AlertContainer: React.FC = () => {
  const { theme } = useTheme();
  const { alertSettings } = useSettings();
  const { notifications, dismissAlert, snoozeAlert, clearNotification } = useAlerts();
  // Track repeating alarms for critical alerts
  const criticalAlarmsRef = useRef<Map<string, () => void>>(new Map());
  // Track which notifications have played their initial sound
  const playedSoundsRef = useRef<Set<string>>(new Set());

  // Handle dismiss based on notification source
  const handleDismiss = (notification: Notification) => {
    // Stop any repeating alarm
    const stopFn = criticalAlarmsRef.current.get(notification.id);
    if (stopFn) {
      stopFn();
      criticalAlarmsRef.current.delete(notification.id);
    }
    playedSoundsRef.current.delete(notification.id);

    if (notification.source === 'server' && notification.alertId) {
      // Server alert - snooze or dismiss
      if (notification.snoozeDurationMinutes && notification.snoozeDurationMinutes > 0) {
        snoozeAlert(notification.alertId, notification.snoozeDurationMinutes);
      } else {
        dismissAlert(notification.alertId);
      }
    } else {
      // Local notification - clear it (this will call onDismiss callback)
      clearNotification(notification.id);
    }
  };

  // Handle sounds based on severity
  useEffect(() => {
    notifications.forEach((notification) => {
      const { id, severity, tone } = notification;

      // Check if tone changed to 'none' - stop any running alarm
      if (tone === 'none') {
        const stopFn = criticalAlarmsRef.current.get(id);
        if (stopFn) {
          stopFn();
          criticalAlarmsRef.current.delete(id);
        }
        playedSoundsRef.current.add(id); // Mark as handled
        return;
      }

      // Skip if already handled (and tone is not 'none')
      if (playedSoundsRef.current.has(id)) {
        // For critical, ensure alarm is still running
        if (severity === 'critical' && !criticalAlarmsRef.current.has(id)) {
          const soundFn = tone ? ALERT_SOUNDS[tone as keyof typeof ALERT_SOUNDS] : ALERT_SOUNDS.alarm;
          if (soundFn) {
            const stopFn = startRepeatingAlarm(1500, soundFn);
            criticalAlarmsRef.current.set(id, stopFn);
          }
        }
        return;
      }

      playedSoundsRef.current.add(id);

      const soundFn = (tone ? ALERT_SOUNDS[tone as keyof typeof ALERT_SOUNDS] : null) || ALERT_SOUNDS.beep;
      if (!soundFn) return;

      switch (severity) {
        case 'info':
          // Single tone
          soundFn();
          break;
        case 'warning':
          // 2-3 tones
          soundFn();
          setTimeout(() => soundFn(), 300);
          setTimeout(() => soundFn(), 600);
          break;
        case 'critical':
          // Continuous repeating tone
          const stopFn = startRepeatingAlarm(1500, soundFn);
          criticalAlarmsRef.current.set(id, stopFn);
          break;
      }
    });

    // Cleanup alarms for notifications that are no longer visible
    const visibleIds = new Set(notifications.map((n) => n.id));
    criticalAlarmsRef.current.forEach((stopFn, notificationId) => {
      if (!visibleIds.has(notificationId)) {
        stopFn();
        criticalAlarmsRef.current.delete(notificationId);
        playedSoundsRef.current.delete(notificationId);
      }
    });
  }, [notifications]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      criticalAlarmsRef.current.forEach((stopFn) => stopFn());
      criticalAlarmsRef.current.clear();
    };
  }, []);

  // Don't render if alerts are disabled globally
  if (!alertSettings.globalEnabled) return null;

  if (notifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: theme.space.lg,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: theme.zIndex.modal + 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: theme.space.md,
        pointerEvents: 'none',
      }}
    >
      {notifications.map((notification) => (
        <div
          key={notification.id}
          style={{
            pointerEvents: 'auto',
          }}
        >
          <AlertBanner
            alert={{
              alertId: notification.alertId || notification.id,
              message: notification.message,
              triggeredAt: notification.triggeredAt,
              severity: notification.severity,
            }}
            severity={notification.severity}
            onDismiss={() => handleDismiss(notification)}
          />
        </div>
      ))}

      {/* CSS for animations */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes alertPulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.02);
          }
        }
      `}</style>
    </div>
  );
};
