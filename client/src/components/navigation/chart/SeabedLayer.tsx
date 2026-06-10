import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { seabedAPI, SeabedFeature, SeabedHolding } from '../../../services/api';
import { useAlerts } from '../../../context/AlertContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLayerLoading } from './LayerLoadingContext';

/**
 * Seabed Composition (anchoring) overlay — EMODnet seabed substrate (EUSeaMap Folk
 * classes) + Posidonia beds, drawn as **clustered themed glyphs** scattered across
 * each substrate area (sand = amber grains, mud = brown ripple, rock = grey rock,
 * seagrass = green weed, …). A chart-style read of "what's on the bottom" at a
 * glance, rather than a flat colour fill.
 *
 * Rendering is a single custom canvas layer (same scaffolding as DepthContourLayer):
 * polygons are projected once per zoom; on each redraw we scatter glyphs on a
 * world-anchored pixel grid clipped to each polygon (point-in-polygon, holes
 * respected) so the icons stay put when panning and only reflow on zoom.
 *
 * Data fetching mirrors the heritage/depth overlays: the server snaps bboxes to a
 * grid, we refetch only when the snapped region changes, gate on zoom/span, and show
 * a self-dismissing "online — tap to download" nudge when served from the live WFS.
 *
 * Tap a substrate area (when no map-tap tool is active) to see its exact substrate,
 * advisory holding quality, and any sensitivity/protection note.
 */

export const SEABED_MIN_ZOOM = 10;
// Max viewport span (degrees) we'll request. The server refuses spans > 2.0° on the
// outward-snapped bbox; snapping (0.25°) can add up to ~0.5°, so gate below that.
const SEABED_MAX_SPAN_DEG = 1.5;
const SNAP_DEG = 0.25; // must match the server's SNAP_DEG
const LOADING_NOTIFY_DELAY_MS = 350;
// Auto-dismiss the "loading online — tap to download" nudge after a few seconds so
// it doesn't linger on screen (it re-shows when a new online region loads).
const ONLINE_NOTE_TTL_MS = 10000;

// Glyph scatter: on-screen spacing (px) between candidate glyph slots, glyph half-
// size (px), and a safety cap on glyphs drawn per redraw.
const GRID_PX = 30;
const GLYPH_S = 5;
// Nudge each glyph off its lattice point by up to ±JITTER_FRAC/2 of a cell, so the
// grid reads as organised but not mechanical. 0 = perfect grid, 1 = fully random.
const JITTER_FRAC = 0.5;
// Per-pass glyph budgets. Substrate and seagrass are drawn in separate passes (each
// with its own cap) so a dense substrate area can't starve the seagrass pass — and
// seagrass is drawn second, on top, since it's the higher-priority anchoring signal.
const SUBSTRATE_GLYPH_CAP = 5000;
const SEAGRASS_GLYPH_CAP = 5000;
// Canvas drawn larger than the viewport so a pan reveals already-drawn glyphs.
const CANVAS_PAD = 0.4;
const MAX_DPR = 2;

// Saturated icon colours (read on any base map; the polygon fills are gone now).
const GLYPH_COLORS: Record<string, string> = {
  sand: '#e8c34d',
  muddy_sand: '#cfa85a',
  mud: '#9c6b3f',
  coarse: '#aab0b6',
  coarse_mixed: '#aab0b6',
  mixed: '#aab0b6',
  rock: '#7b828b',
  worm_reef: '#a564c4',
  seagrass: '#36c46f',
  sediment: '#9aa0a6',
  unknown: '#9aa0a6',
};
const glyphColor = (key: string) => GLYPH_COLORS[key] ?? GLYPH_COLORS.unknown;

const HOLDING_COLORS: Record<SeabedHolding, string> = {
  good: '#43a047',
  moderate: '#f9a825',
  poor: '#e53935',
  unknown: '#9e9e9e',
};

const KEY_ORDER = ['sand', 'muddy_sand', 'mud', 'coarse', 'coarse_mixed', 'mixed', 'rock', 'worm_reef', 'seagrass', 'sediment', 'unknown'];

const subsName = (key: string, t: (k: string) => string) => t(`seabed.subs_${key}`);
const holdingLabel = (h: SeabedHolding, t: (k: string) => string) => t(`seabed.holding_${h}`);

