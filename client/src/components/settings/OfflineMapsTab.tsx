import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { useTheme } from '../../context/ThemeContext';
import { offlineMapsAPI, OfflineRegion, Bounds, TileEstimate, StorageStats } from '../../services/api';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useLanguage } from '../../i18n/LanguageContext';
import 'leaflet/dist/leaflet.css';

// Hardcoded server proxy URLs for tiles - client always fetches through server
import { API_BASE_URL } from '../../utils/urls';
const TILE_URLS = {
  street: `${API_BASE_URL}/tiles/street/{z}/{x}/{y}`,
};

interface OfflineMapsTabProps {
  formatFileSize: (bytes?: number) => string;
}

// Component to track map center and calculate bounds from the square overlay
const BoundsTracker: React.FC<{
  onBoundsChange: (bounds: Bounds) => void;
  squareSize: number; // Size in pixels
  onMapReady?: (map: LeafletMap) => void;
}> = ({ onBoundsChange, squareSize, onMapReady }) => {
  const map = useMap();

  const calculateBoundsFromSquare = useCallback(() => {
    const center = map.getCenter();
    const containerPoint = map.latLngToContainerPoint(center);

    // Calculate the corners of the square in container pixels
    const halfSize = squareSize / 2;
    const topLeft = map.containerPointToLatLng([
      containerPoint.x - halfSize,
      containerPoint.y - halfSize
    ]);
    const bottomRight = map.containerPointToLatLng([
      containerPoint.x + halfSize,
      containerPoint.y + halfSize
    ]);

    onBoundsChange({
      north: topLeft.lat,
      south: bottomRight.lat,
      east: bottomRight.lng,
      west: topLeft.lng,
    });
  }, [map, onBoundsChange, squareSize]);

  // Update bounds on map events
  useMapEvents({
    moveend: calculateBoundsFromSquare,
    zoomend: calculateBoundsFromSquare,
  });

  // Initial calculation and pass map ref to parent
  useEffect(() => {
    // Small delay to ensure map is ready
    const timer = setTimeout(() => {
      calculateBoundsFromSquare();
      onMapReady?.(map);
    }, 100);
    return () => clearTimeout(timer);
  }, [calculateBoundsFromSquare, map, onMapReady]);

  return null;
};

