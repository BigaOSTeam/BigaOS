import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { depthAPI, DepthContours } from '../../../services/api';
import { useAlerts } from '../../../context/AlertContext';
import { useLayerLoading } from './LayerLoadingContext';

/**
 * Depth contour overlay.
 *
 * Draws GeoJSON isobaths from the server (EMODnet DTM) on a single custom
 * canvas layer: depth-coloured polylines plus depth labels placed along each
 * line at a fixed pixel spacing, rotated to follow the contour. Drawing the
 * labels on the same canvas as the lines (rather than as DOM markers) keeps
 * them reliably visible and cheap even with hundreds of contours.
 *
 * Data fetching is gated: the server snaps bboxes to a grid, so we only refetch
 * when the snapped region changes. The canvas reprojects/redraws itself on pan
 * and zoom, so plain pans within a region cost nothing on the network.
 *
 * While a fresh region loads, a "Loading depth…" notification is pushed into
 * the app's alert stack.
 */

export const DEPTH_MIN_ZOOM = 9;
// Max viewport span (degrees) we'll request contours for. The server refuses
// spans over MAX_SPAN_DEG (3°) on the *outward-snapped* bbox, so we gate a bit
// lower (snapping adds up to ~0.5°). Crucially the "zoom in" hint uses the SAME
// gate as the fetch, so there's no dead band where neither contours nor the
// hint show (the old bug: zoom ≥ 9 but span > 3° → server returned nothing and
// the hint, keyed only on zoom, stayed hidden).
const CONTOUR_MAX_SPAN_DEG = 2.5;
const SNAP_DEG = 0.25; // must match the server's SNAP_DEG
const LABEL_SPACING_PX = 130;
const LABEL_START_PX = 40;
const MAX_LABELS = 500;
const LOADING_NOTIFY_DELAY_MS = 350;
// Auto-dismiss the "tap to download" nudges (online / no-data) after a few seconds
// so they don't linger on screen (they re-show when a new relevant region loads).
const ONLINE_NOTE_TTL_MS = 10000;

// Blue ramp: shallow = light, deep = dark. Used for both line and labels.
function depthColor(d: number): string {
  if (d <= 2) return '#7fd4f5';
  if (d <= 5) return '#39b6e6';
  if (d <= 10) return '#1f97d2';
  if (d <= 20) return '#1675b4';
  if (d <= 50) return '#115d96';
  if (d <= 100) return '#0d497a';
  return '#0a3a62';
}

