import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { seamarksAPI } from '../../../services/api';
import { toPoint, GENERIC, type SeamarkPoint } from './seamark-symbols';

/**
 * Offline seamark overlay — vector buoys, lights, beacons from a downloaded
 * pack, drawn on a single canvas (modeled on DepthContourLayer). It is the
 * offline/vector counterpart of the online OpenSeaMap raster overlay: where a
 * seamark pack covers the view it renders crisp, zoom-independent symbols; where
 * it doesn't (`source: 'none'`) it draws nothing and reports no-coverage so
 * ChartView shows the online raster instead.
 *
 * Symbols are drawn programmatically (colour-coded by the IALA scheme) rather
 * than from an icon sprite — recognisable and dependency-free for v1; a vendored
 * OpenSeaMap SVG sprite can refine them later. Unknown types get a generic
 * diamond + name so a mark is never invisible.
 *
 * Data: © OpenStreetMap contributors / OpenSeaMap. NOT FOR NAVIGATION.
 */

// Don't fetch/draw below this — at ocean zooms the online raster is enough and a
// pack query would return everything. Matches the spirit of the server gating.
const SEAMARK_MIN_ZOOM = 8;
const NAME_MIN_ZOOM = 13;
const LIGHT_MIN_ZOOM = 12;
const SNAP_DEG = 0.25;
const CANVAS_PAD = 0.3;
const MAX_DPR = 2;

function snapKey(b: L.LatLngBounds): string {
  const q = SNAP_DEG;
  const w = Math.floor(b.getWest() / q) * q;
  const s = Math.floor(b.getSouth() / q) * q;
  const e = Math.ceil(b.getEast() / q) * q;
  const n = Math.ceil(b.getNorth() / q) * q;
  return `${w.toFixed(2)},${s.toFixed(2)},${e.toFixed(2)},${n.toFixed(2)}`;
}

const SeamarkCanvasLayer = (L.Layer as any).extend({
  _points: [] as SeamarkPoint[],

  onAdd(map: L.Map) {
    this._map = map;
    const canvas = L.DomUtil.create('canvas', 'leaflet-layer leaflet-seamark-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    // Above the base/pmtiles/depth; where the nautical raster would sit.
    canvas.style.zIndex = '11';
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

  setData(points: SeamarkPoint[]) {
    this._points = points;
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

    const points = this._points as SeamarkPoint[];
    if (!points || points.length === 0) return;

    const zoom = map.getZoom();
    const origin = map.getPixelOrigin();
    const tl = map.containerPointToLayerPoint([-padX, -padY]);
    const offX = -origin.x - tl.x;
    const offY = -origin.y - tl.y;
    const M = 24;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (const pt of points) {
      const proj = map.project([pt.lat, pt.lon], zoom);
      const x = proj.x + offX;
      const y = proj.y + offY;
      if (x < -M || x > cssW + M || y < -M || y > cssH + M) continue;
      this._drawSymbol(ctx, x, y, pt, zoom);
    }
  },

  _drawSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, pt: SeamarkPoint, zoom: number) {
    const r = 6;
    // Light flare behind the mark.
    if (pt.isLight) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r + 6, -Math.PI * 0.42, -Math.PI * 0.08);
      ctx.closePath();
      ctx.fillStyle = 'rgba(208,48,200,0.55)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';

    const colours = pt.colours.length ? pt.colours : [GENERIC];
    const drawPath = () => {
      ctx.beginPath();
      switch (pt.shape) {
        case 'triangle':
          ctx.moveTo(0, -r);
          ctx.lineTo(r, r);
          ctx.lineTo(-r, r);
          ctx.closePath();
          break;
        case 'diamond':
          ctx.moveTo(0, -r);
          ctx.lineTo(r, 0);
          ctx.lineTo(0, r);
          ctx.lineTo(-r, 0);
          ctx.closePath();
          break;
        case 'square':
          ctx.rect(-r, -r, 2 * r, 2 * r);
          break;
        case 'star': {
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI / 4) * i - Math.PI / 2;
            const rr = i % 2 === 0 ? r : r * 0.45;
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          break;
        }
        default: // circle
          ctx.arc(0, 0, r, 0, Math.PI * 2);
      }
    };

    // Fill with the primary colour, then paint horizontal bands for extras.
    drawPath();
    ctx.fillStyle = colours[0];
    ctx.fill();
    if (colours.length > 1) {
      ctx.save();
      drawPath();
      ctx.clip();
      const bandH = (2 * r) / colours.length;
      for (let i = 0; i < colours.length; i++) {
        ctx.fillStyle = colours[i];
        ctx.fillRect(-r, -r + i * bandH, 2 * r, bandH);
      }
      ctx.restore();
      drawPath();
    }
    ctx.stroke();

    // Cardinal letter.
    if (pt.cardinal) {
      ctx.fillStyle = '#000';
      ctx.font = '700 8px sans-serif';
      ctx.fillText(pt.cardinal, 0, 0);
    }
    ctx.restore();

    // Labels: light character (magenta) then name, stacked below the mark.
    let ly = y + r + 8;
    const drawLabel = (text: string, colour: string) => {
      ctx.save();
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(text, x, ly);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, ly);
      ctx.restore();
      ly += 13;
    };
    if (zoom >= LIGHT_MIN_ZOOM && pt.lightChar) drawLabel(pt.lightChar, '#f7b0f0');
    if (zoom >= NAME_MIN_ZOOM && pt.name) drawLabel(pt.name, '#ffffff');
  },
});

interface SeamarkLayerProps {
  /** Reports whether the current view is covered by an installed seamark pack.
   *  ChartView shows the online raster nautical layer when this is false. */
  onCoverage?: (hasLocal: boolean) => void;
}

export const SeamarkLayer = ({ onCoverage }: SeamarkLayerProps) => {
  const map = useMap();
  const onCoverageRef = useRef(onCoverage);
  onCoverageRef.current = onCoverage;

  useEffect(() => {
    const layer = new SeamarkCanvasLayer();
    layer.addTo(map);

    let abort: AbortController | null = null;
    let disposed = false;
    let lastKey: string | null = null;
    let inflightKey: string | null = null;

    const report = (hasLocal: boolean) => onCoverageRef.current?.(hasLocal);

    const refresh = async () => {
      if (disposed) return;
      if (map.getZoom() < SEAMARK_MIN_ZOOM) {
        layer.setData([]);
        lastKey = null;
        inflightKey = null;
        report(false); // let the raster show at ocean zooms
        return;
      }
      const key = snapKey(map.getBounds());
      if (key === lastKey || key === inflightKey) return;

      abort?.abort();
      abort = new AbortController();
      const myAbort = abort;
      inflightKey = key;

      const b = map.getBounds();
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      try {
        const res = await seamarksAPI.getFeatures(bbox, Math.round(map.getZoom()), myAbort.signal);
        if (disposed || myAbort !== abort) return;
        inflightKey = null;
        const source = res.data?.source ?? 'none';
        if (source === 'local') {
          const points = (res.data.features || []).map(toPoint).filter(Boolean) as SeamarkPoint[];
          layer.setData(points);
          lastKey = key;
          report(true);
        } else {
          layer.setData([]);
          lastKey = null; // no pack here — don't cache, so a downloaded pack shows on the next move
          report(false);
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        if (myAbort === abort) inflightKey = null;
        // Leave current data; a later move retries. Assume no local coverage.
        report(false);
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
      map.removeLayer(layer);
    };
  }, [map]);

  return null;
};
