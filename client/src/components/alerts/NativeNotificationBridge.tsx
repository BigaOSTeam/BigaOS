/**
 * NativeNotificationBridge - mirrors alerts into Android system notifications.
 *
 * Renders nothing. On the native APK it:
 * - posts a system notification for every triggered server alert
 *   (warning/critical), and removes it when the alert clears
 * - re-alerts every 20s for active critical alarms while the app is
 *   backgrounded, so a dragging anchor keeps making noise
 * - arms the AnchorWatch foreground service while the anchor alarm is
 *   active anywhere on the boat, keeping the socket alive through
 *   screen-off and Doze
 * - raises its own critical notification if the boat connection drops
 *   while the anchor watch is armed
 *
 * In the browser / on the Pi displays this component is inert.
 */

import React, { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useAlerts, Notification } from '../../context/AlertContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { wsService } from '../../services/websocket';
import { isNativeApp } from '../../utils/serverConfig';
import {
  initNativeNotifications,
  showNativeNotification,
  cancelNativeNotification,
  cancelAllNativeNotifications,
  areNativeNotificationsEnabled,
  NATIVE_NOTIFICATIONS_TOGGLE_EVENT,
} from '../../services/nativeNotifications';
import { setAnchorWatchKeepAlive } from '../../services/anchorWatch';

const RE_ALERT_INTERVAL_MS = 20000;
const CONNECTION_LOST_ID = 'native_connection_lost';
const WATCH_LOST_ID = 'native_anchor_watch_lost';
// After a reconnect the server re-sends the anchor state almost immediately;
// if nothing arrives within this window the watch is considered gone
// (e.g. the server rebooted and lost it).
const ANCHOR_RESYNC_GRACE_MS = 7000;

interface ShownNotification {
  title: string;
  message: string;
  critical: boolean;
}