// EMODnet's substrate labels are inconsistently cased across regions ("Fine mud" in
// one tile, "SAND" in another). Sentence-case all-caps labels for display so the tap
// card doesn't shout; leave already-mixed-case labels untouched.
const prettySubstrate = (raw?: string): string | undefined => {
  if (!raw) return raw;
  return raw === raw.toUpperCase() ? raw.charAt(0) + raw.slice(1).toLowerCase() : raw;
};

function snapKey(b: L.LatLngBounds): string {
  const q = SNAP_DEG;
  const w = Math.floor(b.getWest() / q) * q;
  const s = Math.floor(b.getSouth() / q) * q;
  const e = Math.ceil(b.getEast() / q) * q;
  const n = Math.ceil(b.getNorth() / q) * q;
  return `${w.toFixed(2)},${s.toFixed(2)},${e.toFixed(2)},${n.toFixed(2)}`;
}

// ---- glyph drawing -----------------------------------------------------------

/** Draw the themed glyph for a substrate key, centred at (x, y). Caller sets any
 *  shadow/halo on the context beforehand. */
function drawGlyph(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, s = GLYPH_S): void {
  const color = glyphColor(key);
  switch (key) {
    case 'seagrass':
      drawWeed(ctx, x, y, s, color);
      break;
    case 'sand':
      drawDots(ctx, x, y, s, color, 4);
      break;
    case 'muddy_sand':
      drawDots(ctx, x, y, s, color, 3);
      break;
    case 'mud':
      drawRipple(ctx, x, y, s, color);
      break;
    case 'coarse':
    case 'coarse_mixed':
    case 'mixed':
      drawPebbles(ctx, x, y, s, color);
      break;
    case 'rock':
      drawRock(ctx, x, y, s, color);
      break;
    case 'worm_reef':
      drawWorm(ctx, x, y, s, color);
      break;
    default:
      drawSingle(ctx, x, y, color);
  }
}

function drawWeed(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const base = y + s;
  ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 1.5, y, x, y - s * 0.9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x - s * 1.1, y, x - s * 0.7, y - s * 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + s * 1.1, y, x + s * 0.8, y - s * 0.5); ctx.stroke();
}

function drawDots(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, n: number) {
  ctx.fillStyle = color;
  const pts: [number, number][] = [[0, 0], [-s * 0.85, s * 0.5], [s * 0.85, s * 0.4], [0, -s * 0.75]];
  for (let i = 0; i < n && i < pts.length; i++) {
    ctx.beginPath();
    ctx.arc(x + pts[i][0], y + pts[i][1], 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRipple(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.8, x, y);
  ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.8, x + s, y);
  ctx.stroke();
}

function drawPebbles(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.6;
  const c: [number, number, number][] = [[-s * 0.6, s * 0.2, s * 0.7], [s * 0.7, -s * 0.1, s * 0.6], [0, -s * 0.6, s * 0.5]];
  for (const [dx, dy, r] of c) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - s, y + s * 0.6);
  ctx.lineTo(x - s * 0.5, y - s * 0.5);
  ctx.lineTo(x + s * 0.3, y - s);
  ctx.lineTo(x + s, y + s * 0.2);
  ctx.lineTo(x + s * 0.4, y + s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // facet highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.5);
  ctx.lineTo(x + s * 0.1, y + s * 0.1);
  ctx.stroke();
}

function drawWorm(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (const dx of [-s * 0.7, 0, s * 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + s);
    ctx.quadraticCurveTo(x + dx + 1, y, x + dx, y - s * 0.8);
    ctx.stroke();
  }
}

function drawSingle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

// Small data-URL icon per key for the legend (drawn once, cached).
const glyphIconCache: Record<string, string> = {};
function glyphDataUrl(key: string): string {
  if (glyphIconCache[key]) return glyphIconCache[key];
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = 18;
  const ctx = c.getContext('2d');
  if (ctx) drawGlyph(ctx, key, 9, 9, 5);
  const url = c.toDataURL();
  glyphIconCache[key] = url;
  return url;
}

// ---- point-in-polygon (geographic, for tap) ----------------------------------

function pipRings(lon: number, lat: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
    }
  }
  return inside;
}

