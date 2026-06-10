/**
 * Anchor-watch keep-alive (Android foreground service).
 *
 * While the anchor alarm is armed, Android must not freeze the WebView or
 * drop the socket — otherwise a dragging anchor at 3am never reaches the
 * phone. The native AnchorWatch plugin runs a sticky foreground service
 * holding a partial wakelock + WiFi lock for exactly that window.
 *
 * Android 12+ forbids starting a foreground service while the app is in the
 * background (e.g. the watch was armed from the cockpit display). In that
 * case the start is remembered and retried when the app comes to the
 * foreground again.
 */

import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { isNativeApp } from '../utils/serverConfig';

interface AnchorWatchPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const AnchorWatch = registerPlugin<AnchorWatchPlugin>('AnchorWatch');

let desiredActive = false;
let resumeListenerInstalled = false;

async function applyDesiredState(): Promise<void> {
  try {
    if (desiredActive) {
      await AnchorWatch.start();
    } else {
      await AnchorWatch.stop();
    }
  } catch (err) {
    // Most likely ForegroundServiceStartNotAllowedException while
    // backgrounded — the resume listener below retries.
    console.warn('[anchorWatch] applying state failed:', err);
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

/** Start or stop the keep-alive service. Safe to call repeatedly. */
export function setAnchorWatchKeepAlive(active: boolean): void {
  if (!isNativeApp()) return;
  ensureResumeListener();
  if (desiredActive === active) return;
  desiredActive = active;
  void applyDesiredState();
}
