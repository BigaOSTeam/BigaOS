import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { depthAPI, DepthContours } from '../../../services/api';
import { useAlerts } from '../../../context/AlertContext';

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
const DEBOUNCE_MS = 450;
const SNAP_DEG = 0.25; // must match the server's SNAP_DEG
const LABEL_SPACING_PX = 130;
const LABEL_START_PX = 40;
const MAX_LABELS = 500;
const LOADING_NOTIFY_DELAY_MS = 350;

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
// Cost is ~quadratic in canvas memory only — contours are sparse vector data
// redrawn on moveend (not per frame) and culled to the canvas, so CPU is flat.
const CANVAS_PAD = 0.75;
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

    for (const feature of data.features) {
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const depth = feature.properties.depth;
      const lineColor = depthColor(depth);
      // Label colour: a lightened tint of the line colour — readable everywhere
      // (with the dark halo) yet still depth-graded so it ties to its contour.
      const labelColor = lighten(lineColor, 0.55);

      // Canvas coords = container point + padding offset.
      const pts = coords.map(([lon, lat]) => {
        const p = map.latLngToContainerPoint([lat, lon]);
        return { x: p.x + padX, y: p.y + padY };
      });

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
  /** Translated "Loading depth…" text for the loading notification. */
  loadingLabel: string;
}

export const DepthContourLayer = ({ loadingLabel }: DepthContourLayerProps) => {
  const map = useMap();
  const { pushNotification, clearNotification } = useAlerts();

  useEffect(() => {
    const layer = new DepthCanvasLayer();
    layer.addTo(map);

    let abort: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let lastKey: string | null = null;

    let loadingNotifId: string | null = null;
    const showLoading = () => {
      if (loadingNotifId) return;
      loadingNotifId = pushNotification({ message: loadingLabel, severity: 'info', tone: 'none' });
    };
    const hideLoading = () => {
      if (loadingNotifId) {
        clearNotification(loadingNotifId);
        loadingNotifId = null;
      }
    };

    const refresh = async () => {
      if (disposed) return;
      if (map.getZoom() < DEPTH_MIN_ZOOM) {
        layer.setData(null);
        lastKey = null;
        hideLoading();
        return;
      }
      const key = snapKey(map.getBounds());
      if (key === lastKey) return; // same region; the canvas reprojects itself

      abort?.abort();
      abort = new AbortController();
      const myAbort = abort;
      const notifyTimer = setTimeout(() => {
        if (!disposed && myAbort === abort) showLoading();
      }, LOADING_NOTIFY_DELAY_MS);

      try {
        const b = map.getBounds();
        const res = await depthAPI.getContours(
          { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
          myAbort.signal
        );
        if (disposed) return;
        clearTimeout(notifyTimer);
        hideLoading();
        lastKey = key;
        layer.setData(res.data);
      } catch (err) {
        clearTimeout(notifyTimer);
        if (axios.isCancel(err)) return;
        if (!disposed && myAbort === abort) hideLoading();
      }
    };

    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    };

    map.on('moveend', debounced);
    map.on('zoomend', debounced);
    refresh();

    return () => {
      disposed = true;
      map.off('moveend', debounced);
      map.off('zoomend', debounced);
      if (timer) clearTimeout(timer);
      abort?.abort();
      hideLoading();
      map.removeLayer(layer);
    };
  }, [map, loadingLabel, pushNotification, clearNotification]);

  return null;
};