function featureContains(f: SeabedFeature, lon: number, lat: number): boolean {
  const g = f.geometry;
  if (g.type === 'Polygon') return pipRings(lon, lat, g.coordinates as number[][][]);
  if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates as number[][][][]) if (pipRings(lon, lat, poly)) return true;
  }
  return false;
}

/** Topmost substrate feature under a tap; prefer seagrass (the notable case). */
function findFeatureAt(features: SeabedFeature[], lon: number, lat: number): SeabedFeature | null {
  let hit: SeabedFeature | null = null;
  for (const f of features) {
    if (featureContains(f, lon, lat)) {
      if (f.properties.kind === 'seagrass') return f;
      if (!hit) hit = f;
    }
  }
  return hit;
}

// Stable per-cell pseudo-random offsets in [0,1) (hash of the integer cell), so the
// small jitter is deterministic — glyphs don't swim when panning at the same zoom.
function jitter(cx: number, cy: number): [number, number] {
  let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return [(h & 1023) / 1024, ((h >>> 10) & 1023) / 1024];
}

// ---- custom canvas layer (scatters glyphs over polygon interiors) ------------

type ProjPoly = { rings: { x: number[]; y: number[] }[]; bbox: [number, number, number, number] };
type ProjFeature = { key: string; polys: ProjPoly[] };

