import React, { useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';

interface ScrollableControlColumnProps {
  /** Scrollable buttons, top→bottom (e.g. Forecast?, Search, Layers, Recenter).
      Each must carry a stable `key`. */
  items: React.ReactNode[];
  /** Always-pinned button rendered at the very bottom (MOB). Never scrolled away. */
  footer: React.ReactNode;
  /** Theme border string, reused for the chevron buttons' top border. */
  separator: string;
}

/**
 * Bottom region of the chart sidebar. Shows as many control buttons as fit
 * above the pinned footer (MOB); when they overflow it pages through them one
 * button at a time with up/down chevrons. When everything fits it looks exactly
 * like a plain bottom-aligned button stack (no chevrons).
 *
 * Heights are measured at runtime — `.chart-sidebar-btn` is `clamp(48px,8vh,72px)`
 * and drops to 40px under `@media (max-height:550px)`, so a fixed value would be
 * wrong. The footer (MOB) is always a `.chart-sidebar-btn`, so its measured
 * height is the uniform slot height H used for the whole region.
 */
export const ScrollableControlColumn: React.FC<ScrollableControlColumnProps> = ({
  items,
  footer,
  separator,
}) => {
  const { t } = useLanguage();
  const outerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0); // available height of the whole region
  const [btnH, setBtnH] = useState(0); // measured uniform button height (H)
  const [offset, setOffset] = useState(0); // index of the first visible scrollable item

  // Measure the region height and the footer (button) height. Observing the
  // OUTER region — whose height comes from `flex:1` and is independent of how
  // many items render — avoids a render→measure→render feedback loop. The
  // footer is observed too because H changes with the viewport-height clamp.
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const foot = footerRef.current;
    if (!outer || !foot) return;
    const measure = () => {
      const oh = outer.getBoundingClientRect().height;
      const fh = foot.getBoundingClientRect().height;
      if (oh > 0) setAvail(oh);
      if (fh > 0) setBtnH(fh);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(foot);
    return () => ro.disconnect();
  }, []);

  const N = items.length;
  const measured = avail > 0 && btnH > 0;
  // Total H-tall slots above the pinned footer; a chevron consumes one slot.
  const cap = btnH > 0 ? Math.max(0, Math.floor((avail - btnH) / btnH)) : 0;
  const fits = measured && cap >= N;
  // Paging needs room for two chevrons + at least one button in the worst
  // (middle) state, i.e. cap >= 3. With fewer slots, fall back to native scroll
  // so every control stays reachable.
  const windowed = measured && cap >= 3 && cap < N;
  const fallback = !measured || (measured && !fits && !windowed);
  // First offset that still reveals the last item (an up-chevron is present there).
  const bottomOffset = Math.max(0, N - (cap - 1));

  // Re-clamp the offset whenever capacity or item count changes (resize, or the
  // optional Forecast button appearing/disappearing) so the window never lands
  // past the end or on a stale position.
  useLayoutEffect(() => {
    const max = windowed ? bottomOffset : 0;
    setOffset((o) => Math.min(Math.max(o, 0), max));
  }, [windowed, bottomOffset]);

  // Compute the visible slice + which chevrons to show. `effOffset` guards the
  // frame before the clamp effect runs after a resize.
  const effOffset = windowed ? Math.min(Math.max(offset, 0), bottomOffset) : 0;
  let showUp = false;
  let showDown = false;
  let start = 0;
  let end = N;
  if (windowed) {
    showUp = effOffset > 0;
    const maxItems = cap - (showUp ? 1 : 0);
    const remaining = N - effOffset;
    let count: number;
    if (remaining <= maxItems) {
      showDown = false;
      count = remaining;
    } else {
      showDown = true;
      count = Math.max(maxItems - 1, 1); // always keep >=1 real button visible
    }
    start = effOffset;
    end = effOffset + count;
  }

  const chevron = (dir: 'up' | 'down') => {
    const label = dir === 'up' ? t('chart.controls_prev') : t('chart.controls_more');
    return (
      <button
        key={`chev-${dir}`}
        type="button"
        className="chart-sidebar-btn nav-arrow"
        style={{ borderTop: separator }}
        title={label}
        aria-label={label}
        onClick={() =>
          setOffset((o) =>
            dir === 'up' ? Math.max(o - 1, 0) : Math.min(o + 1, bottomOffset),
          )
        }
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points={dir === 'up' ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
        </svg>
      </button>
    );
  };

  let region: React.ReactNode;
  if (fallback) {
    // Native-scroll fallback: all items in a scroller, footer still pinned.
    region = (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflowY: 'auto' }}>
        {items}
      </div>
    );
  } else if (windowed) {
    region = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {showUp && chevron('up')}
        {items.slice(start, end)}
        {showDown && chevron('down')}
      </div>
    );
  } else {
    // Everything fits — plain bottom-aligned stack (identical to before).
    region = <div style={{ display: 'flex', flexDirection: 'column' }}>{items}</div>;
  }

  return (
    <div
      ref={outerRef}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {region}
      <div ref={footerRef}>{footer}</div>
    </div>
  );
};
