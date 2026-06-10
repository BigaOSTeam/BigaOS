/**
 * Keep-alive control (Android foreground service).
 *
 * Android freezes the WebView minutes after the app leaves the foreground —
 * the socket dies and no alerts arrive. The native KeepAlive plugin runs a
 * sticky foreground service holding a partial wakelock + WiFi lock so the
 * connection survives screen-off and Doze. It runs in two situations:
 *
 * - while the anchor alarm is armed (reason "anchor"), always
 * - permanently, when the per-device "background alerts" setting is on
 *   (reason "alerts")
 *
 * Android 12+ forbids starting a foreground service while the app is in the
 * background (e.g. the watch was armed from the cockpit display). In that
 * case the start is remembered and retried when the app comes to the
 * foreground again.
 */

import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { isNativeApp } from '../utils/serverConfig';

interface KeepAlivePlugin {
  start(options: { reason: 'anchor' | 'alerts' }): Promise<void>;
  stop(): Promise<void>;
  setBackgroundAlertsEnabled(options: { enabled: boolean }): Promise<void>;
  requestBatteryExemption(): Promise<void>;
}

const KeepAlive = registerPlugin<KeepAlivePlugin>('KeepAlive');

// ---- Per-device "background alerts" setting -------------------------------

const BACKGROUND_ALERTS_STORAGE_KEY = 'bigaos-background-alerts';
export const BACKGROUND_ALERTS_TOGGLE_EVENT = 'bigaos-background-alerts-changed';

export function areBackgroundAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(BACKGROUND_ALERTS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBackgroundAlertsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BACKGROUND_ALERTS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch { /* storage unavailable */ }
  if (isNativeApp()) {
    // Mirror into SharedPreferences so BootReceiver can read it after a
    // reboot (it has no access to WebView localStorage).
    void KeepAlive.setBackgroundAlertsEnabled({ enabled }).catch(() => {});
    if (enabled) {
      // Without the exemption, deep Doze ignores the service's wakelock and
      // alerts stall while the phone lies still. No-op if already granted.
      void KeepAlive.requestBatteryExemption().catch(() => {});
    }
  }
  window.dispatchEvent(new Event(BACKGROUND_ALERTS_TOGGLE_EVENT));
}

// ---- Service control -------------------------------------------------------

type KeepAliveReason = 'anchor' | 'alerts' | null;

let desiredReason: KeepAliveReason = null;
let resumeListenerInstalled = false;

async function applyDesiredState(): Promise<void> {
  try {
    if (desiredReason) {
      await KeepAlive.start({ reason: desiredReason });
    } else {
      await KeepAlive.stop();
    }
  } catch (err) {
    // Most likely ForegroundServiceStartNotAllowedException while
    // backgrounded — the resume listener below retries.
    console.warn('[keepAlive] applying state failed:', err);
  }
}

function ensureResumeListener(): void {
  if (resumeListenerInstalled) return;
  resumeListenerInstalled = true;
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void applyDesiredState();
    }
  });
}

/**
 * Reconcile the foreground service with the current needs. The anchor watch
 * takes precedence for the notification text. Safe to call repeatedly.
 */
export function updateKeepAlive(needs: { anchorArmed: boolean; backgroundAlerts: boolean }): void {
  if (!isNativeApp()) return;
  ensureResumeListener();
  const reason: KeepAliveReason = needs.anchorArmed
    ? 'anchor'
    : needs.backgroundAlerts
      ? 'alerts'
      : null;
  if (desiredReason === reason) return;
  desiredReason = reason;
  void applyDesiredState();
}
