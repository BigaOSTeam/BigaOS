import React from 'react';
import { VesselSettings } from '../../../context/SettingsContext';

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
  const hasIdentification = vesselSettings.registrationNumber || vesselSettings.callSign ||
    vesselSettings.mmsi || vesselSettings.homePort || vesselSettings.flag;

  const InfoRow: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => {
    if (!value && value !== 0) return null;
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.4rem 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.8rem' }}>{label}</span>
        <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
          {value}{unit ? ` ${unit}` : ''}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
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
          background: 'rgba(10, 25, 41, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '8px',
          padding: '1.25rem',
          zIndex: 1101,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          minWidth: '280px',
          maxWidth: '340px',
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
            width: '28px',
            height: '28px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            color: 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            color: '#fff',
          }}>
            {vesselSettings.name || 'My Vessel'}
          </div>
          {vesselSettings.homePort && (
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.25rem' }}>
              {vesselSettings.homePort}{vesselSettings.flag ? `, ${vesselSettings.flag}` : ''}
            </div>
          )}
        </div>

        {/* Identification Section */}
        {hasIdentification && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              fontSize: '0.7rem',
              color: 'rgba(255, 255, 255, 0.4)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '0.5rem',
            }}>
              Identification
            </div>
            <InfoRow label="Registration" value={vesselSettings.registrationNumber} />
            <InfoRow label="Call Sign" value={vesselSettings.callSign} />
            <InfoRow label="MMSI" value={vesselSettings.mmsi} />
          </div>
        )}

        {/* Dimensions Section */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.7rem',
            color: 'rgba(255, 255, 255, 0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.5rem',
          }}>
            Dimensions
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>Length</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.length}m</div>
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>Beam</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.beam}m</div>
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>Draft</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.draft}m</div>
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>Displacement</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.displacement}t</div>
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>Freeboard</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.freeboardHeight}m</div>
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
              padding: '0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>WL Length</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{vesselSettings.waterlineLength}m</div>
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
              padding: '0.75rem',
              background: 'rgba(79, 195, 247, 0.2)',
              border: '1px solid rgba(79, 195, 247, 0.4)',
              borderRadius: '6px',
              color: '#4fc3f7',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Vessel Details
          </button>
        )}
      </div>
    </>
  );
};
