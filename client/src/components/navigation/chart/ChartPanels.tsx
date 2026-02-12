import React from 'react';
import { SearchResult } from '../../../services/geocoding';
import { CustomMarker, markerIcons } from './map-icons';
import { useSettings, windConversions, depthConversions, temperatureConversions } from '../../../context/SettingsContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { radToDeg, degToRad, TWO_PI } from '../../../utils/angle';

interface DepthSettingsPanelProps {
  sidebarWidth: number;
  depthUnit: string;
  depthAlarm: number | null;
  soundAlarmEnabled: boolean;
  onSetDepthAlarm: (value: number | null) => void;
  onSetSoundAlarm: (enabled: boolean) => void;
  onClose: () => void;
}

export const DepthSettingsPanel: React.FC<DepthSettingsPanelProps> = ({
  sidebarWidth,
  depthUnit,
  depthAlarm,
  soundAlarmEnabled,
  onSetDepthAlarm,
  onSetSoundAlarm,
  onClose,
}) => {
  const { t } = useLanguage();
  const settingsPanelWidth = 180;
  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: `${settingsPanelWidth}px`,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'rgb(10, 25, 41)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.75rem' }}>
          {t('depth.depth_alarm_upper')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onSetDepthAlarm(null)}
            style={{
              padding: '0.9rem 0.75rem',
              background:
                depthAlarm === null
                  ? 'rgba(25, 118, 210, 0.5)'
                  : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              textAlign: 'left',
            }}
          >
            {t('common.off')}
          </button>
          {alarmOptions.map((alarmDepth) => (
            <button
              key={alarmDepth}
              onClick={() => onSetDepthAlarm(alarmDepth)}
              style={{
                padding: '0.9rem 0.75rem',
                background:
                  depthAlarm === alarmDepth
                    ? 'rgba(25, 118, 210, 0.5)'
                    : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.1rem',
                textAlign: 'left',
              }}
            >
              &lt; {alarmDepth} {depthUnit}
            </button>
          ))}
        </div>

        <div
          style={{
            fontSize: '0.8rem',
            opacity: 0.6,
            marginBottom: '0.75rem',
            marginTop: '1rem',
          }}
        >
          {t('depth.sound')}
        </div>
        <button
          onClick={() => onSetSoundAlarm(!soundAlarmEnabled)}
          style={{
            width: '100%',
            padding: '0.9rem 0.75rem',
            background: soundAlarmEnabled
              ? 'rgba(25, 118, 210, 0.5)'
              : 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1.1rem',
            textAlign: 'left',
          }}
        >
          {soundAlarmEnabled ? t('common.on') : t('common.off')}
        </button>
      </div>

      {/* Click outside to close (only on single click, not double-click zoom) */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: sidebarWidth,
          bottom: 0,
          zIndex: 999,
        }}
      />
    </>
  );
};

interface SearchPanelProps {
  sidebarWidth: number;
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  customMarkers: CustomMarker[];
  isOffline?: boolean;
  onSearchChange: (query: string) => void;
  onResultClick: (result: SearchResult) => void;
  onMarkerClick: (marker: CustomMarker) => void;
  onClose: () => void;
}

interface AutopilotPanelProps {
  sidebarWidth: number;
  targetHeading: number;
  isActive: boolean;
  hasActiveNavigation: boolean;
  followingRoute: boolean;
  currentBearing?: number | null;
  onSetHeading: (heading: number) => void;
  onToggleActive: () => void;
  onToggleFollowRoute: () => void;
  onClose: () => void;
}

