/**
 * TanksTab — manage configured tanks (fuel/water/waste/etc).
 *
 * Tanks are owned by the BigaOS server (TankService). The MacArthur HAT
 * plugin (or any plugin exposing `analog_voltage` streams) provides the raw
 * input. Calibration converts raw V → liters server-side.
 */

import React, { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useTanks } from '../../context/TankContext';
import { usePlugins } from '../../context/PluginContext';
import { SButton, SCard, SInfoBox, SSection } from '../ui/SettingsUI';
import { TankConfig, fluidColor, fluidLabelKey } from '../../types/tanks';
import { TankEditDialog } from './TankEditDialog';

export const TanksTab: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const { tanks, readings, deleteTank } = useTanks();
  const { plugins, debugData } = usePlugins();

  const [editing, setEditing] = useState<TankConfig | null>(null);
  const [creating, setCreating] = useState(false);

  // All analog_voltage streams across enabled plugins, used both by the
  // dialog (source picker) and by the tab (showing the live raw voltage
  // next to each tank).
  const analogStreams = useMemo(() => {
    const out: { pluginId: string; pluginName: string; streamId: string; streamName: string }[] = [];
    for (const p of plugins) {
      const streams = p.manifest.driver?.dataStreams ?? [];
      for (const s of streams) {
        if (s.dataType === 'analog_voltage') {
          out.push({
            pluginId: p.id,
            pluginName: p.manifest.name,
            streamId: s.id,
            streamName: s.name,
          });
        }
      }
    }
    return out;
  }, [plugins]);

  const debugByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of debugData) {
      if (d.dataType === 'analog_voltage' && typeof d.value === 'number') {
        m.set(`${d.pluginId}:${d.streamId}`, d.value);
      }
    }
    return m;
  }, [debugData]);

  const handleDelete = async (tank: TankConfig) => {
    const ok = await confirm({
      title: t('tanks.delete_title'),
      message: t('tanks.delete_message', { name: tank.name }),
    });
    if (ok) deleteTank(tank.id);
  };

  const renderTankCard = (tank: TankConfig) => {
    const reading = readings[tank.id];
    const rawV = debugByKey.get(tank.sourceStreamId);
    const hasSignal = typeof rawV === 'number';
    const calibrated = tank.calibration.points.length >= 1;
    const accent = fluidColor(tank.fluidType);

    return (
      <SCard key={tank.id} style={{ marginBottom: theme.space.md, borderLeft: `4px solid ${accent}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.space.md }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.space.sm,
              marginBottom: theme.space.xs,
              flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
                color: theme.colors.textPrimary,
              }}>
                {tank.name}
              </span>
              <span style={{
                fontSize: '10px',
                padding: `1px ${theme.space.xs}`,
                borderRadius: theme.radius.xs,
                background: `${accent}22`,
                color: accent,
                fontWeight: theme.fontWeight.medium,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {t(fluidLabelKey(tank.fluidType))}
              </span>
            </div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
              {t('tanks.capacity_label')}: {tank.capacityLiters.toFixed(0)} L
              {' · '}
              {t('tanks.source_label')}: {tank.sourceStreamId}
            </div>
          </div>
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <SButton variant="outline" onClick={() => setEditing(tank)} style={{ padding: `${theme.space.sm} ${theme.space.md}` }}>
              {t('common.edit')}
            </SButton>
            <SButton variant="danger" onClick={() => handleDelete(tank)} style={{ padding: `${theme.space.sm} ${theme.space.md}` }}>
              {t('common.delete')}
            </SButton>
          </div>
        </div>

        {/* Live status row */}
        <div style={{
          marginTop: theme.space.md,
          padding: theme.space.sm,
          background: theme.colors.bgPrimary,
          borderRadius: theme.radius.sm,
          fontSize: theme.fontSize.sm,
        }}>
          {!hasSignal && (
            <div style={{ color: theme.colors.warning }}>{t('tanks.no_signal')}</div>
          )}
          {hasSignal && !calibrated && (
            <div style={{ color: theme.colors.warning }}>
              {t('tanks.uncalibrated', { volts: rawV!.toFixed(3) })}
            </div>
          )}
          {hasSignal && calibrated && reading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md, flexWrap: 'wrap' }}>
              <span style={{ color: accent, fontWeight: theme.fontWeight.bold, fontSize: theme.fontSize.lg }}>
                {reading.level.toFixed(0)}%
              </span>
              <span style={{ color: theme.colors.textPrimary }}>
                {reading.volume.toFixed(1)} / {reading.capacity.toFixed(0)} L
              </span>
              <span style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginLeft: 'auto' }}>
                raw: {rawV!.toFixed(3)} V · {tank.calibration.points.length} {t('tanks.points')}
              </span>
            </div>
          )}
          {hasSignal && calibrated && !reading && (
            <div style={{ color: theme.colors.textMuted }}>
              raw: {rawV!.toFixed(3)} V · {tank.calibration.points.length} {t('tanks.points')}
            </div>
          )}
        </div>
      </SCard>
    );
  };

  return (
    <div>
      <SSection description={t('tanks.intro')}>
        {t('tanks.title')}
      </SSection>

      {analogStreams.length === 0 && (
        <SInfoBox>{t('tanks.no_streams')}</SInfoBox>
      )}

      {tanks.length === 0 && analogStreams.length > 0 && (
        <SInfoBox>{t('tanks.empty')}</SInfoBox>
      )}

      {tanks.map(renderTankCard)}

      <SButton
        variant="primary"
        onClick={() => setCreating(true)}
        disabled={analogStreams.length === 0}
        style={{ marginTop: theme.space.md }}
      >
        {t('tanks.add')}
      </SButton>

      {(editing || creating) && (
        <TankEditDialog
          tank={editing}
          analogStreams={analogStreams}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
};

