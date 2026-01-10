import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import {
  useSettings,
  distanceConversions,
} from '../../context/SettingsContext';
import { geocodingService, SearchResult } from '../../services/geocoding';
import { navigationAPI } from '../../services/api';

// Import extracted components
import {
  calculateDistanceNm,
  formatETA,
  CustomMarker,
  markerColors,
  createBoatIcon,
  createCustomMarkerIcon,
  createWaypointIcon,
  MapController,
  LongPressHandler,
  AddMarkerDialog,
  EditMarkerDialog,
  ChartSidebar,
  DepthSettingsPanel,
  SearchPanel,
} from './chart';

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
  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerColor, setMarkerColor] = useState(markerColors[0]);
  const [markerIcon, setMarkerIcon] = useState('pin');

  // Navigation state
  const [navigationTarget, setNavigationTarget] = useState<CustomMarker | null>(
    () => {
      const saved = localStorage.getItem('navigationTarget');
      return saved ? JSON.parse(saved) : null;
    }
  );
  const [routeWaypoints, setRouteWaypoints] = useState<
    Array<{ lat: number; lon: number }>
  >([]);
  const [routeLoading, setRouteLoading] = useState(false);

  // Refs
  const mapRef = useRef<L.Map>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoutePositionRef = useRef<{ lat: number; lon: number } | null>(null);

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
    mapTileUrls,
    apiUrls,
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

  // Fetch water-aware route
  const fetchRoute = useCallback(async () => {
    if (!navigationTarget) {
      setRouteWaypoints([]);
      return;
    }

    setRouteLoading(true);
    try {
      const response = await navigationAPI.calculateRoute(
        position.latitude,
        position.longitude,
        navigationTarget.lat,
        navigationTarget.lon
      );
      setRouteWaypoints(response.data.waypoints);
    } catch (error) {
      console.error('Failed to calculate route:', error);
      setRouteWaypoints([
        { lat: position.latitude, lon: position.longitude },
        { lat: navigationTarget.lat, lon: navigationTarget.lon },
      ]);
    } finally {
      setRouteLoading(false);
    }
  }, [navigationTarget, position.latitude, position.longitude]);

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
      setRouteWaypoints([]);
    }
  }, [navigationTarget]);

  // Fetch route when navigation target or position changes
  useEffect(() => {
    if (!navigationTarget) return;

    const lastPos = lastRoutePositionRef.current;
    const positionChanged =
      !lastPos ||
      Math.abs(position.latitude - lastPos.lat) > 0.0001 ||
      Math.abs(position.longitude - lastPos.lon) > 0.0001;

    if (positionChanged) {
      lastRoutePositionRef.current = {
        lat: position.latitude,
        lon: position.longitude,
      };
      fetchRoute();
    }
  }, [navigationTarget?.id, position.latitude, position.longitude, fetchRoute]);

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

  // Disable map dragging when dialogs are open
  useEffect(() => {
    if (mapRef.current) {
      if (contextMenu || editingMarker) {
        mapRef.current.dragging.disable();
      } else {
        mapRef.current.dragging.enable();
      }
    }
  }, [contextMenu, editingMarker]);

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

  // Update geocoding service URL
  useEffect(() => {
    geocodingService.setConfig({ nominatimUrl: apiUrls.nominatimUrl });
  }, [apiUrls.nominatimUrl]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search handler
  const handleSearch = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await geocodingService.search(query, { limit: 5 });
      setSearchResults(results);
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

  // Marker management
  const addMarker = (
    lat: number,
    lon: number,
    name: string,
    color: string,
    icon: string
  ) => {
    const newMarker: CustomMarker = {
      id: Date.now().toString(),
      lat,
      lon,
      name,
      color,
      icon,
    };
    setCustomMarkers([...customMarkers, newMarker]);
    setContextMenu(null);
    setMarkerName('');
    setMarkerColor(markerColors[0]);
    setMarkerIcon('pin');
  };

  const deleteMarker = (id: string) => {
    setCustomMarkers(customMarkers.filter((m) => m.id !== id));
    setEditingMarker(null);
  };

  const updateMarker = (
    id: string,
    name: string,
    color: string,
    icon: string
  ) => {
    setCustomMarkers(
      customMarkers.map((m) => (m.id === id ? { ...m, name, color, icon } : m))
    );
    setEditingMarker(null);
  };

  const navigateToMarker = (marker: CustomMarker) => {
    setNavigationTarget(marker);
    setEditingMarker(null);
    setAutoCenter(false);

    if (mapRef.current) {
      const bounds = L.latLngBounds(
        [position.latitude, position.longitude],
        [marker.lat, marker.lon]
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
          <TileLayer attribution="" url={mapTileUrls.satelliteMap} />
        ) : (
          <TileLayer attribution="" url={mapTileUrls.streetMap} />
        )}
        <TileLayer attribution="" url={mapTileUrls.nauticalOverlay} />

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
            icon={createCustomMarkerIcon(marker.color, marker.name, marker.icon)}
            eventHandlers={{
              click: () => {
                setEditingMarker(marker);
                setMarkerName(marker.name);
                setMarkerColor(marker.color);
                setMarkerIcon(marker.icon || 'pin');
              },
            }}
          />
        ))}

        {/* Navigation route */}
        {navigationTarget && routeWaypoints.length >= 2 && (
          <>
            <Polyline
              positions={routeWaypoints.map(
                (wp) => [wp.lat, wp.lon] as [number, number]
              )}
              pathOptions={{
                color: '#ffffff',
                weight: 5,
                dashArray: '10, 10',
                opacity: 0.8,
              }}
            />
            <Polyline
              positions={routeWaypoints.map(
                (wp) => [wp.lat, wp.lon] as [number, number]
              )}
              pathOptions={{
                color: '#000000',
                weight: 3,
                dashArray: '10, 10',
                opacity: 0.9,
              }}
            />
            {routeWaypoints.length > 2 &&
              routeWaypoints.slice(1, -1).map((wp, index) => (
                <Marker
                  key={`waypoint-${index}`}
                  position={[wp.lat, wp.lon]}
                  icon={createWaypointIcon()}
                />
              ))}
          </>
        )}

        {/* Fallback direct line while loading */}
        {navigationTarget && routeWaypoints.length < 2 && (
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
                opacity: routeLoading ? 0.4 : 0.8,
              }}
            />
            <Polyline
              positions={[
                [position.latitude, position.longitude],
                [navigationTarget.lat, navigationTarget.lon],
              ]}
              pathOptions={{
                color: routeLoading ? '#888888' : '#000000',
                weight: 3,
                dashArray: '10, 10',
                opacity: routeLoading ? 0.5 : 0.9,
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

      {/* Navigation info banner */}
      {!hideSidebar && navigationTarget && (() => {
        const distanceNm = calculateDistanceNm(
          position.latitude,
          position.longitude,
          navigationTarget.lat,
          navigationTarget.lon
        );
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
            <span>{navigationTarget.name}</span>
            <span style={{ opacity: 0.7 }}>|</span>
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
          onSearchChange={setSearchQuery}
          onResultClick={handleSearchResultClick}
          onMarkerClick={handleMarkerSearchClick}
          onClose={() => {
            setSearchOpen(false);
            setSearchResults([]);
          }}
        />
      )}

      {/* Add Marker Dialog */}
      {contextMenu && (
        <AddMarkerDialog
          position={{ lat: contextMenu.lat, lon: contextMenu.lon }}
          markerName={markerName}
          setMarkerName={setMarkerName}
          markerColor={markerColor}
          setMarkerColor={setMarkerColor}
          markerIcon={markerIcon}
          setMarkerIcon={setMarkerIcon}
          onClose={() => setContextMenu(null)}
          onAdd={addMarker}
        />
      )}

      {/* Edit Marker Dialog */}
      {editingMarker && (
        <EditMarkerDialog
          marker={editingMarker}
          markerName={markerName}
          setMarkerName={setMarkerName}
          markerColor={markerColor}
          setMarkerColor={setMarkerColor}
          markerIcon={markerIcon}
          setMarkerIcon={setMarkerIcon}
          onClose={() => setEditingMarker(null)}
          onSave={updateMarker}
          onDelete={deleteMarker}
          onNavigate={navigateToMarker}
        />
      )}

      {/* Compact navigation info for dashboard widget */}
      {hideSidebar && navigationTarget && (() => {
        const distanceNm = calculateDistanceNm(
          position.latitude,
          position.longitude,
          navigationTarget.lat,
          navigationTarget.lon
        );
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
          style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            width: '56px',
            height: '56px',
            background: autoCenter ? 'rgba(25, 118, 210, 0.3)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            zIndex: 1000,
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!autoCenter)
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = autoCenter
              ? 'rgba(25, 118, 210, 0.3)'
              : 'transparent';
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
