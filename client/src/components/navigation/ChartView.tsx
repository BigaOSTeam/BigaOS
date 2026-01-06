import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import { useSettings, speedConversions, depthConversions } from '../../context/SettingsContext';
import { geocodingService, SearchResult } from '../../services/geocoding';

interface ChartViewProps {
  position: GeoPosition;
  heading: number;
  speed: number;
  depth: number;
  onClose?: () => void;
  hideSidebar?: boolean;
}

interface CustomMarker {
  id: string;
  lat: number;
  lon: number;
  name: string;
  color: string;
  icon: string;
}

// Google Material Icons SVG paths (all solid/filled versions)
const markerIcons: { [key: string]: string } = {
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', // place
  anchor: 'M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z', // anchor
  buoy: 'M12 22c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm-1-14V5h2v3h-2zm1-5c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z', // mooring buoy
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z', // star
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z', // flag
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z', // warning triangle
  favorite: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', // favorite/heart
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', // home
};

// Custom boat icon that rotates with heading
const createBoatIcon = (heading: number) => {
  const svgIcon = `
    <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(25, 25) rotate(${heading})">
        <!-- Boat arrow with V-shaped back -->
        <path d="M 0,-18 L 8,10 L 0,4 L -8,10 Z" fill="#000" stroke="#fff" stroke-width="2"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'boat-icon',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
};

// Create custom marker icon with better styling and label
const createCustomMarkerIcon = (color: string, name: string, icon: string = 'pin') => {
  const iconPath = markerIcons[icon] || markerIcons.pin;
  const markerHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; width: max-content;">
      <div style="
        background: rgba(10, 25, 41, 0.95);
        border: 1px solid ${color};
        border-radius: 4px;
        padding: 4px 8px;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        margin-bottom: 4px;
      ">${name}</div>
      <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
        <path d="${iconPath}" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: markerHtml,
    className: 'custom-marker-icon-with-label',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

// Component to update map center when position changes (only if auto-center enabled)
const MapController: React.FC<{
  position: GeoPosition;
  autoCenter: boolean;
  onDrag: () => void;
}> = ({ position, autoCenter, onDrag }) => {
  const map = useMap();

  useEffect(() => {
    if (autoCenter) {
      map.setView([position.latitude, position.longitude], map.getZoom());
    }
  }, [position.latitude, position.longitude, map, autoCenter]);

  useEffect(() => {
    // Disable auto-center when user drags the map
    map.on('dragstart', onDrag);
    return () => {
      map.off('dragstart', onDrag);
    };
  }, [map, onDrag]);

  // Blur zoom buttons after click to remove focus state
  useEffect(() => {
    const zoomContainer = document.querySelector('.leaflet-control-zoom');
    if (zoomContainer) {
      const handleClick = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A') {
          setTimeout(() => target.blur(), 100);
        }
      };
      zoomContainer.addEventListener('click', handleClick);
      return () => zoomContainer.removeEventListener('click', handleClick);
    }
  }, []);

  return null;
};

// Component to handle long press for adding markers
const LongPressHandler: React.FC<{
  onLongPress: (lat: number, lon: number, x: number, y: number) => void;
}> = ({ onLongPress }) => {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPositionRef = useRef<{ lat: number; lon: number; latlng: L.LatLng } | null>(null);
  const initialTouchRef = useRef<{ x: number; y: number } | null>(null);
  const map = useMap();

  useEffect(() => {
    const mapContainer = map.getContainer();

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = mapContainer.getBoundingClientRect();

        // Calculate position relative to map container
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        initialTouchRef.current = { x: touch.clientX, y: touch.clientY };

        // Convert touch position to lat/lng using container coordinates
        const point = map.containerPointToLatLng([x, y]);
        longPressPositionRef.current = {
          lat: point.lat,
          lon: point.lng,
          latlng: point
        };

        longPressTimerRef.current = setTimeout(() => {
          if (longPressPositionRef.current) {
            onLongPress(
              longPressPositionRef.current.lat,
              longPressPositionRef.current.lon,
              x,
              y
            );
          }
        }, 500); // Reduced to 500ms for faster response
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (initialTouchRef.current && e.touches[0]) {
        const touch = e.touches[0];
        const dx = touch.clientX - initialTouchRef.current.x;
        const dy = touch.clientY - initialTouchRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 10) { // Reduced threshold to 10px
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          longPressPositionRef.current = null;
          initialTouchRef.current = null;
        }
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressPositionRef.current = null;
      initialTouchRef.current = null;
    };

    // Add listeners to the map container
    mapContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    mapContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
    mapContainer.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      mapContainer.removeEventListener('touchstart', handleTouchStart);
      mapContainer.removeEventListener('touchmove', handleTouchMove);
      mapContainer.removeEventListener('touchend', handleTouchEnd);
      mapContainer.removeEventListener('touchcancel', handleTouchEnd);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [map, onLongPress]);

  // Still keep mouse events for desktop
  useMapEvents({
    mousedown: (e) => {
      longPressPositionRef.current = { lat: e.latlng.lat, lon: e.latlng.lng, latlng: e.latlng };
      longPressTimerRef.current = setTimeout(() => {
        if (longPressPositionRef.current) {
          const containerPoint = map.latLngToContainerPoint(e.latlng);
          onLongPress(
            longPressPositionRef.current.lat,
            longPressPositionRef.current.lon,
            containerPoint.x,
            containerPoint.y
          );
        }
      }, 700);
    },
    mouseup: () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressPositionRef.current = null;
    },
    mousemove: () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    },
  });

  return null;
};

// Compass component with animated cardinal line
const Compass: React.FC<{ heading: number }> = ({ heading }) => {
  // Cardinal and intercardinal points
  const points = [
    { deg: 0, label: 'N' },
    { deg: 45, label: 'NE' },
    { deg: 90, label: 'E' },
    { deg: 135, label: 'SE' },
    { deg: 180, label: 'S' },
    { deg: 225, label: 'SW' },
    { deg: 270, label: 'W' },
    { deg: 315, label: 'NW' },
  ];

  // Calculate position for each point relative to current heading
  // Center of the line represents current heading
  const getPointPosition = (pointDeg: number) => {
    let diff = pointDeg - heading;
    // Normalize to -180 to 180
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    // Map to position: 0 = center, negative = left, positive = right
    // Scale: 45 degrees = ~25px from center (visible range is about ±67.5 degrees)
    return diff * (80 / 90);
  };

  const lineWidth = 80;

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      {/* Large heading number with indicator arrow */}
      <div style={{ display: 'inline-block', textAlign: 'center' }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>
          {heading.toFixed(0)}°
        </div>
        {/* Small white arrow pointing down */}
        <div style={{
          width: '0',
          height: '0',
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '5px solid #fff',
          margin: '2px auto 6px auto'
        }} />
      </div>

      {/* Animated cardinal line */}
      <div style={{
        position: 'relative',
        height: '24px',
        overflow: 'hidden',
        width: `${lineWidth}px`,
        margin: '0 auto'
      }}>
        {/* Tick marks and cardinal points */}
        <div style={{
          position: 'relative',
          height: '24px'
        }}>
          {/* Generate tick marks every 15 degrees */}
          {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
            const pos = getPointPosition(deg);
            const centerPos = lineWidth / 2 + pos;
            const isVisible = centerPos > -5 && centerPos < lineWidth + 5;
            const isCardinal = deg % 90 === 0;
            const isIntercardinal = deg % 45 === 0 && !isCardinal;

            if (!isVisible) return null;

            return (
              <div
                key={`tick-${deg}`}
                style={{
                  position: 'absolute',
                  left: `${centerPos}px`,
                  top: 0,
                  transform: 'translateX(-50%)',
                  width: isCardinal ? '2px' : '1px',
                  height: isCardinal ? '8px' : isIntercardinal ? '6px' : '4px',
                  background: isCardinal ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
                  transition: 'left 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              />
            );
          })}

          {/* Cardinal/intercardinal labels */}
          {points.map((point) => {
            const pos = getPointPosition(point.deg);
            const centerPos = lineWidth / 2 + pos;
            const isVisible = centerPos > -10 && centerPos < lineWidth + 10;
            const isNorth = point.label === 'N';

            if (!isVisible) return null;

            return (
              <div
                key={point.label}
                style={{
                  position: 'absolute',
                  left: `${centerPos}px`,
                  top: '10px',
                  transform: 'translateX(-50%)',
                  fontSize: '0.6rem',
                  fontWeight: isNorth ? 'bold' : 'normal',
                  color: isNorth ? '#ef5350' : 'rgba(255,255,255,0.7)',
                  transition: 'left 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  whiteSpace: 'nowrap'
                }}
              >
                {point.label}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export const ChartView: React.FC<ChartViewProps> = ({ position, heading, speed, depth, onClose, hideSidebar = false }) => {
  const [autoCenter, setAutoCenter] = useState(true);
  const [depthSettingsOpen, setDepthSettingsOpen] = useState(false);
  const [useSatellite, setUseSatellite] = useState(() => {
    // Load satellite view preference from localStorage
    const saved = localStorage.getItem('chartUseSatellite');
    return saved ? JSON.parse(saved) : false;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(() => {
    // Load markers from localStorage on initial render
    const saved = localStorage.getItem('chartMarkers');
    return saved ? JSON.parse(saved) : [];
  });
  const [contextMenu, setContextMenu] = useState<{ lat: number; lon: number; x: number; y: number } | null>(null);
  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerColor, setMarkerColor] = useState('#ef5350');
  const [markerIcon, setMarkerIcon] = useState('pin');
  const mapRef = useRef<L.Map>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    speedUnit,
    depthUnit,
    depthAlarm,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    convertSpeed,
    convertDepth,
    mapTileUrls,
    apiUrls,
  } = useSettings();

  const convertedSpeed = convertSpeed(speed);
  const convertedDepth = convertDepth(depth);

  // Beep function - annoying dual tone
  const playBeep = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  };

  // Save markers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chartMarkers', JSON.stringify(customMarkers));
  }, [customMarkers]);

  // Save satellite view preference to localStorage
  useEffect(() => {
    localStorage.setItem('chartUseSatellite', JSON.stringify(useSatellite));
  }, [useSatellite]);

  // Disable map dragging when context menu or edit dialog is open
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
  }, [isDepthAlarmTriggered, soundAlarmEnabled]);

  const getDepthColor = (depthInMeters: number) => {
    // If alarm is triggered, always show red
    if (isDepthAlarmTriggered) return '#ef5350';

    if (depthInMeters < 2) return '#ef5350'; // Red - very shallow
    if (depthInMeters < 5) return '#ffa726'; // Orange - shallow
    if (depthInMeters < 10) return '#66bb6a'; // Green - safe
    return '#4fc3f7'; // Blue - deep
  };

  const handleRecenter = () => {
    setAutoCenter(true);
    if (mapRef.current) {
      mapRef.current.setView([position.latitude, position.longitude], mapRef.current.getZoom());
    }
  };

  const handleMapDrag = () => {
    setAutoCenter(false);
  };

  // Update geocoding service URL when settings change
  useEffect(() => {
    geocodingService.setConfig({ nominatimUrl: apiUrls.nominatimUrl });
  }, [apiUrls.nominatimUrl]);

  // Search functionality with auto-search after 2 characters
  // Filter custom markers by search query
  const getMatchingMarkers = (query: string): CustomMarker[] => {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.length < 2) return [];
    return customMarkers.filter(marker =>
      marker.name.toLowerCase().includes(lowerQuery)
    );
  };

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

  // Handle clicking on a custom marker search result
  const handleMarkerSearchClick = (marker: CustomMarker) => {
    if (mapRef.current) {
      mapRef.current.flyTo([marker.lat, marker.lon], 16);
      setAutoCenter(false);
    }
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchResultClick = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (mapRef.current) {
      // Just fly to location, don't add marker
      mapRef.current.flyTo([lat, lon], 14);
      setAutoCenter(false);
    }

    // Close search panel
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Marker management
  const addMarker = (lat: number, lon: number, name: string, color: string, icon: string) => {
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
    setMarkerColor('#ef5350');
    setMarkerIcon('pin');
  };

  const deleteMarker = (id: string) => {
    setCustomMarkers(customMarkers.filter(m => m.id !== id));
    setEditingMarker(null);
  };

  const updateMarker = (id: string, name: string, color: string, icon: string) => {
    setCustomMarkers(customMarkers.map(m =>
      m.id === id ? { ...m, name, color, icon } : m
    ));
    setEditingMarker(null);
  };

  // Callback for long press event from LongPressHandler component
  const handleLongPress = (lat: number, lon: number, x: number, y: number) => {
    setContextMenu({ lat, lon, x, y });
  };

  const sidebarWidth = hideSidebar ? 0 : 100;
  const settingsPanelWidth = 180;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Full screen map */}
      <MapContainer
        center={[position.latitude, position.longitude]}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
        zoomControl={!hideSidebar}
      >
        {/* Base layer - Street or Satellite */}
        {useSatellite ? (
          <TileLayer
            attribution=""
            url={mapTileUrls.satelliteMap}
          />
        ) : (
          <TileLayer
            attribution=""
            url={mapTileUrls.streetMap}
          />
        )}
        {/* OpenSeaMap overlay - always on top */}
        <TileLayer
          attribution=""
          url={mapTileUrls.nauticalOverlay}
        />
        <Marker
          position={[position.latitude, position.longitude]}
          icon={createBoatIcon(heading)}
        >
          <Popup>
            <div style={{ padding: '0.5rem' }}>
              <strong>Your Boat</strong>
              <br />
              <strong>Position:</strong> {position.latitude.toFixed(5)}°, {position.longitude.toFixed(5)}°
              <br />
              <strong>Heading:</strong> {heading.toFixed(0)}°
              <br />
              <strong>Speed:</strong> {speed.toFixed(1)} kt
              <br />
              <strong>Depth:</strong> <span style={{ color: getDepthColor(depth) }}>{depth.toFixed(1)}m</span>
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

        <MapController position={position} autoCenter={autoCenter} onDrag={handleMapDrag} />
        <LongPressHandler onLongPress={handleLongPress} />
      </MapContainer>

      {/* Sidebar */}
      {!hideSidebar && (
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: `${sidebarWidth}px`,
          height: '100%',
          background: 'rgba(10, 25, 41, 0.95)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Home button */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              width: '100%',
              height: '56px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="Back to Dashboard"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
        )}

        {/* Compass */}
        <div style={{
          padding: '1rem 0.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Compass heading={heading} />
        </div>

        {/* Speed */}
        <div
          style={{
            padding: '1rem 0.5rem',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.25rem' }}>SPEED</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{convertedSpeed.toFixed(1)}</div>
          <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{speedConversions[speedUnit].label}</div>
        </div>

        {/* Depth - clickable to open alarm settings */}
        <div
          onClick={() => setDepthSettingsOpen(!depthSettingsOpen)}
          style={{
            padding: '1rem 0.5rem',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            background: depthSettingsOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            transition: 'background 0.2s',
          }}
        >
          <div style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
            DEPTH
            {depthAlarm !== null && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: getDepthColor(depth) }}>{convertedDepth.toFixed(1)}</div>
          <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{depthConversions[depthUnit].label}</div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search button */}
        <button
          onClick={() => {
            setSearchOpen(!searchOpen);
            setDepthSettingsOpen(false);
          }}
          style={{
            width: '100%',
            height: '56px',
            background: searchOpen ? 'rgba(25, 118, 210, 0.3)' : 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transition: 'background 0.2s',
            gap: '0.25rem'
          }}
          onMouseEnter={(e) => {
            if (!searchOpen) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = searchOpen ? 'rgba(25, 118, 210, 0.3)' : 'transparent';
          }}
          title="Search locations"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={searchOpen ? '#4fc3f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>
            SEARCH
          </span>
        </button>

        {/* Satellite/Street toggle button */}
        <button
          onClick={() => setUseSatellite(!useSatellite)}
          style={{
            width: '100%',
            height: '56px',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transition: 'background 0.2s',
            gap: '0.25rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title={useSatellite ? 'Switch to Street View' : 'Switch to Satellite View'}
        >
          {useSatellite ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          )}
          <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>
            {useSatellite ? 'STREET' : 'SATELLITE'}
          </span>
        </button>

        {/* Recenter button */}
        <button
          onClick={handleRecenter}
          style={{
            width: '100%',
            height: '56px',
            background: autoCenter ? 'rgba(25, 118, 210, 0.3)' : 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!autoCenter) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = autoCenter ? 'rgba(25, 118, 210, 0.3)' : 'transparent';
          }}
          title={autoCenter ? 'Auto-centering ON' : 'Click to recenter'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={autoCenter ? '#4fc3f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Crosshair */}
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="3" fill={autoCenter ? '#4fc3f7' : 'currentColor'} />
          </svg>
        </button>
      </div>
      )}

      {/* Depth Alarm Notification */}
      {isDepthAlarmTriggered && (
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
            animation: 'pulse 1s infinite'
          }}
        >
          <span>SHALLOW WATER</span>
          <span style={{ opacity: 0.8, fontWeight: 'normal' }}>Tap to dismiss</span>
        </button>
      )}

      {/* Depth Settings Panel */}
      {depthSettingsOpen && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: `${sidebarWidth + 8}px`,
            width: `${settingsPanelWidth}px`,
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            background: 'rgba(10, 25, 41, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            padding: '1rem',
            zIndex: 1001,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.75rem' }}>DEPTH ALARM</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => setDepthAlarm(null)}
              style={{
                padding: '0.9rem 0.75rem',
                background: depthAlarm === null ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '3px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.1rem',
                textAlign: 'left'
              }}
            >
              Off
            </button>
            {(depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30]).map((alarmDepth) => (
              <button
                key={alarmDepth}
                onClick={() => setDepthAlarm(alarmDepth)}
                style={{
                  padding: '0.9rem 0.75rem',
                  background: depthAlarm === alarmDepth ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '3px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  textAlign: 'left'
                }}
              >
                &lt; {alarmDepth} {depthUnit}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.75rem', marginTop: '1rem' }}>SOUND</div>
          <button
            onClick={() => setSoundAlarmEnabled(!soundAlarmEnabled)}
            style={{
              width: '100%',
              padding: '0.9rem 0.75rem',
              background: soundAlarmEnabled ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '3px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              textAlign: 'left'
            }}
          >
            {soundAlarmEnabled ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {/* Click outside to close depth settings */}
      {depthSettingsOpen && (
        <div
          onClick={() => setDepthSettingsOpen(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: sidebarWidth,
            bottom: 0,
            zIndex: 999
          }}
        />
      )}

      {/* Search Panel */}
      {searchOpen && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: `${sidebarWidth + 8}px`,
            width: '300px',
            maxHeight: 'calc(100vh - 32px)',
            background: 'rgba(10, 25, 41, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            padding: '1rem',
            zIndex: 1001,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.25rem' }}>SEARCH LOCATIONS</div>

          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to search (min 2 chars)..."
              style={{
                width: '100%',
                padding: '0.75rem',
                paddingRight: searchLoading ? '2.5rem' : '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '3px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
              autoFocus
            />
            {searchLoading && (
              <div style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.8rem',
                opacity: 0.6,
              }}>
                ...
              </div>
            )}
          </div>


          {/* Search results */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            {/* Custom markers section */}
            {searchQuery && getMatchingMarkers(searchQuery).length > 0 && (
              <>
                <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '0.25rem', marginTop: '0.25rem' }}>
                  YOUR MARKERS
                </div>
                {getMatchingMarkers(searchQuery).map((marker) => (
                  <button
                    key={`marker-${marker.id}`}
                    onClick={() => handleMarkerSearchClick(marker)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: `1px solid ${marker.color}`,
                      borderRadius: '3px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      transition: 'background 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={marker.color} stroke="#fff" strokeWidth="1.5">
                      <path d={markerIcons[marker.icon] || markerIcons.pin} />
                    </svg>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{marker.name}</div>
                      <div style={{ opacity: 0.5, fontSize: '0.7rem' }}>
                        {marker.lat.toFixed(4)}, {marker.lon.toFixed(4)}
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Geocoding results section */}
            {searchQuery && searchResults.length > 0 && (
              <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '0.25rem', marginTop: '0.5rem' }}>
                LOCATIONS
              </div>
            )}
            {searchResults.length === 0 && getMatchingMarkers(searchQuery).length === 0 && !searchLoading && searchQuery && (
              <div style={{ opacity: 0.6, fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                No results found
              </div>
            )}
            {searchResults.map((result, index) => (
              <button
                key={`${result.lat}-${result.lon}-${index}`}
                onClick={() => handleSearchResultClick(result)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '3px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {result.display_name.split(',')[0]}
                </div>
                <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>
                  {result.display_name.split(',').slice(1).join(',').trim()}
                </div>
                <div style={{ opacity: 0.5, fontSize: '0.7rem', marginTop: '0.25rem' }}>
                  {result.type}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Click outside to close search */}
      {searchOpen && (
        <div
          onClick={() => {
            setSearchOpen(false);
            setSearchResults([]);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: sidebarWidth,
            bottom: 0,
            zIndex: 999
          }}
        />
      )}

      {/* Context menu for adding marker */}
      {contextMenu && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1100
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              background: 'rgba(10, 25, 41, 0.98)',
              border: '2px solid rgba(79, 195, 247, 0.5)',
              borderRadius: '8px',
              padding: '0.75rem',
              zIndex: 1101,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              minWidth: '280px',
            }}
          >
            <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '0.75rem', textAlign: 'center' }}>
              ADD MARKER
            </div>
            <input
              type="text"
              value={markerName}
              onChange={(e) => setMarkerName(e.target.value)}
              placeholder="Marker name..."
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
            <div style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.35rem' }}>ICON</div>
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {Object.keys(markerIcons).map((iconKey) => (
                <button
                  key={iconKey}
                  onClick={() => setMarkerIcon(iconKey)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    background: markerIcon === iconKey ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    border: markerIcon === iconKey ? '2px solid #4fc3f7' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={markerColor} stroke="#fff" strokeWidth="1.5">
                    <path d={markerIcons[iconKey]} />
                  </svg>
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: '0.35rem' }}>COLOR</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'center' }}>
              {['#ef5350', '#66bb6a', '#42a5f5', '#ffa726', '#ab47bc'].map((color) => (
                <button
                  key={color}
                  onClick={() => setMarkerColor(color)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: color,
                    border: markerColor === color ? '3px solid #fff' : '2px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
            <button
              onClick={() => {
                if (markerName.trim()) {
                  addMarker(contextMenu.lat, contextMenu.lon, markerName, markerColor, markerIcon);
                }
              }}
              disabled={!markerName.trim()}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: markerName.trim() ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: markerName.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                opacity: markerName.trim() ? 1 : 0.5,
              }}
            >
              Add Marker
            </button>
          </div>
        </>
      )}

      {/* Edit marker dialog */}
      {editingMarker && (
        <>
          <div
            onClick={() => setEditingMarker(null)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1200
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(10, 25, 41, 0.98)',
              border: '2px solid rgba(79, 195, 247, 0.5)',
              borderRadius: '12px',
              padding: '1.5rem',
              zIndex: 1201,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              minWidth: '300px',
            }}
          >
            {/* Close X button */}
            <button
              onClick={() => setEditingMarker(null)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                width: '28px',
                height: '28px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                color: 'rgba(255, 255, 255, 0.6)',
                transition: 'color 0.2s, background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>
              Edit Marker
            </div>
            <input
              type="text"
              value={markerName}
              onChange={(e) => setMarkerName(e.target.value)}
              placeholder="Marker name..."
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />

            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>ICON</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {Object.keys(markerIcons).map((iconKey) => (
                <button
                  key={iconKey}
                  onClick={() => setMarkerIcon(iconKey)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '6px',
                    background: markerIcon === iconKey ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    border: markerIcon === iconKey ? '2px solid #4fc3f7' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s, background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={markerColor} stroke="#fff" strokeWidth="1.5">
                    <path d={markerIcons[iconKey]} />
                  </svg>
                </button>
              ))}
            </div>

            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>COLOR</div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
              {['#ef5350', '#66bb6a', '#42a5f5', '#ffa726', '#ab47bc'].map((color) => (
                <button
                  key={color}
                  onClick={() => setMarkerColor(color)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: color,
                    border: markerColor === color ? '3px solid #fff' : '2px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => deleteMarker(editingMarker.id)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(239, 83, 80, 0.5)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                Delete
              </button>
              <button
                onClick={() => {
                  if (markerName.trim()) {
                    updateMarker(editingMarker.id, markerName, markerColor, markerIcon);
                  }
                }}
                disabled={!markerName.trim()}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: markerName.trim() ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: markerName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  opacity: markerName.trim() ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

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
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!autoCenter) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = autoCenter ? 'rgba(25, 118, 210, 0.3)' : 'transparent';
          }}
          title={autoCenter ? 'Auto-centering ON' : 'Click to recenter'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={autoCenter ? '#4fc3f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="3" fill={autoCenter ? '#4fc3f7' : 'currentColor'} />
          </svg>
        </button>
      )}
    </div>
  );
};
