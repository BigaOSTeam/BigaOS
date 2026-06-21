import React from 'react';
import { Compass } from './MapComponents';
import {
  speedConversions,
  depthConversions,
  SpeedUnit,
  DepthUnit,
  SidebarPosition,
} from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { ScrollableControlColumn } from './ScrollableControlColumn';
import { radToDeg } from '../../../utils/angle';

type WeatherDisplayMode = 'wind' | 'waves' | 'swell' | 'current' | 'water-temp' | 'tide';

interface ChartSidebarProps {
  heading: number | null;
  cog: number | null;
  convertedSpeed: number | null;
  convertedStw: number | null;
  speedUnit: SpeedUnit;
  convertedDepth: number | null;
  depthUnit: DepthUnit;
  depthColor: string;
  depthAlarm: number | null;
  depthSettingsOpen: boolean;
  searchOpen: boolean;
  layersPanelOpen: boolean;
  autoCenter: boolean;
  bearingToTarget?: number | null;
  bearingToMOB?: number | null;
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
  onLayersClick: () => void;
  onRecenter: () => void;
  onMOBPressStart: () => void;
  onMOBPressEnd: () => void;
  onCompassClick: () => void;
  onDebugToggle?: () => void;
  onWeatherClick?: () => void;
  toolsPanelOpen?: boolean;
  onToolsClick?: () => void;
  sidebarWidth?: number;
  sidebarPosition?: SidebarPosition;
}

