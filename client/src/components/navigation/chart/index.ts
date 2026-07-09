// Navigation utilities
export { calculateDistanceNm, calculateDistanceMeters, calculateRouteDistanceNm, formatETA, calculateBearing } from './navigation-utils';

// Map icons and types
export {
  markerIcons,
  markerColors,
  createBoatIcon,
  createCustomMarkerIcon,
  createWaypointIcon,
  createFinishFlagIcon,
  createAnchorIcon,
  createCrosshairIcon,
  createMOBIcon,
  createRulerPointIcon,
  createRulerLabelIcon,
  createGnssLostLabelIcon,
} from './map-icons';
export type { CustomMarker } from './map-icons';

// Map components
export { MapController, LongPressHandler, RulerClickHandler, ContextMenu, Compass, AnchorPlacementController, ZoomTracker } from './MapComponents';
export { LayerLoadingProvider } from './LayerLoadingContext';
export type { ContextMenuOption } from './MapComponents';

// Dialogs
export { MarkerDialog, AnchorAlarmDialog } from './MarkerDialogs';
export { VesselDetailsDialog } from './VesselDetailsDialog';

// Sidebar
export { ChartSidebar } from './ChartSidebar';
export { ScrollableControlColumn } from './ScrollableControlColumn';

// Panels
export { DepthSettingsPanel, SearchPanel, AutopilotPanel, WeatherPanel, LayersPanel, ToolsPanel } from './ChartPanels';

// Depth contour overlay
export { DepthContourLayer, DEPTH_MIN_ZOOM } from './DepthContourLayer';

// Heritage ("Worth a Look") overlay — wrecks + UNESCO sites
export { HeritageLayer, HERITAGE_MIN_ZOOM } from './HeritageLayer';

// Seabed composition (anchoring) overlay — EMODnet substrate + Posidonia polygons
export { SeabedLayer, SEABED_MIN_ZOOM } from './SeabedLayer';

// Offline chart-pack layers: PMTiles vector base + vector seamarks.
export { OfflinePmtilesLayer } from './OfflinePmtilesLayer';
export { SeamarkLayer } from './SeamarkLayer';

// Debug overlay
export { WaterDebugOverlay, DebugInfoPanel, useWaterDebugGrid } from './WaterDebugOverlay';
export type { DebugMode } from './WaterDebugOverlay';

// Weather overlay
export { WeatherOverlay, useWeatherOverlay, useTideForecast, TIDE_WINDOW_HOURS } from './WeatherOverlay';
export type { WeatherDisplayMode, TideForecast } from './WeatherOverlay';
