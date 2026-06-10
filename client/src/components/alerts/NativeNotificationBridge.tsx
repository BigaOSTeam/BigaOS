/**
 * NativeNotificationBridge - mirrors alerts into Android system notifications.
 *
 * Renders nothing. On the native APK it:
 * - posts ONE system notification per triggered server alert
 *   (warning/critical) and removes it when the alert clears — message
 *   updates from the server never re-post, so it doesn't nag
 * - runs the KeepAlive foreground service while the anchor alarm is
 *   active anywhere on the boat, or permanently when the per-device
 *   background-alerts setting is on, keeping the socket alive through
 *   screen-off and Doze
 * - raises its own critical notification if the boat connection drops
 *   while the anchor watch is armed
 *
 * In the browser / on the Pi displays this component is inert.
 */

import React, { useEffect, useRef, useState } from 'react';
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
  NotificationKind,
} from '../../services/nativeNotifications';
import {
  updateKeepAlive,
  areBackgroundAlertsEnabled,
  BACKGROUND_ALERTS_TOGGLE_EVENT,
} from '../../services/keepAlive';

const CONNECTION_LOST_ID = 'native_connection_lost';
const WATCH_LOST_ID = 'native_anchor_watch_lost';
// After a reconnect the server re-sends the anchor state almost immediately;
// if nothing arrives within this window the watch is considered gone
// (e.g. the server rebooted and lost it).
const ANCHOR_RESYNC_GRACE_MS = 7000;

export const NativeNotificationBridge: React.FC = () => {
  const { notifications } = useAlerts();
  const { alertSettings } = useSettings();
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(areNativeNotificationsEnabled());
  const [backgroundAlerts, setBackgroundAlerts] = useState(areBackgroundAlertsEnabled());
  const [anchorWatchArmed, setAnchorWatchArmed] = useState(false);

  // What is currently shown in the Android shade: alert id -> channel kind
  const shownRef = useRef<Map<string, NotificationKind>>(new Map());
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

  // Per-device settings toggles (AlertsTab writes localStorage + fires these)
  useEffect(() => {
    if (!isNativeApp()) return;
    const notifHandler = () => setEnabled(areNativeNotificationsEnabled());
    const bgHandler = () => setBackgroundAlerts(areBackgroundAlertsEnabled());
    window.addEventListener(NATIVE_NOTIFICATIONS_TOGGLE_EVENT, notifHandler);
    window.addEventListener(BACKGROUND_ALERTS_TOGGLE_EVENT, bgHandler);
    return () => {
      window.removeEventListener(NATIVE_NOTIFICATIONS_TOGGLE_EVENT, notifHandler);
      window.removeEventListener(BACKGROUND_ALERTS_TOGGLE_EVENT, bgHandler);
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
              kind: 'critical',
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

  // Drive the foreground service from anchor state + toggles
  useEffect(() => {
    if (!isNativeApp()) return;
    updateKeepAlive({
      anchorArmed: anchorWatchArmed && enabled,
      backgroundAlerts: backgroundAlerts && enabled,
    });
  }, [anchorWatchArmed, backgroundAlerts, enabled]);

  // Connection-lost warning while the watch is armed
  useEffect(() => {
    if (!isNativeApp() || !anchorWatchArmed || !enabled) return;

    const handleReachability = (event: { reachable: boolean }) => {
      if (!event.reachable) {
        void showNativeNotification({
          id: CONNECTION_LOST_ID,
          title: tRef.current('phoneNotif.title_critical'),
          body: tRef.current('phoneNotif.connection_lost'),
          kind: 'critical',
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
      const kind: NotificationKind =
        n.tone === 'none' ? 'silent' : n.severity === 'critical' ? 'critical' : 'warning';
      // Post exactly once per alert (re-post only on a severity/tone change).
      // Message-only updates arrive on every sensor tick (anchor
      // over-distance, measured values) — re-posting those would make the
      // notification ding and reappear every couple of seconds.
      if (shown.get(n.id) !== kind) {
        shown.set(n.id, kind);
        void showNativeNotification({
          id: n.id,
          title: notificationTitle(n, tRef.current),
          body: n.message,
          kind,
        });
      }
    });

    shown.forEach((_, id) => {
      if (!visibleIds.has(id)) {
        shown.delete(id);
        void cancelNativeNotification(id);
      }
    });
  }, [notifications, alertSettings.globalEnabled, enabled]);

  return null;
};

function notificationTitle(n: Notification, t: (key: string) => string): string {
  if (n.title) return n.title;
  return n.severity === 'critical'
    ? t('phoneNotif.title_critical')
    : t('phoneNotif.title_warning');
}