export const AutopilotPanel: React.FC<AutopilotPanelProps> = ({
  sidebarWidth,
  targetHeading,
  isActive,
  hasActiveNavigation,
  followingRoute,
  currentBearing,
  onSetHeading,
  onToggleActive,
  onToggleFollowRoute,
  onClose,
}) => {
  const { t } = useLanguage();
  const settingsPanelWidth = 200;

  const adjustHeading = (deltaDeg: number) => {
    // Turn off follow mode when manually adjusting
    if (followingRoute) {
      onToggleFollowRoute();
    }
    let newHeading = targetHeading + degToRad(deltaDeg);
    if (newHeading >= TWO_PI) newHeading -= TWO_PI;
    if (newHeading < 0) newHeading += TWO_PI;
    onSetHeading(newHeading);
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: `${settingsPanelWidth}px`,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'rgb(10, 25, 41)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.75rem' }}>
          {t('autopilot.autopilot')}
        </div>

        {/* Heading display */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '1rem',
            padding: '0.75rem',
            background: isActive ? 'rgba(39, 174, 96, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            borderRadius: '6px',
            border: isActive ? '1px solid rgba(39, 174, 96, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>
            {t('autopilot.set_course')}
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            {radToDeg(targetHeading).toFixed(0)}°
          </div>
        </div>

        {/* Adjustment buttons - minus on left, plus on right */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          {/* Minus buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <button
              onClick={() => adjustHeading(-1)}
              style={{
                padding: '0.7rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              -1°
            </button>
            <button
              onClick={() => adjustHeading(-10)}
              style={{
                padding: '0.7rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              -10°
            </button>
          </div>
          {/* Plus buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <button
              onClick={() => adjustHeading(1)}
              style={{
                padding: '0.7rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              +1°
            </button>
            <button
              onClick={() => adjustHeading(10)}
              style={{
                padding: '0.7rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              +10°
            </button>
          </div>
        </div>

        {/* Follow Route toggle - show when navigation is active */}
        {hasActiveNavigation && currentBearing !== null && currentBearing !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0',
              marginBottom: '0.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.9rem' }}>
                {t('autopilot.follow_route')}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {radToDeg(currentBearing).toFixed(0)}°
              </div>
            </div>
            <button
              onClick={onToggleFollowRoute}
              style={{
                width: '56px',
                height: '32px',
                borderRadius: '16px',
                border: 'none',
                background: followingRoute ? 'rgba(39, 174, 96, 0.8)' : 'rgba(255, 255, 255, 0.2)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '3px',
                  left: followingRoute ? '27px' : '3px',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        )}

        {/* Activate/Deactivate button */}
        <button
          onClick={onToggleActive}
          style={{
            width: '100%',
            padding: '0.9rem',
            background: isActive ? 'rgba(239, 83, 80, 0.3)' : 'rgba(39, 174, 96, 0.3)',
            border: `1px solid ${isActive ? 'rgba(239, 83, 80, 0.5)' : 'rgba(39, 174, 96, 0.5)'}`,
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          {isActive ? t('autopilot.deactivate') : t('autopilot.activate')}
        </button>
      </div>

      {/* Click outside to close (only on single click, not double-click zoom) */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: sidebarWidth,
          bottom: 0,
          zIndex: 999,
        }}
      />
    </>
  );
};

// Weather forecast panel
type WeatherDisplayMode = 'wind' | 'waves' | 'swell' | 'current' | 'water-temp';

interface WeatherPanelProps {
  sidebarWidth: number;
  enabled: boolean;
  forecastHour: number;
  displayMode: WeatherDisplayMode;
  loading?: boolean;
  error?: string | null;
  onToggleEnabled: () => void;
  onSetForecastHour: (hour: number) => void;
  onSetDisplayMode: (mode: WeatherDisplayMode) => void;
  onClose: () => void;
}

// Forecast time presets (3x4 grid with Custom button)
const FORECAST_PRESETS = [
  { hour: 0, label: 'Now' },
  { hour: 1, label: '+1h' },
  { hour: 3, label: '+3h' },
  { hour: 6, label: '+6h' },
  { hour: 12, label: '+12h' },
  { hour: 24, label: '+1d' },
  { hour: 48, label: '+2d' },
  { hour: 72, label: '+3d' },
  { hour: 168, label: '+7d' },
];

// Display mode options for tab selector
const DISPLAY_MODES: { mode: WeatherDisplayMode; label: string }[] = [
  { mode: 'wind', label: 'Wind' },
  { mode: 'waves', label: 'Waves' },
  { mode: 'swell', label: 'Swell' },
  { mode: 'current', label: 'Current' },
  { mode: 'water-temp', label: 'Temp' },
];

