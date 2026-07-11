/**
 * OSM-Carto-approximating style for the offline PMTiles base.
 *
 * Maps the familiar openstreetmap.org palette onto the Protomaps basemap schema
 * so the offline vector base reads like the online OSM tiles: pale-beige land,
 * blue water, green parks/woods, pink motorways / orange primaries / white minor
 * roads with grey casing, brown buildings. NOT pixel-exact to OSM Carto (a
 * different engine + a simplified vector schema), but visually close and applied
 * everywhere so online↔offline is one consistent look.
 *
 * Built by overriding a stock light flavor's colours, so every schema key stays
 * present (paintRules/labelRules need the full set).
 */
import { namedFlavor, type Flavor } from '@protomaps/basemaps';
import { paintRules, labelRules, PolygonSymbolizer, type PaintRule, type LabelRule } from 'protomaps-leaflet';

const WATER = '#aad3df';

const OSM_OVERRIDES: Partial<Flavor> = {
  background: '#f2efe9',
  earth: '#f2efe9',
  water: '#aad3df',
  glacier: '#ffffff',
  // Green space.
  park_a: '#c8facc',
  park_b: '#a4d98c',
  wood_a: '#add19e',
  wood_b: '#94c187',
  scrub_a: '#d6d99f',
  scrub_b: '#c8d7ab',
  // Land use.
  hospital: '#fde5e5',
  school: '#f5f3d0',
  industrial: '#ebdbe8',
  pedestrian: '#ededed',
  sand: '#f5e9c6',
  beach: '#f5e9c6',
  pier: '#f2efe9',
  buildings: '#d9d0c9',
  // Roads — surface (the recognisable OSM road colours).
  highway: '#e892a2',
  highway_casing_early: '#cc6688',
  highway_casing_late: '#cc6688',
  major: '#fcd6a4',
  major_casing_early: '#c48f4a',
  major_casing_late: '#c48f4a',
  link: '#fcd6a4',
  link_casing: '#c48f4a',
  minor_a: '#ffffff',
  minor_b: '#ffffff',
  minor_casing: '#c8c2bb',
  minor_service: '#ffffff',
  minor_service_casing: '#d3cdc6',
  other: '#ffffff',
  // Roads — bridges (mirror the surface roads).
  bridges_highway: '#e892a2',
  bridges_highway_casing: '#cc6688',
  bridges_major: '#fcd6a4',
  bridges_major_casing: '#c48f4a',
  bridges_link: '#fcd6a4',
  bridges_link_casing: '#c48f4a',
  bridges_minor: '#ffffff',
  bridges_minor_casing: '#c8c2bb',
  bridges_other: '#ffffff',
  bridges_other_casing: '#d3cdc6',
  railway: '#9aa0a0',
  boundaries: '#9e6b9e',
  // Labels.
  ocean_label: '#4271b3',
  roads_label_minor: '#66594e',
  roads_label_minor_halo: '#ffffff',
  roads_label_major: '#66594e',
  roads_label_major_halo: '#ffffff',
  subplace_label: '#6b6b6b',
  subplace_label_halo: '#ffffff',
  city_label: '#333333',
  city_label_halo: '#ffffff',
  state_label: '#7a7a7a',
  state_label_halo: '#ffffff',
  country_label: '#55555a',
  address_label: '#66594e',
  address_label_halo: '#ffffff',
  landcover: {
    grassland: '#cdebb0',
    barren: '#f5efe6',
    urban_area: '#e0dfdf',
    farmland: '#eef0d5',
    glacier: '#ffffff',
    scrub: '#c8d7ab',
    forest: '#add19e',
  },
};

const osmFlavor: Flavor = { ...namedFlavor('light'), ...OSM_OVERRIDES } as Flavor;

// Unfiltered sea fill drawn UNDER everything. The stock `water` paint rule is
// filtered (may not cover open ocean at all zooms); without a background,
// unfilled sea would be transparent — and since the raster underneath skips
// pack-covered tiles, that would leave the Baltic blank. This guarantees the
// sea is painted *where the pack has data*, while out-of-pack tiles (no ocean/
// water features) stay transparent so the online raster still shows through.
const seaFill = (dataLayer: string): PaintRule =>
  ({ dataLayer, symbolizer: new PolygonSymbolizer({ fill: WATER }) } as unknown as PaintRule);

/** Paint rules for the OSM-styled vector base (static — the flavor is fixed). */
export const osmPaintRules: PaintRule[] = [seaFill('ocean'), seaFill('water'), ...paintRules(osmFlavor)];

/** Label rules for the OSM-styled base, in the given language. */
export const osmLabelRules = (lang: string): LabelRule[] => labelRules(osmFlavor, lang);
