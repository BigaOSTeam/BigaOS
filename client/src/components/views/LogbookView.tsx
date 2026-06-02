import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BufferedTileLayer } from '../navigation/chart/BufferedTileLayer';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSettings, speedConversions, distanceConversions } from '../../context/SettingsContext';
import { useTileSources, useChartLayers } from '../../context/TileSourcesContext';
import { wsService } from '../../services/websocket';
import {
  logbookAPI,
  LogbookDaySummary,
  LogbookSegment,
  LogbookTrackpoint,
} from '../../services/api';
import { ViewLayout } from './shared';
import { LogbookCalendarPicker } from './LogbookCalendarPicker';

const MPS_TO_KT = 1 / 0.514444;
const M_TO_NM = 1 / 1852;
const WIDE_BREAKPOINT = 900;

const SEGMENT_COLORS = ['#4fc3f7', '#ffa726', '#ab47bc', '#66bb6a', '#ec407a'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

interface LogbookViewProps {
  onClose: () => void;
}

/** Auto-fit the map to the polyline bounds on first load (or when bounds change). */
const MapFitter: React.FC<{ bounds: L.LatLngBoundsExpression | null; resetKey: string }> = ({ bounds, resetKey }) => {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [bounds, resetKey, map]);
  return null;
};

const StartEndIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

