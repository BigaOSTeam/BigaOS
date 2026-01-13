import React from 'react';
import { Compass } from './MapComponents';
import {
  speedConversions,
  depthConversions,
  SpeedUnit,
  DepthUnit,
} from '../../../context/SettingsContext';

interface ChartSidebarProps {
  heading: number;
  convertedSpeed: number;
  speedUnit: SpeedUnit;
  convertedDepth: number;
  depthUnit: DepthUnit;
  depthColor: string;
  depthAlarm: number | null;
  depthSettingsOpen: boolean;
  searchOpen: boolean;
  useSatellite: boolean;
  autoCenter: boolean;
  bearingToTarget?: number | null;
  autopilotOpen: boolean;
  autopilotActive: boolean;
  debugMode?: boolean;
  onClose?: () => void;
  onDepthClick: () => void;
  onSearchClick: () => void;
  onSatelliteToggle: () => void;
  onRecenter: () => void;
  onCompassClick: () => void;
  onDebugToggle?: () => void;
}

export const ChartSidebar: React.FC<ChartSidebarProps> = ({
  heading,
  convertedSpeed,
  speedUnit,
  convertedDepth,
  depthUnit,
  depthColor,
  depthAlarm,
  depthSettingsOpen,
  searchOpen,
  useSatellite,
  autoCenter,
  bearingToTarget,
  autopilotOpen,
  autopilotActive,
  debugMode: _debugMode,
  onClose,
  onDepthClick,
  onSearchClick,
  onSatelliteToggle,
  onRecenter,
  onCompassClick,
  onDebugToggle: _onDebugToggle,
}) => {
  const sidebarWidth = 100;

  return (
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
        flexDirection: 'column',
      }}
    >
      {/* Home button */}
      {onClose && (
        <button
          onClick={onClose}
          className="chart-sidebar-btn"
          style={{
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          title="Back to Dashboard"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
      )}

      {/* Compass - clickable to open autopilot */}
      <div
        onClick={onCompassClick}
        style={{
          padding: '0.5rem 0.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          cursor: 'pointer',
          background: autopilotOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <Compass heading={heading} bearingToTarget={bearingToTarget} />
      </div>

      {/* Speed */}
      <div
        style={{
          padding: '0.5rem 0.5rem',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ fontSize: '0.6rem', opacity: 0.6, marginBottom: '0.15rem' }}>
          SPEED
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
          {convertedSpeed.toFixed(1)}
        </div>
        <div style={{ fontSize: '0.6rem', opacity: 0.6 }}>
          {speedConversions[speedUnit].label}
        </div>
      </div>

      {/* Depth - clickable to open alarm settings */}
      <div
        onClick={onDepthClick}
        style={{
          padding: '0.5rem 0.5rem',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          cursor: 'pointer',
          background: depthSettingsOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            fontSize: '0.6rem',
            opacity: 0.6,
            marginBottom: '0.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem',
          }}
        >
          DEPTH
          {depthAlarm !== null && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4fc3f7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          )}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: depthColor }}>
          {convertedDepth.toFixed(1)}
        </div>
        <div style={{ fontSize: '0.6rem', opacity: 0.6 }}>
          {depthConversions[depthUnit].label}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search button */}
      <button
        onClick={onSearchClick}
        className={`chart-sidebar-btn with-label ${searchOpen ? 'active' : ''}`}
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        title="Search locations"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={searchOpen ? '#4fc3f7' : 'currentColor'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>SEARCH</span>
      </button>

      {/* Satellite/Street toggle button */}
      <button
        onClick={onSatelliteToggle}
        className="chart-sidebar-btn with-label"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        title={useSatellite ? 'Switch to Street View' : 'Switch to Satellite View'}
      >
        {useSatellite ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
        onClick={onRecenter}
        className={`chart-sidebar-btn ${autoCenter ? 'active' : ''}`}
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
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
    </div>
  );
};
