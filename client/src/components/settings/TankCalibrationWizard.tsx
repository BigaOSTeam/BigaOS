/**
 * TankCalibrationWizard — guided multi-point calibration.
 *
 * Phase 1 (sweep): walk the user through a fixed set of liter targets
 * (default: capacity / 4, so 5 points at 0/25/50/75/100 %). Each step shows
 * the live raw voltage, an instruction ("pour X liters → press Capture"),
 * and a Skip button. Captured points are stored server-side immediately.
 *
 * Phase 2 (refine): once the sweep is done, scan adjacent point intervals
 * for slope outliers. If any local slope deviates from the median by more
 * than OUTLIER_RATIO, propose a midpoint capture. User can capture or skip.
 * Loops until no outliers remain or user finishes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTanks } from '../../context/TankContext';
import { usePlugins } from '../../context/PluginContext';
import { SButton, SInput, SLabel } from '../ui/SettingsUI';
import { TankConfig, fluidColor, FluidType } from '../../types/tanks';

interface TankCalibrationWizardProps {
  tank: TankConfig;
  onClose: () => void;
}

type Phase = 'setup' | 'sweep' | 'refine' | 'done';

// Local slope (V/L) is "outlier" if it's >2× or <0.5× the median local slope.
// Below MIN_INTERVAL_L we won't suggest a split — splitting a 0.5 L interval
// further is silly and noisy raw V will dominate the math.
const OUTLIER_RATIO = 2.0;
const MIN_INTERVAL_L = 1.0;

export const TankCalibrationWizard: React.FC<TankCalibrationWizardProps> = ({ tank, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tanks, captureCalibrationPoint, clearCalibration } = useTanks();
  const { debugData } = usePlugins();

  // Always read the latest tank from the context (server-source-of-truth).
  // The prop's calibration may be stale if the user has already captured.
  const liveTank = tanks.find(x => x.id === tank.id) ?? tank;
  const accent = fluidColor(liveTank.fluidType as FluidType);

  // Live raw V on the source stream.
  const rawV = useMemo(() => {
    const entry = debugData.find(d => `${d.pluginId}:${d.streamId}` === liveTank.sourceStreamId);
    return typeof entry?.value === 'number' ? entry.value : null;
  }, [debugData, liveTank.sourceStreamId]);

  const [phase, setPhase] = useState<Phase>('setup');
  // Step size in liters. Default = capacity / 4 (5 points: 0, 25, 50, 75, 100 %).
  const defaultStepSize = Math.max(1, Math.round(liveTank.capacityLiters / 4));
  const [stepSizeInput, setStepSizeInput] = useState(String(defaultStepSize));
  const stepSize = (() => {
    const n = parseFloat(stepSizeInput);
    if (!Number.isFinite(n) || n <= 0) return defaultStepSize;
    return Math.min(n, liveTank.capacityLiters);
  })();

  // The sweep target list — built when the user starts the sweep so it's
  // stable across re-renders even if the user edits the input afterward.
  const [sweepTargets, setSweepTargets] = useState<number[]>([]);
  const [sweepIdx, setSweepIdx] = useState(0);

  // Refine queue — pending midpoint suggestions {a, b, mid}.
  const [refineQueue, setRefineQueue] = useState<{ a: number; b: number; mid: number }[]>([]);

  // ============ Sweep helpers ============

  const buildSweepTargets = (size: number, capacity: number): number[] => {
    const out: number[] = [0];
    let cur = size;
    while (cur < capacity - 0.0001) {
      out.push(round1(cur));
      cur += size;
    }
    out.push(capacity);
    return out;
  };

  const startSweep = () => {
    // If the user already has the full point starting at 0 and capacity,
    // they probably want to redo. Wipe and start fresh so the targets line
    // up cleanly with what we'll capture.
    clearCalibration(liveTank.id);
    const targets = buildSweepTargets(stepSize, liveTank.capacityLiters);
    setSweepTargets(targets);
    setSweepIdx(0);
    setPhase('sweep');
  };

  const onCapture = () => {
    if (rawV === null) return;
    const target = sweepTargets[sweepIdx];
    if (target === undefined) return;
    captureCalibrationPoint(liveTank.id, target);
    advance();
  };

  const onSkip = () => {
    advance();
  };

  const advance = () => {
    if (sweepIdx + 1 >= sweepTargets.length) {
      // Sweep done — analyse for refine candidates.
      const queue = analyseOutliers(liveTank);
      if (queue.length === 0) setPhase('done');
      else { setRefineQueue(queue); setPhase('refine'); }
    } else {
      setSweepIdx(sweepIdx + 1);
    }
  };

  // ============ Refine helpers ============

  const onRefineCapture = () => {
    if (rawV === null) return;
    const next = refineQueue[0];
    if (!next) return;
    captureCalibrationPoint(liveTank.id, next.mid);
    setRefineQueue(refineQueue.slice(1));
  };

  const onRefineSkip = () => {
    setRefineQueue(refineQueue.slice(1));
  };

  // When a refine capture is processed and queue empties, re-analyse — a
  // newly captured midpoint can reveal further outliers in the sub-intervals.
  useEffect(() => {
    if (phase !== 'refine') return;
    if (refineQueue.length > 0) return;
    const queue = analyseOutliers(liveTank);
    if (queue.length === 0) {
      setPhase('done');
    } else {
      setRefineQueue(queue);
    }
    // Intentionally depends on points (via liveTank) — re-runs after each capture.
  }, [phase, refineQueue, liveTank.calibration.points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Render helpers ============

  const points = liveTank.calibration.points;
  const sortedPoints = [...points].sort((a, b) => a.liters - b.liters);

  const curveSvg = useMemo(() => {
    if (sortedPoints.length < 1) return null;
    const w = 280, h = 100, pad = 6;
    const maxV = Math.max(...sortedPoints.map(p => p.rawVolts), 0.1);
    const minV = Math.min(...sortedPoints.map(p => p.rawVolts), 0);
    const spanV = maxV - minV || 1;
    const maxL = liveTank.capacityLiters;
    const path = sortedPoints
      .map((p, i) => {
        const x = pad + ((p.rawVolts - minV) / spanV) * (w - pad * 2);
        const y = h - pad - (p.liters / maxL) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ background: theme.colors.bgPrimary, borderRadius: theme.radius.sm, display: 'block' }}>
        <path d={path} stroke={accent} strokeWidth={2} fill="none" />
        {sortedPoints.map((p, i) => {
          const x = pad + ((p.rawVolts - minV) / spanV) * (w - pad * 2);
          const y = h - pad - (p.liters / maxL) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r={2.5} fill={accent} />;
        })}
      </svg>
    );
  }, [sortedPoints, liveTank.capacityLiters, accent, theme.colors.bgPrimary, theme.radius.sm]);

  // ============ Phase bodies ============

  const setupBody = (
    <>
      <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginBottom: theme.space.lg, lineHeight: 1.4 }}>
        {t('tanks.wizard_intro', { capacity: String(liveTank.capacityLiters) })}
      </div>

      <SLabel>{t('tanks.wizard_step_size')}</SLabel>
      <SInput
        type="number"
        value={stepSizeInput}
        onChange={(e) => setStepSizeInput(e.target.value)}
        min={1}
        max={liveTank.capacityLiters}
      />
      <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: theme.space.xs, marginBottom: theme.space.lg }}>
        {t('tanks.wizard_step_hint', {
          steps: String(buildSweepTargets(stepSize, liveTank.capacityLiters).length),
          size: String(stepSize),
        })}
      </div>

      {points.length > 0 && (
        <div style={{
          padding: theme.space.sm,
          background: `${theme.colors.warning}18`,
          border: `1px solid ${theme.colors.warning}44`,
          borderRadius: theme.radius.sm,
          fontSize: theme.fontSize.xs,
          color: theme.colors.warning,
          marginBottom: theme.space.lg,
        }}>
          {t('tanks.wizard_will_clear', { count: String(points.length) })}
        </div>
      )}

      <SButton variant="primary" onClick={startSweep} disabled={rawV === null} fullWidth>
        {t('tanks.wizard_start')}
      </SButton>
      {rawV === null && (
        <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.warning, marginTop: theme.space.sm, textAlign: 'center' }}>
          {t('tanks.no_live_signal')}
        </div>
      )}
    </>
  );

  const sweepBody = (() => {
    const target = sweepTargets[sweepIdx];
    const prevTarget = sweepIdx === 0 ? null : sweepTargets[sweepIdx - 1];
    const pourThisStep = target === undefined
      ? 0
      : (prevTarget === null ? 0 : Math.max(0, target - prevTarget));
    const isFirst = sweepIdx === 0;
    const isLast = target === liveTank.capacityLiters;

    const instruction = isFirst
      ? t('tanks.wizard_step_empty')
      : isLast
        ? t('tanks.wizard_step_fill_full', { liters: String(round1(pourThisStep)), total: String(round1(target)) })
        : t('tanks.wizard_step_fill', { liters: String(round1(pourThisStep)), total: String(round1(target)) });

    return (
      <>
        {/* Progress */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: theme.space.sm,
        }}>
          <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('tanks.wizard_step_of', { current: String(sweepIdx + 1), total: String(sweepTargets.length) })}
          </span>
          <span style={{ fontSize: theme.fontSize.lg, color: accent, fontWeight: theme.fontWeight.bold }}>
            {round1(target ?? 0)} L
          </span>
        </div>

        <div style={{
          padding: theme.space.lg,
          background: theme.colors.bgPrimary,
          borderRadius: theme.radius.md,
          marginBottom: theme.space.lg,
          fontSize: theme.fontSize.md,
          color: theme.colors.textPrimary,
          lineHeight: 1.5,
        }}>
          {instruction}
        </div>

        {/* Live raw V */}
        <div style={{
          padding: theme.space.sm,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.sm,
          marginBottom: theme.space.lg,
          fontSize: theme.fontSize.sm,
          textAlign: 'center',
        }}>
          {rawV !== null
            ? <>{t('tanks.current_raw')}: <strong style={{ color: accent }}>{rawV.toFixed(3)} V</strong></>
            : <span style={{ color: theme.colors.warning }}>{t('tanks.no_live_signal')}</span>}
        </div>

        <div style={{ display: 'flex', gap: theme.space.md }}>
          <SButton variant="secondary" onClick={onSkip} style={{ flex: 1 }}>
            {t('tanks.wizard_skip')}
          </SButton>
          <SButton variant="primary" onClick={onCapture} disabled={rawV === null} style={{ flex: 2 }}>
            {t('tanks.wizard_capture')}
          </SButton>
        </div>
      </>
    );
  })();

  const refineBody = (() => {
    const next = refineQueue[0];
    if (!next) return null;
    const pourMore = round1(next.mid - next.b);
    return (
      <>
        <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: theme.space.sm }}>
          {t('tanks.wizard_refine')}
        </div>

        <div style={{
          padding: theme.space.lg,
          background: theme.colors.bgPrimary,
          borderRadius: theme.radius.md,
          marginBottom: theme.space.lg,
          fontSize: theme.fontSize.sm,
          color: theme.colors.textPrimary,
          lineHeight: 1.5,
        }}>
          {t('tanks.wizard_refine_explain', {
            from: String(round1(next.a)),
            to: String(round1(next.b)),
          })}
          <div style={{ marginTop: theme.space.sm, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: accent }}>
            {pourMore > 0
              ? t('tanks.wizard_refine_pour', { liters: String(pourMore), total: String(round1(next.mid)) })
              : t('tanks.wizard_refine_drain', { liters: String(Math.abs(pourMore)), total: String(round1(next.mid)) })}
          </div>
        </div>

        <div style={{
          padding: theme.space.sm,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.sm,
          marginBottom: theme.space.lg,
          fontSize: theme.fontSize.sm,
          textAlign: 'center',
        }}>
          {rawV !== null
            ? <>{t('tanks.current_raw')}: <strong style={{ color: accent }}>{rawV.toFixed(3)} V</strong></>
            : <span style={{ color: theme.colors.warning }}>{t('tanks.no_live_signal')}</span>}
        </div>

        <div style={{ display: 'flex', gap: theme.space.md }}>
          <SButton variant="secondary" onClick={onRefineSkip} style={{ flex: 1 }}>
            {t('tanks.wizard_skip')}
          </SButton>
          <SButton variant="primary" onClick={onRefineCapture} disabled={rawV === null} style={{ flex: 2 }}>
            {t('tanks.wizard_capture')}
          </SButton>
        </div>
      </>
    );
  })();

  const doneBody = (
    <>
      <div style={{
        padding: theme.space.lg,
        background: `${accent}18`,
        border: `1px solid ${accent}44`,
        borderRadius: theme.radius.md,
        marginBottom: theme.space.lg,
        fontSize: theme.fontSize.md,
        color: theme.colors.textPrimary,
        textAlign: 'center',
      }}>
        {t('tanks.wizard_done', { count: String(points.length) })}
      </div>
      <SButton variant="primary" onClick={onClose} fullWidth>
        {t('common.done')}
      </SButton>
    </>
  );

  // ============ Modal shell ============

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: theme.colors.bgOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: theme.zIndex.modal,
      }}
      onClick={onClose}
    >
      <div
        className="settings-scroll"
        style={{
          background: theme.colors.bgSecondary,
          borderRadius: theme.radius.lg,
          padding: theme.space.xl,
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: theme.shadow.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.lg }}>
          <h2 style={{
            margin: 0,
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.bold,
            color: theme.colors.textPrimary,
          }}>
            {t('tanks.wizard_title', { name: liveTank.name })}
          </h2>
          <SButton variant="ghost" onClick={onClose} style={{ padding: theme.space.xs }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </SButton>
        </div>

        {phase === 'setup' && setupBody}
        {phase === 'sweep' && sweepBody}
        {phase === 'refine' && refineBody}
        {phase === 'done' && doneBody}

        {/* Always show captured points + curve so the user can see progress */}
        {sortedPoints.length > 0 && (
          <div style={{ marginTop: theme.space.xl, paddingTop: theme.space.lg, borderTop: `1px solid ${theme.colors.border}` }}>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: theme.space.sm,
            }}>
              {t('tanks.wizard_points', { count: String(sortedPoints.length) })}
            </div>
            <div style={{ marginBottom: theme.space.sm }}>{curveSvg}</div>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>{round1(sortedPoints[0].liters)} L → {sortedPoints[0].rawVolts.toFixed(2)} V</span>
              <span>{round1(sortedPoints[sortedPoints.length - 1].liters)} L → {sortedPoints[sortedPoints.length - 1].rawVolts.toFixed(2)} V</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ Pure helpers ============

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Look at adjacent calibration intervals; suggest midpoint captures wherever
 * the local slope (V/L) deviates from the median by more than OUTLIER_RATIO.
 * Returns one suggestion per outlier interval, deduped, sorted by deviation.
 */
function analyseOutliers(tank: TankConfig): { a: number; b: number; mid: number }[] {
  const pts = [...tank.calibration.points].sort((a, b) => a.liters - b.liters);
  if (pts.length < 3) return [];

  const intervals = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dL = b.liters - a.liters;
    if (dL < MIN_INTERVAL_L) continue;
    const dV = b.rawVolts - a.rawVolts;
    const slope = Math.abs(dV) / dL;
    intervals.push({ aL: a.liters, bL: b.liters, slope });
  }
  if (intervals.length === 0) return [];

  const median = (() => {
    const sorted = [...intervals].map(x => x.slope).sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  })();
  if (median === 0) return [];

  const out: { a: number; b: number; mid: number; dev: number }[] = [];
  for (const iv of intervals) {
    const ratio = iv.slope / median;
    if (ratio > OUTLIER_RATIO || ratio < 1 / OUTLIER_RATIO) {
      out.push({
        a: iv.aL,
        b: iv.bL,
        mid: round1((iv.aL + iv.bL) / 2),
        dev: Math.max(ratio, 1 / ratio),
      });
    }
  }
  // Skip suggestions whose midpoint is already a captured point (don't loop forever).
  const captured = new Set(pts.map(p => round1(p.liters)));
  const filtered = out.filter(s => !captured.has(s.mid));

  filtered.sort((a, b) => b.dev - a.dev);
  return filtered.map(({ a, b, mid }) => ({ a, b, mid }));
}
