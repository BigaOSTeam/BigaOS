import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { navigationAPI } from '../../../services/api';
import { useTheme } from '../../../context/ThemeContext';

export type DebugMode = 'off' | 'grid';

interface GridPoint {
  lat: number;
  lon: number;
  type: 'ocean' | 'lake' | 'land';
}

interface WaterDebugOverlayProps {
  mode: DebugMode;
  gridPoints: GridPoint[];
  onClear: () => void;
}

export const WaterDebugOverlay: React.FC<WaterDebugOverlayProps> = ({
  mode,
  gridPoints,
  onClear,
}) => {
  const map = useMap();
  const gridLayerRef = useRef<L.LayerGroup | null>(null);

  // Clear grid when map moves
  useEffect(() => {
    const handleMove = () => {
      if (gridPoints.length > 0) {
        onClear();
      }
    };

    map.on('movestart', handleMove);
    map.on('zoomstart', handleMove);

    return () => {
      map.off('movestart', handleMove);
      map.off('zoomstart', handleMove);
    };
  }, [map, gridPoints.length, onClear]);

  // Render grid points as circle markers
  useEffect(() => {
    // Remove old grid layer
    if (gridLayerRef.current) {
      map.removeLayer(gridLayerRef.current);
      gridLayerRef.current = null;
    }

    if (mode === 'off' || gridPoints.length === 0) {
      return;
    }

    // Create new grid layer
    const layerGroup = L.layerGroup();

    gridPoints.forEach((point) => {
      let color: string;
      let fillOpacity: number;

      switch (point.type) {
        case 'ocean':
          color = '#2196F3'; // Blue
          fillOpacity = 0.6;
          break;
        case 'lake':
          color = '#4FC3F7'; // Light blue
          fillOpacity = 0.6;
          break;
        case 'land':
          color = '#F44336'; // Red
          fillOpacity = 0.7;
          break;
        default:
          color = '#9E9E9E'; // Gray
          fillOpacity = 0.5;
      }

      const circle = L.circleMarker([point.lat, point.lon], {
        radius: 4,
        fillColor: color,
        fillOpacity,
        color: '#000',
        weight: 0.5,
        opacity: 0.5,
      });

      circle.bindPopup(`
        <div style="font-size: 12px;">
          <strong>Type:</strong> ${point.type}<br>
          <strong>Lat:</strong> ${point.lat.toFixed(5)}<br>
          <strong>Lon:</strong> ${point.lon.toFixed(5)}
        </div>
      `);

      layerGroup.addLayer(circle);
    });

    layerGroup.addTo(map);
    gridLayerRef.current = layerGroup;

    return () => {
      if (gridLayerRef.current) {
        map.removeLayer(gridLayerRef.current);
        gridLayerRef.current = null;
      }
    };
  }, [map, mode, gridPoints]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gridLayerRef.current) {
        map.removeLayer(gridLayerRef.current);
      }
    };
  }, [map]);

  return null;
};

// Debug info panel component
interface DebugInfoPanelProps {
  onClose: () => void;
  sidebarWidth: number;
  gridPoints: GridPoint[];
  onGenerate: () => void;
  onClear: () => void;
  loading: boolean;
  currentResolution: number | null;
}