export const NativeNotificationBridge: React.FC = () => {
  const { notifications } = useAlerts();
  const { alertSettings } = useSettings();
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(areNativeNotificationsEnabled());
  const [anchorWatchArmed, setAnchorWatchArmed] = useState(false);

  // What is currently shown in the Android shade, by alert id
  const shownRef = useRef<Map<string, ShownNotification>>(new Map());
  const appInBackgroundRef = useRef(false);
  const anchorWatchArmedRef = useRef(false);
  anchorWatchArmedRef.current = anchorWatchArmed;
  const tRef = useRef(t);
  tRef.current = t;

  // Drop notifications left over from a previous process (e.g. Android
  // killed the app while an alarm was showing) — anything still relevant
  // re-posts as soon as alerts_sync arrives.
  useEffect(() => {
    if (!isNativeApp()) return;
    void cancelAllNativeNotifications();
  }, []);

  // Permission + channels; re-run on language change so channel names follow
  useEffect(() => {
    if (!isNativeApp()) return;
    void initNativeNotifications(t);
  }, [t]);

  // Per-device settings toggle (AlertsTab writes localStorage + fires this)
  useEffect(() => {
    if (!isNativeApp()) return;
    const handler = () => setEnabled(areNativeNotificationsEnabled());
    window.addEventListener(NATIVE_NOTIFICATIONS_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(NATIVE_NOTIFICATIONS_TOGGLE_EVENT, handler);
  }, []);

  // Track foreground/background so re-alerting only nags when nobody is looking
  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      appInBackgroundRef.current = !isActive;
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, []);

  // Anchor watch state, synced from the server (it may have been armed from
  // the cockpit display, not this phone)
  useEffect(() => {
    if (!isNativeApp()) return;

    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleAnchorChanged = (data: { anchorAlarm?: { active?: boolean } }) => {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
      const active = !!data?.anchorAlarm?.active;
      if (active) void cancelNativeNotification(WATCH_LOST_ID);
      setAnchorWatchArmed(active);
    };

    const handleAnchorCleared = () => {
      setAnchorWatchArmed(false);
    };

    const handleReachability = (event: { reachable: boolean }) => {
      if (event.reachable) {
        // Reconnected — expect an anchor_alarm_changed shortly if still armed
        if (graceTimer) clearTimeout(graceTimer);
        graceTimer = setTimeout(() => {
          // The watch we believed in is gone server-side (e.g. server
          // restart) — say so instead of silently dropping protection.
          if (anchorWatchArmedRef.current && areNativeNotificationsEnabled()) {
            void showNativeNotification({
              id: WATCH_LOST_ID,
              title: tRef.current('phoneNotif.title_critical'),
              body: tRef.current('phoneNotif.watch_lost'),
              critical: true,
            });
          }
          setAnchorWatchArmed(false);
        }, ANCHOR_RESYNC_GRACE_MS);
      }
    };

    wsService.on('anchor_alarm_changed', handleAnchorChanged);
    wsService.on('anchor_alarm_cleared', handleAnchorCleared);
    wsService.on('server_reachability', handleReachability);
    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      wsService.off('anchor_alarm_changed', handleAnchorChanged);
      wsService.off('anchor_alarm_cleared', handleAnchorCleared);
      wsService.off('server_reachability', handleReachability);
    };
  }, []);

  // Drive the foreground service from anchor state + toggle
  useEffect(() => {
    if (!isNativeApp()) return;
    setAnchorWatchKeepAlive(anchorWatchArmed && enabled);
  }, [anchorWatchArmed, enabled]);

  // Connection-lost warning while the watch is armed
  useEffect(() => {
    if (!isNativeApp() || !anchorWatchArmed || !enabled) return;

    const handleReachability = (event: { reachable: boolean }) => {
      if (!event.reachable) {
        void showNativeNotification({
          id: CONNECTION_LOST_ID,
          title: tRef.current('phoneNotif.title_critical'),
          body: tRef.current('phoneNotif.connection_lost'),
          critical: true,
        });
      } else {
        void cancelNativeNotification(CONNECTION_LOST_ID);
      }
    };

    wsService.on('server_reachability', handleReachability);
    return () => {
      wsService.off('server_reachability', handleReachability);
      void cancelNativeNotification(CONNECTION_LOST_ID);
    };
  }, [anchorWatchArmed, enabled]);

  // Mirror triggered alerts into the shade
  useEffect(() => {
    if (!isNativeApp()) return;

    if (!enabled) {
      if (shownRef.current.size > 0) {
        shownRef.current.clear();
        void cancelAllNativeNotifications();
      }
      return;
    }

    const visible = notifications.filter(
      (n) =>
        n.source === 'server' &&
        n.severity !== 'info' &&
        (alertSettings.globalEnabled || n.alertId?.startsWith('special_'))
    );

    const shown = shownRef.current;
    const visibleIds = new Set<string>();

    visible.forEach((n) => {
      visibleIds.add(n.id);
      const prev = shown.get(n.id);
      const critical = n.severity === 'critical';
      // Post when new; re-post when the message changed (e.g. anchor
      // over-distance grows) — replacing re-plays the channel sound
      if (!prev || prev.message !== n.message || prev.critical !== critical) {
        const title = notificationTitle(n, tRef.current);
        shown.set(n.id, { title, message: n.message, critical });
        void showNativeNotification({ id: n.id, title, body: n.message, critical });
      }
    });

    shown.forEach((_, id) => {
      if (!visibleIds.has(id)) {
        shown.delete(id);
        void cancelNativeNotification(id);
      }
    });
  }, [notifications, alertSettings.globalEnabled, enabled]);

  // Background re-alert loop for critical alarms
  useEffect(() => {
    if (!isNativeApp() || !enabled) return;

    const interval = setInterval(() => {
      if (!appInBackgroundRef.current) return;
      shownRef.current.forEach((info, id) => {
        if (!info.critical) return;
        void showNativeNotification({
          id,
          title: info.title,
          body: info.message,
          critical: true,
        });
      });
    }, RE_ALERT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  return null;
};

function notificationTitle(n: Notification, t: (key: string) => string): string {
  if (n.title) return n.title;
  return n.severity === 'critical'
    ? t('phoneNotif.title_critical')
    : t('phoneNotif.title_warning');
}