export const OfflineMapsTab: React.FC<OfflineMapsTabProps> = ({ formatFileSize }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBounds, setSelectedBounds] = useState<Bounds | null>(null);
  const [regionName, setRegionName] = useState('');
  const [estimate, setEstimate] = useState<TileEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [downloadingRegions, setDownloadingRegions] = useState<Set<string>>(new Set());
  const [mapRef, setMapRef] = useState<LeafletMap | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [includeSatellite, setIncludeSatellite] = useState(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const estimateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm } = useConfirmDialog();

  // Square overlay size in pixels (fixed size)
  const SQUARE_SIZE = 200;

  // Zoom handlers
  const handleZoomIn = () => mapRef?.zoomIn();
  const handleZoomOut = () => mapRef?.zoomOut();

  // Fetch storage stats
  const fetchStorageStats = useCallback(async () => {
    try {
      const response = await offlineMapsAPI.getStorageStats();
      setStorageStats(response.data);
    } catch (error) {
      console.error('Failed to fetch storage stats:', error);
    }
  }, []);

  // Fetch regions
  const fetchRegions = useCallback(async () => {
    try {
      const response = await offlineMapsAPI.getRegions();
      setRegions(response.data.regions);

      // Track active downloads
      const activeDownloads = response.data.regions.filter(
        r => r.status === 'downloading' || r.status === 'pending'
      );
      setDownloadingRegions(new Set(activeDownloads.map(r => r.id)));

      // Also fetch storage stats
      fetchStorageStats();

      return activeDownloads.length > 0;
    } catch (error) {
      console.error('Failed to fetch regions:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchStorageStats]);

  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  // Poll for download progress
  useEffect(() => {
    const startPolling = async () => {
      const hasActiveDownloads = await fetchRegions();
      if (hasActiveDownloads && !pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(async () => {
          const stillActive = await fetchRegions();
          if (!stillActive && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 1000);
      }
    };

    if (downloadingRegions.size > 0 && !pollIntervalRef.current) {
      startPolling();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [downloadingRegions.size, fetchRegions]);

  // Build layers array based on toggle
  const getSelectedLayers = useCallback(() => {
    const layers: ('street' | 'satellite' | 'nautical')[] = ['street', 'nautical'];
    if (includeSatellite) {
      layers.splice(1, 0, 'satellite'); // Insert satellite between street and nautical
    }
    return layers;
  }, [includeSatellite]);

  // Fetch estimate when bounds change (debounced) - satellite toggle is handled client-side
  useEffect(() => {
    if (!selectedBounds) {
      setEstimate(null);
      return;
    }

    // Clear previous timeout
    if (estimateTimeoutRef.current) {
      clearTimeout(estimateTimeoutRef.current);
    }

    // Debounce the estimate fetch
    estimateTimeoutRef.current = setTimeout(async () => {
      setEstimateLoading(true);
      try {
        // Always fetch with all layers - we'll calculate totals client-side based on toggle
        const response = await offlineMapsAPI.getEstimate({
          bounds: selectedBounds,
          minZoom: 0,
          maxZoom: 16,
          layers: ['street', 'satellite', 'nautical'],
        });
        setEstimate(response.data);
      } catch (error) {
        console.error('Failed to fetch estimate:', error);
      } finally {
        setEstimateLoading(false);
      }
    }, 300);

    return () => {
      if (estimateTimeoutRef.current) {
        clearTimeout(estimateTimeoutRef.current);
      }
    };
  }, [selectedBounds]);

  const handleCreateRegion = async () => {
    if (!selectedBounds || !regionName.trim()) return;

    try {
      await offlineMapsAPI.createRegion({
        name: regionName.trim(),
        bounds: selectedBounds,
        minZoom: 0,
        maxZoom: 16,
        layers: getSelectedLayers(),
      });

      // Reset form
      setRegionName('');

      // Start polling
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(async () => {
          const stillActive = await fetchRegions();
          if (!stillActive && pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }, 1000);
      }

      fetchRegions();
    } catch (error) {
      console.error('Failed to create region:', error);
    }
  };

  const handleDeleteRegion = async (region: OfflineRegion) => {
    const confirmed = await confirm({
      title: t('offline_maps.delete_region', { name: region.name }),
      message: t('offline_maps.delete_region_desc'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;

    try {
      await offlineMapsAPI.deleteRegion(region.id);
      fetchRegions();
    } catch (error) {
      console.error('Failed to delete region:', error);
    }
  };

  const handleCancelDownload = async (region: OfflineRegion) => {
    try {
      await offlineMapsAPI.cancelDownload(region.id);
      fetchRegions();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  const handleRetryDownload = async (region: OfflineRegion) => {
    try {
      await offlineMapsAPI.retryDownload(region.id);
      fetchRegions();
    } catch (error) {
      console.error('Failed to retry download:', error);
    }
  };

  const getProgressPercent = (region: OfflineRegion): number => {
    if (region.totalTiles === 0) return 0;
    return Math.round((region.downloadedTiles / region.totalTiles) * 100);
  };

  const getStatusColor = (status: OfflineRegion['status']): string => {
    switch (status) {
      case 'complete':
        return theme.colors.success;
      case 'downloading':
      case 'pending':
        return theme.colors.primary;
      case 'error':
        return theme.colors.error;
      default:
        return theme.colors.textMuted;
    }
  };

  const getStatusText = (region: OfflineRegion): string => {
    switch (region.status) {
      case 'complete':
        return t('offline_maps.complete');
      case 'downloading':
        return t('offline_maps.downloading', { percent: getProgressPercent(region) });
      case 'pending':
        return t('common.starting');
      case 'error':
        return region.error || t('offline_maps.error');
      default:
        return t('common.unknown');
    }
  };

  return (
    <div>
      {/* Section: Download New Region */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('offline_maps.download_new_region')}
      </div>

      {/* Horizontal layout: Map on left, controls on right */}
      <div style={{
        display: 'flex',
        gap: theme.space.lg,
        marginBottom: theme.space['2xl'],
      }}>
        {/* Map with zoom controls outside */}
        <div style={{
          display: 'flex',
          gap: theme.space.sm,
          flexShrink: 0,
        }}>
          {/* Map for region selection */}
          <div style={{
            width: '250px',
            height: '250px',
            borderRadius: theme.radius.md,
            overflow: 'hidden',
            border: `1px solid ${theme.colors.border}`,
            position: 'relative',
          }}>
            <MapContainer
              center={[54.5, 10.0]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
              zoomControl={false}
            >
              <TileLayer
                attribution=""
                url={TILE_URLS.street}
              />
              <BoundsTracker
                onBoundsChange={setSelectedBounds}
                squareSize={SQUARE_SIZE}
                onMapReady={setMapRef}
              />
            </MapContainer>

            {/* Square overlay - centered on the map */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${SQUARE_SIZE}px`,
              height: `${SQUARE_SIZE}px`,
              border: `3px solid ${theme.colors.primary}`,
              borderRadius: theme.radius.sm,
              background: 'rgba(25, 118, 210, 0.15)',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: `0 0 0 2000px rgba(0, 0, 0, 0.3)`,
            }} />

            {/* Instructions overlay */}
            <div style={{
              position: 'absolute',
              bottom: theme.space.xs,
              left: theme.space.xs,
              background: theme.colors.bgOverlayHeavy,
              padding: `${theme.space.xs} ${theme.space.sm}`,
              borderRadius: theme.radius.sm,
              fontSize: theme.fontSize.xs,
              color: theme.colors.textSecondary,
              zIndex: 1001,
            }}>
            {t('offline_maps.pan_and_zoom')}
          </div>
        </div>

          {/* Zoom controls outside the map */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.space.xs,
          }}>
            <button
              onClick={handleZoomIn}
              style={{
                width: '32px',
                height: '32px',
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm,
                color: theme.colors.textPrimary,
                fontSize: theme.fontSize.lg,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
            <button
              onClick={handleZoomOut}
              style={{
                width: '32px',
                height: '32px',
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.sm,
                color: theme.colors.textPrimary,
                fontSize: theme.fontSize.lg,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              -
            </button>
          </div>
        </div>

        {/* Controls (right side) */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space.md,
        }}>
          {/* Region name input */}
          <input
            type="text"
            placeholder={t('offline_maps.region_name_placeholder')}
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
            style={{
              width: '100%',
              padding: theme.space.md,
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.sm,
              color: theme.colors.textPrimary,
              fontSize: theme.fontSize.md,
              boxSizing: 'border-box',
            }}
          />

          {/* Estimate display - stretched to fill height */}
          <div style={{
            flex: 1,
            padding: theme.space.md,
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            {estimateLoading ? (
              <div style={{ color: theme.colors.textMuted }}>{t('offline_maps.calculating')}</div>
            ) : estimate ? (
              (() => {
                // Calculate per-layer sizes
                const streetBytes = estimate.tilesPerLayer * 18000;
                const satelliteBytes = estimate.tilesPerLayer * 40000;
                const nauticalBytes = estimate.tilesPerLayer * 8000;
                const totalBytes = streetBytes + (includeSatellite ? satelliteBytes : 0) + nauticalBytes;

                return (
              <>
                    {/* Per-layer breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
                      {/* Street Maps - ~18KB avg per tile */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${theme.space.xs} 0`,
                        borderBottom: `1px solid ${theme.colors.border}`,
                      }}>
                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary }}>
                          {t('offline_maps.street_maps')}
                        </span>
                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>
                          ~{formatFileSize(streetBytes)}
                        </span>
                      </div>
                      {/* Satellite - ~40KB avg per tile - with toggle */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${theme.space.xs} 0`,
                        borderBottom: `1px solid ${theme.colors.border}`,
                        opacity: includeSatellite ? 1 : 0.5,
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.space.sm,
                        }}>
                          <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary }}>
                            {t('offline_maps.satellite')}
                          </span>
                          {/* Toggle switch */}
                          <button
                            onClick={() => setIncludeSatellite(!includeSatellite)}
                            style={{
                              width: '32px',
                              height: '18px',
                              borderRadius: '9px',
                              border: 'none',
                              background: includeSatellite ? theme.colors.primary : theme.colors.bgCardActive,
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'background 0.2s ease',
                              padding: 0,
                            }}
                          >
                            <div style={{
                              width: '14px',
                              height: '14px',
                              borderRadius: '50%',
                              background: '#fff',
                              position: 'absolute',
                              top: '2px',
                              left: includeSatellite ? '16px' : '2px',
                              transition: 'left 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            }} />
                          </button>
                        </div>
                        <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>
                          ~{formatFileSize(satelliteBytes)}
                        </span>
                      </div>
                      {/* Sea Charts - ~8KB avg per tile */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: `${theme.space.xs} 0`,
                  }}>
                    <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textPrimary }}>
                          {t('offline_maps.sea_charts')}
                    </span>
                    <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>
                          ~{formatFileSize(nauticalBytes)}
                    </span>
                  </div>
                </div>

                {/* Total summary */}
                <div style={{
                  marginTop: theme.space.md,
                  paddingTop: theme.space.sm,
                  borderTop: `1px solid ${theme.colors.borderHover}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold }}>
                        {t('offline_maps.total')}
                  </span>
                  <span style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold }}>
                        ~{formatFileSize(totalBytes)}
                  </span>
                </div>
              </>
                );
              })()
            ) : (
              <div style={{ color: theme.colors.textMuted }}>{t('offline_maps.move_map_estimate')}</div>
            )}
          </div>

          {/* Download button */}
          <button
            onClick={handleCreateRegion}
            disabled={!selectedBounds || !regionName.trim() || estimateLoading}
            style={{
              width: '100%',
              padding: theme.space.md,
              background: selectedBounds && regionName.trim()
                ? theme.colors.primary
                : theme.colors.bgCardActive,
              border: 'none',
              borderRadius: theme.radius.sm,
              color: selectedBounds && regionName.trim()
                ? '#fff'
                : theme.colors.textMuted,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.bold,
              cursor: selectedBounds && regionName.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.space.sm,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('offline_maps.download_region')}
          </button>
        </div>
      </div>

      {/* Device Storage Info - compact */}
      {storageStats?.deviceStorage && (
        <div style={{
          marginBottom: theme.space.lg,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
        }}>
          <span style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, whiteSpace: 'nowrap' }}>
            {t('offline_maps.storage_free', { available: storageStats.deviceStorage.availableFormatted })}
          </span>
          <div style={{
            flex: 1,
            height: '4px',
            background: theme.colors.bgCardActive,
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${storageStats.deviceStorage.usedPercent}%`,
              background: storageStats.deviceStorage.usedPercent > 90
                ? theme.colors.error
                : storageStats.deviceStorage.usedPercent > 75
                  ? theme.colors.warning
                  : theme.colors.primary,
              borderRadius: '2px',
            }} />
          </div>
        </div>
      )}

      {/* Section: Saved Regions */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('offline_maps.saved_regions', { count: regions.length })}
      </div>

      {loading ? (
        <div style={{ color: theme.colors.textMuted, padding: theme.space.lg }}>
          {t('offline_maps.loading')}
        </div>
      ) : regions.length === 0 ? (
        <div style={{
          color: theme.colors.textMuted,
          padding: theme.space.lg,
          textAlign: 'center',
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          border: `1px solid ${theme.colors.border}`,
        }}>
          {t('offline_maps.no_regions')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
          {regions.map((region) => (
            <div
              key={region.id}
              style={{
                background: theme.colors.bgCard,
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border}`,
                padding: theme.space.lg,
              }}
            >
              {/* Region header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: theme.space.md,
              }}>
                <div style={{
                  fontWeight: theme.fontWeight.medium,
                }}>
                  {region.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
                {/* Only show status for error regions */}
                {region.status === 'error' && (
                  <div style={{
                    fontSize: theme.fontSize.xs,
                    color: getStatusColor(region.status),
                    fontWeight: theme.fontWeight.medium,
                  }}>
                    {getStatusText(region)}
                  </div>
                )}
                  {/* Satellite indicator */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: region.layers?.includes('satellite')
                      ? `${theme.colors.success}20`
                      : `${theme.colors.error}20`,
                    border: `1px solid ${region.layers?.includes('satellite') ? theme.colors.success : theme.colors.error}40`,
                  }}>
                    {region.layers?.includes('satellite') ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.success} strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={theme.colors.error} strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                    <span style={{
                      fontSize: '10px',
                      color: region.layers?.includes('satellite') ? theme.colors.success : theme.colors.error,
                    }}>{t('offline_maps.satellite')}</span>
                  </div>
                </div>
              </div>

              {/* Progress bar for downloading regions */}
              {(region.status === 'downloading' || region.status === 'pending') && (
                <>
                  <div style={{
                    height: '8px',
                    background: theme.colors.bgCardActive,
                    borderRadius: theme.radius.sm,
                    marginBottom: theme.space.sm,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${getProgressPercent(region)}%`,
                      background: theme.colors.primary,
                      borderRadius: theme.radius.sm,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    fontSize: theme.fontSize.xs,
                    color: theme.colors.textMuted,
                    marginBottom: theme.space.sm,
                    textAlign: 'right',
                  }}>
                    {getProgressPercent(region)}%
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: theme.space.sm }}>
                {(region.status === 'downloading' || region.status === 'pending') ? (
                  <button
                    onClick={() => handleCancelDownload(region)}
                    style={{
                      flex: 1,
                      padding: theme.space.md,
                      background: theme.colors.bgCardActive,
                      border: `1px solid ${theme.colors.error}40`,
                      borderRadius: theme.radius.sm,
                      color: theme.colors.error,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.bold,
                      cursor: 'pointer',
                    }}
                  >
                    {t('offline_maps.cancel_download')}
                  </button>
                ) : region.status === 'complete' ? (
                  <>
                    <div style={{
                      flex: 1,
                      padding: theme.space.md,
                      background: `${theme.colors.success}30`,
                      border: 'none',
                      borderRadius: theme.radius.sm,
                      color: `${theme.colors.success}`,
                      fontSize: theme.fontSize.sm,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.space.sm,
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('offline_maps.downloaded')}{region.storageBytes > 0 ? ` (${formatFileSize(region.storageBytes)})` : ''}
                    </div>
                    <button
                      onClick={() => handleDeleteRegion(region)}
                      style={{
                        padding: theme.space.md,
                        background: theme.colors.bgCardActive,
                        border: `1px solid ${theme.colors.error}40`,
                        borderRadius: theme.radius.sm,
                        color: theme.colors.error,
                        cursor: 'pointer',
                        fontSize: theme.fontSize.sm,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleRetryDownload(region)}
                      style={{
                        flex: 1,
                        padding: theme.space.md,
                        background: theme.colors.primary,
                        border: 'none',
                        borderRadius: theme.radius.sm,
                        color: '#fff',
                        fontSize: theme.fontSize.sm,
                        fontWeight: theme.fontWeight.bold,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: theme.space.sm,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                      </svg>
                      {t('offline_maps.retry')}
                    </button>
                    <button
                      onClick={() => handleDeleteRegion(region)}
                      style={{
                        padding: theme.space.md,
                        background: theme.colors.bgCardActive,
                        border: `1px solid ${theme.colors.error}40`,
                        borderRadius: theme.radius.sm,
                        color: theme.colors.error,
                        cursor: 'pointer',
                        fontSize: theme.fontSize.sm,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.xs,
        color: theme.colors.textMuted,
        marginTop: theme.space.xl,
        lineHeight: 1.5,
      }}>
        {t('offline_maps.info')}
      </div>
    </div>
  );
};
