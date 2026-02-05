import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import {
  useSettings,
  distanceConversions,
} from '../../context/SettingsContext';
import { useNavigation } from '../../context/NavigationContext';
import { SearchResult } from '../../services/geocoding';
import { navigationAPI, geocodingAPI } from '../../services/api';
import { wsService } from '../../services/websocket';

// Hardcoded server proxy URLs for tiles - client always fetches through server
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const TILE_URLS = {
  street: `${API_BASE_URL}/tiles/street/{z}/{x}/{y}`,
  satellite: `${API_BASE_URL}/tiles/satellite/{z}/{x}/{y}`,
  nautical: `${API_BASE_URL}/tiles/nautical/{z}/{x}/{y}`,
};

// Import extracted components
import {
  calculateDistanceNm,
  calculateDistanceMeters,
  calculateRouteDistanceNm,
  calculateBearing,
  formatETA,
  CustomMarker,
  markerColors,
  createBoatIcon,
  createCustomMarkerIcon,
  createWaypointIcon,
  createFinishFlagIcon,
  createAnchorIcon,
  createCrosshairIcon,
  MapController,
  LongPressHandler,
  ContextMenu,
  AnchorPlacementController,
  ZoomTracker,
  MarkerDialog,
  AnchorAlarmDialog,
  VesselDetailsDialog,
  ChartSidebar,
  DepthSettingsPanel,
  SearchPanel,
  AutopilotPanel,
  WaterDebugOverlay,
  DebugInfoPanel,
  DebugMode,
  useWaterDebugGrid,
  WeatherOverlay,
  WeatherPanel,
  useWeatherOverlay,
} from './chart';

// Component to refresh tiles when connectivity changes from offline to online
const ConnectivityRefresher: React.FC = () => {
  const map = useMap();
  const wasOfflineRef = useRef<boolean>(false);

  useEffect(() => {
    const handleConnectivityChange = (data: { online: boolean }) => {
      // If we were offline and now online, refresh all tile layers
      if (wasOfflineRef.current && data.online) {
        console.log('Connectivity restored - refreshing tiles...');

        // Longer delay to ensure server connectivity check has settled
        // Server checks every 5s, so wait a bit for it to confirm online status
        setTimeout(() => {
          map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
              // Force reload by removing and re-adding the tile layer's URL
              // This busts browser cache for placeholder tiles
              const tileLayer = layer as L.TileLayer;
              const currentUrl = (tileLayer as any)._url;

              // Add cache-busting parameter to force fresh tiles
              const cacheBuster = `_cb=${Date.now()}`;
              const newUrl = currentUrl.includes('?')
                ? `${currentUrl}&${cacheBuster}`
                : `${currentUrl}?${cacheBuster}`;

              tileLayer.setUrl(newUrl);

              // After tiles start loading, restore original URL for future requests
              setTimeout(() => {
                tileLayer.setUrl(currentUrl);
              }, 100);
            }
          });
        }, 1500);
      }
      wasOfflineRef.current = !data.online;
    };

    // Listen for connectivity changes via WebSocket
    wsService.on('connectivity_change', handleConnectivityChange);

    return () => {
      wsService.off('connectivity_change', handleConnectivityChange);
    };
  }, [map]);

  return null;
};

interface ChartViewProps {
  position: GeoPosition;
  heading: number;
  speed: number;
  depth: number;
  onClose?: () => void;
  hideSidebar?: boolean;
}