export const LogbookView: React.FC<LogbookViewProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { speedUnit, distanceUnit, convertSpeed, convertDistance, timeFormat, dateFormat } = useSettings();
  const { tileUrl } = useTileSources();
  const { activeSources } = useChartLayers();

  // Layout breakpoint — listen to resizes so a docked window switches sides cleanly.
  const [isWide, setIsWide] = useState(window.innerWidth >= WIDE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= WIDE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Which calendar day is being viewed. Defaults to today; corrected once we
  // know what days have entries (see useEffect below).
  const [currentDate, setCurrentDate] = useState<string>(() => todayLocalDate());
  const [hasInitialized, setHasInitialized] = useState(false);

  const [segments, setSegments] = useState<LogbookSegment[]>([]);
  const [points, setPoints] = useState<LogbookTrackpoint[]>([]);
  const [allDays, setAllDays] = useState<LogbookDaySummary[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Editor drafts. Reset whenever the loaded day changes.
  const [titleDraft, setTitleDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  // Last saved values, used to detect "actually changed" for autosave debounce.
  // Ref instead of state so updating it doesn't retrigger the autosave effect.
  const lastSavedRef = useRef<{ title: string; note: string }>({ title: '', note: '' });
  // Note textarea sizes to its content — no manual resize handle, no scrollbar.
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [noteDraft, isWide]);

  const formatDistance = useCallback((m: number): string => {
    const nm = m * M_TO_NM;
    return `${convertDistance(nm).toFixed(2)} ${distanceConversions[distanceUnit].label}`;
  }, [distanceUnit, convertDistance]);

  const formatSpeed = useCallback((mps: number): string => {
    const kt = mps * MPS_TO_KT;
    return `${convertSpeed(kt).toFixed(1)} ${speedConversions[speedUnit].label}`;
  }, [speedUnit, convertSpeed]);

  const formatTimeOfDay = useCallback((ts: number): string => {
    return new Date(ts).toLocaleTimeString(language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
  }, [language, timeFormat]);

  // Numeric date in user's format, prefixed with localized weekday for readability.
  const formatLongDate = useCallback((d: string): string => {
    const today = todayLocalDate();
    const yesterday = shiftDate(today, -1);
    if (d === today) return t('logbook.today');
    if (d === yesterday) return t('logbook.yesterday');
    const [y, mo, dd] = d.split('-').map(Number);
    const dt = new Date(y, mo - 1, dd);
    const dStr = pad(dd);
    const mStr = pad(mo);
    const yStr = String(y);
    const numeric =
      dateFormat === 'MM/DD/YYYY' ? `${mStr}/${dStr}/${yStr}` :
      dateFormat === 'YYYY-MM-DD' ? `${yStr}-${mStr}-${dStr}` :
      dateFormat === 'DD.MM.YYYY' ? `${dStr}.${mStr}.${yStr}` :
      `${dStr}/${mStr}/${yStr}`;
    const weekday = dt.toLocaleDateString(language, { weekday: 'long' });
    return `${weekday}, ${numeric}`;
  }, [language, dateFormat, t]);

  const refreshAllDays = useCallback(async () => {
    try {
      const res = await logbookAPI.listDays({ limit: 3650 });
      setAllDays(res.data.days);
      return res.data.days;
    } catch (err) {
      console.error('[Logbook] failed to load days list:', err);
      return [];
    }
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setLoadingDay(true);
    try {
      const [dayRes, trackRes] = await Promise.all([
        logbookAPI.getDay(date).catch((err) => {
          // 404 = no entry yet for that date — that's a valid empty state.
          if (err?.response?.status === 404) return null;
          throw err;
        }),
        logbookAPI.getTrack(date).catch(() => null),
      ]);
      const loadedTitle = dayRes?.data?.day?.title || '';
      const loadedNote = dayRes?.data?.day?.note || '';
      setSegments(dayRes?.data?.segments || []);
      setTitleDraft(loadedTitle);
      setNoteDraft(loadedNote);
      lastSavedRef.current = { title: loadedTitle, note: loadedNote };
      setPoints(trackRes?.data?.points || []);
    } catch (err) {
      console.error('[Logbook] failed to load day:', err);
    } finally {
      setLoadingDay(false);
    }
  }, []);

  // Initial mount: figure out which day to land on, then load it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const days = await refreshAllDays();
      if (cancelled) return;
      const today = todayLocalDate();
      const todayHasEntry = days.some(d => d.date === today);
      const target = todayHasEntry || days.length === 0 ? today : days[0].date;
      setCurrentDate(target);
      setHasInitialized(true);
      await loadDay(target);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user navigates to a different day, reload it.
  useEffect(() => {
    if (!hasInitialized) return;
    loadDay(currentDate);
  }, [currentDate, hasInitialized, loadDay]);

  // Live refresh on segment close — reload allDays + current day so live
  // recording shows up immediately.
  useEffect(() => {
    const handler = () => {
      refreshAllDays();
      loadDay(currentDate);
    };
    wsService.on('logbook_segment_closed', handler);
    return () => wsService.off('logbook_segment_closed', handler);
  }, [refreshAllDays, loadDay, currentDate]);

  // Prev/next stay within the set of days that have entries — stepping
  // through empty days isn't useful. The calendar picker still allows
  // jumping to any date.
  const datesWithEntries = useMemo(() => allDays.map(d => d.date), [allDays]);
  const currentIndex = datesWithEntries.indexOf(currentDate);
  // allDays is sorted newest-first; "prev" = older (higher index), "next" = newer (lower index).
  const prevDate = currentIndex >= 0 ? datesWithEntries[currentIndex + 1] : (datesWithEntries[0] || null);
  const nextDate = currentIndex > 0 ? datesWithEntries[currentIndex - 1] : null;
  const entryDateSet = useMemo(() => new Set(datesWithEntries), [datesWithEntries]);

  // Aggregate totals for the stats strip.
  const totals = useMemo(() => {
    let dist = 0;
    let dur = 0;
    let maxSog = 0;
    for (const s of segments) {
      if (s.ended_at !== null) {
        dist += s.distance_m;
        dur += s.ended_at - s.started_at;
        if (s.max_sog > maxSog) maxSog = s.max_sog;
      }
    }
    const avgSog = dur > 0 ? dist / (dur / 1000) : 0;
    return { dist, dur, avgSog, maxSog };
  }, [segments]);

  // Build per-segment polyline positions.
  const polylines = useMemo(() => {
    const bySegment = new Map<number, [number, number][]>();
    for (const p of points) {
      if (p.segment_id === null) continue;
      const arr = bySegment.get(p.segment_id) || [];
      arr.push([p.lat, p.lon]);
      bySegment.set(p.segment_id, arr);
    }
    return Array.from(bySegment.entries()).map(([segId, positions], idx) => ({
      segId,
      positions,
      color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
    }));
  }, [points]);

  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (points.length === 0) return null;
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ];
  }, [points]);

  // Debounced autosave. After the user stops typing for AUTOSAVE_DEBOUNCE_MS,
  // push the title+note to the server. Status indicator near the note tells
  // the user it's saved without needing a button.
  const AUTOSAVE_DEBOUNCE_MS = 1000;
  useEffect(() => {
    if (!hasInitialized || loadingDay) return;
    const titleChanged = titleDraft !== lastSavedRef.current.title;
    const noteChanged = noteDraft !== lastSavedRef.current.note;
    if (!titleChanged && !noteChanged) return;

    const timer = setTimeout(async () => {
      try {
        await logbookAPI.updateDay(currentDate, {
          title: titleDraft.trim() ? titleDraft.trim() : null,
          note: noteDraft.trim() ? noteDraft : null,
        });
        lastSavedRef.current = { title: titleDraft, note: noteDraft };
        // Reflect title/note changes in the days list (so the calendar dot stays correct).
        refreshAllDays();
      } catch (err) {
        console.error('[Logbook] autosave failed:', err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [titleDraft, noteDraft, currentDate, hasInitialized, loadingDay, refreshAllDays]);

  // Editor + stats column.
  const editorColumn = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: theme.space.md,
      minWidth: 0,
      flex: isWide ? '1 1 380px' : undefined,
    }}>
      {/* Title — no separate label; the input's placeholder explains it and
          this lines up with the top of the map column. */}
      <input
        type="text"
        value={titleDraft}
        onChange={e => setTitleDraft(e.target.value)}
        placeholder={t('logbook.title_placeholder')}
        style={{
          width: '100%',
          background: theme.colors.bgPrimary,
          color: theme.colors.textPrimary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          padding: `${theme.space.sm} ${theme.space.md}`,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.semibold,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />

      {/* Note */}
      <div>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: theme.space.xs,
        }}>
          {t('logbook.note')}
        </div>
        <textarea
          ref={noteRef}
          value={noteDraft}
          onChange={e => setNoteDraft(e.target.value)}
          placeholder={t('logbook.note_placeholder')}
          style={{
            width: '100%',
            background: theme.colors.bgPrimary,
            color: theme.colors.textPrimary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            padding: theme.space.md,
            fontSize: theme.fontSize.base,
            fontFamily: 'inherit',
            resize: 'none',
            overflow: 'hidden',
            minHeight: 80,
            boxSizing: 'border-box',
            display: 'block',
          }}
        />
      </div>

      {/* Stats */}
      {segments.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: theme.space.sm,
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.colors.border}`,
        }}>
          <div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('logbook.distance')}
            </div>
            <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.dataPosition, marginTop: 2 }}>
              {formatDistance(totals.dist)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('logbook.time_underway')}
            </div>
            <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, marginTop: 2 }}>
              {formatDuration(totals.dur)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('logbook.avg_speed')}
            </div>
            <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.dataSpeed, marginTop: 2 }}>
              {formatSpeed(totals.avgSog)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('logbook.max_speed')}
            </div>
            <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.dataSpeed, marginTop: 2 }}>
              {formatSpeed(totals.maxSog)}
            </div>
          </div>
        </div>
      )}

      {/* Trips */}
      {segments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            paddingLeft: theme.space.xs,
          }}>
            {t('logbook.trips')}
          </div>
          {segments.map((s, idx) => {
            const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
            const open = s.ended_at === null;
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.space.sm,
                  padding: theme.space.sm,
                  background: theme.colors.bgCard,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.md,
                  borderLeft: `4px solid ${color}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold }}>
                    {formatTimeOfDay(s.started_at)} → {open ? t('logbook.in_progress') : formatTimeOfDay(s.ended_at!)}
                  </div>
                  <div style={{
                    fontSize: theme.fontSize.sm,
                    color: theme.colors.textSecondary,
                    marginTop: 2,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: theme.space.sm,
                  }}>
                    <span>{formatDistance(s.distance_m)}</span>
                    {!open && <span>{formatDuration(s.ended_at! - s.started_at)}</span>}
                    <span>{t('logbook.avg')} {formatSpeed(s.avg_sog)}</span>
                    <span>{t('logbook.max')} {formatSpeed(s.max_sog)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );

  // Map column.
  const mapColumn = (
    <div style={{
      flex: isWide ? '1 1 0' : undefined,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {bounds ? (
        <div style={{
          height: isWide ? 'min(70vh, 600px)' : 320,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          border: `1px solid ${theme.colors.border}`,
        }}>
          <MapContainer
            center={[0, 0]}
            zoom={2}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            zoomControl={false}
          >
            {activeSources.filter((s) => s.kind !== 'contours').map((src, idx) => (
              <BufferedTileLayer
                key={src.id}
                url={tileUrl(src.id)}
                attribution=""
                zIndex={src.role === 'overlay' ? 10 + idx : undefined}
                keepBuffer={4}
                loadBuffer={0.5}
              />
            ))}
            <MapFitter bounds={bounds} resetKey={currentDate} />
            {polylines.map(line => (
              <Polyline
                key={line.segId}
                positions={line.positions}
                pathOptions={{ color: line.color, weight: 4, opacity: 0.9 }}
              />
            ))}
            {segments.length > 0 && segments[0].start_lat !== null && segments[0].start_lon !== null && (
              <Marker
                position={[segments[0].start_lat, segments[0].start_lon]}
                icon={StartEndIcon(theme.colors.success)}
              />
            )}
            {(() => {
              const last = segments[segments.length - 1];
              if (!last || last.end_lat === null || last.end_lon === null) return null;
              return (
                <Marker
                  position={[last.end_lat, last.end_lon]}
                  icon={StartEndIcon(theme.colors.error)}
                />
              );
            })()}
          </MapContainer>
        </div>
      ) : (
        <div style={{
          padding: theme.space['2xl'],
          background: theme.colors.bgCard,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.colors.border}`,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.base,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: theme.space.md,
          minHeight: isWide ? 'min(70vh, 600px)' : 200,
          justifyContent: 'center',
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <div>{allDays.length === 0 ? t('logbook.no_entries_yet') : t('logbook.no_track')}</div>
          {allDays.length === 0 && (
            <div style={{ fontSize: theme.fontSize.sm, maxWidth: 360, lineHeight: 1.4 }}>
              {t('logbook.no_entries_hint')}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <ViewLayout title={formatLongDate(currentDate)} onClose={onClose}>
      {/* Sub-header: prev/next + calendar button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        padding: `${theme.space.sm} ${theme.space.md}`,
        borderBottom: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => prevDate && setCurrentDate(prevDate)}
          disabled={!prevDate}
          className="touch-btn"
          style={{
            background: 'transparent',
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            cursor: prevDate ? 'pointer' : 'default',
            opacity: prevDate ? 1 : 0.3,
            borderRadius: theme.radius.md,
            padding: `${theme.space.xs} ${theme.space.md}`,
            display: 'flex',
            alignItems: 'center',
            gap: theme.space.xs,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('logbook.prev_day')}
        </button>
        <button
          onClick={() => nextDate && setCurrentDate(nextDate)}
          disabled={!nextDate}
          className="touch-btn"
          style={{
            background: 'transparent',
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            cursor: nextDate ? 'pointer' : 'default',
            opacity: nextDate ? 1 : 0.3,
            borderRadius: theme.radius.md,
            padding: `${theme.space.xs} ${theme.space.md}`,
            display: 'flex',
            alignItems: 'center',
            gap: theme.space.xs,
          }}
        >
          {t('logbook.next_day')}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCurrentDate(todayLocalDate())}
          className="touch-btn"
          style={{
            background: 'transparent',
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            borderRadius: theme.radius.md,
            padding: `${theme.space.xs} ${theme.space.md}`,
          }}
        >
          {t('logbook.today')}
        </button>
        <button
          onClick={() => setCalendarOpen(true)}
          className="touch-btn"
          style={{
            background: 'transparent',
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            borderRadius: theme.radius.md,
            padding: `${theme.space.xs} ${theme.space.md}`,
            display: 'flex',
            alignItems: 'center',
            gap: theme.space.xs,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {t('logbook.calendar')}
        </button>
      </div>

      {/* Body */}
      <div style={{
        padding: theme.space.md,
        boxSizing: 'border-box',
        opacity: loadingDay ? 0.6 : 1,
        transition: 'opacity 0.15s',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isWide ? 'row' : 'column',
          gap: theme.space.lg,
          alignItems: 'flex-start',
          maxWidth: 1400,
          margin: '0 auto',
        }}>
          {mapColumn}
          {editorColumn}
        </div>
      </div>

      {calendarOpen && (
        <LogbookCalendarPicker
          selectedDate={currentDate}
          entryDates={entryDateSet}
          onSelect={(d) => setCurrentDate(d)}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </ViewLayout>
  );
};
