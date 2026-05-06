/**
 * Minimal sd_notify wrapper.
 *
 * systemd's NOTIFY_SOCKET is an AF_UNIX SOCK_DGRAM socket, which Node's
 * built-in `net` and `dgram` modules can't open without a native module.
 * Rather than pull in `sd-daemon` or similar, we shell out to the
 * `systemd-notify` binary, which ships with every systemd installation.
 *
 * When NOTIFY_SOCKET is unset (dev, manual run, non-systemd), all functions
 * are no-ops.
 */

import { execFile } from 'child_process';

const NOTIFY_SOCKET = process.env.NOTIFY_SOCKET;

function notify(...args: string[]): void {
  if (!NOTIFY_SOCKET) return;
  // execFile (not exec) — no shell, args list is safe.
  execFile('systemd-notify', args, (err) => {
    if (err) {
      // Suppress repeated noise from missing binary; one warn is enough.
      if (!notifyWarned) {
        console.error('[sd-notify] systemd-notify failed:', err.message);
        notifyWarned = true;
      }
    }
  });
}
let notifyWarned = false;

export function sdNotifyReady(): void {
  notify('--ready', '--status=Server running');
}

export function sdNotifyStopping(): void {
  notify('--stopping', '--status=Shutting down');
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start pinging the systemd watchdog. The interval is half of WATCHDOG_USEC
 * (so we have headroom for one missed tick), or 10 s if it's unset.
 */
export function sdNotifyWatchdog(): void {
  if (watchdogTimer) return;
  if (!NOTIFY_SOCKET) return;

  const usec = process.env.WATCHDOG_USEC;
  const intervalMs = usec ? Math.max(1000, Math.floor(parseInt(usec, 10) / 1000 / 2)) : 10000;

  notify('WATCHDOG=1');
  watchdogTimer = setInterval(() => notify('WATCHDOG=1'), intervalMs);
  // Don't keep the event loop alive just for the watchdog.
  watchdogTimer.unref();
}

export function sdNotifyStopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}
