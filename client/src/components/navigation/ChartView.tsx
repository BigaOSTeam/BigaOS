import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoPosition } from '../../types';
import { useSettings, speedConversions, depthConversions } from '../../context/SettingsContext';

interface ChartViewProps {
  position: GeoPosition;
  heading: number;
  speed: number;
  depth: number;
  onClose?: () => void;
}

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

export const ChartView: React.FC<ChartViewProps> = ({ position, heading, speed, depth, onClose }) => {
  const [autoCenter, setAutoCenter] = useState(true);
  const [depthSettingsOpen, setDepthSettingsOpen] = useState(false);
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

  const sidebarWidth = 100;
  const settingsPanelWidth = 180;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Full screen map */}
      <MapContainer
        center={[position.latitude, position.longitude]}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution=""
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <TileLayer
          attribution=""
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
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
        <MapController position={position} autoCenter={autoCenter} onDrag={handleMapDrag} />
      </MapContainer>

      {/* Sidebar */}
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
    </div>
  );
};
