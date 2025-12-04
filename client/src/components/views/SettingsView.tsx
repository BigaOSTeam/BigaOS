import React from 'react';
import {
  useSettings,
  SpeedUnit,
  DepthUnit,
  DistanceUnit,
  speedConversions,
  depthConversions,
  distanceConversions,
} from '../../context/SettingsContext';

interface SettingsViewProps {
  onClose: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const {
    speedUnit,
    depthUnit,
    distanceUnit,
    setSpeedUnit,
    setDepthUnit,
    setDistanceUnit,
  } = useSettings();

  const renderUnitSelector = <T extends string>(
    label: string,
    currentValue: T,
    options: T[],
    labels: Record<T, string>,
    onChange: (value: T) => void
  ) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: '0.75rem',
        opacity: 0.6,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: '0.75rem',
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}>
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            style={{
              flex: '1 1 auto',
              minWidth: '70px',
              padding: '1rem',
              background: currentValue === option ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
              border: currentValue === option ? '2px solid rgba(25, 118, 210, 0.8)' : '2px solid transparent',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: currentValue === option ? 'bold' : 'normal',
              transition: 'all 0.2s',
            }}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0a1929',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Settings</h1>
      </div>

      {/* Settings content */}
      <div style={{
        flex: 1,
        padding: '1.5rem',
        overflowY: 'auto',
      }}>
        {/* Units section */}
        <div style={{
          marginBottom: '2rem',
        }}>
          <div style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="21" y1="10" x2="3" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="21" y1="18" x2="3" y2="18" />
            </svg>
            Units
          </div>

          {renderUnitSelector<SpeedUnit>(
            'Speed',
            speedUnit,
            ['kt', 'km/h', 'mph', 'm/s'],
            {
              'kt': speedConversions['kt'].label,
              'km/h': speedConversions['km/h'].label,
              'mph': speedConversions['mph'].label,
              'm/s': speedConversions['m/s'].label,
            },
            setSpeedUnit
          )}

          {renderUnitSelector<DepthUnit>(
            'Depth',
            depthUnit,
            ['m', 'ft'],
            {
              'm': depthConversions['m'].label,
              'ft': depthConversions['ft'].label,
            },
            setDepthUnit
          )}

          {renderUnitSelector<DistanceUnit>(
            'Distance',
            distanceUnit,
            ['nm', 'km', 'mi'],
            {
              'nm': distanceConversions['nm'].label,
              'km': distanceConversions['km'].label,
              'mi': distanceConversions['mi'].label,
            },
            setDistanceUnit
          )}
        </div>

        {/* Info section */}
        <div style={{
          padding: '1rem',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          opacity: 0.7,
        }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>About Units</div>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Changing units here will update all displays across the application.
            The depth alarm will be reset when changing depth units to avoid confusion.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        textAlign: 'center',
        fontSize: '0.75rem',
        opacity: 0.5,
      }}>
        BigaOS v1.0
      </div>
    </div>
  );
};
