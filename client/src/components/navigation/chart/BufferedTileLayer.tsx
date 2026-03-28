import { createElementObject, createTileLayerComponent, updateGridLayer, withPane } from '@react-leaflet/core';
import L from 'leaflet';

/**
 * TileLayer subclass that pre-loads tiles beyond the visible viewport.
 * `loadBuffer` controls how much extra area to load as a fraction of screen size.
 * 0.5 = half a screen on each side (one full screen extra total per axis).
 */
const proto = L.TileLayer.prototype as any;

const BufferedTileLayerClass = L.TileLayer.extend({
  _getTiledPixelBounds(center: L.LatLng) {
    const bounds = proto._getTiledPixelBounds.call(this, center);
    const buffer = (this.options as any).loadBuffer ?? 0.5;
    const padding = (this as any)._map.getSize().multiplyBy(buffer);
    bounds.min = bounds.min.subtract(padding);
    bounds.max = bounds.max.add(padding);
    return bounds;
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