const SeabedCanvasLayer = (L.Layer as any).extend({
  _data: [] as SeabedFeature[],
  _proj: null as ProjFeature[] | null,
  _projZoom: null as number | null,

  onAdd(map: L.Map) {
    this._map = map;
    const canvas = L.DomUtil.create('canvas', 'leaflet-layer leaflet-seabed-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    // tilePane, just under the depth contours (z 5) and the Seekarte (z 10+),
    // above the base imagery, and below routes/markers (overlayPane).
    canvas.style.zIndex = '4';
    this._canvas = canvas;
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

  setData(features: SeabedFeature[]) {
    this._data = features || [];
    this._proj = null;
    this._redraw();
    return this;
  },

  _animateZoom(e: any) {
    const map = this._map as any;
    const scale = map.getZoomScale(e.zoom);
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

    const data = this._data as SeabedFeature[];
    if (!data || data.length === 0) return;

    const zoom = map.getZoom();
    if (!this._proj || this._projZoom !== zoom) {
      this._proj = data.map((f) => {
        const polysIn: number[][][][] = f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates as number[][][]]
          : (f.geometry.coordinates as number[][][][]);
        const polys: ProjPoly[] = [];
        for (const rings of polysIn) {
          const pr: { x: number[]; y: number[] }[] = [];
          let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
          rings.forEach((ring, ri) => {
            const xs: number[] = [];
            const ys: number[] = [];
            for (const [lon, lat] of ring) {
              const p = map.project([lat, lon], zoom);
              xs.push(p.x);
              ys.push(p.y);
              if (ri === 0) {
                if (p.x < minx) minx = p.x;
                if (p.x > maxx) maxx = p.x;
                if (p.y < miny) miny = p.y;
                if (p.y > maxy) maxy = p.y;
              }
            }
            pr.push({ x: xs, y: ys });
          });
          polys.push({ rings: pr, bbox: [minx, miny, maxx, maxy] });
        }
        return { key: f.properties.substrateKey || 'unknown', polys };
      });
      this._projZoom = zoom;
    }

    const origin = map.getPixelOrigin();
    const tl = map.containerPointToLayerPoint([-padX, -padY]);
    const offX = -origin.x - tl.x;
    const offY = -origin.y - tl.y;
    // Visible world-pixel range (canvas pixel = world + off).
    const visMinX = -offX, visMaxX = cssW - offX;
    const visMinY = -offY, visMaxY = cssH - offY;

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 2;
    ctx.lineJoin = 'round';

    // Scatter one kind of feature (substrate vs seagrass) up to its budget. Glyphs
    // sit on a clean world-anchored lattice (multiples of GRID_PX) — no jitter — so
    // they read as an organised grid rather than random speckle.
    const drawList = (wantSeagrass: boolean, cap: number) => {
      let count = 0;
      for (const feat of this._proj as ProjFeature[]) {
        if ((feat.key === 'seagrass') !== wantSeagrass) continue;
        for (const poly of feat.polys) {
          const [pminx, pminy, pmaxx, pmaxy] = poly.bbox;
          const x0 = Math.max(pminx, visMinX);
          const y0 = Math.max(pminy, visMinY);
          const x1 = Math.min(pmaxx, visMaxX);
          const y1 = Math.min(pmaxy, visMaxY);
          if (x1 < x0 || y1 < y0) continue;
          let polyCount = 0;
          for (let gx = Math.ceil(x0 / GRID_PX) * GRID_PX; gx <= x1; gx += GRID_PX) {
            for (let gy = Math.ceil(y0 / GRID_PX) * GRID_PX; gy <= y1; gy += GRID_PX) {
              // small, stable jitter around the lattice point
              const [jx, jy] = jitter(Math.round(gx / GRID_PX), Math.round(gy / GRID_PX));
              const wx = gx + (jx - 0.5) * GRID_PX * JITTER_FRAC;
              const wy = gy + (jy - 0.5) * GRID_PX * JITTER_FRAC;
              if (!pipPx(wx, wy, poly.rings)) continue;
              const px = wx + offX;
              const py = wy + offY;
              if (px < -8 || px > cssW + 8 || py < -8 || py > cssH + 8) continue;
              drawGlyph(ctx, feat.key, px, py);
              polyCount++;
              if (++count >= cap) return;
            }
          }
          // Tiny polygons can fall between grid points; guarantee one glyph each.
          if (polyCount === 0) {
            const px = (pminx + pmaxx) / 2 + offX;
            const py = (pminy + pmaxy) / 2 + offY;
            if (px >= -8 && px <= cssW + 8 && py >= -8 && py <= cssH + 8) {
              drawGlyph(ctx, feat.key, px, py);
              if (++count >= cap) return;
            }
          }
        }
      }
    };
    drawList(false, SUBSTRATE_GLYPH_CAP); // substrate underneath
    drawList(true, SEAGRASS_GLYPH_CAP);   // seagrass on top (priority signal)
    ctx.shadowBlur = 0;
  },
});

// point-in-polygon over projected (pixel) rings, even-odd (holes respected).
function pipPx(px: number, py: number, rings: { x: number[]; y: number[] }[]): boolean {
  let inside = false;
  for (const r of rings) {
    const xs = r.x, ys = r.y, n = xs.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = xs[i], yi = ys[i], xj = xs[j], yj = ys[j];
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
  }
  return inside;
}

// ---- detail dialog -----------------------------------------------------------

const SeabedDetailDialog = ({ feature, onClose }: { feature: SeabedFeature; onClose: () => void }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const p = feature.properties;
  const accent = glyphColor(p.substrateKey);
  // Title = translated class name (so it's German in DE, not the raw English EMODnet
  // label). For seagrass, show the Latin species (language-neutral) as a subtitle.
  const title = subsName(p.substrateKey, t);
  const species = p.kind === 'seagrass' ? prettySubstrate(p.substrate) : undefined;

  return createPortal(
    <>
      <div
        onClick={(e) => { if (e.detail === 1) onClose(); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000 }}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: theme.colors.bgSecondary, border: `1px solid ${theme.colors.borderDashed}`,
          borderRadius: '8px', padding: '1.25rem', zIndex: 2001, width: '360px', maxWidth: '92vw',
          maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <button
          onClick={onClose}
          className="touch-btn"
          style={{
            position: 'absolute', top: '0.6rem', right: '0.6rem', width: '36px', height: '36px',
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <img src={glyphDataUrl(p.substrateKey)} width={18} height={18} alt="" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '0.04em', textTransform: 'uppercase', color: accent }}>
            {p.kind === 'seagrass' ? t('seabed.kind_seagrass') : t('seabed.kind_substrate')}
          </span>
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: species ? '0.2rem' : '0.75rem', paddingRight: '2rem' }}>
          {title}
        </div>
        {species && (
          <div style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.7, color: theme.colors.textPrimary, marginBottom: '0.75rem' }}>
            {species}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.95rem', marginBottom: '0.6rem' }}>
          <span style={{ opacity: 0.6 }}>{t('seabed.holding')}</span>
          <span style={{ fontWeight: 'bold', color: HOLDING_COLORS[p.holding] }}>{holdingLabel(p.holding, t)}</span>
        </div>

        {p.country && (
          <div style={{ fontSize: '0.85rem', opacity: 0.75, marginBottom: '0.5rem' }}>
            {t('heritage.country')}: {p.country}
          </div>
        )}

        {(p.protected || p.sensitive) && (
          <div
            style={{
              fontSize: '0.85rem', lineHeight: 1.5, color: theme.colors.textPrimary,
              background: 'rgba(46,158,143,0.12)', border: '1px solid rgba(46,158,143,0.4)',
              borderRadius: '6px', padding: '0.6rem 0.7rem', marginTop: '0.4rem',
            }}
          >
            {p.protected
              ? t('seabed.note_posidonia')
              : p.kind === 'seagrass'
                ? t('seabed.note_seagrass')
                : t('seabed.note_sensitive')}
          </div>
        )}

        <div style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '0.9rem' }}>
          {t('seabed.advisory')}
        </div>
      </div>
    </>,
    document.body
  );
};

