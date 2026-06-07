/**
 * ZoneDialog — finalise a drawn zone (name + type) or import zones from pasted
 * GeoJSON. Used by ChartView's zone-authoring tool. Appends to the `chartZones`
 * boat setting via the callbacks.
 */
import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { SInput, SButton, SOptionGroup } from '../../ui/SettingsUI';
import { ZoneFeature, ZoneType, ZONE_TYPES } from './ZonesLayer';

function newId(): string {
  return `z${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Extract Polygon zones from arbitrary pasted GeoJSON (Polygon/MultiPolygon). */
function parseImportedZones(text: string): ZoneFeature[] {
  const gj = JSON.parse(text);
  const feats: any[] =
    gj.type === 'FeatureCollection' ? gj.features ?? []
      : gj.type === 'Feature' ? [gj]
        : [{ type: 'Feature', properties: {}, geometry: gj }];

  const out: ZoneFeature[] = [];
  for (const f of feats) {
    const g = f?.geometry;
    const props = f?.properties ?? {};
    const zoneType: ZoneType = ZONE_TYPES.includes(props.zoneType) ? props.zoneType : 'nogo';
    const name = typeof props.name === 'string' ? props.name : '';
    if (g?.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
      out.push({ type: 'Feature', properties: { id: newId(), name, zoneType }, geometry: { type: 'Polygon', coordinates: g.coordinates } });
    } else if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      for (const poly of g.coordinates) {
        if (Array.isArray(poly?.[0])) {
          out.push({ type: 'Feature', properties: { id: newId(), name, zoneType }, geometry: { type: 'Polygon', coordinates: poly } });
        }
      }
    }
  }
  return out;
}

interface ZoneDialogProps {
  mode: 'save' | 'import';
  onSave: (name: string, zoneType: ZoneType) => void;
  onImport: (features: ZoneFeature[]) => void;
  onClose: () => void;
}

export const ZoneDialog: React.FC<ZoneDialogProps> = ({ mode, onSave, onImport, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [zoneType, setZoneType] = useState<ZoneType>('nogo');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);

  const typeLabels: Record<ZoneType, string> = {
    nogo: t('chart.zone_type_nogo'),
    nature: t('chart.zone_type_nature'),
    anchorage: t('chart.zone_type_anchorage'),
    speed: t('chart.zone_type_speed'),
  };

  const doImport = () => {
    try {
      const feats = parseImportedZones(paste);
      if (feats.length === 0) { setError(t('chart.zone_import_none')); return; }
      onImport(feats);
    } catch {
      setError(t('chart.zone_import_invalid'));
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.bgSecondary, borderRadius: theme.radius.lg,
          padding: theme.space.xl, width: 'min(380px, 92vw)',
          border: `1px solid ${theme.colors.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.textPrimary, marginBottom: theme.space.md }}>
          {mode === 'save' ? t('chart.zone_save_title') : t('chart.zone_import_title')}
        </div>

        {mode === 'save' ? (
          <>
            <SInput autoFocus placeholder={t('chart.zone_name')} value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ margin: `${theme.space.md} 0 ${theme.space.sm}`, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>
              {t('chart.zone_type')}
            </div>
            <SOptionGroup options={ZONE_TYPES} labels={typeLabels} value={zoneType} onChange={setZoneType} />
          </>
        ) : (
          <>
            <textarea
              autoFocus
              placeholder={t('chart.zone_import_placeholder')}
              value={paste}
              onChange={(e) => { setPaste(e.target.value); setError(null); }}
              style={{
                width: '100%', minHeight: '140px', resize: 'vertical', boxSizing: 'border-box',
                padding: '0.5rem 0.75rem', background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md,
                color: theme.colors.textPrimary, fontFamily: 'monospace', fontSize: theme.fontSize.xs,
              }}
            />
            {error && <div style={{ color: theme.colors.error, fontSize: theme.fontSize.xs, marginTop: theme.space.xs }}>{error}</div>}
          </>
        )}

        <div style={{ display: 'flex', gap: theme.space.md, marginTop: theme.space.xl }}>
          <SButton variant="outline" onClick={onClose} style={{ flex: 1 }}>{t('chart.zone_cancel')}</SButton>
          {mode === 'save' ? (
            <SButton variant="primary" onClick={() => onSave(name.trim(), zoneType)} style={{ flex: 1 }}>
              {t('chart.zone_save')}
            </SButton>
          ) : (
            <SButton variant="primary" onClick={doImport} disabled={!paste.trim()} style={{ flex: 1 }}>
              {t('chart.zone_import_btn')}
            </SButton>
          )}
        </div>
      </div>
    </div>
  );
};