export const WeatherPanel: React.FC<WeatherPanelProps> = ({
  sidebarWidth,
  enabled,
  forecastHour,
  displayMode,
  loading = false,
  error = null,
  onToggleEnabled,
  onSetForecastHour,
  onSetDisplayMode,
  onClose,
}) => {
  const settingsPanelWidth = 320;
  const { windUnit, depthUnit, temperatureUnit, timeFormat, dateFormat } = useSettings();
  const { t, language } = useLanguage();

  // Custom time dialog state
  const [showCustomDialog, setShowCustomDialog] = React.useState(false);
  const [customDays, setCustomDays] = React.useState(0);
  const [customHours, setCustomHours] = React.useState(0);

  // Calculate forecast time (rounded to actual forecast hours)
  const getForecastTime = () => {
    if (!enabled) return null;
    const now = new Date();
    // Round down to current hour (forecast data is hourly)
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const forecastDate = new Date(currentHour.getTime() + forecastHour * 60 * 60 * 1000);

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const forecastDay = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), forecastDate.getDate());
    const dayDiff = Math.round((forecastDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    const timeStr = forecastDate.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });

    if (dayDiff === 0) {
      return `${t('common.today')} ${timeStr}`;
    } else if (dayDiff === 1) {
      return `${t('common.tomorrow')} ${timeStr}`;
    } else {
      // Format date based on user's date format preference
      const day = forecastDate.getDate().toString().padStart(2, '0');
      const month = (forecastDate.getMonth() + 1).toString().padStart(2, '0');
      const weekday = forecastDate.toLocaleDateString(language, { weekday: 'short' });

      let dateStr: string;
      switch (dateFormat) {
        case 'MM/DD/YYYY':
          dateStr = `${weekday} ${month}/${day}`;
          break;
        case 'YYYY-MM-DD':
          dateStr = `${weekday} ${month}-${day}`;
          break;
        case 'DD/MM/YYYY':
        default:
          dateStr = `${weekday} ${day}/${month}`;
          break;
      }
      return `${dateStr} ${timeStr}`;
    }
  };

  // Check if current forecastHour matches a preset
  const isPresetSelected = FORECAST_PRESETS.some(p => p.hour === forecastHour);

  const handlePresetSelect = (hour: number) => {
    if (!enabled) onToggleEnabled();
    onSetForecastHour(hour);
  };

  const handleOpenCustomDialog = () => {
    // Initialize dialog with current values
    const days = Math.floor(forecastHour / 24);
    const hours = forecastHour % 24;
    setCustomDays(days);
    setCustomHours(hours);
    setShowCustomDialog(true);
  };

  const handleApplyCustomTime = () => {
    const totalHours = Math.min(168, customDays * 24 + customHours);
    if (!enabled) onToggleEnabled();
    onSetForecastHour(totalHours);
    setShowCustomDialog(false);
  };

  const isSelected = (hour: number) => {
    return enabled && forecastHour === hour;
  };

  // Wind speed legend ranges with nice round numbers per unit
  const legendRanges: Record<string, string[]> = {
    'kt': ['<10', '10-20', '20-30', '30-40', '40+'],
    'km/h': ['<20', '20-35', '35-55', '55-75', '75+'],
    'mph': ['<15', '15-25', '25-35', '35-45', '45+'],
    'm/s': ['<5', '5-10', '10-15', '15-20', '20+'],
    'bft': ['0-3', '3-5', '5-6', '6-8', '8+'],
  };

  const unitLabel = windConversions[windUnit].label;
  const ranges = legendRanges[windUnit] || legendRanges['kt'];

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: `${settingsPanelWidth}px`,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'rgb(10, 25, 41)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.5rem' }}>
          {t('weather.marine_forecast')}
        </div>

        {/* Display mode selector - 2 rows */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.4rem',
          marginBottom: '0.75rem',
        }}>
          {DISPLAY_MODES.map(({ mode }) => {
            const modeLabels: Record<WeatherDisplayMode, string> = {
              'wind': t('weather.wind'),
              'waves': t('weather.waves'),
              'swell': t('weather.swell'),
              'current': t('weather.current'),
              'water-temp': t('weather.temp'),
            };
            return (
              <button
                key={mode}
                onClick={() => {
                  onSetDisplayMode(mode);
                  if (!enabled) onToggleEnabled();
                }}
                style={{
                  padding: '0.9rem 0.4rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: displayMode === mode && enabled ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontWeight: displayMode === mode && enabled ? 'bold' : 'normal',
                }}
              >
                {modeLabels[mode]}
              </button>
            );
          })}
          <button
            onClick={() => { if (enabled) onToggleEnabled(); }}
            style={{
              padding: '0.9rem 0.4rem',
              borderRadius: '6px',
              border: 'none',
              background: !enabled ? 'rgba(239, 83, 80, 0.5)' : 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.9rem',
              cursor: 'pointer',
              fontWeight: !enabled ? 'bold' : 'normal',
            }}
          >
            {t('common.off')}
          </button>
        </div>

        {/* Fixed-height status area - always present to prevent layout shift */}
        <div style={{
          minHeight: '36px',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.4rem 0.5rem',
          background: error && !loading ? 'rgba(255, 152, 0, 0.1)' : 'rgba(79, 195, 247, 0.08)',
          borderRadius: '4px',
          fontSize: '0.9rem',
        }}>
          {loading ? (
            <>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  marginRight: '0.4rem',
                  border: '2px solid rgba(79, 195, 247, 0.3)',
                  borderTopColor: '#4FC3F7',
                  borderRadius: '50%',
                  animation: 'weather-spin 1s linear infinite',
                }}
              />
              <span style={{ color: '#4FC3F7' }}>{t('weather.loading')}</span>
            </>
          ) : error ? (
            <span style={{ color: '#FF9800', fontSize: '0.75rem', textAlign: 'center' }}>{error}</span>
          ) : enabled ? (
            <span style={{ color: '#4FC3F7' }}>{getForecastTime()}</span>
          ) : (
            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{t('weather.select_time')}</span>
          )}
        </div>

        {/* TIME section header */}
        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.4rem', marginTop: '0.25rem' }}>
          {t('weather.time')}
        </div>

        {/* Time preset buttons + Custom */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '0.4rem',
          marginBottom: '0.75rem',
        }}>
          {FORECAST_PRESETS.map((opt) => (
            <button
              key={opt.hour}
              onClick={() => handlePresetSelect(opt.hour)}
              style={{
                padding: '0.9rem 0.3rem',
                borderRadius: '6px',
                border: 'none',
                background: isSelected(opt.hour) ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {opt.hour === 0 ? t('weather.now') : opt.label}
            </button>
          ))}
          <button
            onClick={handleOpenCustomDialog}
            style={{
              padding: '0.9rem 0.3rem',
              borderRadius: '6px',
              border: 'none',
              background: !isPresetSelected && enabled ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.9rem',
              cursor: 'pointer',
              fontWeight: !isPresetSelected && enabled ? 'bold' : 'normal',
            }}
          >
            {t('weather.custom')}
          </button>
        </div>

        {/* Legend */}
        <div style={{
          paddingTop: '0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {displayMode === 'wind' ? (
            <>
              <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
                {t('weather.wind_speed')} ({unitLabel})
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.85)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4FC3F7' }}></span>
                  {ranges[0]}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50' }}></span>
                  {ranges[1]}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFEB3B' }}></span>
                  {ranges[2]}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF9800' }}></span>
                  {ranges[3]}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F44336' }}></span>
                  {ranges[4]}
                </span>
              </div>
            </>
          ) : displayMode === 'waves' || displayMode === 'swell' ? (
            <>
              <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
                {displayMode === 'swell' ? t('weather.swell_height') : t('weather.wave_height')} ({depthConversions[depthUnit].label}) + period (s)
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.85)',
              }}>
                {depthUnit === 'm' ? (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4FC3F7' }}></span>
                      &lt;0.5
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50' }}></span>
                      0.5-1
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFEB3B' }}></span>
                      1-2
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF9800' }}></span>
                      2-3
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F44336' }}></span>
                      3+
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4FC3F7' }}></span>
                      &lt;2
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50' }}></span>
                      2-3
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFEB3B' }}></span>
                      3-7
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF9800' }}></span>
                      7-10
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F44336' }}></span>
                      10+
                    </span>
                  </>
                )}
              </div>
            </>
          ) : displayMode === 'current' ? (
            <>
              <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
                {t('weather.current_speed')} (kt)
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.85)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ADD8E6' }}></span>
                  &lt;0.5
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8A2BE2' }}></span>
                  0.5-1
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#9400D3' }}></span>
                  1-2
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF1493' }}></span>
                  2-3
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#8B0000' }}></span>
                  3+
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
                {t('weather.sea_temperature')} ({temperatureConversions[temperatureUnit].label})
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.85)',
              }}>
                {temperatureUnit === '°C' ? (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6495ED' }}></span>
                      &lt;10
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00D2FF' }}></span>
                      10-15
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#32CD32' }}></span>
                      15-20
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFD700' }}></span>
                      20-25
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#DC143C' }}></span>
                      25+
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6495ED' }}></span>
                      &lt;50
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00D2FF' }}></span>
                      50-60
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#32CD32' }}></span>
                      60-70
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFD700' }}></span>
                      70-80
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#DC143C' }}></span>
                      80+
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Attribution */}
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.65rem',
          opacity: 0.5,
          textAlign: 'center',
        }}>
          {t('weather.powered_by')}
        </div>

        <style>{`
          @keyframes weather-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Custom Time Dialog */}
      {showCustomDialog && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgb(10, 25, 41)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            padding: '1.25rem',
            zIndex: 1100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '280px',
          }}
        >
          <div style={{ fontSize: '0.9rem', opacity: 0.6, marginBottom: '1rem' }}>
            {t('weather.custom_time')}
          </div>

          {/* Days selector */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.4rem' }}>{t('weather.days_from_now')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setCustomDays(Math.max(0, customDays - 1))}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                -
              </button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '1.3rem',
                fontWeight: 'bold',
              }}>
                {customDays}
              </div>
              <button
                onClick={() => setCustomDays(Math.min(6, customDays + 1))}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Hours selector */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.5, marginBottom: '0.4rem' }}>{t('weather.hours')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={() => setCustomHours(Math.max(0, customHours - 1))}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                -
              </button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '1.3rem',
                fontWeight: 'bold',
              }}>
                {customHours}
              </div>
              <button
                onClick={() => setCustomHours(Math.min(23, customHours + 1))}
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Date/time preview */}
          <div style={{
            textAlign: 'center',
            fontSize: '1rem',
            color: '#4FC3F7',
            marginBottom: '1rem',
            padding: '0.6rem',
            background: 'rgba(79, 195, 247, 0.1)',
            borderRadius: '6px',
          }}>
            {(() => {
              const totalHours = customDays * 24 + customHours;
              const now = new Date();
              const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
              const forecastDate = new Date(currentHour.getTime() + totalHours * 60 * 60 * 1000);
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const forecastDay = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), forecastDate.getDate());
              const dayDiff = Math.round((forecastDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
              const timeStr = forecastDate.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });

              if (dayDiff === 0) {
                return `${t('common.today')} ${timeStr}`;
              } else if (dayDiff === 1) {
                return `${t('common.tomorrow')} ${timeStr}`;
              } else {
                const weekday = forecastDate.toLocaleDateString(language, { weekday: 'short' });
                const day = forecastDate.getDate().toString().padStart(2, '0');
                const month = (forecastDate.getMonth() + 1).toString().padStart(2, '0');
                return `${weekday} ${day}/${month} ${timeStr}`;
              }
            })()}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              onClick={() => setShowCustomDialog(false)}
              style={{
                flex: 1,
                padding: '0.9rem',
                borderRadius: '6px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleApplyCustomTime}
              style={{
                flex: 1,
                padding: '0.9rem',
                borderRadius: '6px',
                border: 'none',
                background: 'rgba(25, 118, 210, 0.6)',
                color: '#fff',
                fontSize: '1rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              {t('common.apply')}
            </button>
          </div>
        </div>
      )}

      {/* Dialog backdrop */}
      {showCustomDialog && (
        <div
          onClick={() => setShowCustomDialog(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1050,
          }}
        />
      )}

      {/* Click outside to close (only on single click, not double-click zoom) */}
      {!showCustomDialog && (
        <div
          onClick={(e) => {
            if (e.detail === 1) onClose();
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: sidebarWidth,
            bottom: 0,
            zIndex: 999,
          }}
        />
      )}
    </>
  );
};

export const SearchPanel: React.FC<SearchPanelProps> = ({
  sidebarWidth,
  searchQuery,
  searchResults,
  searchLoading,
  customMarkers,
  isOffline = false,
  onSearchChange,
  onResultClick,
  onMarkerClick,
  onClose,
}) => {
  const { t } = useLanguage();
  const getMatchingMarkers = (query: string): CustomMarker[] => {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.length < 2) return [];
    return customMarkers.filter((marker) =>
      marker.name.toLowerCase().includes(lowerQuery)
    );
  };

  const matchingMarkers = getMatchingMarkers(searchQuery);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: '340px',
          maxHeight: 'calc(100vh - 32px)',
          background: 'rgb(10, 25, 41)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.25rem' }}>
          {t('search.search_locations')}
        </div>

        {/* Offline notice */}
        {isOffline && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: 'rgba(239, 68, 68, 0.9)',
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
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            {t('search.offline_marker_only')}
          </div>
        )}

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('search.type_to_search')}
            style={{
              width: '100%',
              padding: '0.75rem',
              paddingRight: searchLoading ? '2.5rem' : '0.75rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none',
            }}
            autoFocus
          />
          {searchLoading && (
            <div
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.8rem',
                opacity: 0.6,
              }}
            >
              ...
            </div>
          )}
        </div>

        {/* Search results */}
        <div
          className="chart-search-results"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            paddingRight: '8px',
            marginRight: '-4px',
          }}
        >
          {/* Custom markers section */}
          {searchQuery && matchingMarkers.length > 0 && (
            <>
              <div
                style={{
                  fontSize: '0.75rem',
                  opacity: 0.5,
                  marginBottom: '0.25rem',
                  marginTop: '0.25rem',
                }}
              >
                {t('search.your_markers')}
              </div>
              {matchingMarkers.map((marker) => (
                <button
                  key={`marker-${marker.id}`}
                  onClick={() => onMarkerClick(marker)}
                  className="touch-btn"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: `1px solid ${marker.color}`,
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={marker.color}
                    stroke="#fff"
                    strokeWidth="1.5"
                  >
                    <path d={markerIcons[marker.icon] || markerIcons.pin} />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{marker.name}</div>
                    <div style={{ opacity: 0.5, fontSize: '0.75rem' }}>
                      {marker.lat.toFixed(4)}, {marker.lon.toFixed(4)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Geocoding results section */}
          {searchQuery && searchResults.length > 0 && (
            <div
              style={{
                fontSize: '0.7rem',
                opacity: 0.5,
                marginBottom: '0.25rem',
                marginTop: '0.5rem',
              }}
            >
              {t('search.locations')}
            </div>
          )}
          {searchLoading && searchQuery && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <div style={{ opacity: 0.6, fontSize: '0.85rem' }}>
                  {t('search.searching')}
                </div>
              </div>
            )}
          {searchResults.length === 0 &&
            matchingMarkers.length === 0 &&
            !searchLoading &&
            searchQuery && (
              <div
                style={{
                  opacity: 0.6,
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  padding: '1rem',
                }}
              >
                {t('search.no_results')}
              </div>
            )}
          {searchResults.map((result, index) => (
            <button
              key={`${result.lat}-${result.lon}-${index}`}
              onClick={() => onResultClick(result)}
              className="touch-btn"
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {result.display_name.split(',')[0]}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                {result.display_name.split(',').slice(1).join(',').trim()}
              </div>
              <div style={{ opacity: 0.5, fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {result.type}
              </div>
            </button>
          ))}
        </div>

        {/* Attribution */}
        <div style={{
          marginTop: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.65rem',
          opacity: 0.5,
          textAlign: 'center',
        }}>
          {t('chart.search_attribution')}
        </div>
      </div>

      {/* Click outside to close (only on single click, not double-click zoom) */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: sidebarWidth,
          bottom: 0,
          zIndex: 999,
        }}
      />

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
