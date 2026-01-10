import React, { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { GeoPosition } from '../../../types';

interface MapControllerProps {
  position: GeoPosition;
  autoCenter: boolean;
  onDrag: () => void;
}

/**
 * Component to update map center when position changes (only if auto-center enabled)
 */
export const MapController: React.FC<MapControllerProps> = ({
  position,
  autoCenter,
  onDrag,
}) => {
  const map = useMap();

  useEffect(() => {
    if (autoCenter) {
      map.setView([position.latitude, position.longitude], map.getZoom());
    }
  }, [position.latitude, position.longitude, map, autoCenter]);

  useEffect(() => {
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

interface LongPressHandlerProps {
  onLongPress: (lat: number, lon: number, x: number, y: number) => void;
}

/**
 * Component to handle long press for adding markers
 */
export const LongPressHandler: React.FC<LongPressHandlerProps> = ({
  onLongPress,
}) => {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPositionRef = useRef<{
    lat: number;
    lon: number;
    latlng: L.LatLng;
  } | null>(null);
  const initialTouchRef = useRef<{ x: number; y: number } | null>(null);
  const map = useMap();

  useEffect(() => {
    const mapContainer = map.getContainer();

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = mapContainer.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        initialTouchRef.current = { x: touch.clientX, y: touch.clientY };

        const point = map.containerPointToLatLng([x, y]);
        longPressPositionRef.current = {
          lat: point.lat,
          lon: point.lng,
          latlng: point,
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
        }, 500);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (initialTouchRef.current && e.touches[0]) {
        const touch = e.touches[0];
        const dx = touch.clientX - initialTouchRef.current.x;
        const dy = touch.clientY - initialTouchRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 10) {
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

    mapContainer.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    mapContainer.addEventListener('touchmove', handleTouchMove, {
      passive: true,
    });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
    mapContainer.addEventListener('touchcancel', handleTouchEnd, {
      passive: true,
    });

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

  // Mouse events for desktop
  useMapEvents({
    mousedown: (e) => {
      longPressPositionRef.current = {
        lat: e.latlng.lat,
        lon: e.latlng.lng,
        latlng: e.latlng,
      };
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

interface CompassProps {
  heading: number;
}

/**
 * Compass component with animated cardinal line
 */
export const Compass: React.FC<CompassProps> = ({ heading }) => {
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

  const getPointPosition = (pointDeg: number) => {
    let diff = pointDeg - heading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff * (80 / 90);
  };

  const lineWidth = 80;

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ display: 'inline-block', textAlign: 'center' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
          {heading.toFixed(0)}°
        </div>
        <div
          style={{
            width: '0',
            height: '0',
            borderLeft: '3px solid transparent',
            borderRight: '3px solid transparent',
            borderTop: '4px solid #fff',
            margin: '1px auto 3px auto',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          height: '20px',
          overflow: 'hidden',
          width: `${lineWidth}px`,
          margin: '0 auto',
        }}
      >
        <div style={{ position: 'relative', height: '24px' }}>
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
                  background: isCardinal
                    ? 'rgba(255,255,255,0.8)'
                    : 'rgba(255,255,255,0.4)',
                  transition: 'left 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
                }}
              />
            );
          })}

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
                  whiteSpace: 'nowrap',
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
