/**
 * Regional import — "Add a lake".
 *
 * Lives in the Downloads tab. Search OSM for a lake, give its max depth, and the
 * server models a depth tile from the outline (lake-depth.service) that folds
 * into the existing Depth overlay. Progress rides the shared `download_progress`
 * WebSocket (fileId = the lake id), so it mirrors the dataset downloads above.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { wsService } from '../../services/websocket';
import { regionalAPI, ImportedLake, LakeCandidate, DownloadProgress } from '../../services/api';
import { SSection, SButton, SInput } from '../ui/SettingsUI';

type Pending = { id: string; status: DownloadProgress['status']; progress: number; error?: string };

export const RegionalImportSection: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();

  const [lakes, setLakes] = useState<ImportedLake[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<LakeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LakeCandidate | null>(null);
  const [maxDepth, setMaxDepth] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await regionalAPI.listLakes();
      setLakes(res.data.lakes ?? []);
    } catch {
      /* leave the existing list */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Debounced OSM search while the add panel is open.
  useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    if (q.length < 3) { setCandidates([]); setSearching(false); return; }
    setSearching(true);
    const tmr = setTimeout(async () => {
      try {
        const res = await regionalAPI.search(q);
        setCandidates(res.data.candidates ?? []);
      } catch {
        setCandidates([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(tmr);
  }, [query, adding]);

  // Track generation progress for the lake we just submitted.
  useEffect(() => {
    const onProgress = (data: DownloadProgress & { timestamp?: unknown }) => {
      setPending((prev) => (prev && data.fileId === prev.id
        ? { id: prev.id, status: data.status, progress: data.progress, error: data.error }
        : prev));
      if (data.status === 'completed') refresh();
    };
    wsService.on('download_progress', onProgress);
    return () => wsService.off('download_progress', onProgress);
  }, [refresh]);

  const resetAdd = useCallback(() => {
    setAdding(false); setQuery(''); setCandidates([]);
    setSelected(null); setMaxDepth(''); setPending(null);
  }, []);

  // Close the panel shortly after a successful import.
  useEffect(() => {
    if (pending?.status !== 'completed') return;
    const tmr = setTimeout(resetAdd, 900);
    return () => clearTimeout(tmr);
  }, [pending?.status, resetAdd]);

  const depthValid = (() => {
    const md = parseFloat(maxDepth);
    return Number.isFinite(md) && md > 0 && md <= 4000;
  })();

  const startImport = async () => {
    if (!selected || !depthValid) return;
    try {
      const res = await regionalAPI.createLake({
        name: selected.name, relationId: selected.relationId, maxDepth: parseFloat(maxDepth),
      });
      setPending({ id: res.data.id, status: 'converting', progress: 5 });
    } catch {
      setPending({ id: selected.name, status: 'error', progress: 0, error: t('regional.error') });
    }
  };

  const removeLake = async (lake: ImportedLake) => {
    const ok = await confirm({
      title: t('regional.delete_title', { name: lake.name }),
      message: t('regional.delete_message'),
      confirmLabel: t('regional.delete'),
      cancelLabel: t('regional.cancel'),
    });
    if (!ok) return;
    try { await regionalAPI.removeLake(lake.id); await refresh(); } catch { /* ignore */ }
  };

  const busy = !!pending && pending.status !== 'error';

  return (
    <div style={{ marginTop: theme.space.lg }}>
      <SSection description={t('regional.modeled_note')}>{t('regional.section_title')}</SSection>

      {/* Installed lakes */}
      {lakes.length === 0 ? (
        <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm, marginBottom: theme.space.sm }}>
          {t('regional.empty')}
        </div>
      ) : (
        lakes.map((lake) => (
          <div
            key={lake.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: theme.space.sm, paddingBottom: theme.space.sm,
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: theme.colors.textPrimary }}>
                {lake.name}
              </div>
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
                {t('regional.depth_max', { depth: lake.maxDepth })}
              </div>
            </div>
            <SButton variant="danger" onClick={() => removeLake(lake)} style={{ flexShrink: 0, width: '42px', padding: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </SButton>
          </div>
        ))
      )}

      {/* Add-a-lake */}
      {!adding ? (
        <SButton
          variant="primary"
          fullWidth
          onClick={() => setAdding(true)}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        >
          {t('regional.add_lake')}
        </SButton>
      ) : (
        <div style={{
          padding: theme.space.md, background: theme.colors.bgCard,
          border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md,
        }}>
          {busy ? (
            // Progress (converting → indexing → completed)
            <div>
              <div style={{ marginBottom: theme.space.sm, background: theme.colors.bgCardActive, borderRadius: theme.radius.sm, overflow: 'hidden', height: '8px', position: 'relative' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(90deg, transparent 0%, ${pending!.status === 'completed' ? theme.colors.success : theme.colors.info} 50%, transparent 100%)`,
                  animation: pending!.status === 'completed' ? 'none' : 'extracting 1.5s ease-in-out infinite',
                  ...(pending!.status === 'completed' ? { background: theme.colors.success } : {}),
                }} />
              </div>
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textAlign: 'center' }}>
                {pending!.status === 'completed' ? t('regional.added')
                  : pending!.status === 'indexing' ? t('downloads.indexing')
                    : t('downloads.converting')}
              </div>
            </div>
          ) : (
            <>
              <SInput
                autoFocus
                placeholder={t('regional.search_placeholder')}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              />

              {/* Candidates */}
              <div style={{ marginTop: theme.space.sm }}>
                {searching ? (
                  <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>{t('regional.searching')}</div>
                ) : query.trim().length >= 3 && candidates.length === 0 ? (
                  <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>{t('regional.no_results')}</div>
                ) : (
                  candidates.map((c) => {
                    const active = selected?.relationId === c.relationId;
                    return (
                      <button
                        key={c.relationId}
                        onClick={() => setSelected(c)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                          padding: '0.5rem 0.6rem', marginBottom: '4px', textAlign: 'left',
                          background: active ? theme.colors.primaryMedium : theme.colors.bgCardActive,
                          border: 'none', borderRadius: theme.radius.sm, cursor: 'pointer',
                          color: theme.colors.textPrimary, fontSize: theme.fontSize.sm,
                        }}
                      >
                        <span>{c.name}</span>
                        <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                          {t('regional.area_km2', { area: c.areaKm2 })}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Max depth + actions */}
              {selected && (
                <div style={{ marginTop: theme.space.sm }}>
                  <SInput
                    type="number"
                    placeholder={t('regional.max_depth')}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                  />
                  <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, margin: `${theme.space.xs} 0 ${theme.space.sm}` }}>
                    {t('regional.max_depth_hint')}
                  </div>
                </div>
              )}

              {pending?.status === 'error' && (
                <div style={{ color: theme.colors.error, fontSize: theme.fontSize.xs, marginBottom: theme.space.sm }}>
                  {pending.error || t('regional.error')}
                </div>
              )}

              <div style={{ display: 'flex', gap: theme.space.sm, marginTop: theme.space.sm }}>
                <SButton variant="outline" onClick={resetAdd} style={{ flex: 1 }}>{t('regional.cancel')}</SButton>
                <SButton variant="primary" onClick={startImport} disabled={!selected || !depthValid} style={{ flex: 2 }}>
                  {t('regional.create')}
                </SButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
