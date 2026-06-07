import { useEffect, useState } from 'react';

/**
 * Returns the current time, re-rendering the consumer on a fixed interval
 * (default once per minute). The first tick is aligned to the next interval
 * boundary so updates land near the minute rather than drifting from mount.
 *
 * Used by night mode to re-evaluate sunset/schedule windows as time passes.
 */
export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    const tick = () => setNow(new Date());

    let interval: ReturnType<typeof setInterval> | undefined;
    const msToBoundary = intervalMs - (Date.now() % intervalMs);
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, intervalMs);
    }, msToBoundary);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
