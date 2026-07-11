import { createElementObject, createTileLayerComponent, updateGridLayer, withPane } from '@react-leaflet/core';
import L from 'leaflet';

/**
 * TileLayer subclass that pre-loads tiles beyond the visible viewport.
 * `loadBuffer` controls how much extra area to load as a fraction of screen size.
 * 0.5 = half a screen on each side (one full screen extra total per axis).
 *
 * Also auto-retries failed tile loads with exponential backoff. Without this,
 * a single 204 (server's failed-tile cache) or transient image-load error leaves
 * the tile permanently white until the user pans away and back. Each retry adds
 * a `_cb=` cache-buster so the server bypasses its short failure cache.
 *
 * `coveragePacks` (optional): a list of installed offline packs (`{ bounds }`).
 * Any tile whose extent falls entirely inside a pack's bounds is served as a
 * transparent data-URI instead of being fetched — the offline vector base
 * renders those tiles, so we skip the redundant online request. Tiles only
 * partially covered (pack edge) still fetch normally so their uncovered part
 * isn't blank. This is what makes local-vs-online a per-tile blend rather than
 * a whole-viewport switch.
 */
const proto = L.TileLayer.prototype as any;

// Retry schedule for tile load errors. The `_cb=` cache-buster bypasses the
// server's failure cache, so these delays only need to give a flaky upstream
// time to recover between attempts.
const RETRY_DELAYS_MS = [500, 2000, 6000];

// 1×1 transparent PNG — returned for tiles a local pack already covers so no
// network request is made for them.
const TRANSPARENT_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const BufferedTileLayerClass = L.TileLayer.extend({
  _getTiledPixelBounds(center: L.LatLng) {
    const bounds = proto._getTiledPixelBounds.call(this, center);
    const buffer = (this.options as any).loadBuffer ?? 0.5;
    const padding = (this as any)._map.getSize().multiplyBy(buffer);
    bounds.min = bounds.min.subtract(padding);
    bounds.max = bounds.max.add(padding);
    return bounds;
  },

  getTileUrl(coords: L.Coords) {
    const packs = (this.options as any).coveragePacks as Array<{ bounds: [number, number, number, number] }> | undefined;
    if (packs && packs.length) {
      const b = (this as any)._tileCoordsToBounds(coords) as L.LatLngBounds;
      for (const p of packs) {
        const [minLon, minLat, maxLon, maxLat] = p.bounds;
        if (
          b.getWest() >= minLon &&
          b.getEast() <= maxLon &&
          b.getSouth() >= minLat &&
          b.getNorth() <= maxLat
        ) {
          return TRANSPARENT_TILE; // covered by an offline pack — don't fetch online
        }
      }
    }
    return proto.getTileUrl.call(this, coords);
  },

  createTile(coords: L.Coords, done: L.DoneCallback) {
    const tile = proto.createTile.call(this, coords, done) as HTMLImageElement;
    const layer = this as any;
    let attempt = 0;

    const onError = () => {
      if (attempt >= RETRY_DELAYS_MS.length) return;
      const delay = RETRY_DELAYS_MS[attempt];
      attempt++;
      setTimeout(() => {
        // Don't retry if the tile has been pruned (pan/zoom away).
        if (!tile.isConnected) return;
        const url: string = layer.getTileUrl(coords);
        const sep = url.includes('?') ? '&' : '?';
        tile.src = `${url}${sep}_cb=${Date.now()}`;
      }, delay);
    };

    tile.addEventListener('error', onError);
    return tile;
  },
});

export const BufferedTileLayer = createTileLayerComponent(
  function createBufferedTileLayer({ url, ...options }: any, context: any) {
    const layer = new (BufferedTileLayerClass as any)(url, withPane(options, context));
    return createElementObject(layer, context);
  },
  function updateBufferedTileLayer(layer: any, props: any, prevProps: any) {
    updateGridLayer(layer, props, prevProps);
    if (props.url != null && props.url !== prevProps.url) {
      layer.setUrl(props.url);
    }
  },
);
