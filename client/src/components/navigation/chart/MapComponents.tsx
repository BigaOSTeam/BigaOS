import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
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
 * Currently using Leaflet's contextmenu event for testing
 */
export const LongPressHandler: React.FC<LongPressHandlerProps> = ({
  onLongPress,
}) => {
  const map = useMap();

  useEffect(() => {
    const handleContextMenu = (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();

      const containerPoint = map.latLngToContainerPoint(e.latlng);
      onLongPress(e.latlng.lat, e.latlng.lng, containerPoint.x, containerPoint.y);
    };

    map.on('contextmenu', handleContextMenu);

    return () => {
      map.off('contextmenu', handleContextMenu);
    };
  }, [map, onLongPress]);

  return null;
};

export interface ContextMenuOption {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  options: ContextMenuOption[];
  header?: string;
  onClose: () => void;
  sidebarWidth?: number;
}

/**
 * Reusable context menu component with arrow pointing to target location
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  options,
  header,
  onClose,
  sidebarWidth = 0,
}) => {
  const menuWidth = 170;
  const itemHeight = 44;
  const headerHeight = header ? 32 : 0;
  const menuHeight = headerHeight + options.length * itemHeight;
  const arrowSize = 8;
  const padding = 10;

  // Determine if menu should appear above or below the point
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const availableWidth = viewportWidth - sidebarWidth; // Account for sidebar
  const showAbove = y + menuHeight + arrowSize + padding > viewportHeight;
  const showLeft = x + menuWidth / 2 > availableWidth - padding;
  const showRight = x - menuWidth / 2 < padding;

  // Calculate menu position (don't overlap with sidebar on right)
  let menuX = x - menuWidth / 2;
  if (showLeft) menuX = Math.min(availableWidth - menuWidth - padding, x - menuWidth / 2);
  if (showRight) menuX = padding;
  // Ensure menu doesn't go past the available width
  menuX = Math.min(menuX, availableWidth - menuWidth - padding);

  // Calculate arrow position relative to menu
  let arrowX = x - menuX - arrowSize;
  arrowX = Math.max(12, Math.min(menuWidth - 24, arrowX));

  // Adjust menu position to account for arrow in total height
  const totalHeight = menuHeight + arrowSize;
  const adjustedMenuY = showAbove ? y - totalHeight : y;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1100,
        }}
      />
      {/* Container with drop-shadow for unified border effect */}
      <div
        style={{
          position: 'absolute',
          left: menuX,
          top: adjustedMenuY,
          width: menuWidth,
          filter: 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.15)) drop-shadow(0 4px 20px rgba(0,0,0,0.5))',
          zIndex: 1101,
          pointerEvents: 'none',
        }}
      >
        {/* Arrow */}
        <div
          style={{
            position: 'absolute',
            left: arrowX,
            top: showAbove ? menuHeight - 4 : 0,
            width: 0,
            height: 0,
            borderLeft: `${arrowSize}px solid transparent`,
            borderRight: `${arrowSize}px solid transparent`,
            ...(showAbove
              ? { borderTop: `${arrowSize}px solid rgba(10, 25, 41, 0.98)` }
              : { borderBottom: `${arrowSize}px solid rgba(10, 25, 41, 0.98)` }),
          }}
        />
        {/* Menu body */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: showAbove ? 0 : arrowSize,
            width: menuWidth,
            background: 'rgba(10, 25, 41, 0.98)',
            borderRadius: '8px',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          {/* Optional header */}
          {header && (
            <div
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '0.75rem',
                opacity: 0.6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {header}
            </div>
          )}
          {/* Menu items */}
          {options.map((option, index) => (
            <button
              key={index}
              onClick={option.onClick}
              className="touch-btn"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: index < options.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                color: '#fff',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left',
              }}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

interface CompassProps {
  heading: number;
  bearingToTarget?: number | null; // Bearing to next navigation waypoint
}

/**
 * Compass component with animated cardinal line
 * Shows a green indicator pointing to the navigation target when active
 */
export const Compass: React.FC<CompassProps> = ({ heading, bearingToTarget }) => {
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

  // Calculate the position of the navigation indicator
  // When bearing matches heading, it should be at center (under the white triangle)
  const getTargetIndicatorPosition = () => {
    if (bearingToTarget === null || bearingToTarget === undefined) return null;
    let diff = bearingToTarget - heading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    // Scale the position - when aligned (diff=0), indicator is at center
    const pos = diff * (80 / 90);
    const rawPos = lineWidth / 2 + pos;
    // Clamp to stay within compass bounds (with small padding)
    return Math.max(4, Math.min(lineWidth - 4, rawPos));
  };

  const targetPos = getTargetIndicatorPosition();

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
          height: '24px',
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

      {/* Navigation target indicator - green triangle at bottom */}
      {targetPos !== null && (
        <div
          style={{
            position: 'relative',
            height: '8px',
            width: `${lineWidth}px`,
            margin: '2px auto 0 auto',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${targetPos}px`,
              top: 0,
              transform: 'translateX(-50%)',
              width: '0',
              height: '0',
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: '6px solid #66bb6a',
              transition: 'left 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }}
          />
        </div>
      )}
    </div>
  );
};
