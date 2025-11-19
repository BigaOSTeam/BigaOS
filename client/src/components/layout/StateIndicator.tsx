import React from 'react';
import { BoatState } from '../../types';

interface StateIndicatorProps {
  state: BoatState;
  onStateChange?: (state: BoatState) => void;
}

const stateConfig = {
  [BoatState.ANCHORED]: { emoji: '⚓', color: '#4fc3f7', label: 'Anchored' },
  [BoatState.SAILING]: { emoji: '⛵', color: '#66bb6a', label: 'Sailing' },
  [BoatState.MOTORING]: { emoji: '🚤', color: '#ffa726', label: 'Motoring' },
  [BoatState.IN_MARINA]: { emoji: '🏠', color: '#ab47bc', label: 'In Marina' },
  [BoatState.DRIFTING]: { emoji: '🌊', color: '#78909c', label: 'Drifting' }
};

export const StateIndicator: React.FC<StateIndicatorProps> = ({ state, onStateChange }) => {
  const config = stateConfig[state];

  return (
    <div className="card" style={{
      background: `linear-gradient(135deg, ${config.color}22, ${config.color}11)`,
      border: `2px solid ${config.color}`,
      marginBottom: '1.5rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2.5rem' }}>{config.emoji}</span>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase' }}>
              Boat Status
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: config.color }}>
              {config.label}
            </div>
          </div>
        </div>

        {onStateChange && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.values(BoatState).map((s) => (
              <button
                key={s}
                onClick={() => onStateChange(s)}
                className="btn btn-secondary"
                style={{
                  padding: '0.5rem',
                  fontSize: '1.25rem',
                  opacity: s === state ? 1 : 0.5,
                  border: s === state ? `2px solid ${stateConfig[s].color}` : 'none'
                }}
                title={stateConfig[s].label}
              >
                {stateConfig[s].emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
