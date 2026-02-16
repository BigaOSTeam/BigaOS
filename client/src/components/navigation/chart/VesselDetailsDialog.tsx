import React from 'react';
import { VesselSettings } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface VesselDetailsDialogProps {
  vesselSettings: VesselSettings;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const VesselDetailsDialog: React.FC<VesselDetailsDialogProps> = ({
  vesselSettings,
  onClose,
  onOpenSettings,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const hasIdentification = vesselSettings.registrationNumber || vesselSettings.callSign ||
    vesselSettings.mmsi || vesselSettings.homePort || vesselSettings.flag;

  const InfoRow: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => {
    if (!value && value !== 0) return null;
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.5rem 0',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <span style={{ color: theme.colors.textSecondary, fontSize: '0.85rem' }}>{label}</span>
        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
          {value}{unit ? ` ${unit}` : ''}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Overlay - only close on single click, not double-click zoom */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1100,
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.borderDashed}`,
          borderRadius: '8px',
          padding: '1.25rem',
          zIndex: 1101,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          minWidth: '300px',
          maxWidth: '360px',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="touch-btn"
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            width: '36px',
            height: '36px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            color: theme.colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Vessel Icon & Name */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <svg
            width="40"
            height="40"
            viewBox="-12 -18 24 28"
            fill="none"
            style={{ marginBottom: '0.5rem' }}
          >
            {/* Hull */}
            <path d="M -10 4 L -10 8 L 10 8 L 12 4 Z" fill="#4fc3f7" fillOpacity="0.3" stroke="#4fc3f7" strokeWidth="1" />
            {/* Mast */}
            <line x1="0" y1="4" x2="0" y2="-16" stroke="#4fc3f7" strokeWidth="1.5" />
            {/* Mainsail */}
            <path d="M -1 -14 L -8 2 L -1 2 Z" fill="#4fc3f7" fillOpacity="0.5" stroke="#4fc3f7" strokeWidth="0.5" />
            {/* Foresail */}
            <path d="M 1 -14 L 10 2 L 1 2 Z" fill="#4fc3f7" fillOpacity="0.4" stroke="#4fc3f7" strokeWidth="0.5" />
          </svg>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: theme.colors.textPrimary,
          }}>
            {vesselSettings.name || t('chart.my_vessel')}
          </div>
          {vesselSettings.homePort && (
            <div style={{ fontSize: '0.85rem', color: theme.colors.textMuted, marginTop: '0.25rem' }}>
              {vesselSettings.homePort}{vesselSettings.flag ? `, ${vesselSettings.flag}` : ''}
            </div>
          )}
        </div>

        {/* Identification Section */}
        {hasIdentification && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              fontSize: '0.8rem',
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '0.5rem',
            }}>
              {t('chart.identification')}
            </div>
            <InfoRow label={t('chart.registration')} value={vesselSettings.registrationNumber} />
            <InfoRow label={t('chart.call_sign')} value={vesselSettings.callSign} />
            <InfoRow label={t('chart.mmsi')} value={vesselSettings.mmsi} />
          </div>
        )}

        {/* Dimensions Section */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.8rem',
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.5rem',
          }}>
            {t('chart.dimensions')}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
          }}>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.length')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.length}m</div>
            </div>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.beam')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.beam}m</div>
            </div>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.draft')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.draft}m</div>
            </div>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.displacement')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.displacement}t</div>
            </div>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.freeboard')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.freeboardHeight}m</div>
            </div>
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '6px',
              padding: '0.6rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>{t('chart.wl_length')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{vesselSettings.waterlineLength}m</div>
            </div>
          </div>
        </div>

        {/* Edit Button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="touch-btn"
            style={{
              width: '100%',
              padding: '0.9rem',
              background: 'rgba(79, 195, 247, 0.2)',
              border: '1px solid rgba(79, 195, 247, 0.4)',
              borderRadius: '6px',
              color: '#4fc3f7',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {t('chart.edit_vessel')}
          </button>
        )}
      </div>
    </>
  );
};
