import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import {
  useSettings,
  distanceConversions,
} from '../../context/SettingsContext';
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
  calculateRouteDistanceNm,
  calculateBearing,
  formatETA,
  CustomMarker,
  markerColors,
  createBoatIcon,
  createCustomMarkerIcon,
  createWaypointIcon,
  MapController,
  LongPressHandler,
  ContextMenu,
  ContextMenuOption,
  MarkerDialog,
  ChartSidebar,
  DepthSettingsPanel,
  SearchPanel,
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
  const [useSatellite, setUseSatellite] = useState(() => {
    const saved = localStorage.getItem('chartUseSatellite');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

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
  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerColor, setMarkerColor] = useState(markerColors[0]);
  const [markerIcon, setMarkerIcon] = useState('pin');

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

  // Refs
  const mapRef = useRef<L.Map>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Fetch water-aware route (called once when navigation starts)
  const fetchRoute = useCallback(async (
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number
  ) => {
    setRouteLoading(true);
    try {
      const response = await navigationAPI.calculateRoute(
        startLat,
        startLon,
        endLat,
        endLon
      );
      setRouteWaypoints(response.data.waypoints);
    } catch (error) {
      console.error('Failed to calculate route:', error);
      // Fallback to direct line
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

  // Waypoint arrival detection threshold in nautical miles (about 150 meters)
  const WAYPOINT_ARRIVAL_THRESHOLD_NM = 0.08;

  // Check for waypoint arrival and update route to follow boat
  useEffect(() => {
    if (!navigationTarget || routeWaypoints.length < 2) return;

    // Check all waypoints (except first which is boat position) to find the furthest one we've reached
    // This handles shortcuts - if we reach waypoint 3 before waypoint 2, skip to 3
    let furthestReachedIndex = -1;

    for (let i = 1; i < routeWaypoints.length; i++) {
      const wp = routeWaypoints[i];
      const distance = calculateDistanceNm(
        position.latitude,
        position.longitude,
        wp.lat,
        wp.lon
      );

      if (distance < WAYPOINT_ARRIVAL_THRESHOLD_NM) {
        furthestReachedIndex = i;
      }
    }

    // If we reached any waypoint
    if (furthestReachedIndex > 0) {
      // Check if we reached the final destination
      if (furthestReachedIndex === routeWaypoints.length - 1) {
        // Arrived at destination!
        setNavigationTarget(null);
        return;
      }

      // Skip to the waypoint after the furthest one we reached
      const remainingWaypoints = routeWaypoints.slice(furthestReachedIndex + 1);

      // Update waypoints with boat position as first point
      setRouteWaypoints([
        { lat: position.latitude, lon: position.longitude },
        ...remainingWaypoints,
      ]);
    }
  }, [position.latitude, position.longitude, navigationTarget, routeWaypoints]);

  // Save satellite view preference
  useEffect(() => {
    localStorage.setItem('chartUseSatellite', JSON.stringify(useSatellite));
  }, [useSatellite]);

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

    // Periodic check every 2 seconds as a fallback
    const periodicCheck = setInterval(() => {
      if (mapRef.current) {
        const container = mapRef.current.getContainer();
        if (container && container.offsetHeight > 0) {
          invalidateMap();
        }
      }
    }, 2000);

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
        if (contextMenu || markerContextMenu || showMarkerDialog) {
          map.dragging.disable();
        } else {
          map.dragging.enable();
        }
      } catch {
        // Ignore errors if map is in transition state
      }
    }
  }, [contextMenu, markerContextMenu, showMarkerDialog]);

  // Handle sound alarm
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
    if (mapRef.current) {
      mapRef.current.setView(
        [position.latitude, position.longitude],
        mapRef.current.getZoom()
      );
    }
  };

  const handleMapDrag = () => setAutoCenter(false);

  const handleLongPress = (lat: number, lon: number, x: number, y: number) => {
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
        <TileLayer attribution="" url={TILE_URLS.nautical} />

        {/* Auto-refresh tiles when coming back online */}
        <ConnectivityRefresher />

        {/* Boat marker */}
        <Marker
          position={[position.latitude, position.longitude]}
          icon={createBoatIcon(heading)}
        >
          <Popup>
            <div style={{ padding: '0.5rem' }}>
              <strong>Your Boat</strong>
              <br />
              <strong>Position:</strong> {position.latitude.toFixed(5)}°,{' '}
              {position.longitude.toFixed(5)}°
              <br />
              <strong>Heading:</strong> {heading.toFixed(0)}°
              <br />
              <strong>Speed:</strong> {speed.toFixed(1)} kt
              <br />
              <strong>Depth:</strong>{' '}
              <span style={{ color: getDepthColor(depth) }}>
                {depth.toFixed(1)}m
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Custom markers */}
        {customMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lon]}
            icon={markerIcons[marker.id]}
            eventHandlers={{
              click: (e) => {
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

        {/* Navigation route - always starts from current boat position */}
        {navigationTarget && routeWaypoints.length >= 2 && (() => {
          // Build route positions: boat position + remaining waypoints (skip first stored waypoint)
          const routePositions: [number, number][] = [
            [position.latitude, position.longitude],
            ...routeWaypoints.slice(1).map((wp) => [wp.lat, wp.lon] as [number, number]),
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
                [position.latitude, position.longitude],
                [navigationTarget.lat, navigationTarget.lon],
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
                [position.latitude, position.longitude],
                [navigationTarget.lat, navigationTarget.lon],
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

        <MapController
          position={position}
          autoCenter={autoCenter}
          onDrag={handleMapDrag}
        />
        <LongPressHandler onLongPress={handleLongPress} />
      </MapContainer>

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
          onClose={onClose}
          onDepthClick={() => setDepthSettingsOpen(!depthSettingsOpen)}
          onSearchClick={() => {
            setSearchOpen(!searchOpen);
            setDepthSettingsOpen(false);
          }}
          onSatelliteToggle={() => setUseSatellite(!useSatellite)}
          onRecenter={handleRecenter}
        />
      )}

      {/* Navigation info banner - only show when route is ready */}
      {!hideSidebar && navigationTarget && !routeLoading && routeWaypoints.length >= 2 && (() => {
        // Calculate distance along the actual route from current position
        const currentRoute = [
          { lat: position.latitude, lon: position.longitude },
          ...routeWaypoints.slice(1),
        ];
        const distanceNm = calculateRouteDistanceNm(currentRoute);
        const convertedDistance = convertDistance(distanceNm);
        const etaHours = speed > 0.1 ? distanceNm / speed : Infinity;

        return (
          <button
            onClick={cancelNavigation}
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(39, 174, 96, 0.9)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.5rem 0.75rem',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              zIndex: 1002,
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
        );
      })()}

      {/* Depth Alarm Notification */}
      {isDepthAlarmTriggered && !navigationTarget && (
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