export const DebugInfoPanel: React.FC<DebugInfoPanelProps> = ({
  onClose,
  sidebarWidth,
  gridPoints,
  onGenerate,
  onClear,
  loading,
  currentResolution,
}) => {
  const { theme } = useTheme();
  const [info, setInfo] = useState<{
    initialized: boolean;
    usingSpatialIndex: boolean;
    cacheStats: { size: number; maxSize: number };
  } | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const response = await navigationAPI.getDebugInfo();
        setInfo(response.data);
      } catch (error) {
        console.error('Failed to fetch debug info:', error);
      }
    };
    fetchInfo();
  }, []);

  // Count by type
  const oceanCount = gridPoints.filter(p => p.type === 'ocean').length;
  const lakeCount = gridPoints.filter(p => p.type === 'lake').length;
  const landCount = gridPoints.filter(p => p.type === 'land').length;

  return (
    <div
      style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        right: `${sidebarWidth + 16}px`,
        maxWidth: '280px',
        background: theme.colors.bgSecondary,
        borderRadius: '8px',
        padding: '1rem',
        zIndex: 1001,
        color: theme.colors.textPrimary,
        fontSize: '0.85rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Water Debug</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>Ctrl+D</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              padding: '0.25rem',
              fontSize: '1.2rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Generate / Clear buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={onGenerate}
          disabled={loading}
          style={{
            flex: 1,
            padding: '0.6rem',
            background: loading ? '#555' : '#1976D2',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '0.8rem',
            fontWeight: 'bold',
          }}
        >
          {loading ? 'Loading...' : 'Generate Grid'}
        </button>
        {gridPoints.length > 0 && (
          <button
            onClick={onClear}
            style={{
              padding: '0.6rem 1rem',
              background: theme.colors.bgCardActive,
              border: 'none',
              borderRadius: '4px',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      {gridPoints.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.5rem', background: theme.colors.bgCard, borderRadius: '4px' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>{gridPoints.length} points</span>
            {currentResolution && (
              <span style={{ color: '#4fc3f7' }}>~{currentResolution}m resolution</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2196F3' }} />
              <span style={{ fontSize: '0.75rem' }}>{oceanCount} ocean</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4FC3F7' }} />
              <span style={{ fontSize: '0.75rem' }}>{lakeCount} lake</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F44336' }} />
              <span style={{ fontSize: '0.75rem' }}>{landCount} land</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend when no points */}
      {gridPoints.length === 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.5rem' }}>Legend</div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2196F3' }} />
              <span style={{ fontSize: '0.75rem' }}>Ocean</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4FC3F7' }} />
              <span style={{ fontSize: '0.75rem' }}>Lake</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F44336' }} />
              <span style={{ fontSize: '0.75rem' }}>Land</span>
            </div>
          </div>
        </div>
      )}

      {/* Service info */}
      {info && (
        <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>
          {info.initialized ? 'Service ready' : 'Not initialized'} | Cache: {info.cacheStats.size}/{info.cacheStats.maxSize}
        </div>
      )}
    </div>
  );
};

// Helper to calculate grid size based on zoom
function getGridSizeForZoom(zoom: number): number {
  if (zoom < 10) return 0.02;      // ~2.2km
  if (zoom < 12) return 0.01;      // ~1.1km
  if (zoom < 14) return 0.005;     // ~550m
  if (zoom < 16) return 0.002;     // ~220m
  if (zoom < 18) return 0.001;     // ~110m
  return 0.0001;                   // ~11m (max resolution)
}

// Convert grid size in degrees to approximate meters
function gridSizeToMeters(gridSize: number): number {
  return Math.round(gridSize * 111000);
}

// Hook for managing debug grid state
export function useWaterDebugGrid(mapRef: React.RefObject<L.Map | null>) {
  const [gridPoints, setGridPoints] = useState<GridPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentResolution, setCurrentResolution] = useState<number | null>(null);

  const generateGrid = useCallback(async () => {
    if (!mapRef.current) return;

    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();

    // Adjust grid size based on zoom level
    const gridSize = getGridSizeForZoom(zoom);
    const resolutionMeters = gridSizeToMeters(gridSize);

    setLoading(true);
    try {
      const response = await navigationAPI.getWaterGrid(
        bounds.getSouth(),
        bounds.getNorth(),
        bounds.getWest(),
        bounds.getEast(),
        gridSize
      );
      setGridPoints(response.data.grid);
      setCurrentResolution(resolutionMeters);
    } catch (error) {
      console.error('Failed to fetch water grid:', error);
    } finally {
      setLoading(false);
    }
  }, [mapRef]);

  const clearGrid = useCallback(() => {
    setGridPoints([]);
    setCurrentResolution(null);
  }, []);

  return { gridPoints, loading, generateGrid, clearGrid, currentResolution };
}