export const ChartView: React.FC<ChartViewProps> = ({
  position,
  heading,
  speed,
  depth,
  onClose,
  hideSidebar = false,
}) => {
  // UI State
  const [autoCenter, setAutoCenter] = useState(true);
  const [depthSettingsOpen, setDepthSettingsOpen] = useState(false);
  const [weatherPanelOpen, setWeatherPanelOpen] = useState(false);
  const [useSatellite, setUseSatellite] = useState(() => {
    const saved = localStorage.getItem('chartUseSatellite');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [debugMode, setDebugMode] = useState<DebugMode>('off');
  const [weatherOverlayEnabled, setWeatherOverlayEnabled] = useState(() => {
    const saved = localStorage.getItem('chartWeatherOverlay');
    return saved ? JSON.parse(saved) : false;
  });
  const [navDataError, setNavDataError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<{
    reason: string;
    title: string;
    message: string;
    suggestions: string[];
  } | null>(null);

  // Marker state
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(() => {
    const saved = localStorage.getItem('chartMarkers');
    return saved ? JSON.parse(saved) : [];
  });
  const [contextMenu, setContextMenu] = useState<{
    lat: number;
    lon: number;
    x: number;
    y: number;
  } | null>(null);
  const [showMarkerDialog, setShowMarkerDialog] = useState(false);
  const [markerContextMenu, setMarkerContextMenu] = useState<{
    marker: CustomMarker;
    x: number;
    y: number;
  } | null>(null);
  const [boatContextMenu, setBoatContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Anchor alarm state
  const [anchorAlarmDialogOpen, setAnchorAlarmDialogOpen] = useState(false);
  const [vesselDetailsDialogOpen, setVesselDetailsDialogOpen] = useState(false);
  const [anchorAlarm, setAnchorAlarm] = useState<{
    active: boolean;
    anchorPosition: { lat: number; lon: number };
    chainLength: number;
    depth: number;
    swingRadius: number;
  } | null>(null);
  // Track boat positions while anchor alarm is active
  const [anchorWatchTrack, setAnchorWatchTrack] = useState<Array<{ lat: number; lon: number }>>([]);
  const [anchorPositionOverride, setAnchorPositionOverride] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [placingAnchor, setPlacingAnchor] = useState(false);
  // Chain/depth state lifted from dialog for preview during placement
  const [anchorChainLength, setAnchorChainLength] = useState(30);
  const [anchorDepth, setAnchorDepth] = useState(depth);

  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerColor, setMarkerColor] = useState(markerColors[0]);
  const [markerIcon, setMarkerIcon] = useState('pin');
  const [mapZoom, setMapZoom] = useState(14);

  // Memoize marker icons to prevent constant re-rendering
  const markerIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    customMarkers.forEach((marker) => {
      icons[marker.id] = createCustomMarkerIcon(marker.color, marker.name, marker.icon);
    });
    return icons;
  }, [customMarkers]);

  // Navigation state
  const [navigationTarget, setNavigationTarget] = useState<CustomMarker | null>(
    () => {
      const saved = localStorage.getItem('navigationTarget');
      return saved ? JSON.parse(saved) : null;
    }
  );
  const [routeWaypoints, setRouteWaypoints] = useState<
    Array<{ lat: number; lon: number }>
  >(() => {
    const saved = localStorage.getItem('routeWaypoints');
    return saved ? JSON.parse(saved) : [];
  });
  const [routeLoading, setRouteLoading] = useState(false);

  // Autopilot state
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const [autopilotActive, setAutopilotActive] = useState(false);
  const [autopilotHeading, setAutopilotHeading] = useState(0);
  const [followingRoute, setFollowingRoute] = useState(false);
  const [courseChangeWarning, setCourseChangeWarning] = useState<{
    secondsUntil: number;
    newHeading: number;
  } | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const headingTransitionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetHeadingRef = useRef<number>(0);

  // Refs
  const mapRef = useRef<L.Map>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const anchorAlarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Water debug grid hook
  const { gridPoints, loading: debugLoading, generateGrid, clearGrid, currentResolution } = useWaterDebugGrid(mapRef);

  // Weather overlay hook
  const weatherOverlay = useWeatherOverlay();

  // Navigation context for navigating to other views
  const { navigate } = useNavigation();

  // Settings
  const {
    speedUnit,
    depthUnit,
    distanceUnit,
    depthAlarm,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    convertSpeed,
    convertDepth,
    convertDistance,
    vesselSettings,
    setVesselSettings,
    weatherSettings,
  } = useSettings();

  const convertedSpeed = convertSpeed(speed);
  const convertedDepth = convertDepth(depth);
  const sidebarWidth = hideSidebar ? 0 : 100;

  // Beep function for depth alarm
  const playBeep = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 2500;
    osc1.type = 'square';
    gain1.gain.value = 0.4;
    osc1.start();
    osc1.stop(ctx.currentTime + 0.1);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 3200;
      osc2.type = 'square';
      gain2.gain.value = 0.4;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.1);
    }, 120);
  }, []);

  // Urgent alarm sound for anchor dragging - phone alarm style beep-beep-beep
  const playAnchorAlarm = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    // Phone alarm style - three quick beeps
    const playBeepAt = (startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 note

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.08);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.1);

      osc.start(startTime);
      osc.stop(startTime + 0.1);
    };

    // Three beeps in quick succession
    playBeepAt(ctx.currentTime);
    playBeepAt(ctx.currentTime + 0.15);
    playBeepAt(ctx.currentTime + 0.3);
  }, []);

  // Get depth color based on value
  const getDepthColor = useCallback(
    (depthInMeters: number) => {
      if (isDepthAlarmTriggered) return '#ef5350';
      if (depthInMeters < 2) return '#ef5350';
      if (depthInMeters < 5) return '#ffa726';
      if (depthInMeters < 10) return '#66bb6a';
      return '#4fc3f7';
    },
    [isDepthAlarmTriggered]
  );

  // Helper to get user-friendly route error info
  const getRouteErrorInfo = (failureReason: string): { title: string; message: string; suggestions: string[] } => {
    switch (failureReason) {
      case 'START_ON_LAND':
        return {
          title: 'Start Point Not on Water',
          message: 'Your current position appears to be on land according to the navigation data.',
          suggestions: [
            'Move to deeper water away from shore',
            'Small harbors and marinas may not be recognized by the water detection',
            'Try navigating from a position further out'
          ]
        };
      case 'END_ON_LAND':
        return {
          title: 'Destination Not on Water',
          message: 'The destination point appears to be on land.',
          suggestions: [
            'Select a destination further from shore',
            'Small harbors and marinas may not be recognized',
            'Try selecting a point in deeper water near your intended destination'
          ]
        };
      case 'NO_PATH_FOUND':
        return {
          title: 'No Water Route Found',
          message: 'Unable to find a navigable water route between these points. Land appears to block the path.',
          suggestions: [
            'The route may require going around a landmass',
            'Try breaking the journey into shorter segments',
            'Check if there is actually a water connection between these points'
          ]
        };
      case 'DISTANCE_TOO_LONG':
        return {
          title: 'Route Too Long',
          message: 'The distance between these points is too long for automatic route calculation.',
          suggestions: [
            'Try breaking the journey into shorter segments (under 100 NM each)',
            'Navigate to an intermediate waypoint first',
            'For ocean crossings, create waypoints manually'
          ]
        };
      case 'NARROW_CHANNEL':
        return {
          title: 'Channel Too Narrow',
          message: 'The route may pass through channels that are too narrow to be detected.',
          suggestions: [
            'Small rivers, canals, and narrow passages may not be recognized',
            'Try navigating through wider waterways',
            'Use local charts for navigation in tight areas'
          ]
        };
      case 'MAX_ITERATIONS':
        return {
          title: 'Route Calculation Timeout',
          message: 'The route calculation took too long and was stopped.',
          suggestions: [
            'Try a shorter distance',
            'The area may have complex coastlines requiring manual waypoints',
            'Break the route into smaller segments'
          ]
        };
      default:
        return {
          title: 'Route Calculation Failed',
          message: 'Unable to calculate a water route between these points.',
          suggestions: [
            'Try selecting points that are clearly in open water',
            'Check that both start and destination are navigable'
          ]
        };
    }
  };

  // Fetch water-aware route (called once when navigation starts)
  const fetchRoute = useCallback(async (
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number
  ) => {
    setRouteLoading(true);
    setRouteError(null);
    try {
      const response = await navigationAPI.calculateRoute(
        startLat,
        startLon,
        endLat,
        endLon
      );

      // Check if route calculation failed with a reason
      if (!response.data.success && response.data.failureReason) {
        const errorInfo = getRouteErrorInfo(response.data.failureReason);
        setRouteError({
          reason: response.data.failureReason,
          ...errorInfo
        });
        // Cancel the navigation attempt
        setNavigationTarget(null);
        setRouteWaypoints([]);
        return;
      }

      setRouteWaypoints(response.data.waypoints);
    } catch (error: unknown) {
      console.error('Failed to calculate route:', error);

      // Check if this is a "no navigation data" error
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      if (axiosError.response?.data?.error === 'NO_NAVIGATION_DATA') {
        setNavDataError(axiosError.response.data.message || 'Navigation data not loaded.');
        // Cancel the navigation attempt
        setNavigationTarget(null);
        setRouteWaypoints([]);
        return;
      }

      // Fallback to direct line for other errors
      setRouteWaypoints([
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon },
      ]);
    } finally {
      setRouteLoading(false);
    }
  }, []);

  // Save markers to localStorage
  useEffect(() => {
    localStorage.setItem('chartMarkers', JSON.stringify(customMarkers));
  }, [customMarkers]);

  // Save navigation target to localStorage
  useEffect(() => {
    if (navigationTarget) {
      localStorage.setItem('navigationTarget', JSON.stringify(navigationTarget));
    } else {
      localStorage.removeItem('navigationTarget');
      localStorage.removeItem('routeWaypoints');
      setRouteWaypoints([]);
    }
  }, [navigationTarget]);

  // Save route waypoints to localStorage (separate effect to avoid infinite loop)
  useEffect(() => {
    if (navigationTarget && routeWaypoints.length > 0) {
      localStorage.setItem('routeWaypoints', JSON.stringify(routeWaypoints));
    }
  }, [routeWaypoints, navigationTarget]);

  // Smooth heading transition function
  const smoothTransitionToHeading = useCallback((targetHeading: number) => {
    // Clear any existing transition
    if (headingTransitionRef.current) {
      clearInterval(headingTransitionRef.current);
    }

    targetHeadingRef.current = targetHeading;

    // Transition over ~1 second (10 steps at 100ms each)
    const TRANSITION_STEPS = 10;
    const TRANSITION_INTERVAL_MS = 100;
    let stepCount = 0;

    const startHeading = autopilotHeading;

    // Calculate the shortest path (handle 359 -> 1 case)
    let delta = targetHeading - startHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    headingTransitionRef.current = setInterval(() => {
      stepCount++;

      if (stepCount >= TRANSITION_STEPS) {
        setAutopilotHeading(targetHeadingRef.current);
        if (headingTransitionRef.current) {
          clearInterval(headingTransitionRef.current);
          headingTransitionRef.current = null;
        }
        return;
      }

      // Ease-in-out interpolation
      const progress = stepCount / TRANSITION_STEPS;
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      let newHeading = startHeading + delta * eased;
      if (newHeading >= 360) newHeading -= 360;
      if (newHeading < 0) newHeading += 360;

      setAutopilotHeading(Math.round(newHeading));
    }, TRANSITION_INTERVAL_MS);
  }, [autopilotHeading]);

  // Update autopilot heading when following route with warning and smooth transition
  useEffect(() => {
    if (!followingRoute || !navigationTarget || routeWaypoints.length < 2) {
      setCourseChangeWarning(null);
      return;
    }

    const boatLat = position.latitude;
    const boatLon = position.longitude;

    // Calculate current bearing to next waypoint
    const currentBearing = calculateBearing(
      boatLat,
      boatLon,
      routeWaypoints[1].lat,
      routeWaypoints[1].lon
    );

    // Calculate distance to next waypoint and ETA
    const distanceToNextWp = calculateDistanceNm(
      boatLat, boatLon,
      routeWaypoints[1].lat, routeWaypoints[1].lon
    );

    // Calculate ETA in seconds (speed is in knots, distance in nm)
    const speedKnots = speed; // speed prop is already in knots
    const etaSeconds = speedKnots > 0.1 ? (distanceToNextWp / speedKnots) * 3600 : Infinity;

    // Check if there's a waypoint after the next one (course change coming)
    if (routeWaypoints.length >= 3) {
      const nextBearing = calculateBearing(
        routeWaypoints[1].lat,
        routeWaypoints[1].lon,
        routeWaypoints[2].lat,
        routeWaypoints[2].lon
      );

      // Calculate heading difference
      let headingDiff = Math.abs(nextBearing - currentBearing);
      if (headingDiff > 180) headingDiff = 360 - headingDiff;

      // Only warn if heading change is significant (> 5 degrees)
      if (headingDiff > 5 && etaSeconds <= 120 && etaSeconds > 0) {
        const newWarning = {
          secondsUntil: Math.round(etaSeconds),
          newHeading: Math.round(nextBearing),
        };
        // Reset dismissed state if the target heading changed significantly
        if (courseChangeWarning && Math.abs(courseChangeWarning.newHeading - newWarning.newHeading) > 5) {
          setWarningDismissed(false);
        }
        setCourseChangeWarning(newWarning);
      } else {
        setCourseChangeWarning(null);
        setWarningDismissed(false);
      }
    } else {
      setCourseChangeWarning(null);
      setWarningDismissed(false);
    }

    // Update heading - use smooth transition if heading change is significant
    const roundedBearing = Math.round(currentBearing);
    let headingDiff = Math.abs(roundedBearing - autopilotHeading);
    if (headingDiff > 180) headingDiff = 360 - headingDiff;

    if (headingDiff > 10) {
      // Significant change - transition smoothly
      smoothTransitionToHeading(roundedBearing);
    } else if (headingDiff > 0) {
      // Small adjustment - apply directly
      setAutopilotHeading(roundedBearing);
    }
  }, [followingRoute, navigationTarget, routeWaypoints, position.latitude, position.longitude, speed, smoothTransitionToHeading]);

  // Cleanup transition on unmount or when following stops
  useEffect(() => {
    return () => {
      if (headingTransitionRef.current) {
        clearInterval(headingTransitionRef.current);
      }
    };
  }, []);

  // Turn off follow mode when navigation ends
  useEffect(() => {
    if (!navigationTarget && followingRoute) {
      setFollowingRoute(false);
    }
  }, [navigationTarget, followingRoute]);

  // Waypoint arrival detection threshold in nautical miles
  // When autopilot is following route, use smaller threshold (about 30 meters) for precision
  // Otherwise use larger threshold (about 150 meters) for manual navigation
  const WAYPOINT_ARRIVAL_THRESHOLD_NM = followingRoute ? 0.016 : 0.08;

  // Track pending skip checks and cooldown to avoid excessive API calls
  const pendingSkipCheck = useRef<boolean>(false);
  const lastSkipCheckTime = useRef<number>(0);
  const SKIP_CHECK_COOLDOWN_MS = 5000; // Only check every 5 seconds max

  // Smart waypoint arrival and skip detection
  // 1. Detect when we're within arrival threshold of a waypoint
  // 2. Check if we're closer to a later waypoint than the next one
  // 3. Only skip if there's a clear water path (no land in the way)
  useEffect(() => {
    if (!navigationTarget || routeWaypoints.length < 2) return;

    const boatLat = position.latitude;
    const boatLon = position.longitude;

    // Calculate distance to each waypoint
    const distances = routeWaypoints.map((wp, i) => ({
      index: i,
      distance: calculateDistanceNm(boatLat, boatLon, wp.lat, wp.lon),
      wp
    }));

    // Check if we've arrived at any waypoint (within threshold)
    let arrivedAtIndex = -1;
    for (let i = 1; i < distances.length; i++) {
      if (distances[i].distance < WAYPOINT_ARRIVAL_THRESHOLD_NM) {
        arrivedAtIndex = i;
      }
    }

    // If we arrived at the final destination
    if (arrivedAtIndex === routeWaypoints.length - 1) {
      setNavigationTarget(null);
      return;
    }

    // If we arrived at an intermediate waypoint, skip past it
    if (arrivedAtIndex > 0) {
      const remainingWaypoints = routeWaypoints.slice(arrivedAtIndex + 1);
      setRouteWaypoints([
        { lat: boatLat, lon: boatLon },
        ...remainingWaypoints,
      ]);
      return;
    }

    // Smart skip detection: Check if we're closer to a later waypoint than the next one
    // This handles shortcuts when we take a different path than the calculated route
    // Throttled to avoid excessive API calls
    if (routeWaypoints.length > 2) {
      const now = Date.now();
      const timeSinceLastCheck = now - lastSkipCheckTime.current;

      // Skip if we're still in cooldown or already checking
      if (pendingSkipCheck.current || timeSinceLastCheck < SKIP_CHECK_COOLDOWN_MS) {
        return;
      }

      const nextWaypointDist = distances[1].distance;

      // Find any later waypoint that's closer than the next one
      let bestSkipIndex = -1;
      for (let i = 2; i < distances.length; i++) {
        // Is this waypoint closer than the next one we're supposed to go to?
        if (distances[i].distance < nextWaypointDist) {
          bestSkipIndex = i;
          break; // Take the first (earliest) skip opportunity
        }
      }

      // If we found a potential skip target, verify the path is clear (over water)
      if (bestSkipIndex > 1) {
        pendingSkipCheck.current = true;
        lastSkipCheckTime.current = now;
        const targetWp = routeWaypoints[bestSkipIndex];

        navigationAPI.checkRoute(boatLat, boatLon, targetWp.lat, targetWp.lon)
          .then(response => {
            // Only skip if the path doesn't cross land
            if (!response.data.crossesLand) {
              console.log(`[Navigation] Skipping to waypoint ${bestSkipIndex} - clear water path`);
              const remainingWaypoints = routeWaypoints.slice(bestSkipIndex);
              setRouteWaypoints([
                { lat: boatLat, lon: boatLon },
                ...remainingWaypoints,
              ]);
            }
          })
          .catch(err => {
            console.warn('[Navigation] Failed to check skip path:', err);
          })
          .finally(() => {
            pendingSkipCheck.current = false;
          });
      }
    }
  }, [position.latitude, position.longitude, navigationTarget, routeWaypoints]);

  // Save satellite view preference
  useEffect(() => {
    localStorage.setItem('chartUseSatellite', JSON.stringify(useSatellite));
  }, [useSatellite]);

  // Save weather overlay preference
  useEffect(() => {
    localStorage.setItem('chartWeatherOverlay', JSON.stringify(weatherOverlayEnabled));
  }, [weatherOverlayEnabled]);

  // Memoize boat icon to prevent recreation on every render
  // Round heading to nearest degree to reduce unnecessary updates
  const boatIcon = useMemo(() => {
    const roundedHeading = Math.round(heading);
    return createBoatIcon(roundedHeading);
  }, [Math.round(heading)]);

  // Force map to recalculate size on mount and visibility changes
  useEffect(() => {
    const invalidateMap = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    // Multiple delayed invalidations to catch different timing issues
    const timer1 = setTimeout(invalidateMap, 50);
    const timer2 = setTimeout(invalidateMap, 150);
    const timer3 = setTimeout(invalidateMap, 300);
    const timer4 = setTimeout(invalidateMap, 600);
    const timer5 = setTimeout(invalidateMap, 1000);

    // Use requestAnimationFrame for smoother invalidation
    let rafId: number;
    const rafInvalidate = () => {
      invalidateMap();
      rafId = requestAnimationFrame(rafInvalidate);
    };
    // Run for a short period on mount
    rafId = requestAnimationFrame(rafInvalidate);
    const stopRaf = setTimeout(() => cancelAnimationFrame(rafId), 1500);

    window.addEventListener('resize', invalidateMap);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(invalidateMap, 50);
        setTimeout(invalidateMap, 200);
        setTimeout(invalidateMap, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic check every 30 seconds as a fallback (reduced from 2 seconds)
    const periodicCheck = setInterval(() => {
      if (mapRef.current) {
        const container = mapRef.current.getContainer();
        if (container && container.offsetHeight > 0) {
          invalidateMap();
        }
      }
    }, 30000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(stopRaf);
      cancelAnimationFrame(rafId);
      clearInterval(periodicCheck);
      window.removeEventListener('resize', invalidateMap);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Disable map dragging when dialogs/menus are open
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.getContainer()) {
      try {
        if (contextMenu || markerContextMenu || boatContextMenu || showMarkerDialog) {
          map.dragging.disable();
        } else {
          map.dragging.enable();
        }
      } catch {
        // Ignore errors if map is in transition state
      }
    }
  }, [contextMenu, markerContextMenu, boatContextMenu, showMarkerDialog]);

  // Check if anchor is dragging
  const isAnchorDragging = useMemo(() => {
    if (!anchorAlarm?.active) return false;
    const distanceToAnchor = calculateDistanceMeters(
      position.latitude,
      position.longitude,
      anchorAlarm.anchorPosition.lat,
      anchorAlarm.anchorPosition.lon
    );
    return distanceToAnchor > anchorAlarm.swingRadius;
  }, [anchorAlarm, position.latitude, position.longitude]);

  // Calculate swing radius for placement preview
  const placementSwingRadius = useMemo(() => {
    if (!placingAnchor || anchorChainLength <= anchorDepth) return 0;
    const horizontalDistance = Math.sqrt(anchorChainLength ** 2 - anchorDepth ** 2);
    return horizontalDistance * 1.2; // 20% safety margin
  }, [placingAnchor, anchorChainLength, anchorDepth]);

  // Handle depth alarm sound (respects soundAlarmEnabled setting)
  useEffect(() => {
    if (isDepthAlarmTriggered && soundAlarmEnabled) {
      if (!beepIntervalRef.current) {
        playBeep();
        beepIntervalRef.current = setInterval(playBeep, 500);
      }
    } else {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [isDepthAlarmTriggered, soundAlarmEnabled, playBeep]);

  // Handle anchor dragging alarm sound (always enabled)
  useEffect(() => {
    if (isAnchorDragging) {
      if (!anchorAlarmIntervalRef.current) {
        playAnchorAlarm();
        anchorAlarmIntervalRef.current = setInterval(playAnchorAlarm, 600);
      }
    } else {
      if (anchorAlarmIntervalRef.current) {
        clearInterval(anchorAlarmIntervalRef.current);
        anchorAlarmIntervalRef.current = null;
      }
    }
    return () => {
      if (anchorAlarmIntervalRef.current) {
        clearInterval(anchorAlarmIntervalRef.current);
        anchorAlarmIntervalRef.current = null;
      }
    };
  }, [isAnchorDragging, playAnchorAlarm]);

  // Track boat positions when anchor alarm is active
  const lastTrackPointRef = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (!anchorAlarm?.active) {
      // Clear track when anchor alarm is deactivated
      setAnchorWatchTrack([]);
      lastTrackPointRef.current = null;
      return;
    }

    const currentPos = { lat: position.latitude, lon: position.longitude };

    // Only add point if moved more than 2 meters from last recorded position
    // This prevents cluttering the track with stationary noise
    if (lastTrackPointRef.current) {
      const distanceMoved = calculateDistanceMeters(
        lastTrackPointRef.current.lat,
        lastTrackPointRef.current.lon,
        currentPos.lat,
        currentPos.lon
      );
      if (distanceMoved < 2) return;
    }

    lastTrackPointRef.current = currentPos;
    setAnchorWatchTrack((prev) => {
      // Limit track to last 1000 points to prevent memory issues
      const newTrack = [...prev, currentPos];
      if (newTrack.length > 1000) {
        return newTrack.slice(-1000);
      }
      return newTrack;
    });
  }, [anchorAlarm?.active, position.latitude, position.longitude]);

  // Track offline state for search panel
  useEffect(() => {
    const handleConnectivityChange = (data: { online: boolean }) => {
      setIsOffline(!data.online);
    };

    wsService.on('connectivity_change', handleConnectivityChange);

    return () => {
      wsService.off('connectivity_change', handleConnectivityChange);
    };
  }, []);

  // Sync anchor alarm state across all clients via websocket
  const isLocalAnchorChange = useRef(false);

  // Helper to update anchor alarm and broadcast to other clients
  const updateAnchorAlarm = useCallback((newAlarm: typeof anchorAlarm) => {
    isLocalAnchorChange.current = true;
    setAnchorAlarm(newAlarm);
    wsService.emit('anchor_alarm_update', { anchorAlarm: newAlarm });
  }, []);

  // Listen for anchor alarm changes from other clients
  useEffect(() => {
    const handleAnchorAlarmChanged = (data: {
      anchorAlarm: typeof anchorAlarm;
      timestamp: Date;
    }) => {
      // Update local state with received anchor alarm
      if (!isLocalAnchorChange.current) {
        setAnchorAlarm(data.anchorAlarm);
      }
      isLocalAnchorChange.current = false;
    };

    wsService.on('anchor_alarm_changed', handleAnchorAlarmChanged);

    return () => {
      wsService.off('anchor_alarm_changed', handleAnchorAlarmChanged);
    };
  }, []);

  // Ctrl+D keyboard shortcut for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault(); // Prevent browser bookmark dialog
        setDebugMode((prev) => (prev === 'off' ? 'grid' : 'off'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search - only search when online
  useEffect(() => {
    // Don't search if offline
    if (isOffline) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isOffline]);

  // Search handler - uses server API which handles offline state
  const handleSearch = async (query: string) => {
    if (query.trim().length < 2 || isOffline) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await geocodingAPI.search(query, 5);
      // Server returns { results, offline } - if offline, results will be empty
      if (response.data.offline) {
        setIsOffline(true);
        setSearchResults([]);
      } else {
        // Transform server response to SearchResult format
        setSearchResults(response.data.results.map(r => ({
          lat: r.lat,
          lon: r.lon,
          display_name: r.display_name,
          type: r.type,
        })));
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Event handlers
  const handleRecenter = () => {
    setAutoCenter(true);
    // Animation is handled by MapController when autoCenter transitions to true
  };

  const handleMapDrag = () => setAutoCenter(false);

  const handleLongPress = (lat: number, lon: number, x: number, y: number) => {
    // Don't show context menu during anchor placement mode
    if (placingAnchor) return;
    setContextMenu({ lat, lon, x, y });
  };

  const handleSearchResultClick = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lon], 14);
      setAutoCenter(false);
    }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleMarkerSearchClick = (marker: CustomMarker) => {
    if (mapRef.current) {
      mapRef.current.flyTo([marker.lat, marker.lon], 16);
      setAutoCenter(false);
    }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Get next marker ID (continuous incrementing)
  const getNextMarkerId = (): string => {
    const existingIds = customMarkers
      .map((m) => parseInt(m.id, 10))
      .filter((id) => !isNaN(id));
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    return String(maxId + 1);
  };

  // Marker management - unified save handler for add/edit
  const saveMarker = (
    lat: number,
    lon: number,
    name: string,
    color: string,
    icon: string,
    id?: string
  ) => {
    if (id) {
      // Update existing marker
      setCustomMarkers(
        customMarkers.map((m) => (m.id === id ? { ...m, name, color, icon } : m))
      );
    } else {
      // Add new marker
      const newMarker: CustomMarker = {
        id: getNextMarkerId(),
        lat,
        lon,
        name,
        color,
        icon,
      };
      setCustomMarkers([...customMarkers, newMarker]);
    }
    // Reset state
    setContextMenu(null);
    setShowMarkerDialog(false);
    setEditingMarker(null);
    setMarkerName('');
    setMarkerColor(markerColors[0]);
    setMarkerIcon('pin');
  };

  const deleteMarker = (id: string) => {
    setCustomMarkers(customMarkers.filter((m) => m.id !== id));
    setMarkerContextMenu(null);
  };

  const navigateToMarker = (marker: CustomMarker) => {
    setRouteWaypoints([]); // Clear old waypoints
    setNavigationTarget(marker);
    setMarkerContextMenu(null);
    setAutoCenter(false);

    // Calculate route once from current position to marker
    fetchRoute(position.latitude, position.longitude, marker.lat, marker.lon);

    if (mapRef.current) {
      const bounds = L.latLngBounds(
        [position.latitude, position.longitude],
        [marker.lat, marker.lon]
      );
      mapRef.current.fitBounds(bounds, { padding: [120, 120], maxZoom: 15 });
    }
  };

  const navigateToCoordinates = (lat: number, lon: number) => {
    // Create a temporary navigation target for the coordinates
    const tempTarget: CustomMarker = {
      id: 'nav-target',
      lat,
      lon,
      name: '',
      color: '#66bb6a',
      icon: 'pin',
    };

    setRouteWaypoints([]); // Clear old waypoints
    setNavigationTarget(tempTarget);
    setContextMenu(null);
    setAutoCenter(false);

    // Calculate route from current position to coordinates
    fetchRoute(position.latitude, position.longitude, lat, lon);

    if (mapRef.current) {
      const bounds = L.latLngBounds(
        [position.latitude, position.longitude],
        [lat, lon]
      );
      mapRef.current.fitBounds(bounds, { padding: [120, 120], maxZoom: 15 });
    }
  };

  const cancelNavigation = () => setNavigationTarget(null);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Map */}
      <MapContainer
        center={[position.latitude, position.longitude]}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
        zoomControl={!hideSidebar}
      >
        {useSatellite ? (
          <TileLayer attribution="" url={TILE_URLS.satellite} />
          ) : (
          <TileLayer attribution="" url={TILE_URLS.street} />
        )}
        <TileLayer attribution="" url={TILE_URLS.nautical} zIndex={10} />

        {/* Auto-refresh tiles when coming back online */}
        <ConnectivityRefresher />

        {/* Anchor alarm swing radius circle */}
        {anchorAlarm?.active && (
          <>
            <Circle
              center={[anchorAlarm.anchorPosition.lat, anchorAlarm.anchorPosition.lon]}
              radius={anchorAlarm.swingRadius}
              pathOptions={{
                color: calculateDistanceMeters(
                  position.latitude,
                  position.longitude,
                  anchorAlarm.anchorPosition.lat,
                  anchorAlarm.anchorPosition.lon
                ) > anchorAlarm.swingRadius
                  ? '#ef5350'
                  : '#66bb6a',
                fillColor: calculateDistanceMeters(
                  position.latitude,
                  position.longitude,
                  anchorAlarm.anchorPosition.lat,
                  anchorAlarm.anchorPosition.lon
                ) > anchorAlarm.swingRadius
                  ? '#ef5350'
                  : '#66bb6a',
                fillOpacity: 0.15,
                weight: 3,
                dashArray: '8, 4',
              }}
            />
            <Marker
              position={[anchorAlarm.anchorPosition.lat, anchorAlarm.anchorPosition.lon]}
              icon={createAnchorIcon()}
              eventHandlers={{
                click: () => {
                  // Pre-fill the dialog with current anchor alarm settings
                  setAnchorChainLength(anchorAlarm.chainLength);
                  setAnchorDepth(anchorAlarm.depth);
                  setAnchorPositionOverride(anchorAlarm.anchorPosition);
                  setAnchorAlarmDialogOpen(true);
                },
              }}
            />
            {/* Anchor watch movement track */}
            {anchorWatchTrack.length >= 2 && (
              <Polyline
                positions={anchorWatchTrack.map((p) => [p.lat, p.lon] as [number, number])}
                pathOptions={{
                  color: '#ffa726',
                  weight: 2,
                  opacity: 0.8,
                }}
              />
            )}
          </>
        )}

        {/* Anchor position placement mode - viewport centered */}
        {placingAnchor && (
          <>
            <AnchorPlacementController
              sidebarWidth={sidebarWidth}
              boatPosition={{ lat: position.latitude, lon: position.longitude }}
              maxRadius={placementSwingRadius}
              initialAnchorPosition={anchorPositionOverride || undefined}
              onCenterChange={(lat, lon) => {
                setAnchorPositionOverride({ lat, lon });
              }}
            />
            {anchorPositionOverride && (
              <>
                {/* Swing radius circle centered on ANCHOR - boat must stay inside */}
                {placementSwingRadius > 0 && (
                  <Circle
                    center={[anchorPositionOverride.lat, anchorPositionOverride.lon]}
                    radius={placementSwingRadius}
                    pathOptions={{
                      color: '#4fc3f7',
                      fillColor: '#4fc3f7',
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray: '6, 4',
                    }}
                  />
                )}
                {/* Crosshair marker at anchor position */}
                <Marker
                  position={[anchorPositionOverride.lat, anchorPositionOverride.lon]}
                  icon={createCrosshairIcon()}
                />
                {/* White outline */}
                <Polyline
                  positions={[
                    [position.latitude, position.longitude],
                    [anchorPositionOverride.lat, anchorPositionOverride.lon],
                  ]}
                  pathOptions={{
                    color: '#fff',
                    weight: 4,
                    dashArray: '8, 8',
                    opacity: 1,
                  }}
                />
                {/* Black line on top */}
                <Polyline
                  positions={[
                    [position.latitude, position.longitude],
                    [anchorPositionOverride.lat, anchorPositionOverride.lon],
                  ]}
                  pathOptions={{
                    color: '#000',
                    weight: 2,
                    dashArray: '8, 8',
                    opacity: 1,
                  }}
                />
              </>
            )}
          </>
        )}

        {/* Boat marker */}
        <Marker
          position={[position.latitude, position.longitude]}
          icon={boatIcon}
          eventHandlers={{
            click: (e) => {
              // Don't show context menu during anchor placement mode
              if (placingAnchor) return;
              const containerPoint = mapRef.current?.latLngToContainerPoint(e.latlng);
              if (containerPoint) {
                setBoatContextMenu({
                  x: containerPoint.x,
                  y: containerPoint.y,
                });
              }
            },
          }}
        />

        {/* Custom markers */}
        {customMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lon]}
            icon={markerIcons[marker.id]}
            eventHandlers={{
              click: (e) => {
                // Don't show context menu during anchor placement mode
                if (placingAnchor) return;
                const containerPoint = mapRef.current?.latLngToContainerPoint(e.latlng);
                if (containerPoint) {
                  setMarkerContextMenu({
                    marker,
                    x: containerPoint.x,
                    y: containerPoint.y,
                  });
                }
              },
            }}
          />
        ))}

        {/* Navigation route - dashes originate from destination toward boat */}
        {navigationTarget && routeWaypoints.length >= 2 && (() => {
          // Build route positions: destination -> waypoints -> boat (reversed for dash direction)
          const routePositions: [number, number][] = [
            ...routeWaypoints.slice(1).map((wp) => [wp.lat, wp.lon] as [number, number]).reverse(),
            [position.latitude, position.longitude],
          ];
          return (
            <>
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: '#ffffff',
                  weight: 5,
                  dashArray: '10, 10',
                  opacity: 0.8,
                }}
              />
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: '#000000',
                  weight: 3,
                  dashArray: '10, 10',
                  opacity: 0.9,
                }}
              />
              {/* Show intermediate waypoint markers (not start or end) */}
              {routeWaypoints.length > 2 &&
                routeWaypoints.slice(1, -1).map((wp, index) => (
                  <Marker
                    key={`waypoint-${index}`}
                    position={[wp.lat, wp.lon]}
                    icon={createWaypointIcon()}
                  />
                ))}
            </>
          );
        })()}

        {/* Fallback direct line when route calculation failed (not while loading) */}
        {navigationTarget && routeWaypoints.length < 2 && !routeLoading && (
          <>
            <Polyline
              positions={[
                [navigationTarget.lat, navigationTarget.lon],
                [position.latitude, position.longitude],
              ]}
              pathOptions={{
                color: '#ffffff',
                weight: 5,
                dashArray: '10, 10',
                opacity: 0.8,
              }}
            />
            <Polyline
              positions={[
                [navigationTarget.lat, navigationTarget.lon],
                [position.latitude, position.longitude],
              ]}
              pathOptions={{
                color: '#000000',
                weight: 3,
                dashArray: '10, 10',
                opacity: 0.9,
              }}
            />
          </>
        )}

        {/* Finish flag at destination when navigating to coordinates (not a saved marker) */}
        {navigationTarget && navigationTarget.id === 'nav-target' && (
          <Marker
            position={[navigationTarget.lat, navigationTarget.lon]}
            icon={createFinishFlagIcon()}
          />
        )}

        <MapController
          position={position}
          autoCenter={autoCenter}
          onDrag={handleMapDrag}
        />
        <ZoomTracker onZoomChange={setMapZoom} />
        <LongPressHandler onLongPress={handleLongPress} />

        {/* Water debug overlay */}
        {debugMode !== 'off' && (
          <WaterDebugOverlay mode={debugMode} gridPoints={gridPoints} onClear={clearGrid} />
        )}

        {/* Weather overlay */}
        {weatherOverlayEnabled && (
          <WeatherOverlay
            enabled={weatherOverlayEnabled}
            forecastHour={weatherOverlay.forecastHour}
            displayMode={weatherOverlay.displayMode}
            onLoadingChange={weatherOverlay.setLoading}
            onError={weatherOverlay.setError}
          />
        )}
      </MapContainer>

      {/* Scale bar - Google Maps style */}
      {!hideSidebar && (() => {
        // Calculate meters per pixel at current zoom and latitude
        // At zoom 0, the whole world (40075km at equator) is 256 pixels
        const metersPerPixel = (40075016.686 * Math.cos(position.latitude * Math.PI / 180)) / Math.pow(2, mapZoom + 8);

        // Find a nice round number for the scale
        const targetWidth = 100; // Target width in pixels
        const targetMeters = metersPerPixel * targetWidth;

        // Round to a nice number
        const niceNumbers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
        let scaleMeters = niceNumbers[0];
        for (const n of niceNumbers) {
          if (n <= targetMeters * 1.5) {
            scaleMeters = n;
          }
        }

        const scaleWidth = scaleMeters / metersPerPixel;
        const scaleLabel = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;

        return (
          <div
            style={{
              position: 'absolute',
              bottom: '0.5rem',
              right: `calc(0.75rem + ${sidebarWidth}px)`,
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: `${scaleWidth}px`,
                height: '6px',
                position: 'relative',
              }}
            >
              {/* Horizontal line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  width: '100%',
                  height: '2px',
                  background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              />
              {/* Left end cap - starts at line, goes down */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '2px',
                  height: '10px',
                  background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              />
            </div>
            <div
              style={{
                fontSize: '0.65rem',
                fontWeight: 500,
                color: '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                whiteSpace: 'nowrap',
                marginTop: '-2px',
                textAlign: 'right',
              }}
            >
              {scaleLabel}
            </div>
            {/* Attribution */}
            <div
              style={{
                fontSize: '0.5rem',
                color: 'rgba(255,255,255,0.6)',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                whiteSpace: 'nowrap',
                marginTop: '2px',
                textAlign: 'right',
              }}
            >
              {useSatellite ? '© Esri' : '© OpenStreetMap'} | © OpenSeaMap
            </div>
          </div>
        );
      })()}

      {/* Weather panel */}
      {weatherPanelOpen && !hideSidebar && (
        <WeatherPanel
          sidebarWidth={sidebarWidth}
          enabled={weatherOverlayEnabled}
          forecastHour={weatherOverlay.forecastHour}
          displayMode={weatherOverlay.displayMode}
          loading={weatherOverlay.loading}
          error={weatherOverlay.error}
          onToggleEnabled={() => setWeatherOverlayEnabled(!weatherOverlayEnabled)}
          onSetForecastHour={weatherOverlay.setForecastHour}
          onSetDisplayMode={weatherOverlay.setDisplayMode}
          onClose={() => setWeatherPanelOpen(false)}
        />
      )}

      {/* Route calculation loading overlay */}
      {routeLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
        >
          <div
            style={{
              background: 'rgba(30, 30, 30, 0.95)',
              borderRadius: '8px',
              padding: '1.5rem 2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: '#4fc3f7',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 500 }}>
              Calculating route...
            </div>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* No navigation data error dialog */}
      {navDataError && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1002,
          }}
        >
          <div
            style={{
              background: 'rgba(30, 30, 30, 0.98)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '400px',
              margin: '1rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <circle cx="12" cy="16" r="0.5" fill="#f44336" />
              </svg>
              <h3 style={{ color: '#f44336', margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                Navigation Data Missing
              </h3>
            </div>
            <p style={{ color: '#ccc', margin: '0 0 1.5rem 0', lineHeight: 1.6 }}>
              {navDataError}
            </p>
            <p style={{ color: '#999', margin: '0 0 1.5rem 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Go to <strong style={{ color: '#4fc3f7' }}>Settings &gt; Navigation Data</strong> to download the required ocean and lake data files.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setNavDataError(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setNavDataError(null);
                  navigate('settings', { settings: { tab: 'downloads' } });
                }}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: '#f44336',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route calculation failed error dialog */}
      {routeError && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1002,
          }}
        >
          <div
            style={{
              background: 'rgba(30, 30, 30, 0.98)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '450px',
              margin: '1rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 152, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff9800" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <circle cx="12" cy="17" r="0.5" fill="#ff9800" />
              </svg>
              <h3 style={{ color: '#ff9800', margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                {routeError.title}
              </h3>
            </div>
            <p style={{ color: '#ccc', margin: '0 0 1rem 0', lineHeight: 1.6 }}>
              {routeError.message}
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ color: '#999', margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 500 }}>
                Suggestions:
              </p>
              <ul style={{ color: '#aaa', margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
                {routeError.suggestions.map((suggestion, index) => (
                  <li key={index} style={{ marginBottom: '0.25rem' }}>{suggestion}</li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRouteError(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  background: 'rgba(255, 152, 0, 0.2)',
                  border: '1px solid rgba(255, 152, 0, 0.4)',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      {!hideSidebar && (
        <ChartSidebar
          heading={heading}
          convertedSpeed={convertedSpeed}
          speedUnit={speedUnit}
          convertedDepth={convertedDepth}
          depthUnit={depthUnit}
          depthColor={getDepthColor(depth)}
          depthAlarm={depthAlarm}
          depthSettingsOpen={depthSettingsOpen}
          searchOpen={searchOpen}
          useSatellite={useSatellite}
          autoCenter={autoCenter}
          bearingToTarget={
            navigationTarget && routeWaypoints.length >= 2
              ? calculateBearing(
                  position.latitude,
                  position.longitude,
                  routeWaypoints[1].lat,
                  routeWaypoints[1].lon
                )
              : null
          }
          autopilotOpen={autopilotOpen}
          autopilotActive={autopilotActive}
          debugMode={debugMode !== 'off'}
          weatherOverlayEnabled={weatherOverlayEnabled}
          weatherPanelOpen={weatherPanelOpen}
          weatherDisplayMode={weatherOverlay.displayMode}
          onClose={onClose}
          onDepthClick={() => {
            setDepthSettingsOpen(!depthSettingsOpen);
            setSearchOpen(false);
            setAutopilotOpen(false);
            setWeatherPanelOpen(false);
          }}
          onSearchClick={() => {
            setSearchOpen(!searchOpen);
            setDepthSettingsOpen(false);
            setAutopilotOpen(false);
            setWeatherPanelOpen(false);
          }}
          onSatelliteToggle={() => setUseSatellite(!useSatellite)}
          onRecenter={handleRecenter}
          onCompassClick={() => {
            setAutopilotOpen(!autopilotOpen);
            setDepthSettingsOpen(false);
            setSearchOpen(false);
            setWeatherPanelOpen(false);
          }}
          onDebugToggle={() => setDebugMode(debugMode === 'off' ? 'grid' : 'off')}
          onWeatherClick={() => {
            setWeatherPanelOpen(!weatherPanelOpen);
            setDepthSettingsOpen(false);
            setSearchOpen(false);
            setAutopilotOpen(false);
          }}
        />
      )}

      {/* Top banners container - navigation, autopilot, and anchor alarm side by side */}
      {!hideSidebar && (navigationTarget && !routeLoading && routeWaypoints.length >= 2 || autopilotActive || anchorAlarm?.active) && (() => {
        const hasNavigation = navigationTarget && !routeLoading && routeWaypoints.length >= 2;

        // Calculate navigation info if active
        let convertedDistance = 0;
        let etaHours = Infinity;
        if (hasNavigation) {
          const currentRoute = [
            { lat: position.latitude, lon: position.longitude },
            ...routeWaypoints.slice(1),
          ];
          const distanceNm = calculateRouteDistanceNm(currentRoute);
          convertedDistance = convertDistance(distanceNm);
          etaHours = speed > 0.1 ? distanceNm / speed : Infinity;
        }

        return (
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '0.5rem',
              zIndex: 1002,
            }}
          >
            {/* Navigation banner */}
            {hasNavigation && (
              <button
                onClick={cancelNavigation}
                style={{
                  background: 'rgba(39, 174, 96, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.5rem 0.75rem',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="8" r="2" fill="currentColor" />
                  <path d="M6 10v4" />
                  <path d="M8 12h2" strokeDasharray="2 2" />
                  <path d="M12 12h2" strokeDasharray="2 2" />
                  <path
                    d="M18 6c0 3-3 6-3 6s-3-3-3-6a3 3 0 1 1 6 0z"
                    fill="currentColor"
                  />
                </svg>
                {navigationTarget.name && (
                  <>
                    <span>{navigationTarget.name}</span>
                    <span style={{ opacity: 0.7 }}>|</span>
                  </>
                )}
                <span>
                  {convertedDistance.toFixed(convertedDistance < 10 ? 2 : 1)}{' '}
                  {distanceConversions[distanceUnit].label}
                </span>
                <span style={{ opacity: 0.7 }}>|</span>
                <span>{formatETA(etaHours)}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: 0.7, marginLeft: '0.25rem' }}
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            {/* Autopilot banner */}
            {autopilotActive && (
              <button
                onClick={() => setAutopilotOpen(true)}
                style={{
                  background: 'rgba(25, 118, 210, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.5rem 0.75rem',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>AUTOPILOT</span>
                {followingRoute && (
                  <>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="M12 5l7 7-7 7" />
                    </svg>
                    <span>ROUTE</span>
                  </>
                )}
                <span style={{ opacity: 0.9, fontWeight: 'normal' }}>
                  {autopilotHeading}°
                </span>
                {courseChangeWarning && (
                  <span
                    style={{
                      marginLeft: '0.25rem',
                      padding: '0.15rem 0.4rem',
                      background: 'rgba(255, 193, 7, 0.9)',
                      borderRadius: '3px',
                      fontSize: '0.7rem',
                      color: '#000',
                      fontWeight: 'bold',
                    }}
                  >
                    {courseChangeWarning.secondsUntil}s → {courseChangeWarning.newHeading}°
                  </span>
                )}
              </button>
            )}

            {/* Anchor alarm banner */}
            {anchorAlarm?.active && (
              <button
                onClick={() => {
                  setAnchorChainLength(anchorAlarm.chainLength);
                  setAnchorDepth(anchorAlarm.depth);
                  setAnchorPositionOverride(anchorAlarm.anchorPosition);
                  setAnchorAlarmDialogOpen(true);
                }}
                style={{
                  background: 'rgba(230, 120, 0, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.5rem 0.75rem',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>
                </svg>
                <span>Anchor Alarm active</span>
                <span style={{ opacity: 0.9, fontWeight: 'normal' }}>
                  Radius: {anchorAlarm.swingRadius.toFixed(0)}m
                </span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Course Change Warning Dialog */}
      {courseChangeWarning && courseChangeWarning.secondsUntil <= 60 && !warningDismissed && (
        <div
          style={{
            position: 'absolute',
            top: '4rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 152, 0, 0.95)',
            border: '2px solid rgba(255, 193, 7, 1)',
            borderRadius: '8px',
            padding: '1rem 1.5rem',
            color: '#000',
            zIndex: 1003,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            textAlign: 'center',
            minWidth: '200px',
          }}
        >
          {/* Dismiss button */}
          <button
            onClick={() => setWarningDismissed(true)}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.6,
            }}
            title="Dismiss"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.25rem' }}>
            COURSE CHANGE IN
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            {courseChangeWarning.secondsUntil}s
          </div>
          <div style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ opacity: 0.7 }}>{autopilotHeading}°</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
            <span style={{ fontWeight: 'bold' }}>{courseChangeWarning.newHeading}°</span>
          </div>
        </div>
      )}

      {/* Depth Alarm Notification */}
      {isDepthAlarmTriggered && !navigationTarget && !autopilotActive && (
        <button
          onClick={() => setDepthAlarm(null)}
          style={{
            position: 'absolute',
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239, 83, 80, 0.95)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.75rem 1.5rem',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 1002,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            animation: 'pulse 1s infinite',
          }}
        >
          <span>SHALLOW WATER</span>
          <span style={{ opacity: 0.8, fontWeight: 'normal' }}>
            Tap to dismiss
          </span>
        </button>
      )}

      {/* Anchor Placement Mode - Info panel */}
      {placingAnchor && (
        <>
          {/* Bottom info panel */}
          <div
            style={{
              position: 'absolute',
              bottom: '2rem',
              left: `calc(50% - ${sidebarWidth / 2}px)`,
              transform: 'translateX(-50%)',
              background: 'rgba(10, 25, 41, 0.95)',
              border: '1px solid rgba(79, 195, 247, 0.5)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              color: '#fff',
              zIndex: 1002,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              Pan map to set anchor position
            </div>
            {anchorPositionOverride && (
              <div style={{ fontSize: '0.9rem', color: '#4fc3f7', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Distance from Boat:</span>
                  <span>{calculateDistanceMeters(
                    position.latitude,
                    position.longitude,
                    anchorPositionOverride.lat,
                    anchorPositionOverride.lon
                  ).toFixed(0)}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Bearing:</span>
                  <span>{calculateBearing(
                    position.latitude,
                    position.longitude,
                    anchorPositionOverride.lat,
                    anchorPositionOverride.lon
                  ).toFixed(0)}°</span>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setAnchorDepth(depth); // Use current sensor depth
                setAnchorAlarmDialogOpen(true);
                setPlacingAnchor(false);
              }}
              className="touch-btn"
              style={{
                padding: '0.5rem 1.5rem',
                background: 'rgba(79, 195, 247, 0.5)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Confirm Position
            </button>
          </div>
        </>
      )}

      {/* Anchor Alarm Alert */}
      {anchorAlarm?.active && (() => {
        const distanceToAnchor = calculateDistanceMeters(
          position.latitude,
          position.longitude,
          anchorAlarm.anchorPosition.lat,
          anchorAlarm.anchorPosition.lon
        );
        const isDragging = distanceToAnchor > anchorAlarm.swingRadius;

        if (isDragging) {
          return (
            <button
              onClick={() => updateAnchorAlarm(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgb(239, 83, 80)',
                border: 'none',
                borderRadius: '4px',
                padding: '0.75rem 1.5rem',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                zIndex: 1002,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                animation: 'pulse 1s infinite',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>
              </svg>
              <span>ANCHOR DRAGGING!</span>
              <span style={{ opacity: 0.8, fontWeight: 'normal' }}>
                +{(distanceToAnchor - anchorAlarm.swingRadius).toFixed(0)}m
              </span>
            </button>
          );
        }
        return null;
      })()}

      {/* Depth Settings Panel */}
      {depthSettingsOpen && (
        <DepthSettingsPanel
          sidebarWidth={sidebarWidth}
          depthUnit={depthUnit}
          depthAlarm={depthAlarm}
          soundAlarmEnabled={soundAlarmEnabled}
          onSetDepthAlarm={setDepthAlarm}
          onSetSoundAlarm={setSoundAlarmEnabled}
          onClose={() => setDepthSettingsOpen(false)}
        />
      )}

      {/* Search Panel */}
      {searchOpen && (
        <SearchPanel
          sidebarWidth={sidebarWidth}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searchLoading={searchLoading}
          customMarkers={customMarkers}
          isOffline={isOffline}
          onSearchChange={setSearchQuery}
          onResultClick={handleSearchResultClick}
          onMarkerClick={handleMarkerSearchClick}
          onClose={() => {
            setSearchOpen(false);
            setSearchResults([]);
          }}
        />
      )}

      {/* Autopilot Panel */}
      {autopilotOpen && (
        <AutopilotPanel
          sidebarWidth={sidebarWidth}
          targetHeading={autopilotHeading}
          isActive={autopilotActive}
          hasActiveNavigation={!!(navigationTarget && routeWaypoints.length >= 2)}
          followingRoute={followingRoute}
          currentBearing={
            navigationTarget && routeWaypoints.length >= 2
              ? calculateBearing(
                  position.latitude,
                  position.longitude,
                  routeWaypoints[1].lat,
                  routeWaypoints[1].lon
                )
              : null
          }
          onSetHeading={setAutopilotHeading}
          onToggleActive={() => setAutopilotActive(!autopilotActive)}
          onToggleFollowRoute={() => setFollowingRoute(!followingRoute)}
          onClose={() => setAutopilotOpen(false)}
        />
      )}

      {/* Water Debug Info Panel */}
      {debugMode !== 'off' && !hideSidebar && (
        <DebugInfoPanel
          onClose={() => setDebugMode('off')}
          sidebarWidth={sidebarWidth}
          gridPoints={gridPoints}
          onGenerate={generateGrid}
          onClear={clearGrid}
          loading={debugLoading}
          currentResolution={currentResolution}
        />
      )}

      {/* Context Menu for empty map location */}
      {contextMenu && !showMarkerDialog && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sidebarWidth={sidebarWidth}
          options={[
            {
              label: 'Create Marker',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#4fc3f7" stroke="#fff" strokeWidth="1">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                </svg>
              ),
              onClick: () => setShowMarkerDialog(true),
            },
            {
              label: 'Navigate Here',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="8" r="2" fill="#66bb6a" />
                  <path d="M6 10v4" />
                  <path d="M8 12h2" strokeDasharray="2 2" />
                  <path d="M12 12h2" strokeDasharray="2 2" />
                  <path d="M18 6c0 3-3 6-3 6s-3-3-3-6a3 3 0 1 1 6 0z" fill="#66bb6a" />
                </svg>
              ),
              onClick: () => navigateToCoordinates(contextMenu.lat, contextMenu.lon),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Context Menu for existing markers */}
      {markerContextMenu && !showMarkerDialog && (
        <ContextMenu
          x={markerContextMenu.x}
          y={markerContextMenu.y}
          sidebarWidth={sidebarWidth}
          header={markerContextMenu.marker.name}
          options={[
            {
              label: 'Edit Marker',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ),
              onClick: () => {
                setEditingMarker(markerContextMenu.marker);
                setMarkerName(markerContextMenu.marker.name);
                setMarkerColor(markerContextMenu.marker.color);
                setMarkerIcon(markerContextMenu.marker.icon || 'pin');
                setShowMarkerDialog(true);
              },
            },
            {
              label: 'Navigate to Marker',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="8" r="2" fill="#66bb6a" />
                  <path d="M6 10v4" />
                  <path d="M8 12h2" strokeDasharray="2 2" />
                  <path d="M12 12h2" strokeDasharray="2 2" />
                  <path d="M18 6c0 3-3 6-3 6s-3-3-3-6a3 3 0 1 1 6 0z" fill="#66bb6a" />
                </svg>
              ),
              onClick: () => navigateToMarker(markerContextMenu.marker),
            },
            {
              label: 'Delete Marker',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              ),
              onClick: () => deleteMarker(markerContextMenu.marker.id),
            },
          ]}
          onClose={() => setMarkerContextMenu(null)}
        />
      )}

      {/* Context Menu for boat */}
      {boatContextMenu && (
        <ContextMenu
          x={boatContextMenu.x}
          y={boatContextMenu.y}
          sidebarWidth={sidebarWidth}
          header={vesselSettings.name || 'Your Boat'}
          options={[
            {
              label: 'Vessel Details',
              icon: (
                <svg width="18" height="18" viewBox="-12 -18 24 28" fill="none">
                  {/* Hull - flat stern (left), pointy bow (right) */}
                  <path
                    d="M -10 4 L -10 8 L 10 8 L 12 4 Z"
                    fill="#4fc3f7"
                    fillOpacity="0.3"
                    stroke="#4fc3f7"
                    strokeWidth="1"
                  />
                  {/* Mast */}
                  <line x1="0" y1="4" x2="0" y2="-16" stroke="#4fc3f7" strokeWidth="1.5" />
                  {/* Mainsail */}
                  <path
                    d="M -1 -14 L -8 2 L -1 2 Z"
                    fill="#4fc3f7"
                    fillOpacity="0.5"
                    stroke="#4fc3f7"
                    strokeWidth="0.5"
                  />
                  {/* Foresail (jib) */}
                  <path
                    d="M 1 -14 L 10 2 L 1 2 Z"
                    fill="#4fc3f7"
                    fillOpacity="0.4"
                    stroke="#4fc3f7"
                    strokeWidth="0.5"
                  />
                </svg>
              ),
              onClick: () => {
                setVesselDetailsDialogOpen(true);
                setBoatContextMenu(null);
              },
            },
            {
              label: 'Anchor Alarm',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="3" />
                  <line x1="12" y1="8" x2="12" y2="21" />
                  <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                </svg>
              ),
              onClick: () => {
                setAnchorDepth(depth); // Use current sensor depth
                setAnchorAlarmDialogOpen(true);
                setBoatContextMenu(null);
              },
            },
          ]}
          onClose={() => setBoatContextMenu(null)}
        />
      )}

      {/* Marker Dialog (Add/Edit) */}
      {showMarkerDialog && (
        <MarkerDialog
          marker={editingMarker || undefined}
          position={contextMenu ? { lat: contextMenu.lat, lon: contextMenu.lon } : undefined}
          markerName={markerName}
          setMarkerName={setMarkerName}
          markerColor={markerColor}
          setMarkerColor={setMarkerColor}
          markerIcon={markerIcon}
          setMarkerIcon={setMarkerIcon}
          onClose={() => {
            setContextMenu(null);
            setMarkerContextMenu(null);
            setShowMarkerDialog(false);
            setEditingMarker(null);
            setMarkerName('');
            setMarkerColor(markerColors[0]);
            setMarkerIcon('pin');
          }}
          onSave={saveMarker}
        />
      )}

      {/* Anchor Alarm Dialog */}
      {anchorAlarmDialogOpen && (
        <AnchorAlarmDialog
          anchorPosition={anchorPositionOverride}
          chainLength={anchorChainLength}
          onChainLengthChange={setAnchorChainLength}
          anchorDepth={anchorDepth}
          onAnchorDepthChange={setAnchorDepth}
          isEditing={!!anchorAlarm?.active}
          vesselSettings={vesselSettings}
          onUpdateVesselSettings={setVesselSettings}
          boatPosition={{ lat: position.latitude, lon: position.longitude }}
          boatHeading={heading}
          onAnchorPositionChange={setAnchorPositionOverride}
          weatherEnabled={weatherSettings?.enabled}
          onSetAnchorPosition={() => {
            // Start anchor placement mode
            if (!anchorPositionOverride) {
              // Initialize at current boat position
              setAnchorPositionOverride({
                lat: position.latitude,
                lon: position.longitude,
              });
            }
            setPlacingAnchor(true);
            setAnchorAlarmDialogOpen(false);
          }}
          onActivate={(chainLength, depth, swingRadius) => {
            const anchorPos = anchorPositionOverride || {
              lat: position.latitude,
              lon: position.longitude,
            };

            // Stop navigation and autopilot when activating anchor alarm
            setNavigationTarget(null);
            setAutopilotActive(false);

            updateAnchorAlarm({
              active: true,
              anchorPosition: anchorPos,
              chainLength,
              depth,
              swingRadius,
            });
            setAnchorAlarmDialogOpen(false);
            setAnchorPositionOverride(null);
            setPlacingAnchor(false);

            // Zoom to max and focus on the boat
            if (mapRef.current) {
              mapRef.current.setView(
                [position.latitude, position.longitude],
                18, // Max zoom level
                { animate: true }
              );
            }
          }}
          onDelete={() => {
            updateAnchorAlarm(null);
            setAnchorAlarmDialogOpen(false);
            setAnchorPositionOverride(null);
            setPlacingAnchor(false);
          }}
          onClose={() => {
            setAnchorAlarmDialogOpen(false);
            // If we were placing anchor, keep the position but stop placement mode
            if (placingAnchor) {
              setPlacingAnchor(false);
            }
          }}
        />
      )}

      {/* Vessel Details Dialog */}
      {vesselDetailsDialogOpen && (
        <VesselDetailsDialog
          vesselSettings={vesselSettings}
          onClose={() => setVesselDetailsDialogOpen(false)}
          onOpenSettings={() => {
            setVesselDetailsDialogOpen(false);
            navigate('settings', { settings: { tab: 'vessel' } });
          }}
        />
      )}

      {/* Compact navigation info for dashboard widget - only show when route is ready */}
      {hideSidebar && navigationTarget && !routeLoading && routeWaypoints.length >= 2 && (() => {
        // Calculate distance along the actual route from current position
        const currentRoute = [
          { lat: position.latitude, lon: position.longitude },
          ...routeWaypoints.slice(1),
        ];
        const distanceNm = calculateRouteDistanceNm(currentRoute);
        const convertedDistance = convertDistance(distanceNm);
        const etaHours = speed > 0.1 ? distanceNm / speed : Infinity;

        return (
          <div
            style={{
              position: 'absolute',
              top: '0.5rem',
              left: '0.5rem',
              background: 'rgba(39, 174, 96, 0.9)',
              borderRadius: '4px',
              padding: '0.4rem 0.6rem',
              color: '#fff',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="6" cy="8" r="2" fill="currentColor" />
              <path d="M6 10v4" />
              <path d="M8 12h2" strokeDasharray="2 2" />
              <path d="M12 12h2" strokeDasharray="2 2" />
              <path
                d="M18 6c0 3-3 6-3 6s-3-3-3-6a3 3 0 1 1 6 0z"
                fill="currentColor"
              />
            </svg>
            <span>
              {convertedDistance.toFixed(1)}{' '}
              {distanceConversions[distanceUnit].label}
            </span>
            <span style={{ opacity: 0.8 }}>|</span>
            <span>{formatETA(etaHours)}</span>
          </div>
        );
      })()}

      {/* Compact recenter button for dashboard widget */}
      {hideSidebar && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRecenter();
          }}
          className={`touch-btn ${autoCenter ? 'active' : ''}`}
          style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            width: '56px',
            height: '56px',
            background: autoCenter ? 'rgba(25, 118, 210, 0.3)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            zIndex: 1000,
          }}
          title={autoCenter ? 'Auto-centering ON' : 'Click to recenter'}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={autoCenter ? '#4fc3f7' : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle
              cx="12"
              cy="12"
              r="3"
              fill={autoCenter ? '#4fc3f7' : 'currentColor'}
            />
          </svg>
        </button>
      )}
    </div>
  );
};
