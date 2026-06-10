/**
 * Native (Android) system notifications for alerts.
 *
 * Mirrors triggered alerts into Android notifications via
 * @capacitor/local-notifications so they reach the user when the app is
 * backgrounded or the screen is off. Every function is a no-op outside the
 * native APK (browser / Pi kiosk clients are unaffected).
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeApp } from '../utils/serverConfig';

// Android notification channels. Importance is fixed at creation time;
// names are re-applied on every init so they follow the app language.
const CHANNEL_CRITICAL = 'bigaos_critical';
const CHANNEL_WARNING = 'bigaos_warning';
const CHANNEL_SILENT = 'bigaos_silent';

// Which channel a notification posts on. 'silent' is for alerts whose tone
// is set to 'none' — visible in the shade but no sound or vibration.
export type NotificationKind = 'critical' | 'warning' | 'silent';

const ENABLED_STORAGE_KEY = 'bigaos-phone-notifications';
// Fired on window when the user flips the settings toggle, so the bridge
// can react without a context round-trip (the flag is per-device, not synced).
export const NATIVE_NOTIFICATIONS_TOGGLE_EVENT = 'bigaos-phone-notifications-changed';

export function areNativeNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setNativeNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(NATIVE_NOTIFICATIONS_TOGGLE_EVENT));
}

/**
 * Request permission and (re)create the notification channels.
 * Returns true when notifications are permitted.
 */
export async function initNativeNotifications(
  t: (key: string) => string
): Promise<boolean> {
  if (!isNativeApp()) return false;

  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      status = await LocalNotifications.requestPermissions();
    }

    await LocalNotifications.createChannel({
      id: CHANNEL_CRITICAL,
      name: t('phoneNotif.channel_critical'),
      description: t('phoneNotif.channel_critical_desc'),
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_WARNING,
      name: t('phoneNotif.channel_warning'),
      description: t('phoneNotif.channel_warning_desc'),
      importance: 3,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_SILENT,
      name: t('phoneNotif.channel_silent'),
      description: t('phoneNotif.channel_silent_desc'),
      importance: 2,
      visibility: 1,
      vibration: false,
    });

    return status.display === 'granted';
  } catch (err) {
    console.warn('[nativeNotifications] init failed:', err);
    return false;
  }
}

// Android wants integer notification ids; alert ids are strings. Stable
// 31-bit hash so show/cancel for the same alert always hit the same slot.
export function notificationNumericId(stringId: string): number {
  let h = 0;
  for (let i = 0; i < stringId.length; i++) {
    h = (h * 31 + stringId.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 2147483646) + 1;
}

export interface NativeAlertNotification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
}

const CHANNEL_FOR_KIND: Record<NotificationKind, string> = {
  critical: CHANNEL_CRITICAL,
  warning: CHANNEL_WARNING,
  silent: CHANNEL_SILENT,
};

/**
 * Show (or replace) a system notification. Re-posting with the same id
 * replaces the existing notification and plays the channel sound again —
 * the bridge uses that to re-alert for active critical alarms.
 */
export async function showNativeNotification(n: NativeAlertNotification): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationNumericId(n.id),
          title: n.title,
          body: n.body,
          channelId: CHANNEL_FOR_KIND[n.kind],
          autoCancel: true,
        },
      ],
    });
  } catch (err) {
    console.warn('[nativeNotifications] schedule failed:', err);
  }
}

export async function cancelNativeNotification(stringId: string): Promise<void> {
  if (!isNativeApp()) return;
  const id = notificationNumericId(stringId);
  try {
    // cancel() only covers pending (scheduled) notifications; delivered ones
    // need removeDeliveredNotifications. Ours display immediately, so the
    // delivered list is where they live.
    await LocalNotifications.cancel({ notifications: [{ id }] });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const match = delivered.notifications.filter((d) => d.id === id);
    if (match.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: match });
    }
  } catch (err) {
    console.warn('[nativeNotifications] cancel failed:', err);
  }
}

export async function cancelAllNativeNotifications(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.removeAllDeliveredNotifications();
  } catch (err) {
    console.warn('[nativeNotifications] cancelAll failed:', err);
  }
}