export const ChartSidebar: React.FC<ChartSidebarProps> = ({
  heading,
  cog,
  convertedSpeed,
  convertedStw,
  speedUnit,
  convertedDepth,
  depthUnit,
  depthColor,
  depthAlarm,
  depthSettingsOpen,
  searchOpen,
  layersPanelOpen,
  autoCenter,
  bearingToTarget,
  bearingToMOB,
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
  onLayersClick,
  onRecenter,
  onMOBPressStart,
  onMOBPressEnd,
  onCompassClick,
  onDebugToggle: _onDebugToggle,
  onWeatherClick,
  toolsPanelOpen,
  onToolsClick,
  sidebarWidth: sidebarWidthProp,
  sidebarPosition = 'left',
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const sidebarWidth = sidebarWidthProp ?? 100;
  const separator = `1px solid ${theme.colors.border}`;
  const isCompact = window.innerHeight <= 500;
  // COG arrives in radians (NMEA2000 convention); show it as a 3-digit course.
  const cogText = cog !== null && Number.isFinite(cog)
    ? `${((Math.round(radToDeg(cog)) % 360) + 360) % 360}°`
    : '—';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        [sidebarPosition]: 0,
        width: `${sidebarWidth}px`,
        height: '100%',
        [`border${sidebarPosition === 'left' ? 'Right' : 'Left'}`]: separator,
        background: theme.colors.bgTertiary,
        // Bind the text colour to the theme explicitly — the SOG/COG/heading
        // readouts render with no colour of their own, so without this they fall
        // back to whatever colour they inherit and turn unreadable in light theme.
        color: theme.colors.textPrimary,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden auto',
      }}
    >
      {/* Settings button (chart-only mode) or Home button */}
      {onOpenSettings ? (
        <button
          onClick={onOpenSettings}
          className="chart-sidebar-btn"
          style={{
            borderBottom: separator,
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
          className="chart-sidebar-btn with-label"
          style={{
            borderBottom: separator,
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
            <path d="M12 12C12 11.4477 12.4477 11 13 11H19C19.5523 11 20 11.4477 20 12V19C20 19.5523 19.5523 20 19 20H13C12.4477 20 12 19.5523 12 19V12Z" />
            <path d="M4 5C4 4.44772 4.44772 4 5 4H8C8.55228 4 9 4.44772 9 5V19C9 19.5523 8.55228 20 8 20H5C4.44772 20 4 19.5523 4 19V5Z" />
            <path d="M12 5C12 4.44772 12.4477 4 13 4H19C19.5523 4 20 4.44772 20 5V7C20 7.55228 19.5523 8 19 8H13C12.4477 8 12 7.55228 12 7V5Z" />
          </svg>
          <span style={{ opacity: 0.7 }}>{t('dashboard.title')}</span>
        </button>
      )}

      {/* Compass - clickable to open autopilot */}
      <div
        onClick={onCompassClick}
        style={{
          padding: '0.5rem 0.5rem',
          borderBottom: separator,
          cursor: 'pointer',
          background: autopilotOpen ? theme.colors.bgCardActive : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <Compass heading={heading} bearingToTarget={bearingToTarget} bearingToMOB={bearingToMOB} />
      </div>

      {/* COG — small line directly under the compass heading */}
      <div
        style={{
          padding: isCompact ? '0.1rem 0.25rem 0.3rem' : '0 0.5rem 0.4rem',
          textAlign: 'center',
          borderBottom: separator,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: '0.35rem',
        }}
      >
        <span style={{ fontSize: 'clamp(0.5rem, 1.1vh, 0.75rem)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('chart.cog')}
        </span>
        <span style={{ fontSize: 'clamp(0.85rem, 2vh, 1.25rem)', fontWeight: 'bold' }}>
          {cogText}
        </span>
      </div>

      {/* Speed — SOG primary (always-available GPS), STW secondary below */}
      <div
        style={{
          padding: isCompact ? '0.3rem 0.25rem' : '0.5rem 0.5rem',
          textAlign: 'center',
          borderBottom: separator,
        }}
      >
        <div style={{ fontSize: 'clamp(0.55rem, 1.2vh, 0.8rem)', opacity: 0.6, marginBottom: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('chart.sog')}
        </div>
        <div style={{ fontSize: 'clamp(1.1rem, 2.5vh, 1.6rem)', fontWeight: 'bold' }}>
          {convertedSpeed !== null ? convertedSpeed.toFixed(1) : '—'}
          <span style={{ fontSize: '0.6em', opacity: 0.6, fontWeight: 'normal', marginLeft: '0.2rem' }}>
            {speedConversions[speedUnit].label}
          </span>
        </div>
        <div style={{ fontSize: 'clamp(0.7rem, 1.7vh, 1.05rem)', marginTop: '0.2rem' }}>
          <span style={{ opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('chart.stw')}
          </span>{' '}
          <span style={{ fontWeight: 600 }}>{convertedStw !== null ? convertedStw.toFixed(1) : '—'}</span>
          <span style={{ opacity: 0.55, fontSize: '0.8em' }}> {speedConversions[speedUnit].label}</span>
        </div>
      </div>

      {/* Depth — clickable to open alarm settings */}
      <div
        onClick={onDepthClick}
        style={{
          padding: isCompact ? '0.3rem 0.25rem' : '0.5rem 0.5rem',
          textAlign: 'center',
          borderBottom: separator,
          cursor: 'pointer',
          background: depthSettingsOpen ? theme.colors.bgCardActive : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(0.55rem, 1.2vh, 0.8rem)',
            opacity: 0.6,
            marginBottom: '0.15rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
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
        <div style={{ fontSize: 'clamp(1.1rem, 2.5vh, 1.6rem)', fontWeight: 'bold', color: depthColor }}>
          {convertedDepth !== null ? convertedDepth.toFixed(1) : '—'}
        </div>
        <div style={{ fontSize: 'clamp(0.55rem, 1.2vh, 0.8rem)', opacity: 0.6 }}>
          {depthConversions[depthUnit].label}
        </div>
      </div>

      {/* Bottom action buttons — windowed/paginated when they don't all fit;
          MOB stays pinned at the bottom and is never scrolled away. */}
      <ScrollableControlColumn
        separator={separator}
        items={[
          // Search
          <button
            key="search"
            onClick={onSearchClick}
            className={`chart-sidebar-btn with-label ${searchOpen ? 'active' : ''}`}
            style={{
              borderTop: separator,
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
            <span style={{ opacity: 0.7 }}>{t('chart.search')}</span>
          </button>,

          // Tools — opens a side panel with chart tools (ruler, ...)
          onToolsClick ? (
            <button
              key="tools"
              onClick={onToolsClick}
              className={`chart-sidebar-btn with-label ${toolsPanelOpen ? 'active' : ''}`}
              style={{
                borderTop: separator,
              }}
              title={t('chart.tools')}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={toolsPanelOpen ? '#4fc3f7' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span style={{ opacity: 0.7 }}>{t('chart.tools')}</span>
            </button>
          ) : null,

          // Forecast
          onWeatherClick ? (
            <button
              key="forecast"
              onClick={onWeatherClick}
              className={`chart-sidebar-btn with-label ${weatherPanelOpen || weatherOverlayEnabled ? 'active' : ''}`}
              style={{
                borderTop: separator,
                background: weatherPanelOpen ? theme.colors.bgCardActive : 'transparent',
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
                ) : weatherDisplayMode === 'tide' ? (
                  /* Tide icon - water surface with rise/fall level arrows */
                  <g transform="matrix(-40, 0, 0, 40, 960, -960)">
                    <path d="M12 2L8.5 6.5H10.75V11H13.25V6.5H15.5L12 2M12 22L15.5 17.5H13.25V13H10.75V17.5H8.5L12 22Z" />
                    <path d="M20 21C18.61 21 17.22 20.53 16 19.67C13.56 21.38 10.44 21.38 8 19.67C6.78 20.53 5.39 21 4 21H2V19H4C5.39 19 6.78 18.53 8 17.67C10.44 19.38 13.56 19.38 16 17.67C17.22 18.53 18.61 19 20 19H22V21H20Z" />
                  </g>
                ) : (
                  /* Sea temperature icon - Bootstrap thermometer */
                  <g transform="matrix(-60, 0, 0, 60, 960, -960)">
                    <path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V6.5a.5.5 0 0 1 1 0v4.585a1.5 1.5 0 0 1 1 1.415" />
                    <path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1" />
                  </g>
                )}
              </svg>
              <span style={{ opacity: 0.7 }}>{t('chart.forecast')}</span>
            </button>
          ) : null,

          // Layers — opens a panel to pick the base map and toggle overlays
          <button
            key="layers"
            onClick={onLayersClick}
            className={`chart-sidebar-btn with-label ${layersPanelOpen ? 'active' : ''}`}
            style={{
              borderTop: separator,
            }}
            title={t('chart.layers')}
          >
            {/* Stacked-layers icon */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke={layersPanelOpen ? '#4fc3f7' : 'currentColor'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span style={{ opacity: 0.7 }}>{t('chart.layers')}</span>
          </button>,

          // Recenter
          <button
            key="recenter"
            onClick={onRecenter}
            className={`chart-sidebar-btn ${autoCenter ? 'active' : ''}`}
            style={{
              borderTop: separator,
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
          </button>,
        ].filter(Boolean)}
        footer={
          /* Man Overboard button — press and hold 1.5s to activate.
             Pointer events are forwarded to ChartView, which owns the hold
             timer and the centered ring overlay. */
          <button
            key="mob"
            className="chart-sidebar-btn with-label mob"
            style={{ borderTop: separator }}
            title={t('chart.mob_title')}
            onPointerDown={(e) => {
              e.preventDefault();
              onMOBPressStart();
            }}
            onPointerUp={onMOBPressEnd}
            onPointerLeave={onMOBPressEnd}
            onPointerCancel={onMOBPressEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Life-ring icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="8" />
              <line x1="12" y1="16" x2="12" y2="22" />
              <line x1="2" y1="12" x2="8" y2="12" />
              <line x1="16" y1="12" x2="22" y2="12" />
            </svg>
            <span>{t('chart.mob')}</span>
          </button>
        }
      />
    </div>
  );
};