interface SeabedLayerProps {
  labels: {
    loading: string;
    online: string;
    zoomHint: string;
  };
  onRequestDownload?: () => void;
  /** Which side the chart sidebar floats on — the legend goes to the opposite
   *  bottom corner so it isn't hidden behind the sidebar (and the attribution). */
  sidebarPosition?: 'left' | 'right';
  /** Tap-to-identify is suppressed while a map-tap tool (ruler/zone/anchor) is
   *  active, so a seabed dialog doesn't pop while the user is placing points. */
  interactive?: boolean;
}

export const SeabedLayer = ({ labels, onRequestDownload, sidebarPosition = 'left', interactive = true }: SeabedLayerProps) => {
  const map = useMap();
  const { pushNotification, clearNotification, updateNotification } = useAlerts();
  const setLayerLoading = useLayerLoading();
  const { t, language } = useLanguage();
  const { theme } = useTheme();

  const [features, setFeatures] = useState<SeabedFeature[]>([]);
  const [selected, setSelected] = useState<SeabedFeature | null>(null);

  const featuresRef = useRef<SeabedFeature[]>([]);
  featuresRef.current = features;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const onRequestDownloadRef = useRef(onRequestDownload);
  onRequestDownloadRef.current = onRequestDownload;

  // Custom canvas layer (created once); fed new data when `features` changes.
  const layerRef = useRef<any>(null);
  useEffect(() => {
    const layer = new (SeabedCanvasLayer as any)();
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);
  useEffect(() => {
    layerRef.current?.setData(features);
  }, [features]);

  // Tap-to-identify: PIP the click against the loaded polygons (gated so it never
  // fights the ruler/zone/anchor map-tap tools). Tapping a marker/route doesn't
  // reach the map 'click', so this only fires on bare substrate taps.
  useEffect(() => {
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!interactiveRef.current) return;
      const hit = findFeatureAt(featuresRef.current, e.latlng.lng, e.latlng.lat);
      if (hit) setSelected(hit);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [map]);

  // ---- data fetch (status note + zoom hint + auto-dismiss) ------------------
  useEffect(() => {
    let abort: AbortController | null = null;
    let disposed = false;
    let lastKey: string | null = null;
    let inflightKey: string | null = null;

    const download = () => onRequestDownloadRef.current?.();

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
    const showLoading = () => setLayerLoading('seabed', labelsRef.current.loading);
    const clearLoading = () => setLayerLoading('seabed', null);

    let zoomHintId: string | null = null;
    const showZoomHint = () => {
      if (!zoomHintId) zoomHintId = pushNotification({ message: labelsRef.current.zoomHint, severity: 'info', tone: 'none' });
    };
    const hideZoomHint = () => {
      if (zoomHintId) { clearNotification(zoomHintId); zoomHintId = null; }
    };

    const refresh = async () => {
      if (disposed) return;
      const vb = map.getBounds();
      const tooFarOut =
        map.getZoom() < SEABED_MIN_ZOOM ||
        vb.getEast() - vb.getWest() > SEABED_MAX_SPAN_DEG ||
        vb.getNorth() - vb.getSouth() > SEABED_MAX_SPAN_DEG;
      if (tooFarOut) {
        setFeatures([]);
        lastKey = null;
        inflightKey = null;
        clearStatus();
        clearLoading();
        showZoomHint();
        return;
      }
      hideZoomHint();

      const key = snapKey(map.getBounds());
      if (key === lastKey || key === inflightKey) return;

      abort?.abort();
      abort = new AbortController();
      const myAbort = abort;
      inflightKey = key;

      const b = map.getBounds();
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };

      const notifyTimer = setTimeout(() => {
        if (!disposed && myAbort === abort && !statusId) showLoading();
      }, LOADING_NOTIFY_DELAY_MS);

      try {
        const res = await seabedAPI.getFeatures(bbox, myAbort.signal);
        if (disposed) return;
        clearTimeout(notifyTimer);
        if (myAbort !== abort) return; // superseded
        inflightKey = null;
        clearLoading();
        const feats = res.data.features ?? [];
        setFeatures(feats);
        const source = res.data.source ?? 'local';
        lastKey = key;
        if (source === 'online' && feats.length > 0) {
          setStatus(labelsRef.current.online, true);
        } else {
          clearStatus();
        }
        if (source === 'none') lastKey = null;
      } catch (err) {
        clearTimeout(notifyTimer);
        if (axios.isCancel(err)) return;
        if (myAbort === abort) inflightKey = null;
      }
    };

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pushNotification, clearNotification, updateNotification, setLayerLoading]);

  // ---- dynamic legend (glyph + name + holding, only classes in view) --------
  const inViewKeys = useMemo(() => {
    const present = new Set(features.map((f) => f.properties.substrateKey));
    return KEY_ORDER.filter((k) => present.has(k));
  }, [features]);

  const legendRef = useRef<L.Control | null>(null);
  useEffect(() => {
    if (inViewKeys.length === 0) {
      if (legendRef.current) { legendRef.current.remove(); legendRef.current = null; }
      return;
    }
    const corner = sidebarPosition === 'left' ? 'bottomright' : 'bottomleft';
    if (!legendRef.current) {
      const ctrl = new L.Control({ position: corner });
      ctrl.onAdd = () => L.DomUtil.create('div', 'seabed-legend');
      ctrl.addTo(map);
      legendRef.current = ctrl;
    } else {
      legendRef.current.setPosition(corner);
    }
    const el = legendRef.current.getContainer();
    if (!el) return;
    el.style.cssText =
      `background:${theme.colors.bgTertiary};border:1px solid ${theme.colors.borderHover};` +
      'border-radius:6px;padding:6px 9px;font-size:11px;line-height:1.7;box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
      'max-width:300px;color:' + theme.colors.textPrimary + ';';
    L.DomEvent.disableClickPropagation(el);
    const title = `<div style="opacity:0.6;margin-bottom:3px;font-weight:bold;">${t('seabed.legend_title')}</div>`;
    const rows = inViewKeys.map((k) => {
      const sample = features.find((f) => f.properties.substrateKey === k);
      const h = sample?.properties.holding ?? 'unknown';
      const icon = `<img src="${glyphDataUrl(k)}" width="15" height="15" style="vertical-align:middle;margin-right:5px;" alt=""/>`;
      // name and holding tag on one line (the row never wraps); the box widens to fit.
      const tag = `<span style="color:${HOLDING_COLORS[h]};opacity:0.9;"> · ${holdingLabel(h, t)}</span>`;
      return `<div style="white-space:nowrap;">${icon}${subsName(k, t)}${tag}</div>`;
    }).join('');
    el.innerHTML = title + rows;
    // language/theme/features/sidebar are intentional deps (legend re-renders on change).
  }, [inViewKeys, features, language, theme, t, map, sidebarPosition]);

  useEffect(() => () => {
    if (legendRef.current) { legendRef.current.remove(); legendRef.current = null; }
  }, []);

  return <>{selected && <SeabedDetailDialog feature={selected} onClose={() => setSelected(null)} />}</>;
};
