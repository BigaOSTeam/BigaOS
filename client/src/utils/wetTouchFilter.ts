/**
 * Wet-weather touch filter
 *
 * Capacitive touchscreens exposed to spray/rain report water as *real* touches:
 * phantom points, jumpy coordinates, and — the dangerous ones — bursts of
 * simultaneous contacts that resolve into spurious button presses (dismissing an
 * alarm, toggling a relay, navigating away). A web app can't do true palm
 * rejection: we only ever see what the touch driver hands the browser. But we
 * can gate the discrete *activations* (clicks) that actually do the damage,
 * while leaving map pan/pinch-zoom and every clean single-finger tap alone.
 *
 * Strategy: OBSERVE pointer events only (never preventDefault them, so Leaflet
 * dragging and pinch-zoom keep working) and judge each touch gesture. A `click`
 * is allowed through only when it came from ONE finger, held still, for a normal
 * tap duration, with no second contact in play and no recent multi-touch burst.
 * Everything else has its click swallowed at the window capture phase, before
 * any React/Leaflet handler runs. Mouse and pen input are never filtered — water
 * only fakes touch.
 *
 * What this does NOT cover: timer-based holds (MOB press-and-hold, chart
 * long-press) don't emit a click, so they bypass this filter — MOB already has
 * its own 1.5 s hold guard. And a lone droplet that happens to land as one still,
 * normal-length contact can still slip through; no app-layer filter can rule
 * that out. This kills the common bursty failure mode, not physics.
 */

export interface WetTouchFilterCallbacks {
  /** Fired when a touch-derived click is rejected, at the click's coordinates. */
  onReject?: (x: number, y: number) => void;
}

// --- Tunables. Times in ms, distances in CSS px. ---------------------------
// A deliberate tap: one finger down and up, roughly in place, in a human
// timeframe. Outside these bounds it's a droplet blip (too brief), a smear/hold
// (too long or moved), or part of a multi-contact splash.
const TAP_MIN_MS = 40;      // shorter than this = a flicker, not a finger
const TAP_MAX_MS = 900;     // longer = a smear or a resting water film
const MOVE_TOL_PX = 16;     // finger jitter allowance before it's a drag/smear
const BURST_COOLDOWN_MS = 500; // after 2+ contacts, distrust clicks this long
const CLICK_MATCH_MS = 900;    // a click must follow its gesture within this
const CLICK_MATCH_PX = 40;     // ...and land near where the finger lifted

// Optional on-device tuning: `localStorage.setItem('bigaos.wetTouchDebug','1')`
// logs every gesture verdict to the console so thresholds can be dialed in
// against the actual panel without a rebuild.
const debugOn = (): boolean => {
  try {
    return localStorage.getItem('bigaos.wetTouchDebug') === '1';
  } catch {
    return false;
  }
};

const now = (): number => performance.now();

interface PointerRec {
  type: string;
  downT: number;
  downX: number;
  downY: number;
  moved: number;
}

interface LastGesture {
  endT: number;
  x: number;
  y: number;
  clean: boolean;
  isTouch: boolean;
}

export interface WetTouchFilter {
  attach: () => void;
  detach: () => void;
}

export function createWetTouchFilter(callbacks: WetTouchFilterCallbacks = {}): WetTouchFilter {
  const pointers = new Map<number, PointerRec>();
  // True once 2+ touch contacts are seen at once during the current gesture;
  // cleared when the last finger lifts. The cooldown timestamp keeps distrusting
  // the tail of a burst even after fingers are gone.
  let gestureDirty = false;
  let suppressUntil = 0;
  let lastGesture: LastGesture | null = null;

  const countTouch = (): number => {
    let n = 0;
    for (const p of pointers.values()) if (p.type === 'touch') n++;
    return n;
  };

  const onPointerDown = (e: PointerEvent): void => {
    pointers.set(e.pointerId, {
      type: e.pointerType,
      downT: now(),
      downX: e.clientX,
      downY: e.clientY,
      moved: 0,
    });
    if (e.pointerType !== 'touch') return;
    // Concurrent contacts are the signature of a splash. One instant of overlap
    // taints the whole gesture and opens a cooldown window.
    if (countTouch() >= 2) {
      gestureDirty = true;
      suppressUntil = now() + BURST_COOLDOWN_MS;
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const d = Math.hypot(e.clientX - p.downX, e.clientY - p.downY);
    if (d > p.moved) p.moved = d;
  };

  const finishPointer = (e: PointerEvent, cancelled: boolean): void => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!p) return;

    if (p.type !== 'touch') {
      // Mouse/pen: always trusted.
      lastGesture = { endT: now(), x: e.clientX, y: e.clientY, clean: true, isTouch: false };
      return;
    }

    const t = now();
    const duration = t - p.downT;
    const othersDown = countTouch(); // this pointer already removed
    const clean =
      !cancelled &&
      !gestureDirty &&
      t >= suppressUntil &&
      othersDown === 0 &&
      duration >= TAP_MIN_MS &&
      duration <= TAP_MAX_MS &&
      p.moved <= MOVE_TOL_PX;

    lastGesture = { endT: t, x: e.clientX, y: e.clientY, clean, isTouch: true };

    // Last finger up — reset the taint. The cooldown (suppressUntil) still
    // guards the immediate aftermath.
    if (othersDown === 0) gestureDirty = false;

    if (debugOn()) {
      // eslint-disable-next-line no-console
      console.debug(
        `[wet-touch] ${clean ? 'PASS' : 'BLOCK'} dur=${Math.round(duration)}ms ` +
          `move=${Math.round(p.moved)}px others=${othersDown} ` +
          `dirty=${gestureDirty} cancelled=${cancelled}`,
      );
    }
  };

  const onPointerUp = (e: PointerEvent): void => finishPointer(e, false);
  const onPointerCancel = (e: PointerEvent): void => finishPointer(e, true);

  const onClick = (e: MouseEvent): void => {
    const g = lastGesture;
    // No recent gesture, or a mouse/pen gesture → not water, allow.
    if (!g || !g.isTouch) return;
    // Not plausibly the click for that tap → don't touch it.
    if (now() - g.endT > CLICK_MATCH_MS) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > CLICK_MATCH_PX) return;
    if (g.clean) return;

    // Dirty touch-click: swallow it before any handler (React, Leaflet) sees it.
    e.stopImmediatePropagation();
    e.preventDefault();
    callbacks.onReject?.(e.clientX, e.clientY);
  };

  const attach = (): void => {
    // Observe-only pointer listeners are passive so they never interfere with
    // scrolling or Leaflet gestures. The click listener must be able to
    // preventDefault, so it is not passive.
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
    window.addEventListener('click', onClick, { capture: true });
  };

  const detach = (): void => {
    window.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions);
    window.removeEventListener('pointermove', onPointerMove, { capture: true } as EventListenerOptions);
    window.removeEventListener('pointerup', onPointerUp, { capture: true } as EventListenerOptions);
    window.removeEventListener('pointercancel', onPointerCancel, { capture: true } as EventListenerOptions);
    window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
    pointers.clear();
    gestureDirty = false;
    suppressUntil = 0;
    lastGesture = null;
  };

  return { attach, detach };
}
