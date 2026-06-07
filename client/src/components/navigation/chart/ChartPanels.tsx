import React from 'react';
import { SearchResult } from '../../../services/geocoding';
import { CustomMarker, markerIcons } from './map-icons';
import { useSettings, windConversions, depthConversions, temperatureConversions, speedConversions, SidebarPosition } from '../../../context/SettingsContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../context/ThemeContext';
import { useTileSources, useChartLayers } from '../../../context/TileSourcesContext';
import { radToDeg, degToRad, TWO_PI } from '../../../utils/angle';
import { getSunTimes, getMoonPhase } from '../../../utils/astronomy';
import { TIDE_WINDOW_HOURS, type TideForecast } from './WeatherOverlay';

// Helper to compute panel positioning based on sidebar position
function getPanelPositionStyle(sidebarWidth: number, sidebarPosition: SidebarPosition): React.CSSProperties {
  return {
    top: '50%',
    transform: 'translateY(-50%)',
    [sidebarPosition === 'left' ? 'left' : 'right']: `${sidebarWidth + 8}px`,
  };
}

// Helper to compute the click-outside overlay positioning
function getOverlayStyle(sidebarWidth: number, sidebarPosition: SidebarPosition): React.CSSProperties {
  return {
    position: 'absolute' as const,
    top: 0,
    left: sidebarPosition === 'left' ? sidebarWidth : 0,
    right: sidebarPosition === 'right' ? sidebarWidth : 0,
    bottom: 0,
    zIndex: 1000,
  };
}

interface DepthSettingsPanelProps {
  sidebarWidth: number;
  sidebarPosition?: SidebarPosition;
  depthUnit: string;
  depthAlarm: number | null;
  soundAlarmEnabled: boolean;
  onSetDepthAlarm: (value: number | null) => void;
  onSetSoundAlarm: (enabled: boolean) => void;
  onClose: () => void;
}