// Mix a hex colour toward white by fraction t (0..1). Used for labels: a
// lightened tint of the line colour stays readable (with the dark halo) on both
// light and dark bases while remaining depth-graded.
function lighten(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// Canvas is drawn larger than the viewport by this fraction on each side, so
// panning reveals already-drawn area instead of blank edges until moveend.
// Kept modest: the clearRect + line/label rasterization each redraw scale with
// canvas area (∝ (1+2·PAD)²), and moveend now fires directly (no debounce), so a
// big buffer isn't needed. 0.4 → 1.8× viewport per axis (~3.2× area) vs 6.25×.
const CANVAS_PAD = 0.4;
// Cap the backing-store resolution so a big padded canvas on a HiDPI screen
// doesn't balloon memory (thin lines + small text stay crisp enough at 2×).
const MAX_DPR = 2;

function snapKey(b: L.LatLngBounds): string {
  const q = SNAP_DEG;
  const w = Math.floor(b.getWest() / q) * q;
  const s = Math.floor(b.getSouth() / q) * q;
  const e = Math.ceil(b.getEast() / q) * q;
  const n = Math.ceil(b.getNorth() / q) * q;
  return `${w.toFixed(2)},${s.toFixed(2)},${e.toFixed(2)},${n.toFixed(2)}`;
}

/**
 * Custom Leaflet canvas layer that draws the contour lines and their labels.
 * Typed loosely (Leaflet's extend isn't TS-friendly), like BufferedTileLayer.
 */
const DepthCanvasLayer = (L.Layer as any).extend({
  _data: null as DepthContours | null,
  // Per-zoom projection cache. Re-projecting every contour vertex on every
  // moveend (including the follow-GPS recenter storm) was the redraw hot path.
  // project() depends only on zoom, so cache it and re-project only on a zoom
  // change; pans/recenters then become a single per-redraw offset add.
  _proj: null as null | Array<{ depth: number; lineColor: string; labelColor: string; pts: { x: number; y: number }[] }>,
  _projZoom: null as number | null,

  onAdd(map: L.Map) {
    this._map = map;
    const canvas = L.DomUtil.create('canvas', 'leaflet-layer leaflet-depth-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    this._canvas = canvas;
    // Stack depth between the base map and the Seekarte: in tilePane the base
    // layer has no explicit z-index (stacks at 0) and the seamap overlay tiles
    // use z-index 10+ (see ChartView), so 5 puts contours above the imagery but
    // below the nautical chart. tilePane (not overlayPane) also keeps depth
    // under routes/markers/weather, where chart annotations belong.
    canvas.style.zIndex = '5';
    map.getPanes().tilePane.appendChild(canvas);
    map.on('moveend', this._reset, this);
    map.on('zoomend', this._reset, this);
    map.on('resize', this._reset, this);
    if (map.options.zoomAnimation && (L.Browser as any).any3d) {
      map.on('zoomanim', this._animateZoom, this);
    }
    this._reset();
  },

  onRemove(map: L.Map) {
    const c = this._canvas as HTMLCanvasElement | undefined;
    if (c && c.parentNode) c.parentNode.removeChild(c);
    map.off('moveend', this._reset, this);
    map.off('zoomend', this._reset, this);
    map.off('resize', this._reset, this);
    map.off('zoomanim', this._animateZoom, this);
  },

  setData(data: DepthContours | null) {
    this._data = data;
    this._proj = null; // new data → invalidate projection cache
    this._redraw();
    return this;
  },

  _animateZoom(e: any) {
    const map = this._map as any;
    const scale = map.getZoomScale(e.zoom);
    // Position the canvas's (padded) top-left for the animation's target
    // zoom/center so the contours scale in place rather than shifting.
    const tlLatLng = map.containerPointToLatLng([-(this._padX || 0), -(this._padY || 0)]);
    const offset = map._latLngToNewLayerPoint(tlLatLng, e.zoom, e.center);
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  _reset() {
    const map = this._map as L.Map;
    const size = map.getSize();
    const padX = Math.round(size.x * CANVAS_PAD);
    const padY = Math.round(size.y * CANVAS_PAD);
    this._padX = padX;
    this._padY = padY;
    const cssW = size.x + 2 * padX;
    const cssH = size.y + 2 * padY;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const c = this._canvas as HTMLCanvasElement;
    if (c.width !== cssW * dpr || c.height !== cssH * dpr) {
      c.width = cssW * dpr;
      c.height = cssH * dpr;
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    // Position the (padded) canvas so its top-left is padX/padY above-left of
    // the viewport's top-left.
    const topLeft = map.containerPointToLayerPoint([-padX, -padY]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._redraw();
  },

  _redraw() {
    const map = this._map as L.Map | undefined;
    if (!map) return;
    const c = this._canvas as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const size = map.getSize();
    const padX = (this._padX as number) || 0;
    const padY = (this._padY as number) || 0;
    const cssW = size.x + 2 * padX;
    const cssH = size.y + 2 * padY;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = this._data as DepthContours | null;
    if (!data) return;

    // (Re)build the per-zoom projection cache. project() is zoom-only, so this
    // runs once per zoom change (or new data) instead of every moveend.
    const zoom = map.getZoom();
    if (!this._proj || this._projZoom !== zoom) {
      this._proj = data.features.map((feature) => {
        const lineColor = depthColor(feature.properties.depth);
        const coords = feature.geometry?.coordinates || [];
        return {
          depth: feature.properties.depth,
          lineColor,
          // Label colour: a lightened tint of the line colour — readable
          // everywhere (with the dark halo) yet still depth-graded.
          labelColor: lighten(lineColor, 0.55),
          pts: coords.map(([lon, lat]) => {
            const p = map.project([lat, lon], zoom);
            return { x: p.x, y: p.y };
          }),
        };
      });
      this._projZoom = zoom;
    }

    // Cached pts are absolute pixel coords at this zoom; convert to canvas coords
    // with one offset per redraw (canvas pixel = layerPoint − canvasTopLeft).
    // This matches the old latLngToContainerPoint()+pad result but skips the
    // per-vertex projection on pans/recenters.
    const origin = map.getPixelOrigin();
    const tl = map.containerPointToLayerPoint([-padX, -padY]);
    const offX = -origin.x - tl.x;
    const offY = -origin.y - tl.y;

    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Cull/label against the full padded canvas (with a small margin) so the
    // label budget is spent on what's visible (incl. the panning margin) rather
    // than long off-screen contours.
    const M = 40;
    const inView = (x: number, y: number) => x >= -M && x <= cssW + M && y >= -M && y <= cssH + M;

    let labelCount = 0;
    const drawLabel = (px: number, py: number, angle: number, text: string, col: string) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = col;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      labelCount++;
    };

    for (const feature of this._proj) {
      const projPts = feature.pts;
      if (projPts.length < 2) continue;
      const depth = feature.depth;
      const lineColor = feature.lineColor;
      const labelColor = feature.labelColor;

      // Cached projection → canvas coords: one add per vertex, no re-projection.
      const pts = new Array<{ x: number; y: number }>(projPts.length);
      for (let i = 0; i < projPts.length; i++) {
        pts[i] = { x: projPts[i].x + offX, y: projPts[i].y + offY };
      }

      // Cull contours whose bbox doesn't intersect the padded canvas.
      let minx = Infinity;
      let miny = Infinity;
      let maxx = -Infinity;
      let maxy = -Infinity;
      for (const p of pts) {
        if (p.x < minx) minx = p.x;
        if (p.x > maxx) maxx = p.x;
        if (p.y < miny) miny = p.y;
        if (p.y > maxy) maxy = p.y;
      }
      if (maxx < -M || minx > cssW + M || maxy < -M || miny > cssH + M) continue;

      // Line — dark casing first (keeps light shallow contours visible over the
      // street map's light-blue water), then the coloured line on top.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = lineColor;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (labelCount >= MAX_LABELS) continue;

      // Labels along the line at fixed pixel spacing, rotated to follow it.
      // Only in-view points get a label (and count toward the budget); acc still
      // advances across off-screen stretches so spacing stays even.
      const label = String(depth);
      let placedInView = 0;
      let acc = LABEL_START_PX;
      for (let i = 0; i < pts.length - 1 && labelCount < MAX_LABELS; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const seg = Math.hypot(dx, dy);
        while (acc <= seg && labelCount < MAX_LABELS) {
          const t = seg > 0 ? acc / seg : 0;
          const px = a.x + dx * t;
          const py = a.y + dy * t;
          if (inView(px, py)) {
            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI / 2) angle -= Math.PI;
            else if (angle < -Math.PI / 2) angle += Math.PI;
            drawLabel(px, py, angle, label, labelColor);
            placedInView++;
          }
          acc += LABEL_SPACING_PX;
        }
        acc -= seg;
      }
      // Short visible contours still get one label at their midpoint.
      if (placedInView === 0 && labelCount < MAX_LABELS) {
        const m = Math.floor(pts.length / 2);
        const a = pts[Math.max(0, m - 1)];
        const b = pts[Math.min(pts.length - 1, m)];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (inView(mx, my)) {
          let angle = Math.atan2(b.y - a.y, b.x - a.x);
          if (angle > Math.PI / 2) angle -= Math.PI;
          else if (angle < -Math.PI / 2) angle += Math.PI;
          drawLabel(mx, my, angle, label, labelColor);
        }
      }
    }
  },
});

interface DepthContourLayerProps {
  /** Translated notification texts (kept in a ref so the layer effect is stable). */
  labels: {
    loading: string;   // "Loading depth…" (brief, for downloaded areas)
    online: string;    // "Loading depth online — tap to download for faster loading" (the single online note)
    noData: string;    // "No depth data for this area — tap to download"
    zoomHint: string;  // "Zoom in for depth contours"
  };
  /** Open Settings → Downloads; wired to the tap action of the status notes. */
  onRequestDownload?: () => void;
}

export const DepthContourLayer = ({ labels, onRequestDownload }: DepthContourLayerProps) => {
  const map = useMap();
  const { pushNotification, clearNotification, updateNotification } = useAlerts();
  const setLayerLoading = useLayerLoading();

  // Keep the latest labels / callback in refs so the layer effect doesn't tear
  // down and re-add the canvas layer when they change identity each render.
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const onRequestDownloadRef = useRef(onRequestDownload);
  onRequestDownloadRef.current = onRequestDownload;

  useEffect(() => {
    const layer = new DepthCanvasLayer();
    layer.addTo(map);

    let abort: AbortController | null = null;
    let disposed = false;
    let lastKey: string | null = null;     // region of the last successful load
    let inflightKey: string | null = null; // region currently being fetched

    const download = () => onRequestDownloadRef.current?.();

    // ONE depth-status note, updated in place (never stacked): it morphs
    // loading → online / no-data as the request resolves, so the user only ever
    // sees a single notification. Tappable (→ Downloads) when withDownload.
    let statusId: string | null = null;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStatusTimer = () => {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    };
    const setStatus = (message: string, withDownload: boolean) => {
      const onClick = withDownload ? download : undefined;
      if (statusId) updateNotification(statusId, { message, onClick });
      else statusId = pushNotification({ message, severity: 'info', tone: 'none', onClick });
      clearStatusTimer();
      // The "tap to download" nudges (online / no-data) auto-dismiss after a few
      // seconds (and reset statusId so they re-show on the next relevant region).
      // The plain "loading…" note has no timer — it clears when the load resolves.
      if (withDownload) {
        statusTimer = setTimeout(() => {
          if (statusId) { clearNotification(statusId); statusId = null; }
          statusTimer = null;
        }, ONLINE_NOTE_TTL_MS);
      }
    };
    const clearStatus = () => {
      clearStatusTimer();
      if (statusId) { clearNotification(statusId); statusId = null; }
    };

    // Loading goes through the shared per-chart channel so multiple active
    // layers show one combined note instead of stacking near-identical ones.
    const showLoading = () => setLayerLoading('depth', labelsRef.current.loading);
    const clearLoading = () => setLayerLoading('depth', null);

    // "Zoom in for depth contours" — same info-notification styling.
    let zoomHintId: string | null = null;
    const showZoomHint = () => {
      if (!zoomHintId) zoomHintId = pushNotification({ message: labelsRef.current.zoomHint, severity: 'info', tone: 'none' });
    };
    const hideZoomHint = () => {
      if (zoomHintId) { clearNotification(zoomHintId); zoomHintId = null; }
    };

    const refresh = async () => {
      if (disposed) return;
      // "Too far out" for contours: zoom below the gate, OR the view spans more
      // than the server will contour. The hint uses this SAME condition as the
      // fetch below, so the two are complementary — no zoom level shows neither.
      const vb = map.getBounds();
      const tooFarOut =
        map.getZoom() < DEPTH_MIN_ZOOM ||
        vb.getEast() - vb.getWest() > CONTOUR_MAX_SPAN_DEG ||
        vb.getNorth() - vb.getSouth() > CONTOUR_MAX_SPAN_DEG;
      if (tooFarOut) {
        layer.setData(null);
        lastKey = null;
        inflightKey = null;
        clearStatus();
        clearLoading();
        showZoomHint();
        return;
      }
      hideZoomHint();
      const key = snapKey(map.getBounds());
      // Already showing this region, or already fetching it. The inflight guard
      // is what keeps a direct (un-debounced) call on every moveend/zoomend
      // cheap: a follow-GPS setView storm and the zoomend+moveend pair just
      // early-return here instead of restarting the fetch.
      if (key === lastKey || key === inflightKey) return;

      abort?.abort();
      abort = new AbortController();
      const myAbort = abort;
      inflightKey = key;

      const b = map.getBounds();
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };

      // Up-front coverage check so we can tell the user immediately when a region
      // is being fetched online (slower) rather than from downloaded tiles (fast).
      let local: boolean | null = null;
      try {
        local = (await depthAPI.getCoverage(bbox, myAbort.signal)).data.local !== false;
      } catch (err) {
        if (axios.isCancel(err)) return; // superseded — the newer fetch owns inflightKey
        local = null; // unknown (pre-check failed)
      }
      if (disposed || myAbort !== abort) return;

      // Drive the single status note: online areas say so right away (and stay
      // saying it after the fast GEBCO load); local areas get a brief generic
      // note only if the load isn't near-instant.
      let notifyTimer: ReturnType<typeof setTimeout> | null = null;
      if (local === false) {
        setStatus(labelsRef.current.online, true);
      } else {
        notifyTimer = setTimeout(() => {
          if (!disposed && myAbort === abort && !statusId) showLoading();
        }, LOADING_NOTIFY_DELAY_MS);
      }

      try {
        const res = await depthAPI.getContours(bbox, myAbort.signal);
        if (disposed) return;
        if (notifyTimer) clearTimeout(notifyTimer);
        if (myAbort === abort) inflightKey = null;
        clearLoading();
        layer.setData(res.data);
        const source = res.data.source ?? 'local';
        if (source === 'none') {
          // No data (e.g. offline + un-downloaded, or the GEBCO read failed) —
          // keep a tappable nudge. Don't cache the key, so a move after
          // downloading a pack re-fetches and the contours appear.
          lastKey = null;
          setStatus(labelsRef.current.noData, true);
        } else {
          // local OR online both loaded fine — the note was only a loading
          // indicator, so clear it now the contours are drawn (online is cached
          // like local to avoid refetch spam). This is why the "loading online"
          // note disappears once the fetch completes.
          lastKey = key;
          clearStatus();
        }
      } catch (err) {
        if (notifyTimer) clearTimeout(notifyTimer);
        if (axios.isCancel(err)) return; // superseded — the newer fetch owns inflightKey
        if (myAbort === abort) inflightKey = null;
        // Leave any current note as-is; a move will retry.
      }
    };

    // Fire directly (not debounced). A trailing debounce gets perpetually reset
    // by the follow-GPS setView storm (MapController re-centres on every GPS
    // tick → moveend), so it would never fire while following the boat — the
    // bug where depth only loaded after a manual pan disabled follow-GPS. The
    // snapped-key / inflight guards above make each direct call cheap.
    // (See project_weather_overlay_recenter for the same lesson.)
    map.on('moveend', refresh);
    map.on('zoomend', refresh);
    refresh();

    return () => {
      disposed = true;
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
      abort?.abort();
      clearStatus();
      clearLoading();
      hideZoomHint();
      map.removeLayer(layer);
    };
  }, [map, pushNotification, clearNotification, updateNotification, setLayerLoading]);

  return null;
};
