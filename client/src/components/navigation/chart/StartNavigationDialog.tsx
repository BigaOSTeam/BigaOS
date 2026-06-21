import React, { useState } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useSettings, distanceConversions } from '../../../context/SettingsContext';
import { SButton, SToggle, SInfoBox } from '../../ui/SettingsUI';
import { radToDeg } from '../../../utils/angle';
import { calculateDistanceNm, calculateBearing } from './navigation-utils';
import { effectiveMaxSpeedKn } from '../../../services/polar';
import type { CalculateOptions } from './weather-route.types';

interface StartNavigationDialogProps {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  destinationName?: string;
  onCancel: () => void;
  onCalculate: (opts: CalculateOptions) => void;
  onOpenVesselSettings?: () => void;
}

type DepartureKind = 'now' | 'at' | 'best-window';

/** Format a Date for an <input type="datetime-local"> value (local time). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const StartNavigationDialog: React.FC<StartNavigationDialogProps> = ({
  origin,
  destination,
  destinationName,
  onCancel,
  onCalculate,
  onOpenVesselSettings,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { vesselSettings, distanceUnit } = useSettings();

  const canDepthRoute = vesselSettings.depthRoutingEnabled && vesselSettings.draft > 0;
  const [depthRouting, setDepthRouting] = useState<boolean>(canDepthRoute);
  const [weatherRouting, setWeatherRouting] = useState<boolean>(true);
  const [departureKind, setDepartureKind] = useState<DepartureKind>('now');
  const [departAt, setDepartAt] = useState<string>(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));

  const distNm = calculateDistanceNm(origin.lat, origin.lon, destination.lat, destination.lon);
  const bearingDeg = Math.round(radToDeg(calculateBearing(origin.lat, origin.lon, destination.lat, destination.lon)));
  const conv = distanceConversions[distanceUnit];
  const distStr = `${(distNm * conv.factor).toFixed(1)} ${conv.label}`;

  const sailing = vesselSettings.propulsion !== 'motor';
  const maxSpeed = effectiveMaxSpeedKn(vesselSettings);

  const propulsionLabel =
    vesselSettings.propulsion === 'sail'
      ? t('vessel.propulsion_sail')
      : vesselSettings.propulsion === 'motor'
      ? t('vessel.propulsion_motor')
      : t('vessel.propulsion_motorsail');

  const handleCalculate = () => {
    let departure: CalculateOptions['departure'];
    if (departureKind === 'best-window') departure = { kind: 'best-window' };
    else if (departureKind === 'at') departure = { kind: 'at', ms: new Date(departAt).getTime() };
    else departure = { kind: 'now' };
    onCalculate({ depthRouting, weatherRouting, departure });
  };

  const segBtn = (kind: DepartureKind, label: string) => (
    <button
      onClick={() => setDepartureKind(kind)}
      style={{
        flex: 1,
        padding: '0.5rem 0.4rem',
        background: departureKind === kind ? theme.colors.primaryMedium : theme.colors.bgCard,
        color: theme.colors.textPrimary,
        border: 'none',
        borderRadius: '6px',
        fontWeight: departureKind === kind ? theme.fontWeight.bold : theme.fontWeight.medium,
        fontSize: theme.fontSize.sm,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const toggleRow = (label: string, desc: string, checked: boolean, onChange: (v: boolean) => void, disabled?: boolean) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.space.md,
        padding: '0.7rem 0',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div>
        <div style={{ fontWeight: theme.fontWeight.medium, fontSize: theme.fontSize.sm }}>{label}</div>
        <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{desc}</div>
      </div>
      <SToggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(28, 28, 30, 0.98)',
          borderRadius: '12px',
          padding: '1.5rem',
          width: 'min(460px, 92vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          border: `1px solid ${theme.colors.border}`,
          color: theme.colors.textPrimary,
        }}
      >
        <h3 style={{ margin: 0, marginBottom: theme.space.md, fontSize: '1.2rem' }}>{t('nav.dialog_title')}</h3>

        {/* Destination summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: theme.space.md, marginBottom: theme.space.md }}>
          <div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{t('nav.destination')}</div>
            <div style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium }}>
              {destinationName || `${destination.lat.toFixed(4)}, ${destination.lon.toFixed(4)}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{t('nav.distance_bearing')}</div>
            <div style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium }}>
              {distStr} · {bearingDeg}°
            </div>
          </div>
        </div>

        {/* Routing toggles */}
        <div style={{ borderTop: `1px solid ${theme.colors.border}`, borderBottom: `1px solid ${theme.colors.border}` }}>
          {toggleRow(t('nav.depth_routing'), t('nav.depth_routing_desc'), depthRouting, setDepthRouting, !canDepthRoute)}
          {toggleRow(t('nav.weather_routing'), t('nav.weather_routing_desc'), weatherRouting, setWeatherRouting)}
        </div>

        {/* Departure */}
        {weatherRouting && (
          <div style={{ marginTop: theme.space.md }}>
            <div style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, marginBottom: theme.space.xs }}>
              {t('nav.departure')}
            </div>
            <div style={{ display: 'flex', gap: theme.space.xs }}>
              {segBtn('now', t('nav.departure_now'))}
              {segBtn('at', t('nav.departure_pick'))}
              {segBtn('best-window', t('nav.departure_best'))}
            </div>
            {departureKind === 'at' && (
              <input
                type="datetime-local"
                value={departAt}
                onChange={(e) => setDepartAt(e.target.value)}
                style={{
                  marginTop: theme.space.sm,
                  width: '100%',
                  padding: '0.5rem',
                  background: theme.colors.bgCard,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                }}
              />
            )}
          </div>
        )}

        {/* Boat profile summary */}
        {weatherRouting && (
          <div
            style={{
              marginTop: theme.space.md,
              background: theme.colors.bgCard,
              borderRadius: '8px',
              padding: '0.7rem',
              fontSize: theme.fontSize.xs,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ color: theme.colors.textMuted }}>{t('nav.boat_profile')}</span>
              {onOpenVesselSettings && (
                <span onClick={onOpenVesselSettings} style={{ color: '#4fc3f7', cursor: 'pointer' }}>
                  {t('nav.edit_in_settings')}
                </span>
              )}
            </div>
            <div style={{ color: theme.colors.textSecondary, lineHeight: 1.6 }}>
              {propulsionLabel}
              {sailing && ` · ${t('vessel.pointing_angle')} ${vesselSettings.pointingAngleDeg}°`}
              {sailing && ` · ${t('vessel.max_speed')} ${maxSpeed.toFixed(1)} ${t('units.knots')}`}
              {vesselSettings.propulsion !== 'sail' && ` · ${t('vessel.cruising_speed')} ${vesselSettings.cruisingSpeedKn} ${t('units.knots')}`}
            </div>
          </div>
        )}

        <SInfoBox style={{ marginTop: theme.space.md }}>{t('nav.advisory')}</SInfoBox>

        {/* Actions */}
        <div style={{ display: 'flex', gap: theme.space.sm, justifyContent: 'flex-end', marginTop: theme.space.lg }}>
          <SButton variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </SButton>
          <SButton variant="primary" onClick={handleCalculate}>
            {t('nav.calculate')}
          </SButton>
        </div>
      </div>
    </div>
  );
};
