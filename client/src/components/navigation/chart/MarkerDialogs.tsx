import React from 'react';
import { CustomMarker, markerIcons, markerColors } from './map-icons';

interface MarkerDialogProps {
  marker?: CustomMarker; // If provided, editing existing marker
  position?: { lat: number; lon: number }; // If provided (and no marker), creating new marker
  markerName: string;
  setMarkerName: (name: string) => void;
  markerColor: string;
  setMarkerColor: (color: string) => void;
  markerIcon: string;
  setMarkerIcon: (icon: string) => void;
  onClose: () => void;
  onSave: (lat: number, lon: number, name: string, color: string, icon: string, id?: string) => void;
}

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
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
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
);

const IconSelector: React.FC<{
  selectedIcon: string;
  selectedColor: string;
  onSelect: (icon: string) => void;
}> = ({ selectedIcon, selectedColor, onSelect }) => (
  <>
    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
      ICON
    </div>
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        marginBottom: '1rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {Object.keys(markerIcons).map((iconKey) => (
        <button
          key={iconKey}
          onClick={() => onSelect(iconKey)}
          className="touch-btn"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            background:
              selectedIcon === iconKey
                ? 'rgba(79, 195, 247, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
            border:
              selectedIcon === iconKey
                ? '2px solid #4fc3f7'
                : '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={selectedColor}
            stroke="#fff"
            strokeWidth="1"
          >
            <path d={markerIcons[iconKey]} />
          </svg>
        </button>
      ))}
    </div>
  </>
);

const ColorSelector: React.FC<{
  selectedColor: string;
  onSelect: (color: string) => void;
}> = ({ selectedColor, onSelect }) => (
  <>
    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
      COLOR
    </div>
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        marginBottom: '1.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {markerColors.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className="touch-btn"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            background: color,
            border:
              selectedColor === color
                ? '2px solid #fff'
                : '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  </>
);

const DialogOverlay: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
}> = ({ onClick, children }) => (
  <>
    <div
      onClick={onClick}
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
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(10, 25, 41, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '6px',
        padding: '1.5rem',
        zIndex: 1101,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        minWidth: '300px',
      }}
    >
      {children}
    </div>
  </>
);

const NameInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Marker name..."
    autoFocus
    style={{
      width: '100%',
      padding: '0.75rem',
      marginBottom: '1rem',
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '0.9rem',
      outline: 'none',
    }}
  />
);

export const MarkerDialog: React.FC<MarkerDialogProps> = ({
  marker,
  position,
  markerName,
  setMarkerName,
  markerColor,
  setMarkerColor,
  markerIcon,
  setMarkerIcon,
  onClose,
  onSave,
}) => {
  const isEditing = !!marker;
  const lat = marker?.lat ?? position?.lat ?? 0;
  const lon = marker?.lon ?? position?.lon ?? 0;

  return (
    <DialogOverlay onClick={onClose}>
      <CloseButton onClick={onClose} />
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          textAlign: 'center',
        }}
      >
        {isEditing ? 'Edit Marker' : 'Add Marker'}
      </div>
      <NameInput value={markerName} onChange={setMarkerName} />
      <IconSelector
        selectedIcon={markerIcon}
        selectedColor={markerColor}
        onSelect={setMarkerIcon}
      />
      <ColorSelector selectedColor={markerColor} onSelect={setMarkerColor} />
      <button
        onClick={() => {
          if (markerName.trim()) {
            onSave(lat, lon, markerName, markerColor, markerIcon, marker?.id);
          }
        }}
        disabled={!markerName.trim()}
        style={{
          width: '100%',
          padding: '0.75rem',
          background: markerName.trim()
            ? 'rgba(79, 195, 247, 0.5)'
            : 'rgba(255, 255, 255, 0.05)',
          border: 'none',
          borderRadius: '6px',
          color: '#fff',
          cursor: markerName.trim() ? 'pointer' : 'not-allowed',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          opacity: markerName.trim() ? 1 : 0.5,
        }}
      >
        {isEditing ? 'Save' : 'Add Marker'}
      </button>
    </DialogOverlay>
  );
};
