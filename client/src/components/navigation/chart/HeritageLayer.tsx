import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import { heritageAPI, HeritageFeature } from '../../../services/api';
import { useAlerts } from '../../../context/AlertContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../context/ThemeContext';
import { useSettings, depthConversions } from '../../../context/SettingsContext';
import { createWreckIcon, createHeritageSiteIcon } from './map-icons';
import { useLayerLoading } from './LayerLoadingContext';

const KIND_COLOR = { wreck: '#0d8b8b', site: '#c8860a' } as const;

// Pick the localized value for a field: the baked `<field>_de` when the app
// language is German and it exists, else the English source value.
type LocField = 'name' | 'country' | 'category' | 'period' | 'desc';
function loc(p: HeritageFeature['properties'], field: LocField, language: string): string | undefined {
  if (language === 'de') {
    const de = (p as Record<string, unknown>)[`${field}_de`];
    if (typeof de === 'string' && de) return de;
  }
  return p[field];
}

/**
 * In-app detail dialog for a heritage point. Rendered via a portal to
 * document.body so it isn't trapped under Leaflet's transformed panes (a fixed
 * element under a `transform`ed ancestor is positioned relative to it). We show
 * the full record in-app rather than opening the source URL in a new page — a
 * new tab strands the user on a fullscreen kiosk client with no way back.
 */
