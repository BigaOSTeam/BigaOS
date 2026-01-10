import React from 'react';
import { SearchResult } from '../../../services/geocoding';
import { CustomMarker, markerIcons } from './map-icons';

interface DepthSettingsPanelProps {
  sidebarWidth: number;
  depthUnit: string;
  depthAlarm: number | null;
  soundAlarmEnabled: boolean;
  onSetDepthAlarm: (value: number | null) => void;
  onSetSoundAlarm: (enabled: boolean) => void;
  onClose: () => void;
}

export const DepthSettingsPanel: React.FC<DepthSettingsPanelProps> = ({
  sidebarWidth,
  depthUnit,
  depthAlarm,
  soundAlarmEnabled,
  onSetDepthAlarm,
  onSetSoundAlarm,
  onClose,
}) => {
  const settingsPanelWidth = 180;
  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: `${settingsPanelWidth}px`,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'rgba(10, 25, 41, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.75rem' }}>
          DEPTH ALARM
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => onSetDepthAlarm(null)}
            style={{
              padding: '0.9rem 0.75rem',
              background:
                depthAlarm === null
                  ? 'rgba(25, 118, 210, 0.5)'
                  : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '3px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1.1rem',
              textAlign: 'left',
            }}
          >
            Off
          </button>
          {alarmOptions.map((alarmDepth) => (
            <button
              key={alarmDepth}
              onClick={() => onSetDepthAlarm(alarmDepth)}
              style={{
                padding: '0.9rem 0.75rem',
                background:
                  depthAlarm === alarmDepth
                    ? 'rgba(25, 118, 210, 0.5)'
                    : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '3px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.1rem',
                textAlign: 'left',
              }}
            >
              &lt; {alarmDepth} {depthUnit}
            </button>
          ))}
        </div>

        <div
          style={{
            fontSize: '0.8rem',
            opacity: 0.6,
            marginBottom: '0.75rem',
            marginTop: '1rem',
          }}
        >
          SOUND
        </div>
        <button
          onClick={() => onSetSoundAlarm(!soundAlarmEnabled)}
          style={{
            width: '100%',
            padding: '0.9rem 0.75rem',
            background: soundAlarmEnabled
              ? 'rgba(25, 118, 210, 0.5)'
              : 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '3px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '1.1rem',
            textAlign: 'left',
          }}
        >
          {soundAlarmEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {/* Click outside to close */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: sidebarWidth,
          bottom: 0,
          zIndex: 999,
        }}
      />
    </>
  );
};

interface SearchPanelProps {
  sidebarWidth: number;
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  customMarkers: CustomMarker[];
  isOffline?: boolean;
  onSearchChange: (query: string) => void;
  onResultClick: (result: SearchResult) => void;
  onMarkerClick: (marker: CustomMarker) => void;
  onClose: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  sidebarWidth,
  searchQuery,
  searchResults,
  searchLoading,
  customMarkers,
  isOffline = false,
  onSearchChange,
  onResultClick,
  onMarkerClick,
  onClose,
}) => {
  const getMatchingMarkers = (query: string): CustomMarker[] => {
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.length < 2) return [];
    return customMarkers.filter((marker) =>
      marker.name.toLowerCase().includes(lowerQuery)
    );
  };

  const matchingMarkers = getMatchingMarkers(searchQuery);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          right: `${sidebarWidth + 8}px`,
          width: '300px',
          maxHeight: 'calc(100vh - 32px)',
          background: 'rgba(10, 25, 41, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          padding: '1rem',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.25rem' }}>
          SEARCH LOCATIONS
        </div>

        {/* Offline notice */}
        {isOffline && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '3px',
              fontSize: '0.75rem',
              color: 'rgba(239, 68, 68, 0.9)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            Offline - only marker search available
          </div>
        )}

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Type to search (min 2 chars)..."
            style={{
              width: '100%',
              padding: '0.75rem',
              paddingRight: searchLoading ? '2.5rem' : '0.75rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '3px',
              color: '#fff',
              fontSize: '0.9rem',
              outline: 'none',
            }}
            autoFocus
          />
          {searchLoading && (
            <div
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.8rem',
                opacity: 0.6,
              }}
            >
              ...
            </div>
          )}
        </div>

        {/* Search results */}
        <div
          className="chart-search-results"
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            paddingRight: '8px',
            marginRight: '-4px',
          }}
        >
          {/* Custom markers section */}
          {searchQuery && matchingMarkers.length > 0 && (
            <>
              <div
                style={{
                  fontSize: '0.7rem',
                  opacity: 0.5,
                  marginBottom: '0.25rem',
                  marginTop: '0.25rem',
                }}
              >
                YOUR MARKERS
              </div>
              {matchingMarkers.map((marker) => (
                <button
                  key={`marker-${marker.id}`}
                  onClick={() => onMarkerClick(marker)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: `1px solid ${marker.color}`,
                    borderRadius: '3px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={marker.color}
                    stroke="#fff"
                    strokeWidth="1.5"
                  >
                    <path d={markerIcons[marker.icon] || markerIcons.pin} />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{marker.name}</div>
                    <div style={{ opacity: 0.5, fontSize: '0.7rem' }}>
                      {marker.lat.toFixed(4)}, {marker.lon.toFixed(4)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Geocoding results section */}
          {searchQuery && searchResults.length > 0 && (
            <div
              style={{
                fontSize: '0.7rem',
                opacity: 0.5,
                marginBottom: '0.25rem',
                marginTop: '0.5rem',
              }}
            >
              LOCATIONS
            </div>
          )}
          {searchResults.length === 0 &&
            matchingMarkers.length === 0 &&
            !searchLoading &&
            searchQuery && (
              <div
                style={{
                  opacity: 0.6,
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  padding: '1rem',
                }}
              >
                No results found
              </div>
            )}
          {searchResults.map((result, index) => (
            <button
              key={`${result.lat}-${result.lon}-${index}`}
              onClick={() => onResultClick(result)}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {result.display_name.split(',')[0]}
              </div>
              <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>
                {result.display_name.split(',').slice(1).join(',').trim()}
              </div>
              <div style={{ opacity: 0.5, fontSize: '0.7rem', marginTop: '0.25rem' }}>
                {result.type}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Click outside to close */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: sidebarWidth,
          bottom: 0,
          zIndex: 999,
        }}
      />
    </>
  );
};
