/**
 * Tile-source registry.
 *
 * Single source of truth for every map tile layer the app knows about. The
 * server uses it to validate `/tiles/:source/...` requests, to look up the
 * remote URL when proxying, and to iterate over downloadable sources for the
 * offline-maps feature. The client fetches a sanitised view of it via
 * `GET /api/tile-sources` so the UI can render the base/overlay controls,
 * attribution, and disclaimers from data instead of hardcoded strings.
 *
 * Adding a new tile source = appending one entry here. Removing one is also
 * just an entry; the offline-region records on disk store the source id as a
 * string, so an unknown id just stops being downloadable (it doesn't break
 * existing records).
 */

export type TileSourceRole = 'base' | 'overlay';

// `remote` — HTTP tile server proxied through `/tiles/:source/...`.
// `contours` — not tiles at all: a vector depth-contour overlay the client
//   fetches as GeoJSON from `/depth/contours` and renders itself (see the
//   depth-contour service). Has no `url`.
// `mbtiles` — reserved for user-imported chart packs (NV Verlag etc.); the
//   server will need to serve tiles out of a local SQLite file before this is
//   wired up. Keeping the discriminator now means the public shape is stable.
export type TileSourceKind = 'remote' | 'contours' | 'mbtiles';

export interface TileSource {
  id: string;
  labelKey: string;
  role: TileSourceRole;
  kind: TileSourceKind;

  // Remote-source fields (kind === 'remote')
  url?: string;

  // Future MBTiles support (kind === 'mbtiles')
  mbtilesPath?: string;

  attribution: string;
  minZoom?: number;
  maxZoom?: number;

  // Overlay-only: should this overlay be visible on a fresh install?
  defaultEnabled?: boolean;

  // True when the underlying data carries a "not for navigation" disclaimer
  // (Sentinel-2, EMODnet etc.). The client surfaces a small badge.
  notForNavigation?: boolean;

  // Gates whether this source appears in the offline-maps download UI.
  offlineDownloadable?: boolean;

  // Used to size the offline-download estimate.
  estimatedBytesPerTile?: number;

  // Path into the existing `mapTileUrls` setting that, if set, overrides
  // `url` at request time. Lets an install point at a paid tile provider
  // (MapTiler, Stadia, ...) without code changes.
  customUrlSettingKey?: keyof MapTileUrlOverrides;
}

// Mirrors the client-side `MapTileUrls` shape so the override keys stay in
// sync. Extending one side requires extending the other; the type is checked
// against the registry below.
export interface MapTileUrlOverrides {
  streetMap?: string;
  satelliteMap?: string;
  nauticalOverlay?: string;
}

export const TILE_SOURCES: readonly TileSource[] = [
  {
    id: 'street',
    labelKey: 'tile_source.street',
    role: 'base',
    kind: 'remote',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    offlineDownloadable: true,
    estimatedBytesPerTile: 18 * 1024,
    customUrlSettingKey: 'streetMap',
  },
  {
    id: 'satellite',
    labelKey: 'tile_source.satellite',
    role: 'base',
    kind: 'remote',
    // EOX Sentinel-2 cloudless mosaic. WMTS template is
    // `{TileMatrix}/{TileRow}/{TileCol}.jpg` → {z}/{y}/{x}.jpg.
    // Bump the year (2024/2025/...) as EOX publishes new mosaics.
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
    attribution:
      '<a href="https://s2maps.eu">Sentinel-2 cloudless</a> by <a href="https://eox.at/">EOX IT Services GmbH</a> ' +
      '(Contains modified Copernicus Sentinel data 2024) — CC BY-NC-SA 4.0',
    maxZoom: 17,
    notForNavigation: true,
    offlineDownloadable: true,
    estimatedBytesPerTile: 25 * 1024,
    customUrlSettingKey: 'satelliteMap',
  },
  {
    id: 'nautical',
    labelKey: 'tile_source.nautical',
    role: 'overlay',
    kind: 'remote',
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openseamap.org/">OpenSeaMap</a> contributors',
    maxZoom: 18,
    defaultEnabled: true,
    offlineDownloadable: true,
    estimatedBytesPerTile: 8 * 1024,
    customUrlSettingKey: 'nauticalOverlay',
  },
  {
    id: 'depth',
    labelKey: 'tile_source.depth',
    role: 'overlay',
    kind: 'contours',
    // Vector depth contours generated server-side from the EMODnet DTM (~115m,
    // all European seas). The client fetches GeoJSON isobaths from
    // `/depth/contours` for the visible bbox and renders translucent labelled
    // lines over the base map. Online only (no offline caching). European
    // waters only — outside EMODnet coverage the response is empty.
    attribution:
      '© <a href="https://emodnet.ec.europa.eu/">EMODnet</a> Bathymetry — CC BY 4.0',
    defaultEnabled: false,
    notForNavigation: true,
  },
];

/**
 * Look up a tile source by id. Returns undefined if the id is unknown, which
 * callers should treat as a 400/404 — never a server error.
 */
export function getTileSource(id: string): TileSource | undefined {
  return TILE_SOURCES.find((s) => s.id === id);
}

/**
 * Sources that the offline-maps downloader is allowed to bulk-fetch.
 */
export function getOfflineDownloadableSources(): TileSource[] {
  return TILE_SOURCES.filter((s) => s.offlineDownloadable);
}

/**
 * Subset of the registry suitable to send to the client over the public API.
 * Strips fields that are server-internal — there are none today, but the
 * indirection keeps a future "internal-only" flag easy to add.
 */
export interface PublicTileSource {
  id: string;
  labelKey: string;
  role: TileSourceRole;
  kind: TileSourceKind;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  defaultEnabled?: boolean;
  notForNavigation?: boolean;
  offlineDownloadable?: boolean;
  estimatedBytesPerTile?: number;
}

export function toPublicTileSource(s: TileSource): PublicTileSource {
  return {
    id: s.id,
    labelKey: s.labelKey,
    role: s.role,
    kind: s.kind,
    attribution: s.attribution,
    minZoom: s.minZoom,
    maxZoom: s.maxZoom,
    defaultEnabled: s.defaultEnabled,
    notForNavigation: s.notForNavigation,
    offlineDownloadable: s.offlineDownloadable,
    estimatedBytesPerTile: s.estimatedBytesPerTile,
  };
}
