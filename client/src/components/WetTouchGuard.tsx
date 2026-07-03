/**
 * WetTouchGuard — mounts the wet-weather touch filter for this screen.
 *
 * Driven by the per-client `wetTouchGuard` setting (Display tab), so a spray-
 * exposed cockpit screen can run it while a dry nav-station screen doesn't.
 * When a touch is rejected as water, a brief ripple flashes where the finger
 * landed — otherwise a mis-rejected real tap would feel like a dead screen.
 *
 * See utils/wetTouchFilter.ts for the detection logic.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useClientSetting } from '../context/ClientSettingsContext';
import { createWetTouchFilter } from '../utils/wetTouchFilter';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

// Matches the .wet-reject-ripple animation duration in globals.css.
const RIPPLE_MS = 650;
// Keep at most this many ripples alive at once — a heavy splash can reject a
// flurry, and we don't want to spawn hundreds of nodes.
const MAX_RIPPLES = 5;

export const WetTouchGuard: React.FC = () => {
  const [enabled] = useClientSetting<boolean>('wetTouchGuard', false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setRipples([]);
      return;
    }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const filter = createWetTouchFilter({
      onReject: (x, y) => {
        const id = ++idRef.current;
        setRipples((rs) => [...rs.slice(-(MAX_RIPPLES - 1)), { id, x, y }]);
        const timer = setTimeout(() => {
          timers.delete(timer);
          setRipples((rs) => rs.filter((r) => r.id !== id));
        }, RIPPLE_MS);
        timers.add(timer);
      },
    });
    filter.attach();
    return () => {
      filter.detach();
      timers.forEach(clearTimeout);
    };
  }, [enabled]);

  return (
    <div className="wet-reject-layer" aria-hidden="true">
      {ripples.map((r) => (
        <span key={r.id} className="wet-reject-ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
};
