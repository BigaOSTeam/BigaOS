import React from 'react';
import { Compass } from './MapComponents';
import {
  speedConversions,
  depthConversions,
  SpeedUnit,
  DepthUnit,
} from '../../../context/SettingsContext';
import { useLanguage } from '../../../i18n/LanguageContext';

type WeatherDisplayMode = 'wind' | 'waves' | 'swell' | 'current' | 'water-temp';

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
  weatherOverlayEnabled?: boolean;
  weatherPanelOpen?: boolean;
  weatherDisplayMode?: WeatherDisplayMode;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onDepthClick: () => void;
  onSearchClick: () => void;
  onSatelliteToggle: () => void;
  onRecenter: () => void;
  onCompassClick: () => void;
  onDebugToggle?: () => void;
  onWeatherClick?: () => void;
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
  autopilotActive: _autopilotActive,
  debugMode: _debugMode,
  weatherOverlayEnabled,
  weatherPanelOpen,
  weatherDisplayMode = 'wind',
  onClose,
  onOpenSettings,
  onDepthClick,
  onSearchClick,
  onSatelliteToggle,
  onRecenter,
  onCompassClick,
  onDebugToggle: _onDebugToggle,
  onWeatherClick,
}) => {
  const { t } = useLanguage();
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
      {/* Settings button (chart-only mode) or Home button */}
      {onOpenSettings ? (
        <button
          onClick={onOpenSettings}
          className="chart-sidebar-btn"
          style={{
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          title={t('chart.open_settings')}
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      ) : onClose && (
        <button
          onClick={onClose}
          className="chart-sidebar-btn"
          style={{
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          title={t('chart.back_to_dashboard')}
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
          {t('chart.speed')}
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
          {t('chart.depth')}
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

      {/* Forecast overlay toggle */}
      {onWeatherClick && (
        <button
          onClick={onWeatherClick}
          className={`chart-sidebar-btn with-label ${weatherPanelOpen || weatherOverlayEnabled ? 'active' : ''}`}
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: weatherPanelOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
          }}
          title={t('weather.marine_forecast')}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 -960 960 960"
            fill={weatherOverlayEnabled ? '#4fc3f7' : 'currentColor'}
          >
            {/* Icon based on display mode */}
            {!weatherOverlayEnabled ? (
              /* Cloud icon when off */
              <path d="M251-160q-88 0-149.5-61.5T40-371q0-78 50-137t127-71q20-97 94-158.5T482-799q112 0 189 81.5T748-522v24q72-2 122 46.5T920-329q0 69-50 119t-119 50H251Zm0-80h500q36 0 62-26t26-63q0-36-26-62t-63-26h-70v-56q0-83-56.5-141T480-722q-83 0-141.5 58.5T280-522h-23q-56 0-96.5 40T120-386q0 56 40.5 96t90.5 40Zm229-260Z" />
            ) : weatherDisplayMode === 'wind' ? (
              /* Wind icon - MDI weather-windy */
              <g transform="matrix(-40, 0, 0, 40, 960, -960)">
                <path d="M4,10A1,1 0 0,1 3,9A1,1 0 0,1 4,8H12A2,2 0 0,0 14,6A2,2 0 0,0 12,4C11.45,4 10.95,4.22 10.59,4.59C10.2,5 9.56,5 9.17,4.59C8.78,4.2 8.78,3.56 9.17,3.17C9.9,2.45 10.9,2 12,2A4,4 0 0,1 16,6A4,4 0 0,1 12,10H4M19,12A1,1 0 0,0 20,11A1,1 0 0,0 19,10C18.72,10 18.47,10.11 18.29,10.29C17.9,10.68 17.27,10.68 16.88,10.29C16.5,9.9 16.5,9.27 16.88,8.88C17.42,8.34 18.17,8 19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14H5A1,1 0 0,1 4,13A1,1 0 0,1 5,12H19M18,18H4A1,1 0 0,1 3,17A1,1 0 0,1 4,16H18A3,3 0 0,1 21,19A3,3 0 0,1 18,22C17.17,22 16.42,21.66 15.88,21.12C15.5,20.73 15.5,20.1 15.88,19.71C16.27,19.32 16.9,19.32 17.29,19.71C17.47,19.89 17.72,20 18,20A1,1 0 0,0 19,19A1,1 0 0,0 18,18Z" />
              </g>
            ) : weatherDisplayMode === 'waves' ? (
              /* Waves icon - MDI waves */
              <g transform="matrix(-40, 0, 0, 40, 960, -960)">
                <path d="M20,12H22V14H20C18.62,14 17.26,13.65 16,13C13.5,14.3 10.5,14.3 8,13C6.74,13.65 5.37,14 4,14H2V12H4C5.39,12 6.78,11.53 8,10.67C10.44,12.38 13.56,12.38 16,10.67C17.22,11.53 18.61,12 20,12M20,6H22V8H20C18.62,8 17.26,7.65 16,7C13.5,8.3 10.5,8.3 8,7C6.74,7.65 5.37,8 4,8H2V6H4C5.39,6 6.78,5.53 8,4.67C10.44,6.38 13.56,6.38 16,4.67C17.22,5.53 18.61,6 20,6M20,18H22V20H20C18.62,20 17.26,19.65 16,19C13.5,20.3 10.5,20.3 8,19C6.74,19.65 5.37,20 4,20H2V18H4C5.39,18 6.78,17.53 8,16.67C10.44,18.38 13.56,18.38 16,16.67C17.22,17.53 18.61,18 20,18Z" />
              </g>
            ) : weatherDisplayMode === 'swell' ? (
              /* Swell icon - MDI wave-arrow-up */
              <g transform="matrix(-40, 0, 0, 40, 960, -960)">
                <path d="M20 7H22V9H20C18.62 9 17.26 8.65 16 8C13.5 9.3 10.5 9.3 8 8C6.74 8.65 5.37 9 4 9H2V7H4C5.39 7 6.78 6.53 8 5.67C10.44 7.38 13.56 7.38 16 5.67C17.22 6.53 18.61 7 20 7M12 11L16 15H13V22H11V15H8L12 11Z" />
              </g>
            ) : weatherDisplayMode === 'current' ? (
              /* Current icon - wave with small arrows below */
              <g transform="matrix(-40, 0, 0, 40, 960, -960)">
                {/* Wave */}
                <path d="M20 7H22V9H20C18.62 9 17.26 8.65 16 8C13.5 9.3 10.5 9.3 8 8C6.74 8.65 5.37 9 4 9H2V7H4C5.39 7 6.78 6.53 8 5.67C10.44 7.38 13.56 7.38 16 5.67C17.22 6.53 18.61 7 20 7" />
                {/* 3 arrows: top-left, middle-right, bottom-center */}
                <path d="M3 12L6 10V11.5H9V12.5H6V14L3 12Z" />
                <path d="M12 15L15 13V14.5H18V15.5H15V17L12 15Z" />
                <path d="M7 18L10 16V17.5H13V18.5H10V20L7 18Z" />
              </g>
            ) : (
              /* Sea temperature icon - Bootstrap thermometer */
              <g transform="matrix(-60, 0, 0, 60, 960, -960)">
                <path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V6.5a.5.5 0 0 1 1 0v4.585a1.5 1.5 0 0 1 1 1.415" />
                <path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1" />
              </g>
            )}
          </svg>
          <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>{t('chart.forecast')}</span>
        </button>
      )}

      {/* Search button */}
      <button
        onClick={onSearchClick}
        className={`chart-sidebar-btn with-label ${searchOpen ? 'active' : ''}`}
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        title={t('search.search_locations')}
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
        <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>{t('chart.search')}</span>
      </button>

      {/* Satellite/Street toggle button */}
      <button
        onClick={onSatelliteToggle}
        className="chart-sidebar-btn with-label"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        title={useSatellite ? t('chart.switch_to_street') : t('chart.switch_to_satellite')}
      >
        {useSatellite ? (
          // Map icon - shown when in satellite mode (click to switch to street/map)
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
            <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
        ) : (
          // Globe icon - shown when in street mode (click to switch to satellite)
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
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        )}
        <span style={{ fontSize: '0.55rem', opacity: 0.7 }}>
          {useSatellite ? t('chart.map') : t('chart.satellite')}
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
