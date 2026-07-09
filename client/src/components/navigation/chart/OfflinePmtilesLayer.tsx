import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import { API_BASE_URL } from '../../../utils/urls';

/**
 * Offline vector base-map layer — one installed PMTiles pack.
 *
 * Renders an OSM vector base map (protomaps-leaflet → canvas) from a pack served
 * by the Pi over HTTP Range, stacked just above the online raster base so that:
 *   - where the pack has data it covers the raster (or the raster's white gap);
 *   - where it doesn't, the online raster shows through.
 * No coverage/bounds logic needed — the stack IS the fallback. Mounted only when
 * a pack is installed (see ChartView), so it's completely inert until one is
 * downloaded.
 *
 * z-index note: sits in tilePane above the base raster (z≈0) but below the depth
 * canvas (z5) and the nautical layer (z10+), so those chart overlays draw on top.
 *
 * Data: © OpenStreetMap contributors · Protomaps. NOT FOR NAVIGATION.
 */

interface OfflinePmtilesLayerProps {
  packId: string;
  /** Pack's max native zoom; protomaps overzooms past it instead of blanking. */
  maxDataZoom: number;
  /** Use the dark stock flavor at night to protect night vision. */
  night: boolean;
  /** tilePane z-index (world pack below regionals, both below depth/nautical). */
  zIndex: number;
}

export const OfflinePmtilesLayer = ({ packId, maxDataZoom, night, zIndex }: OfflinePmtilesLayerProps) => {
  const map = useMap();

  useEffect(() => {
    // protomaps-leaflet fetches this URL directly with Range requests; the Pi's
    // /charts route is Accept-Ranges enabled.
    const url = `${API_BASE_URL}/charts/${packId}/tiles.pmtiles`;
    const layer = leafletLayer({
      url,
      flavor: night ? 'dark' : 'light',
      maxDataZoom,
      attribution: '',
      pane: 'tilePane',
      zIndex,
    } as any) as any;

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
    // Re-create on pack/flavor/zoom/z change (cheap; packs rarely change).
  }, [map, packId, maxDataZoom, night, zIndex]);

  return null;
};