export const DepthSettingsPanel: React.FC<DepthSettingsPanelProps> = ({
  sidebarWidth,
  sidebarPosition = 'left',
  depthUnit,
  depthAlarm,
  soundAlarmEnabled,
  onSetDepthAlarm,
  onSetSoundAlarm,
  onClose,
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const settingsPanelWidth = 180;
  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

  return (
    <>
      <div
        style={{
          position: 'absolute',
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(${settingsPanelWidth}px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
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
                  : theme.colors.bgCardActive,
              border: 'none',
              borderRadius: '6px',
              color: theme.colors.textPrimary,
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
                    : theme.colors.bgCardActive,
                border: 'none',
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
              : theme.colors.bgCardActive,
            border: 'none',
            borderRadius: '6px',
            color: theme.colors.textPrimary,
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
          ...getOverlayStyle(sidebarWidth, sidebarPosition),
          zIndex: 999,
        }}
      />
    </>
  );
};

interface RulerLeg {
  /** Leg distance, pre-formatted in the user's unit. */
  distanceText: string;
  /** Leg bearing as a 3-digit degree string, e.g. "045°". */
  bearingText: string;
}

type ToolId = 'ruler' | 'goto' | 'sun' | 'cts';

interface ToolsPanelProps {
  sidebarWidth: number;
  sidebarPosition?: SidebarPosition;
  // Ruler — measurement state lives in ChartView, driven by map taps.
  rulerPointCount: number;
  rulerTotalText: string | null;
  rulerLegs: RulerLeg[];
  /** Fired when the ruler becomes the open tool (true) or is left (false). */
  onRulerActiveChange: (active: boolean) => void;
  onClearRuler: () => void;
  // Go to coordinates
  onGoToCoordinates: (lat: number, lon: number) => void;
  // Sun & moon — boat position to compute against
  boatLat: number;
  boatLon: number;
  onClose: () => void;
}

const MOON_PHASE_KEYS = [
  'chart.moon_new',
  'chart.moon_waxing_crescent',
  'chart.moon_first_quarter',
  'chart.moon_waxing_gibbous',
  'chart.moon_full',
  'chart.moon_waning_gibbous',
  'chart.moon_last_quarter',
  'chart.moon_waning_crescent',
];

/**
 * Side panel listing chart tools as an accordion: ruler (tap points to measure),
 * go-to coordinates, a sun & moon almanac, and a course-to-steer calculator.
 * Only one tool is expanded at a time.
 *
 * When the ruler is the open tool the click-outside overlay is suppressed so
 * taps reach the map; the parent is notified via onRulerActiveChange so it can
 * capture clicks and draw the measurement.
 */
export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  sidebarWidth,
  sidebarPosition = 'left',
  rulerPointCount,
  rulerTotalText,
  rulerLegs,
  onRulerActiveChange,
  onClearRuler,
  onGoToCoordinates,
  boatLat,
  boatLon,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const { timeFormat, speedUnit } = useSettings();
  const panelWidth = 240;

  const [activeTool, setActiveTool] = React.useState<ToolId | null>(null);
  const rulerActive = activeTool === 'ruler';

  // Let the chart arm/disarm map taps as the ruler tool is opened/left.
  React.useEffect(() => {
    onRulerActiveChange(rulerActive);
  }, [rulerActive, onRulerActiveChange]);

  // Go-to-coordinates form
  const [latInput, setLatInput] = React.useState('');
  const [lonInput, setLonInput] = React.useState('');
  const [gotoError, setGotoError] = React.useState(false);

  // Course-to-steer form
  const [ctsTrack, setCtsTrack] = React.useState('');
  const [ctsBoat, setCtsBoat] = React.useState('');
  const [ctsSet, setCtsSet] = React.useState('');
  const [ctsDrift, setCtsDrift] = React.useState('');

  const speedLabel = speedConversions[speedUnit].label;
  const parseNum = (s: string): number => parseFloat(s.trim().replace(',', '.'));

  const fmtTime = (d: Date | null): string =>
    d
      ? d.toLocaleTimeString(language, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: timeFormat === '12h',
        })
      : '—';

  const sun = React.useMemo(
    () => getSunTimes(new Date(), boatLat, boatLon),
    [boatLat, boatLon]
  );
  const moon = React.useMemo(() => getMoonPhase(new Date()), []);

  // Vector triangle: heading to steer + speed over ground for a desired track
  // given boat speed and the current's set/drift.
  const cts = React.useMemo(() => {
    const trackDeg = parseNum(ctsTrack);
    const boatSpeed = parseNum(ctsBoat);
    const setDeg = parseNum(ctsSet);
    const drift = parseNum(ctsDrift);
    if (![trackDeg, boatSpeed, setDeg, drift].every(Number.isFinite) || boatSpeed <= 0) {
      return null;
    }
    const rel = (setDeg - trackDeg) * (Math.PI / 180);
    const cross = drift * Math.sin(rel);
    const along = drift * Math.cos(rel);
    const sinCorr = -cross / boatSpeed;
    if (Math.abs(sinCorr) > 1) return { tooStrong: true as const };
    const corr = Math.asin(sinCorr);
    const heading = (((trackDeg + corr * (180 / Math.PI)) % 360) + 360) % 360;
    const sog = boatSpeed * Math.cos(corr) + along;
    return {
      tooStrong: false as const,
      headingText: `${String(Math.round(heading) % 360).padStart(3, '0')}°`,
      sogText: `${sog.toFixed(1)} ${speedLabel}`,
    };
  }, [ctsTrack, ctsBoat, ctsSet, ctsDrift, speedLabel]);

  const handleGo = () => {
    const lat = parseNum(latInput);
    const lon = parseNum(lonInput);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      setGotoError(true);
      return;
    }
    setGotoError(false);
    onGoToCoordinates(lat, lon);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    background: theme.colors.bgCardActive,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '4px',
    color: theme.colors.textPrimary,
    fontSize: '0.9rem',
  };
  const primaryButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem',
    background: 'rgba(25, 118, 210, 0.5)',
    border: 'none',
    borderRadius: '6px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    fontSize: '0.9rem',
  };
  const secondaryButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    background: theme.colors.bgCardActive,
    marginTop: '0.6rem',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    padding: '2px 0',
  };
  const fieldLabelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    opacity: 0.6,
    marginBottom: '0.15rem',
  };

  const icons: Record<ToolId, React.ReactNode> = {
    ruler: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
        <path d="m14.5 12.5 2-2" />
        <path d="m11.5 9.5 2-2" />
        <path d="m8.5 6.5 2-2" />
        <path d="m17.5 15.5 2-2" />
      </svg>
    ),
    goto: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    sun: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
      </svg>
    ),
    cts: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
  };

  const labels: Record<ToolId, string> = {
    ruler: t('chart.ruler'),
    goto: t('chart.goto'),
    sun: t('chart.sun_moon'),
    cts: t('chart.cts'),
  };

  const order: ToolId[] = ['ruler', 'goto', 'sun', 'cts'];

  return (
    <>
      <div
        style={{
          position: 'absolute',
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(${panelWidth}px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.75rem' }}>
          {t('chart.tools')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {order.map((id) => {
            const open = activeTool === id;
            return (
              <div key={id}>
                <button
                  onClick={() => setActiveTool(open ? null : id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.7rem 0.75rem',
                    background: open
                      ? 'rgba(25, 118, 210, 0.5)'
                      : theme.colors.bgCardActive,
                    border: 'none',
                    borderRadius: '6px',
                    color: theme.colors.textPrimary,
                    cursor: 'pointer',
                    fontSize: '1rem',
                    textAlign: 'left',
                  }}
                >
                  {icons[id]}
                  <span>{labels[id]}</span>
                </button>

                {open && (
                  <div style={{ padding: '0.6rem 0.25rem 0.25rem' }}>
                    {id === 'ruler' &&
                      (rulerTotalText ? (
                        <>
                          <div
                            style={{
                              fontSize: '0.7rem',
                              opacity: 0.6,
                              marginBottom: '0.2rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {t('chart.ruler_total')}
                          </div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: theme.colors.info }}>
                            {rulerTotalText}
                          </div>
                          {rulerLegs.length === 1 ? (
                            <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.2rem' }}>
                              {t('chart.bearing')} {rulerLegs[0].bearingText}
                            </div>
                          ) : (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {rulerLegs.map((leg, i) => (
                                <div key={i} style={rowStyle}>
                                  <span style={{ opacity: 0.8 }}>
                                    {i + 1}. {leg.distanceText}
                                  </span>
                                  <span style={{ opacity: 0.8 }}>{leg.bearingText}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <button onClick={onClearRuler} style={secondaryButtonStyle}>
                            {t('chart.ruler_clear')}
                          </button>
                          <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '0.4rem', textAlign: 'center' }}>
                            {t('chart.ruler_hint_more')}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.85rem', opacity: 0.7, lineHeight: 1.4 }}>
                          {rulerPointCount === 0
                            ? t('chart.ruler_hint_first')
                            : t('chart.ruler_hint_next')}
                        </div>
                      ))}

                    {id === 'goto' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <div style={fieldLabelStyle}>{t('chart.goto_lat')}</div>
                          <input
                            value={latInput}
                            inputMode="decimal"
                            placeholder="47.8000"
                            onChange={(e) => {
                              setLatInput(e.target.value);
                              setGotoError(false);
                            }}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <div style={fieldLabelStyle}>{t('chart.goto_lon')}</div>
                          <input
                            value={lonInput}
                            inputMode="decimal"
                            placeholder="12.4000"
                            onChange={(e) => {
                              setLonInput(e.target.value);
                              setGotoError(false);
                            }}
                            style={inputStyle}
                          />
                        </div>
                        {gotoError && (
                          <div style={{ color: theme.colors.error, fontSize: '0.75rem' }}>
                            {t('chart.goto_invalid')}
                          </div>
                        )}
                        <button onClick={handleGo} style={primaryButtonStyle}>
                          {t('chart.goto_go')}
                        </button>
                      </div>
                    )}

                    {id === 'sun' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {sun.alwaysUp ? (
                          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t('chart.sun_always_up')}</div>
                        ) : sun.alwaysDown ? (
                          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{t('chart.sun_always_down')}</div>
                        ) : (
                          <>
                            <div style={rowStyle}>
                              <span style={{ opacity: 0.7 }}>{t('chart.sun_dawn')}</span>
                              <span>{fmtTime(sun.dawn)}</span>
                            </div>
                            <div style={rowStyle}>
                              <span style={{ opacity: 0.7 }}>{t('chart.sun_sunrise')}</span>
                              <span>{fmtTime(sun.sunrise)}</span>
                            </div>
                            <div style={rowStyle}>
                              <span style={{ opacity: 0.7 }}>{t('chart.sun_sunset')}</span>
                              <span>{fmtTime(sun.sunset)}</span>
                            </div>
                            <div style={rowStyle}>
                              <span style={{ opacity: 0.7 }}>{t('chart.sun_dusk')}</span>
                              <span>{fmtTime(sun.dusk)}</span>
                            </div>
                          </>
                        )}
                        <div style={{ borderTop: `1px solid ${theme.colors.border}`, margin: '6px 0' }} />
                        <div style={rowStyle}>
                          <span style={{ opacity: 0.7 }}>{t(MOON_PHASE_KEYS[moon.phaseIndex])}</span>
                          <span>
                            {Math.round(moon.illumination * 100)}% {t('chart.moon_illumination')}
                          </span>
                        </div>
                      </div>
                    )}

                    {id === 'cts' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <div style={fieldLabelStyle}>{t('chart.cts_track')} (°)</div>
                          <input value={ctsTrack} inputMode="decimal" onChange={(e) => setCtsTrack(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <div style={fieldLabelStyle}>
                            {t('chart.cts_boat_speed')} ({speedLabel})
                          </div>
                          <input value={ctsBoat} inputMode="decimal" onChange={(e) => setCtsBoat(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <div style={fieldLabelStyle}>{t('chart.cts_set')} (°)</div>
                          <input value={ctsSet} inputMode="decimal" onChange={(e) => setCtsSet(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <div style={fieldLabelStyle}>
                            {t('chart.cts_drift')} ({speedLabel})
                          </div>
                          <input value={ctsDrift} inputMode="decimal" onChange={(e) => setCtsDrift(e.target.value)} style={inputStyle} />
                        </div>
                        {cts &&
                          (cts.tooStrong ? (
                            <div style={{ color: theme.colors.warning, fontSize: '0.8rem' }}>
                              {t('chart.cts_too_strong')}
                            </div>
                          ) : (
                            <div style={{ marginTop: '0.2rem' }}>
                              <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>{t('chart.cts_heading')}</span>
                                <span style={{ fontWeight: 'bold', color: theme.colors.info }}>{cts.headingText}</span>
                              </div>
                              <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>{t('chart.cts_sog')}</span>
                                <span style={{ fontWeight: 'bold' }}>{cts.sogText}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Click outside to close — suppressed while the ruler is open so taps
          reach the map instead of closing the panel. */}
      {!rulerActive && (
        <div
          onClick={(e) => {
            if (e.detail === 1) onClose();
          }}
          style={{
            ...getOverlayStyle(sidebarWidth, sidebarPosition),
            zIndex: 999,
          }}
        />
      )}
    </>
  );
};

interface LayersPanelProps {
  sidebarWidth: number;
  sidebarPosition?: SidebarPosition;
  onClose: () => void;
}

/**
 * Layer picker: a mutually-exclusive base-map selector on top (street vs
 * satellite vs ...) and toggleable overlays below (sea chart, depth, ...).
 * Reads/writes the chart layer selection directly via the tile-source
 * contexts, so it needs no data props.
 */
export const LayersPanel: React.FC<LayersPanelProps> = ({
  sidebarWidth,
  sidebarPosition = 'left',
  onClose,
}) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { bases, overlays } = useTileSources();
  const { baseMapId, setBaseMapId, overlayEnabled, toggleOverlay } = useChartLayers();
  const panelWidth = 220;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(${panelWidth}px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        {/* Base map — segmented, mutually exclusive */}
        <div style={{ fontSize: '0.85rem', opacity: 0.6, marginBottom: '0.6rem' }}>
          {t('chart.base_map')}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: theme.colors.bgCardActive,
            borderRadius: '6px',
            padding: '3px',
          }}
        >
          {bases.map((b) => {
            const active = baseMapId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setBaseMapId(b.id)}
                aria-pressed={active ? 'true' : 'false'}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.4rem',
                  background: active ? 'rgba(25, 118, 210, 0.6)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: active ? 600 : 400,
                  transition: 'background 0.15s ease',
                }}
              >
                {t(b.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Overlays — independent toggles layered on top of the base */}
        {overlays.length > 0 && (
          <>
            <div
              style={{
                fontSize: '0.85rem',
                opacity: 0.6,
                marginTop: '1rem',
                marginBottom: '0.6rem',
              }}
            >
              {t('chart.overlays')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overlays.map((ov) => {
                const enabled = !!overlayEnabled[ov.id];
                return (
                  <button
                    key={ov.id}
                    onClick={() => toggleOverlay(ov.id)}
                    aria-pressed={enabled ? 'true' : 'false'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '0.7rem 0.75rem',
                      background: enabled ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                      border: 'none',
                      borderRadius: '6px',
                      color: theme.colors.textPrimary,
                      cursor: 'pointer',
                      fontSize: '1rem',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>{t(ov.labelKey)}</span>
                      {ov.notForNavigation && (
                        <span style={{ fontSize: '0.6rem', color: theme.colors.warning, opacity: 0.9 }}>
                          {t('chart.not_for_navigation')}
                        </span>
                      )}
                    </span>
                    {/* Toggle switch */}
                    <span
                      style={{
                        flexShrink: 0,
                        width: '34px',
                        height: '20px',
                        borderRadius: '10px',
                        background: enabled ? '#4fc3f7' : theme.colors.bgTertiary,
                        position: 'relative',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: enabled ? '16px' : '2px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Click outside to close (only on single click, not double-click zoom) */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          ...getOverlayStyle(sidebarWidth, sidebarPosition),
          zIndex: 999,
        }}
      />
    </>
  );
};

interface SearchPanelProps {
  sidebarWidth: number;
  sidebarPosition?: SidebarPosition;
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
  sidebarPosition?: SidebarPosition;
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
  sidebarPosition = 'left',
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
  const { theme } = useTheme();
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
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(${settingsPanelWidth}px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
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
            background: isActive ? 'rgba(39, 174, 96, 0.2)' : theme.colors.bgCard,
            borderRadius: '6px',
            border: isActive ? '1px solid rgba(39, 174, 96, 0.5)' : `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>
            {t('autopilot.set_course')}
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
            {(Math.round(radToDeg(targetHeading)) % 360)}°
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
                background: theme.colors.bgCardActive,
                border: 'none',
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
                background: theme.colors.bgCardActive,
                border: 'none',
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
                background: theme.colors.bgCardActive,
                border: 'none',
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
                background: theme.colors.bgCardActive,
                border: 'none',
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.9rem' }}>
                {t('autopilot.follow_route')}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {(Math.round(radToDeg(currentBearing)) % 360)}°
              </div>
            </div>
            <button
              onClick={onToggleFollowRoute}
              style={{
                width: '56px',
                height: '32px',
                borderRadius: '16px',
                border: 'none',
                background: followingRoute ? 'rgba(39, 174, 96, 0.8)' : theme.colors.borderHover,
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
            color: theme.colors.textPrimary,
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
          ...getOverlayStyle(sidebarWidth, sidebarPosition),
          zIndex: 999,
        }}
      />
    </>
  );
};

// Weather forecast panel
type WeatherDisplayMode = 'wind' | 'waves' | 'swell' | 'current' | 'water-temp' | 'tide';

interface WeatherPanelProps {
  sidebarWidth: number;
  sidebarPosition?: SidebarPosition;
  enabled: boolean;
  forecastHour: number;
  displayMode: WeatherDisplayMode;
  loading?: boolean;
  error?: string | null;
  tide?: TideForecast; // tide series (only supplied/used in 'tide' mode)
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
  { mode: 'tide', label: 'Tide' },
];

export const WeatherPanel: React.FC<WeatherPanelProps> = ({
  sidebarWidth,
  sidebarPosition = 'left',
  enabled,
  forecastHour,
  displayMode,
  loading = false,
  error = null,
  tide,
  onToggleEnabled,
  onSetForecastHour,
  onSetDisplayMode,
  onClose,
}) => {
  const settingsPanelWidth = 320;
  const { theme } = useTheme();
  const { windUnit, depthUnit, temperatureUnit, timeFormat, dateFormat, convertDepth } = useSettings();
  const { t, language } = useLanguage();
  const isTide = displayMode === 'tide';

  // Custom time dialog state
  const [showCustomDialog, setShowCustomDialog] = React.useState(false);
  const [customDays, setCustomDays] = React.useState(0);
  const [customHours, setCustomHours] = React.useState(0);

  // Time-slider drag value. Tide mode commits live (no network — instant
  // recolour); grid-backed modes commit on release to avoid a grid refetch per
  // hour dragged. The slider window is short for tides (48h) and full otherwise.
  const sliderMax = isTide ? TIDE_WINDOW_HOURS : 168;
  const [scrubHour, setScrubHour] = React.useState(forecastHour);
  React.useEffect(() => { setScrubHour(forecastHour); }, [forecastHour]);

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
        case 'DD.MM.YYYY':
          dateStr = `${weekday} ${day}.${month}`;
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
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(${settingsPanelWidth}px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          overflowY: 'auto',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
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
              'tide': t('weather.tide'),
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
                  background: displayMode === mode && enabled ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                  color: theme.colors.textPrimary,
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
              background: !enabled ? 'rgba(239, 83, 80, 0.5)' : theme.colors.bgCardActive,
              color: theme.colors.textPrimary,
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
            <span style={{ color: theme.colors.textMuted }}>{t('weather.select_time')}</span>
          )}
        </div>

        {/* TIME section header */}
        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.4rem', marginTop: '0.25rem' }}>
          {t('weather.time')}
        </div>

        {/* Time scrubber. Drag to slide through the forecast; in tide mode the
            track is annotated with high (▲) / low (▼) water markers. */}
        <div style={{ marginBottom: '0.6rem' }}>
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={1}
            value={Math.min(scrubHour, sliderMax)}
            onChange={(e) => {
              const h = parseInt(e.target.value, 10);
              setScrubHour(h);
              if (!enabled) onToggleEnabled();
              if (isTide) onSetForecastHour(h); // live recolour, no network
            }}
            onMouseUp={() => { if (!isTide) onSetForecastHour(scrubHour); }}
            onTouchEnd={() => { if (!isTide) onSetForecastHour(scrubHour); }}
            onKeyUp={() => { if (!isTide) onSetForecastHour(scrubHour); }}
            style={{ width: '100%', accentColor: '#1976d2', cursor: 'pointer' }}
          />
          {enabled && isTide && tide && tide.extrema.length > 0 && (
            <div style={{ position: 'relative', height: '14px', marginTop: '-2px' }}>
              {tide.extrema.filter((e) => e.hour <= sliderMax).map((e, i) => (
                <span
                  key={i}
                  title={`${e.type === 'high' ? t('weather.high_tide') : t('weather.low_tide')} · ${new Date(e.timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}`}
                  style={{
                    position: 'absolute',
                    left: `${(e.hour / sliderMax) * 100}%`,
                    transform: 'translateX(-50%)',
                    fontSize: '0.7rem',
                    lineHeight: 1,
                    color: e.type === 'high' ? '#4aa0e0' : '#d75050',
                  }}
                >
                  {e.type === 'high' ? '▲' : '▼'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time preset buttons + Custom */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '0.4rem',
          marginBottom: '0.75rem',
        }}>
          {(isTide ? FORECAST_PRESETS.filter((p) => p.hour <= TIDE_WINDOW_HOURS) : FORECAST_PRESETS).map((opt) => (
            <button
              key={opt.hour}
              onClick={() => handlePresetSelect(opt.hour)}
              style={{
                padding: '0.9rem 0.3rem',
                borderRadius: '6px',
                border: 'none',
                background: isSelected(opt.hour) ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                color: theme.colors.textPrimary,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {opt.hour === 0 ? t('weather.now') : opt.label}
            </button>
          ))}
          {!isTide && (
            <button
              onClick={handleOpenCustomDialog}
              style={{
                padding: '0.9rem 0.3rem',
                borderRadius: '6px',
                border: 'none',
                background: !isPresetSelected && enabled ? 'rgba(25, 118, 210, 0.5)' : theme.colors.bgCardActive,
                color: theme.colors.textPrimary,
                fontSize: '0.9rem',
                cursor: 'pointer',
                fontWeight: !isPresetSelected && enabled ? 'bold' : 'normal',
              }}
            >
              {t('weather.custom')}
            </button>
          )}
        </div>

        {/* Legend */}
        <div style={{
          paddingTop: '0.75rem',
          borderTop: `1px solid ${theme.colors.border}`,
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
                color: theme.colors.textPrimary,
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
                color: theme.colors.textPrimary,
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
                color: theme.colors.textPrimary,
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
          ) : displayMode === 'tide' ? (
            // When the overlay is off, show no live tide readout (displayMode
            // stays 'tide' while disabled, so guard on enabled here).
            !enabled ? null : (() => {
              const dLabel = depthConversions[depthUnit].label;
              const fmt = (m: number | null | undefined) => {
                if (m == null) return '--';
                const v = convertDepth(m);
                return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
              };
              const clock = (ts: string) =>
                new Date(ts).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
              const state = tide?.stateAt(forecastHour);
              const trend = state?.trend ?? null;
              const trendColor = trend === 'rising' ? '#4aa0e0' : trend === 'falling' ? '#d75050' : theme.colors.textMuted;
              const trendLabel =
                trend === 'rising' ? `▲ ${t('weather.rising')}` :
                trend === 'falling' ? `▼ ${t('weather.falling')}` :
                trend === 'slack' ? `● ${t('weather.slack')}` : '';
              const nextHigh = tide?.extrema.find((e) => e.type === 'high' && e.hour > forecastHour);
              const nextLow = tide?.extrema.find((e) => e.type === 'low' && e.hour > forecastHour);
              return (
                <>
                  {/* Selected-time tide height + trend */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <div>
                      <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: theme.colors.textPrimary }}>{fmt(state?.height)}</span>
                      <span style={{ fontSize: '0.8rem', color: theme.colors.textMuted, marginLeft: '0.3rem' }}>{dLabel}</span>
                    </div>
                    {trendLabel && <span style={{ fontSize: '0.8rem', color: trendColor }}>{trendLabel}</span>}
                  </div>

                  {/* Next high / low water */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: theme.colors.textPrimary, marginBottom: '0.6rem' }}>
                    <span><span style={{ color: '#4aa0e0' }}>▲ {t('weather.high_tide')}</span> {nextHigh ? `${clock(nextHigh.timestamp)} ${fmt(nextHigh.height)}${dLabel}` : '--'}</span>
                    <span><span style={{ color: '#d75050' }}>▼ {t('weather.low_tide')}</span> {nextLow ? `${clock(nextLow.timestamp)} ${fmt(nextLow.height)}${dLabel}` : '--'}</span>
                  </div>

                  {/* Low-water → high-water colour scale (location range) */}
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>
                    {t('weather.tide_height')} ({dLabel})
                  </div>
                  <div style={{ height: '10px', borderRadius: '4px', marginBottom: '0.25rem', background: 'linear-gradient(to right, rgb(215,50,50), rgb(235,235,245), rgb(40,100,210))' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: theme.colors.textMuted }}>
                    <span>{tide ? fmt(tide.range.min) : '--'}</span>
                    <span>{tide ? fmt(tide.range.max) : '--'}</span>
                  </div>

                  <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '0.5rem', fontStyle: 'italic' }}>
                    {t('weather.tide_disclaimer')}
                  </div>
                </>
              );
            })()
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
                color: theme.colors.textPrimary,
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
          borderTop: `1px solid ${theme.colors.border}`,
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
            background: theme.colors.bgTertiary,
            border: `1px solid ${theme.colors.textDisabled}`,
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
                  background: theme.colors.bgCardActive,
                  color: theme.colors.textPrimary,
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
                  background: theme.colors.bgCardActive,
                  color: theme.colors.textPrimary,
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
                  background: theme.colors.bgCardActive,
                  color: theme.colors.textPrimary,
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
                  background: theme.colors.bgCardActive,
                  color: theme.colors.textPrimary,
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
                let dateStr: string;
                switch (dateFormat) {
                  case 'MM/DD/YYYY':
                    dateStr = `${weekday} ${month}/${day}`;
                    break;
                  case 'YYYY-MM-DD':
                    dateStr = `${weekday} ${month}-${day}`;
                    break;
                  case 'DD.MM.YYYY':
                    dateStr = `${weekday} ${day}.${month}`;
                    break;
                  case 'DD/MM/YYYY':
                  default:
                    dateStr = `${weekday} ${day}/${month}`;
                    break;
                }
                return `${dateStr} ${timeStr}`;
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
                background: theme.colors.bgCardActive,
                color: theme.colors.textPrimary,
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
                color: theme.colors.textPrimary,
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
            ...getOverlayStyle(sidebarWidth, sidebarPosition),
            zIndex: 999,
          }}
        />
      )}
    </>
  );
};

export const SearchPanel: React.FC<SearchPanelProps> = ({
  sidebarWidth,
  sidebarPosition = 'left',
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
  const { theme } = useTheme();
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
          ...getPanelPositionStyle(sidebarWidth, sidebarPosition),
          width: `min(340px, calc(100vw - ${sidebarWidth + 16}px))`,
          maxHeight: 'calc(100% - 32px)',
          background: theme.colors.bgTertiary,
          border: `1px solid ${theme.colors.borderHover}`,
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
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.borderHover}`,
              borderRadius: '6px',
              color: theme.colors.textPrimary,
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
                    background: theme.colors.bgCardActive,
                    border: `1px solid ${marker.color}`,
                    borderRadius: '6px',
                    color: theme.colors.textPrimary,
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
                    border: `2px solid ${theme.colors.borderHover}`,
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
                background: theme.colors.bgCardActive,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '6px',
                color: theme.colors.textPrimary,
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
          borderTop: `1px solid ${theme.colors.border}`,
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
          ...getOverlayStyle(sidebarWidth, sidebarPosition),
          zIndex: 999,
        }}
      />
    </>
  );
};
