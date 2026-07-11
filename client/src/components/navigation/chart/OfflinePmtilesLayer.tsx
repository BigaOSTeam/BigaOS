import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { leafletLayer } from 'protomaps-leaflet';
import { API_BASE_URL } from '../../../utils/urls';
import { osmPaintRules, osmLabelRules } from './osm-flavor';

/**
 * Offline vector base-map layer — one installed PMTiles pack.
 *
 * Renders an OSM vector base map (protomaps-leaflet → canvas) from a pack served
 * by the Pi over HTTP Range, styled to look like the online OSM tiles (see
 * osm-flavor). Mounted by ChartView whenever a pack is installed, stacked ABOVE
 * the online raster base. It draws where the pack has data (sea + land) and is
 * transparent elsewhere; the raster underneath skips any tile the pack fully
 * covers (see BufferedTileLayer's `coveragePacks`), so covered tiles come purely
 * from local data with zero online requests while uncovered tiles blend in from
 * OSM — a per-tile blend, not a whole-viewport switch.
 *
 * z-index note: sits in tilePane above the base raster (z≈0) but below the depth
 * canvas (z5) and seamarks (z11).
 *
 * Data: © OpenStreetMap contributors · Protomaps. NOT FOR NAVIGATION.
 */

interface OfflinePmtilesLayerProps {
  packId: string;
  /** Pack's max native zoom; protomaps overzooms past it instead of blanking. */
  maxDataZoom: number;
  /** Label language (selects the OSM name:<lang> field where present). */
  lang: string;
  /** tilePane z-index (world pack below regionals, both below depth/seamarks). */
  zIndex: number;
}

export const OfflinePmtilesLayer = ({ packId, maxDataZoom, lang, zIndex }: OfflinePmtilesLayerProps) => {
  const map = useMap();

  useEffect(() => {
    // protomaps-leaflet fetches this URL directly with Range requests; the Pi's
    // /charts route is Accept-Ranges enabled.
    const url = `${API_BASE_URL}/charts/${packId}/tiles.pmtiles`;
    const layer = leafletLayer({
      url,
      paintRules: osmPaintRules,
      labelRules: osmLabelRules(lang),
      maxDataZoom,
      attribution: '',
      pane: 'tilePane',
      zIndex,
    } as any) as any;

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, packId, maxDataZoom, lang, zIndex]);

  return null;
};
