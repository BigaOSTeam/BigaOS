/**
 * ZonesLayer — renders user-authored zone polygons (no-go / nature / anchorage
 * / speed) drawn or imported on the chart. Data lives in the `chartZones` boat
 * setting (synced + persisted server-side); this just draws it as a toggleable
 * overlay (registry id `zones`). Tap a polygon to see its name/type and delete.
 *
 * GeoJSON stores [lon, lat]; Leaflet wants [lat, lon].
 */
import React from 'react';
import { Polygon, Popup } from 'react-leaflet';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

export type ZoneType = 'nogo' | 'nature' | 'anchorage' | 'speed';

export interface ZoneFeature {
  type: 'Feature';
  properties: { id: string; name: string; zoneType: ZoneType };
  geometry: { type: 'Polygon'; coordinates: number[][][] }; // [ [ [lon,lat], ... ] ]
}

export interface ZoneCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

export const ZONE_TYPES: ZoneType[] = ['nogo', 'nature', 'anchorage', 'speed'];

export const ZONE_COLORS: Record<ZoneType, string> = {
  nogo: '#ef5350',
  nature: '#66bb6a',
  anchorage: '#42a5f5',
  speed: '#ffa726',
};

interface ZonesLayerProps {
  zones: ZoneCollection;
  onDelete: (id: string) => void;
}

export const ZonesLayer: React.FC<ZonesLayerProps> = ({ zones, onDelete }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const features = Array.isArray(zones?.features) ? zones.features : [];

  return (
    <>
      {features.map((f) => {
        const ring = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring) || ring.length < 3) return null;
        const positions = ring.map(([lon, lat]) => [lat, lon] as [number, number]);
        const color = ZONE_COLORS[f.properties.zoneType] ?? '#ab47bc';
        return (
          <Polygon
            key={f.properties.id}
            positions={positions}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.18,
              weight: 2,
              dashArray: f.properties.zoneType === 'nogo' ? '6 4' : undefined,
            }}
          >
            <Popup>
              <div style={{ minWidth: '150px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: theme.colors.textPrimary }}>
                  {f.properties.name || t(`chart.zone_type_${f.properties.zoneType}`)}
                </div>
                <div style={{ fontSize: '0.72rem', color, marginTop: '2px' }}>
                  {t(`chart.zone_type_${f.properties.zoneType}`)}
                </div>
                <button
                  onClick={() => onDelete(f.properties.id)}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '6px 8px',
                    background: theme.colors.errorLight,
                    color: theme.colors.error,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  {t('chart.zone_delete')}
                </button>
              </div>
            </Popup>
          </Polygon>
        );
      })}
    </>
  );
};
