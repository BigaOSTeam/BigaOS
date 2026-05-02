/**
 * TankEditDialog — create/edit a tank's metadata.
 *
 * Two layers:
 *   1. Tank metadata form (name, fluid type, capacity, source stream).
 *   2. After save: a read-only summary of the captured calibration points
 *      and a "Calibrate" button that opens the step-by-step wizard.
 *
 * Calibration itself lives in TankCalibrationWizard so this dialog stays
 * focused on metadata and the wizard owns the guided pour-and-capture flow.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTanks } from '../../context/TankContext';
import { usePlugins } from '../../context/PluginContext';
import { CustomSelect, SelectOption } from '../ui/CustomSelect';
import { SButton, SInput, SLabel } from '../ui/SettingsUI';
import {
  TankConfig,
  FluidType,
  FLUID_TYPES,
  fluidColor,
  fluidLabelKey,
} from '../../types/tanks';
import { TankCalibrationWizard } from './TankCalibrationWizard';

interface AnalogStream {
  pluginId: string;
  pluginName: string;
  streamId: string;
  streamName: string;
}

interface TankEditDialogProps {
  tank: TankConfig | null;
  analogStreams: AnalogStream[];
  onClose: () => void;
}

export const TankEditDialog: React.FC<TankEditDialogProps> = ({ tank, analogStreams, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tanks, saveTank, clearCalibration } = useTanks();
  const { debugData } = usePlugins();

  const isNew = tank === null;
  const [name, setName] = useState(tank?.name ?? '');
  const [fluidType, setFluidType] = useState<FluidType>(tank?.fluidType ?? 'fresh_water');
  const [capacityInput, setCapacityInput] = useState(String(tank?.capacityLiters ?? 60));
  const [sourceStreamId, setSourceStreamId] = useState<string>(
    tank?.sourceStreamId ?? (analogStreams[0] ? `${analogStreams[0].pluginId}:${analogStreams[0].streamId}` : '')
  );
  const [showWizard, setShowWizard] = useState(false);

  // Live tank from context — picks up server-confirmed captures over WebSocket.
  const liveTank = useMemo(() => {
    if (!tank) return null;
    return tanks.find(x => x.id === tank.id) ?? tank;
  }, [tank, tanks]);

  const rawV = useMemo(() => {
    const entry = debugData.find(d => `${d.pluginId}:${d.streamId}` === sourceStreamId);
    return typeof entry?.value === 'number' ? entry.value : null;
  }, [debugData, sourceStreamId]);

  const sourceOptions: SelectOption<string>[] = analogStreams.map(s => ({
    value: `${s.pluginId}:${s.streamId}`,
    label: `${s.pluginName} – ${s.streamName}`,
  }));

  const fluidOptions: SelectOption<FluidType>[] = FLUID_TYPES.map(f => ({
    value: f,
    label: t(fluidLabelKey(f)),
  }));

  const capacity = parseFloat(capacityInput);
  const capacityValid = Number.isFinite(capacity) && capacity > 0;
  const canSave = name.trim().length > 0 && capacityValid && sourceStreamId.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const next: TankConfig = {
      id: liveTank?.id ?? '',
      name: name.trim(),
      fluidType,
      capacityLiters: capacity,
      sourceStreamId,
      calibration: liveTank?.calibration ?? { points: [] },
    };
    saveTank(next);
    if (isNew) onClose();
  };

  const handleClearCalibration = () => {
    if (!liveTank) return;
    clearCalibration(liveTank.id);
  };

  const accent = fluidColor(fluidType);
  const points = liveTank?.calibration.points ?? [];
  const sortedPoints = [...points].sort((a, b) => a.liters - b.liters);

  // Inline curve preview (raw V vs L).
  const curveSvg = useMemo(() => {
    if (sortedPoints.length < 1 || !liveTank) return null;
    const w = 240, h = 80, pad = 4;
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
  }, [sortedPoints, liveTank, accent, theme.colors.bgPrimary, theme.radius.sm]);

  // If the source stream goes away (e.g. plugin disabled), fall back to the
  // first available stream so the dropdown isn't stuck on a dead value.
  useEffect(() => {
    if (!analogStreams.length) return;
    const found = analogStreams.find(s => `${s.pluginId}:${s.streamId}` === sourceStreamId);
    if (!found && analogStreams[0]) {
      setSourceStreamId(`${analogStreams[0].pluginId}:${analogStreams[0].streamId}`);
    }
  }, [analogStreams, sourceStreamId]);

  return (
    <>
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
            maxWidth: '560px',
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
              {isNew ? t('tanks.create_title') : t('tanks.edit_title')}
            </h2>
            <SButton variant="ghost" onClick={onClose} style={{ padding: theme.space.xs }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </SButton>
          </div>

          {/* Tank metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.lg }}>
            <div>
              <SLabel>{t('tanks.name')}</SLabel>
              <SInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('tanks.name_placeholder')} />
            </div>

            <div>
              <SLabel>{t('tanks.fluid_type')}</SLabel>
              <CustomSelect value={fluidType} options={fluidOptions} onChange={setFluidType} />
            </div>

            <div>
              <SLabel>{t('tanks.capacity_liters')}</SLabel>
              <SInput
                type="number"
                value={capacityInput}
                onChange={(e) => setCapacityInput(e.target.value)}
                placeholder="60"
                min={0}
              />
            </div>

            <div>
              <SLabel>{t('tanks.source_stream')}</SLabel>
              <CustomSelect value={sourceStreamId} options={sourceOptions} onChange={setSourceStreamId} />
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: theme.space.xs }}>
                {rawV !== null
                  ? t('tanks.live_raw', { volts: rawV.toFixed(3) })
                  : t('tanks.no_live_signal')}
              </div>
            </div>

            <SButton variant="primary" onClick={handleSave} disabled={!canSave} fullWidth>
              {isNew ? t('tanks.save_and_close') : t('common.save')}
            </SButton>
          </div>

          {/* Calibration section — only after the tank has been saved at least once. */}
          {liveTank && (
            <div style={{ marginTop: theme.space.xl, paddingTop: theme.space.lg, borderTop: `1px solid ${theme.colors.border}` }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: theme.space.sm,
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: theme.fontSize.md,
                  fontWeight: theme.fontWeight.semibold,
                  color: theme.colors.textPrimary,
                }}>
                  {t('tanks.calibration')}
                </h3>
                <span style={{
                  fontSize: theme.fontSize.xs,
                  color: sortedPoints.length === 0 ? theme.colors.warning : theme.colors.textMuted,
                }}>
                  {sortedPoints.length === 0
                    ? t('tanks.calibration_status_uncalibrated')
                    : t('tanks.calibration_status_points', { count: String(sortedPoints.length) })}
                </span>
              </div>

              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: theme.space.md }}>
                {t('tanks.calibration_intro_short')}
              </div>

              {sortedPoints.length > 0 && (
                <div style={{ marginBottom: theme.space.md }}>
                  {curveSvg}
                  <div style={{
                    fontSize: theme.fontSize.xs,
                    color: theme.colors.textMuted,
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: theme.space.xs,
                  }}>
                    <span>{sortedPoints[0].liters.toFixed(1)} L → {sortedPoints[0].rawVolts.toFixed(2)} V</span>
                    <span>{sortedPoints[sortedPoints.length - 1].liters.toFixed(1)} L → {sortedPoints[sortedPoints.length - 1].rawVolts.toFixed(2)} V</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: theme.space.sm }}>
                <SButton variant="primary" onClick={() => setShowWizard(true)} style={{ flex: 2 }}>
                  {sortedPoints.length === 0 ? t('tanks.calibrate_start') : t('tanks.calibrate_redo')}
                </SButton>
                {sortedPoints.length > 0 && (
                  <SButton variant="outline" onClick={handleClearCalibration} style={{ flex: 1 }}>
                    {t('tanks.clear_calibration')}
                  </SButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showWizard && liveTank && (
        <TankCalibrationWizard tank={liveTank} onClose={() => setShowWizard(false)} />
      )}
    </>
  );
};
