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
} from './map-icons';
export type { CustomMarker } from './map-icons';

// Map components
export { MapController, LongPressHandler, ContextMenu, Compass, AnchorPlacementController, ZoomTracker } from './MapComponents';
export type { ContextMenuOption } from './MapComponents';

// Dialogs
export { MarkerDialog, AnchorAlarmDialog } from './MarkerDialogs';
export { VesselDetailsDialog } from './VesselDetailsDialog';

// Sidebar
export { ChartSidebar } from './ChartSidebar';

// Panels
export { DepthSettingsPanel, SearchPanel, AutopilotPanel, WeatherPanel, LayersPanel } from './ChartPanels';

// Depth contour overlay
export { DepthContourLayer, DEPTH_MIN_ZOOM } from './DepthContourLayer';

// Debug overlay
export { WaterDebugOverlay, DebugInfoPanel, useWaterDebugGrid } from './WaterDebugOverlay';
export type { DebugMode } from './WaterDebugOverlay';

// Weather overlay
export { WeatherOverlay, useWeatherOverlay, useTideForecast, TIDE_WINDOW_HOURS } from './WeatherOverlay';
export type { WeatherDisplayMode, TideForecast } from './WeatherOverlay';