const HeritageDetailDialog = ({ feature, onClose }: { feature: HeritageFeature; onClose: () => void }) => {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { convertDepth, depthUnit } = useSettings();
  const depthLabel = depthConversions[depthUnit]?.label ?? 'm';
  const p = feature.properties;
  const isSite = p.kind === 'site';
  const accent = KIND_COLOR[p.kind] ?? KIND_COLOR.wreck;
  const country = loc(p, 'country', language);
  const period = loc(p, 'period', language);
  const category = loc(p, 'category', language);
  const desc = loc(p, 'desc', language);

  const rows: { label: string; value: string }[] = [];
  if (country) rows.push({ label: t('heritage.country'), value: country });
  if (p.depth != null) rows.push({ label: t('heritage.depth'), value: `${convertDepth(p.depth).toFixed(1)} ${depthLabel}` });
  if (p.year != null) rows.push({ label: t('heritage.year'), value: String(p.year) });
  if (period) rows.push({ label: t('heritage.period'), value: period });
  if (category) rows.push({ label: t('heritage.category'), value: category });

  return createPortal(
    <>
      {/* Backdrop — single click only (a double-click is a map zoom). */}
      <div
        onClick={(e) => { if (e.detail === 1) onClose(); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.borderDashed}`,
          borderRadius: '8px',
          padding: '1.25rem',
          zIndex: 2001,
          width: '380px',
          maxWidth: '92vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="touch-btn"
          style={{
            position: 'absolute', top: '0.6rem', right: '0.6rem', width: '36px', height: '36px',
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', letterSpacing: '0.04em', textTransform: 'uppercase', color: accent, marginBottom: '0.25rem' }}>
          {isSite ? t('heritage.site') : t('heritage.wreck')}
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: theme.colors.textPrimary, marginBottom: '0.75rem', paddingRight: '2rem' }}>
          {loc(p, 'name', language) || (isSite ? t('heritage.site') : t('heritage.wreck'))}
        </div>

        {rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 0.75rem', fontSize: '0.9rem', marginBottom: desc ? '0.9rem' : 0 }}>
            {rows.map((r) => (
              <Fragment key={r.label}>
                <span style={{ opacity: 0.6 }}>{r.label}</span>
                <span style={{ color: theme.colors.textPrimary }}>{r.value}</span>
              </Fragment>
            ))}
          </div>
        )}

        {desc && (
          <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: theme.colors.textPrimary, opacity: 0.9 }}>
            {desc}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

/**
 * "Worth a Look" overlay — EMODnet shipwrecks + UNESCO coastal World Heritage
 * sites as tappable markers. Data fetching mirrors the depth-contour overlay:
 * the server snaps bboxes to a grid, so we only refetch when the snapped region
 * changes, and we gate on zoom/span so a zoomed-out view doesn't pull a continent.
 *
 * Offline-first: a downloaded pack serves instantly; otherwise the server falls
 * back to a live EMODnet WFS query. A status note tells the user when they're on
 * the online fallback (tap → Downloads) so they can grab it for offline.
 */

export const HERITAGE_MIN_ZOOM = 8;
// Max viewport span (degrees) we'll request. The server refuses spans > 6° on the
// outward-snapped bbox; snapping (0.5°) can add up to ~1°, so gate well below.
const HERITAGE_MAX_SPAN_DEG = 4.5;
const SNAP_DEG = 0.5; // must match the server's SNAP_DEG
const LOADING_NOTIFY_DELAY_MS = 350;
// Auto-dismiss the "loading online — tap to download" nudge after a few seconds so
// it doesn't linger on screen (it re-shows when a new online region loads).
const ONLINE_NOTE_TTL_MS = 10000;

function snapKey(b: L.LatLngBounds): string {
  const q = SNAP_DEG;
  const w = Math.floor(b.getWest() / q) * q;
  const s = Math.floor(b.getSouth() / q) * q;
  const e = Math.ceil(b.getEast() / q) * q;
  const n = Math.ceil(b.getNorth() / q) * q;
  return `${w.toFixed(2)},${s.toFixed(2)},${e.toFixed(2)},${n.toFixed(2)}`;
}

interface HeritageLayerProps {
  /** Translated status-note texts (kept in a ref so the fetch effect is stable). */
  labels: {
    loading: string; // "Loading sights…"
    online: string; // "Loading online — tap to download for offline"
    noData: string; // (unused today; reserved for symmetry with depth)
    zoomHint: string; // "Zoom in for points of interest"
  };
  /** Open Settings → Downloads; wired to the tap action of the online note. */
  onRequestDownload?: () => void;
  /** Center-on-GPS (follow-the-boat). When on, popups don't autoPan (the pan
   *  would fight MapController re-centring on the boat). */
  followGps?: boolean;
}

export const HeritageLayer = ({ labels, onRequestDownload, followGps }: HeritageLayerProps) => {
  const map = useMap();
  const { pushNotification, clearNotification, updateNotification } = useAlerts();
  const setLayerLoading = useLayerLoading();
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const { convertDepth, depthUnit } = useSettings();

  const [features, setFeatures] = useState<HeritageFeature[]>([]);
  // The feature whose detail dialog is open (null = closed).
  const [selected, setSelected] = useState<HeritageFeature | null>(null);

  // Stable icon instances (DivIcons are immutable here).
  const wreckIcon = useMemo(() => createWreckIcon(), []);
  const siteIcon = useMemo(() => createHeritageSiteIcon(), []);

  // Keep labels / callback in refs so the fetch effect doesn't re-subscribe when
  // they change identity each render (same approach as DepthContourLayer).
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const onRequestDownloadRef = useRef(onRequestDownload);
  onRequestDownloadRef.current = onRequestDownload;
  // Read live in the popupopen handler: react-leaflet bakes Popup options at
  // creation (autoPan isn't reactive), and the popups are created once when
  // features load — so we pan imperatively instead of via the autoPan prop.
  const followGpsRef = useRef(followGps);
  followGpsRef.current = followGps;

  useEffect(() => {
    let abort: AbortController | null = null;
    let disposed = false;
    let lastKey: string | null = null; // region of the last successful load
    let inflightKey: string | null = null; // region currently being fetched

    const download = () => onRequestDownloadRef.current?.();

    // ONE status note, updated in place: morphs loading → online as the request
    // resolves. Tappable (→ Downloads) when serving from the online fallback.
    let statusId: string | null = null;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStatusTimer = () => {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    };
    const setStatus = (message: string, withDownload: boolean) => {
      const onClick = withDownload ? download : undefined;
      if (statusId) updateNotification(statusId, { message, onClick });
      else statusId = pushNotification({ message, severity: 'info', tone: 'none', onClick });
      clearStatusTimer();
      // The online "tap to download" nudge auto-dismisses after a few seconds (and
      // resets statusId so it re-shows on the next online region). The plain
      // "loading…" note has no timer — it clears itself when the load resolves.
      if (withDownload) {
        statusTimer = setTimeout(() => {
          if (statusId) { clearNotification(statusId); statusId = null; }
          statusTimer = null;
        }, ONLINE_NOTE_TTL_MS);
      }
    };
    const clearStatus = () => {
      clearStatusTimer();
      if (statusId) { clearNotification(statusId); statusId = null; }
    };

    // Loading goes through the shared per-chart channel so multiple active
    // layers show one combined note instead of stacking near-identical ones.
    const showLoading = () => setLayerLoading('heritage', labelsRef.current.loading);
    const clearLoading = () => setLayerLoading('heritage', null);

    let zoomHintId: string | null = null;
    const showZoomHint = () => {
      if (!zoomHintId) zoomHintId = pushNotification({ message: labelsRef.current.zoomHint, severity: 'info', tone: 'none' });
    };
    const hideZoomHint = () => {
      if (zoomHintId) { clearNotification(zoomHintId); zoomHintId = null; }
    };

    const refresh = async () => {
      if (disposed) return;
      const vb = map.getBounds();
      const tooFarOut =
        map.getZoom() < HERITAGE_MIN_ZOOM ||
        vb.getEast() - vb.getWest() > HERITAGE_MAX_SPAN_DEG ||
        vb.getNorth() - vb.getSouth() > HERITAGE_MAX_SPAN_DEG;
      if (tooFarOut) {
        setFeatures([]);
        lastKey = null;
        inflightKey = null;
        clearStatus();
        clearLoading();
        showZoomHint();
        return;
      }
      hideZoomHint();

      const key = snapKey(map.getBounds());
      // Already showing or already fetching this region — the inflight guard keeps
      // a direct (un-debounced) call on every moveend cheap (follow-GPS storm).
      if (key === lastKey || key === inflightKey) return;

      abort?.abort();
      abort = new AbortController();
      const myAbort = abort;
      inflightKey = key;

      const b = map.getBounds();
      const bbox = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };

      // Brief loading note only if the fetch isn't near-instant (downloaded pack
      // is instant; the online fallback is small but adds a round-trip).
      const notifyTimer = setTimeout(() => {
        if (!disposed && myAbort === abort && !statusId) showLoading();
      }, LOADING_NOTIFY_DELAY_MS);

      try {
        const res = await heritageAPI.getFeatures(bbox, myAbort.signal);
        if (disposed) return;
        clearTimeout(notifyTimer);
        if (myAbort !== abort) return; // superseded
        inflightKey = null;
        clearLoading();
        const feats = res.data.features ?? [];
        setFeatures(feats);
        const source = res.data.source ?? 'local';
        lastKey = key;
        if (source === 'online' && feats.length > 0) {
          // Live EMODnet fallback served this — keep a tappable "download for
          // offline" nudge so it works when the boat loses signal.
          setStatus(labelsRef.current.online, true);
        } else {
          // Local pack, or nothing here — the note was just a loading indicator.
          clearStatus();
        }
        if (source === 'none') lastKey = null; // failed — retry on next move
      } catch (err) {
        clearTimeout(notifyTimer);
        if (axios.isCancel(err)) return; // superseded
        if (myAbort === abort) inflightKey = null;
        // Leave any current note as-is; a move retries.
      }
    };

    // Fire directly (not debounced) — the snapped-key / inflight guards make each
    // call cheap, and a trailing debounce would never fire under the follow-GPS
    // setView storm. (See DepthContourLayer / project_weather_overlay_recenter.)
    map.on('moveend', refresh);
    map.on('zoomend', refresh);
    refresh();

    return () => {
      disposed = true;
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
      abort?.abort();
      clearStatus();
      clearLoading();
      hideZoomHint();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pushNotification, clearNotification, updateNotification, setLayerLoading]);

  const depthLabel = depthConversions[depthUnit]?.label ?? 'm';

  // Compact popup teaser line: country, year, and (for wrecks) depth, when known.
  const teaser = (p: HeritageFeature['properties']) =>
    [
      loc(p, 'country', language),
      p.year != null ? String(p.year) : null,
      p.depth != null ? `${convertDepth(p.depth).toFixed(1)} ${depthLabel}` : null,
    ].filter(Boolean).join(' · ');

  return (
    <>
      {features.map((f, i) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        const isSite = p.kind === 'site';
        const sub = teaser(p);
        return (
          <Marker
            key={`${p.kind}-${lon.toFixed(5)}-${lat.toFixed(5)}-${i}`}
            position={[lat, lon]}
            icon={isSite ? siteIcon : wreckIcon}
            eventHandlers={{
              popupopen: (e) => {
                // Pan a near-edge popup fully into view — but NOT while center-on-GPS
                // is on, where it would fight MapController re-centring on the boat
                // (the map would jump). Padding leaves room for the popup, which
                // opens above and centred on the marker.
                if (followGpsRef.current) return;
                const ll = e.popup.getLatLng();
                if (ll) map.panInside(ll, { paddingTopLeft: L.point(140, 170), paddingBottomRight: L.point(140, 60) });
              },
            }}
          >
            {/* autoPan off: we pan imperatively in popupopen (above) so the
                behaviour can depend on the live center-on-GPS state. */}
            <Popup autoPan={false}>
              <div style={{ minWidth: '160px', maxWidth: '220px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: theme.colors.textPrimary }}>
                  {loc(p, 'name', language) || (isSite ? t('heritage.site') : t('heritage.wreck'))}
                </div>
                <div style={{ fontSize: '0.72rem', color: KIND_COLOR[p.kind], marginTop: '2px' }}>
                  {isSite ? t('heritage.site') : t('heritage.wreck')}{sub ? ` · ${sub}` : ''}
                </div>
                <button
                  onClick={() => { map.closePopup(); setSelected(f); }}
                  className="touch-btn"
                  style={{
                    marginTop: '8px', padding: '0.4rem 0.7rem', background: 'rgba(79,195,247,0.5)',
                    border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold',
                  }}
                >
                  {t('heritage.more_info')}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {selected && <HeritageDetailDialog feature={selected} onClose={() => setSelected(null)} />}
    </>
  );
};
