import React, { useState, useEffect, useCallback } from 'react';
import {
  useSettings,
  SpeedUnit,
  WindUnit,
  DepthUnit,
  DistanceUnit,
  TimeFormat,
  speedConversions,
  windConversions,
  depthConversions,
  distanceConversions,
} from '../../context/SettingsContext';
import { theme } from '../../styles/theme';
import { dataAPI, DataFileInfo, DownloadProgress, offlineMapsAPI, StorageStats } from '../../services/api';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { OfflineMapsTab } from '../settings/OfflineMapsTab';
import { wsService } from '../../services/websocket';

interface SettingsViewProps {
  onClose: () => void;
}

type SettingsTab = 'general' | 'units' | 'downloads' | 'offline-maps' | 'advanced';

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [dataFiles, setDataFiles] = useState<DataFileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set());
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const { confirm } = useConfirmDialog();

  const fetchStorageStats = useCallback(async () => {
    try {
      const response = await offlineMapsAPI.getStorageStats();
      setStorageStats(response.data);
    } catch (error) {
      console.error('Failed to fetch storage stats:', error);
    }
  }, []);

  const fetchDataStatus = useCallback(async () => {
    try {
      const response = await dataAPI.getStatus();
      setDataFiles(response.data.files);
      setEditingUrls(prev => {
        const urls: Record<string, string> = { ...prev };
        response.data.files.forEach(f => {
          if (!urls[f.id]) urls[f.id] = f.url;
        });
        return urls;
      });

      const activeDownloads = response.data.files.filter(
        f => f.downloadStatus && (f.downloadStatus.status === 'downloading' || f.downloadStatus.status === 'extracting')
      );
      setDownloadingFiles(new Set(activeDownloads.map(f => f.id)));

      // Also fetch storage stats
      fetchStorageStats();

      return activeDownloads.length > 0;
    } catch (error) {
      console.error('Failed to fetch data status:', error);
      return false;
    } finally {
      setLoadingFiles(false);
    }
  }, [fetchStorageStats]);

  useEffect(() => {
    fetchDataStatus();
  }, [fetchDataStatus]);

  // Listen for WebSocket download progress updates
  useEffect(() => {
    const handleDownloadProgress = (data: DownloadProgress & { timestamp: Date }) => {
      setDataFiles(prev => prev.map(file => {
        if (file.id === data.fileId) {
          return {
            ...file,
            downloadStatus: {
              fileId: data.fileId,
              status: data.status,
              progress: data.progress,
              bytesDownloaded: data.bytesDownloaded,
              totalBytes: data.totalBytes,
              error: data.error,
            }
          };
        }
        return file;
      }));

      // Update downloadingFiles set based on status
      if (data.status === 'downloading' || data.status === 'extracting') {
        setDownloadingFiles(prev => new Set([...prev, data.fileId]));
      } else {
        setDownloadingFiles(prev => {
          const next = new Set(prev);
          next.delete(data.fileId);
          return next;
        });
        // Refresh full status when download completes or errors
        if (data.status === 'completed' || data.status === 'error') {
          fetchDataStatus();
        }
      }
    };

    wsService.on('download_progress', handleDownloadProgress);

    return () => {
      wsService.off('download_progress', handleDownloadProgress);
    };
  }, [fetchDataStatus]);

  const { timeFormat } = useSettings();

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (isoDate?: string): string => {
    if (!isoDate) return 'Unknown';
    const date = new Date(isoDate);
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    };
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], timeOptions);
  };

  const hasUpdate = (file: DataFileInfo): boolean => {
    if (!file.exists || !file.remoteDate) return false;
    const remoteTime = new Date(file.remoteDate).getTime();
    const localTime = file.localDate ? new Date(file.localDate).getTime() : 0;
    return remoteTime > localTime + 60000;
  };

  const getInstalledDate = (file: DataFileInfo): string | undefined => {
    if (file.remoteDate && !hasUpdate(file)) {
      return file.remoteDate;
    }
    return file.localDate;
  };

  const handleDownload = async (file: DataFileInfo) => {
    try {
      setDownloadingFiles(prev => new Set([...prev, file.id]));
      await dataAPI.downloadFile(file.id);
      // Progress updates will come via WebSocket
    } catch (error) {
      console.error('Failed to start download:', error);
      setDownloadingFiles(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };

  const handleCancelDownload = async (file: DataFileInfo) => {
    try {
      await dataAPI.cancelDownload(file.id);
      fetchDataStatus();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  const handleDelete = async (file: DataFileInfo) => {
    const confirmed = await confirm({
      title: `Delete ${file.name}?`,
      message: 'This will remove the downloaded data. You can re-download it later.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    try {
      await dataAPI.deleteFile(file.id);
      fetchDataStatus();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const handleUrlChange = (fileId: string, url: string) => {
    setEditingUrls(prev => ({ ...prev, [fileId]: url }));
  };

  const handleUrlSave = async (file: DataFileInfo) => {
    const newUrl = editingUrls[file.id];
    if (newUrl === file.url) return;

    setSavingUrl(file.id);
    try {
      await dataAPI.updateUrl(file.id, newUrl);
      fetchDataStatus();
    } catch (error) {
      console.error('Failed to update URL:', error);
    } finally {
      setSavingUrl(null);
    }
  };

  const handleResetUrl = (file: DataFileInfo) => {
    setEditingUrls(prev => ({ ...prev, [file.id]: file.defaultUrl }));
  };

  const navigationFiles = dataFiles.filter(f => f.category === 'navigation');

  const {
    speedUnit,
    windUnit,
    depthUnit,
    distanceUnit,
    setSpeedUnit,
    setWindUnit,
    setDepthUnit,
    setDistanceUnit,
    setTimeFormat,
    mapTileUrls,
    setMapTileUrls,
    apiUrls,
    setApiUrls,
    demoMode,
    setDemoMode,
  } = useSettings();

  const renderUnitSelector = <T extends string>(
    label: string,
    currentValue: T,
    options: T[],
    labels: Record<T, string>,
    onChange: (value: T) => void
  ) => (
    <div style={{ marginBottom: theme.space.xl }}>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: theme.space.md,
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        gap: theme.space.sm,
        flexWrap: 'wrap',
      }}>
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            style={{
              flex: '1 1 auto',
              minWidth: '70px',
              padding: theme.space.lg,
              background: currentValue === option ? theme.colors.primaryMedium : theme.colors.bgCardActive,
              border: currentValue === option ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
              borderRadius: theme.radius.md,
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: theme.fontSize.base,
              fontWeight: currentValue === option ? theme.fontWeight.bold : theme.fontWeight.normal,
              transition: `all ${theme.transition.normal}`,
            }}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );

  const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: 'units',
      label: 'Units',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="21" y1="10" x2="3" y2="10" />
          <line x1="21" y1="6" x2="3" y2="6" />
          <line x1="21" y1="14" x2="3" y2="14" />
          <line x1="21" y1="18" x2="3" y2="18" />
        </svg>
      ),
    },
    {
      id: 'downloads',
      label: 'Nav Data',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      ),
    },
    {
      id: 'offline-maps',
      label: 'Offline Maps',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      id: 'advanced',
      label: 'Advanced',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
    },
  ];

  // Render General Tab
  const renderGeneralTab = () => (
    <div>
      {/* Demo Mode Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.space.lg,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.border}`,
        marginBottom: theme.space.lg,
      }}>
        <div>
          <div style={{ fontWeight: theme.fontWeight.medium, marginBottom: theme.space.xs }}>
            Demo Mode
          </div>
          <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
            Simulate sensor data for testing
          </div>
        </div>
        <button
          onClick={() => setDemoMode(!demoMode)}
          style={{
            width: '56px',
            height: '32px',
            borderRadius: '16px',
            background: demoMode ? theme.colors.primary : theme.colors.bgCardActive,
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.2s',
          }}
        >
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: '4px',
            left: demoMode ? '28px' : '4px',
            transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Time Format */}
      {renderUnitSelector<TimeFormat>(
        'Time Format',
        timeFormat,
        ['24h', '12h'],
        {
          '24h': '24h',
          '12h': 'AM/PM',
        },
        setTimeFormat
      )}
    </div>
  );

  // Render Units Tab
  const renderUnitsTab = () => (
    <div>
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

      {renderUnitSelector<WindUnit>(
        'Wind',
        windUnit,
        ['kt', 'km/h', 'm/s', 'bft'],
        {
          'kt': windConversions['kt'].label,
          'km/h': windConversions['km/h'].label,
          'm/s': windConversions['m/s'].label,
          'bft': 'Beaufort',
        },
        setWindUnit
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

      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        marginTop: theme.space.lg,
      }}>
        Changing units will update all displays across the application.
        The depth alarm will be reset when changing depth units.
      </div>
    </div>
  );

  // Render Downloads Tab (Navigation Data)
  const renderDownloadsTab = () => (
    <div>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        marginBottom: theme.space.md,
      }}>
        Water body datasets for marine navigation and route planning.
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
            Storage: {storageStats.deviceStorage.availableFormatted} free
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

      {loadingFiles ? (
        <div style={{ color: theme.colors.textMuted, padding: theme.space.lg }}>
          Loading data status...
        </div>
      ) : (
        navigationFiles.map((file) => (
          <div key={file.id} style={{
            marginBottom: theme.space.md,
            padding: theme.space.lg,
            background: theme.colors.bgCard,
            borderRadius: theme.radius.md,
            border: `1px solid ${file.exists ? theme.colors.success + '40' : theme.colors.border}`,
          }}>
            {/* Header with name and status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: theme.space.sm,
            }}>
              <div style={{
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.bold,
                color: theme.colors.textPrimary,
              }}>
                {file.name}
              </div>
              {file.remoteSize && (
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>
                  {formatFileSize(file.remoteSize)}
                </span>
              )}
            </div>

            {/* File info */}
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginBottom: theme.space.md,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: `${theme.space.xs} ${theme.space.md}`,
            }}>
              {file.exists && (
                <>
                  <span>Installed:</span>
                  <span>{formatDate(getInstalledDate(file))} ({formatFileSize(file.size)})</span>
                </>
              )}
              {hasUpdate(file) && file.remoteDate && (
                <>
                  <span style={{ color: theme.colors.warning }}>Update:</span>
                  <span style={{ color: theme.colors.warning }}>{formatDate(file.remoteDate)} available</span>
                </>
              )}
            </div>

            {/* Collapsible URL section */}
            <div style={{ marginBottom: theme.space.md }}>
              <button
                onClick={() => setExpandedUrls(prev => {
                  const next = new Set(prev);
                  if (next.has(file.id)) {
                    next.delete(file.id);
                  } else {
                    next.add(file.id);
                  }
                  return next;
                })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.space.xs,
                  padding: `${theme.space.xs} 0`,
                  background: 'transparent',
                  border: 'none',
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    transform: expandedUrls.has(file.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Custom URL
                {editingUrls[file.id] !== file.defaultUrl && (
                  <span style={{ color: theme.colors.primary, marginLeft: theme.space.xs }}>
                    (modified)
                  </span>
                )}
              </button>

              {expandedUrls.has(file.id) && (
                <div style={{ marginTop: theme.space.sm }}>
                  <div style={{ display: 'flex', gap: theme.space.sm }}>
                    <input
                      type="text"
                      value={editingUrls[file.id] || ''}
                      onChange={(e) => handleUrlChange(file.id, e.target.value)}
                      style={{
                        flex: 1,
                        padding: theme.space.sm,
                        background: theme.colors.bgCardActive,
                        border: `1px solid ${editingUrls[file.id] !== file.url ? theme.colors.primary : theme.colors.border}`,
                        borderRadius: theme.radius.sm,
                        color: theme.colors.textPrimary,
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                      placeholder="Enter download URL"
                    />
                    {editingUrls[file.id] !== file.url && (
                      <button
                        onClick={() => handleUrlSave(file)}
                        disabled={savingUrl === file.id}
                        style={{
                          padding: `${theme.space.xs} ${theme.space.sm}`,
                          background: theme.colors.primary,
                          border: 'none',
                          borderRadius: theme.radius.sm,
                          color: '#fff',
                          cursor: savingUrl === file.id ? 'wait' : 'pointer',
                          fontSize: theme.fontSize.xs,
                          opacity: savingUrl === file.id ? 0.7 : 1,
                        }}
                      >
                        {savingUrl === file.id ? 'Saving...' : 'Save'}
                      </button>
                    )}
                    {editingUrls[file.id] !== file.defaultUrl && (
                      <button
                        onClick={() => handleResetUrl(file)}
                        title="Reset to default URL"
                        style={{
                          padding: theme.space.xs,
                          background: theme.colors.bgCardActive,
                          border: `1px solid ${theme.colors.border}`,
                          borderRadius: theme.radius.sm,
                          color: theme.colors.textMuted,
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Download Progress or Actions */}
            {file.downloadStatus && (file.downloadStatus.status === 'downloading' || file.downloadStatus.status === 'extracting') ? (
              <div style={{ marginTop: theme.space.sm }}>
                <div style={{
                  marginBottom: theme.space.sm,
                  background: theme.colors.bgCardActive,
                  borderRadius: theme.radius.sm,
                  overflow: 'hidden',
                  height: '8px',
                  position: 'relative',
                }}>
                  {file.downloadStatus.status === 'extracting' ? (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: `linear-gradient(90deg, transparent 0%, ${theme.colors.warning} 50%, transparent 100%)`,
                      animation: 'extracting 1.5s ease-in-out infinite',
                    }} />
                  ) : (
                    <div style={{
                      width: `${file.downloadStatus.progress}%`,
                      height: '100%',
                      background: theme.colors.primary,
                      transition: 'width 0.3s ease',
                    }} />
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: theme.fontSize.xs,
                  color: theme.colors.textMuted,
                  marginBottom: theme.space.sm,
                }}>
                  <span>
                    {file.downloadStatus.status === 'extracting' ? 'Extracting...' : (
                      `${formatFileSize(file.downloadStatus.bytesDownloaded)} / ${formatFileSize(file.downloadStatus.totalBytes)}`
                    )}
                  </span>
                  <span>{file.downloadStatus.status === 'extracting' ? '' : `${file.downloadStatus.progress}%`}</span>
                </div>
                <button
                  onClick={() => handleCancelDownload(file)}
                  style={{
                    width: '100%',
                    padding: theme.space.md,
                    background: theme.colors.bgCardActive,
                    border: `1px solid ${theme.colors.error}40`,
                    borderRadius: theme.radius.sm,
                    color: theme.colors.error,
                    cursor: 'pointer',
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.bold,
                  }}
                >
                  Cancel Download
                </button>
              </div>
            ) : file.downloadStatus && file.downloadStatus.status === 'error' ? (
              <div style={{ marginTop: theme.space.sm }}>
                <div style={{
                  padding: theme.space.md,
                  background: `${theme.colors.error}10`,
                  border: `1px solid ${theme.colors.error}40`,
                  borderRadius: theme.radius.sm,
                  color: theme.colors.error,
                  fontSize: theme.fontSize.xs,
                  marginBottom: theme.space.sm,
                }}>
                  Error: {file.downloadStatus.error || 'Download failed'}
                </div>
                <button
                  onClick={() => handleDownload(file)}
                  style={{
                    width: '100%',
                    padding: theme.space.md,
                    background: theme.colors.primary,
                    border: 'none',
                    borderRadius: theme.radius.sm,
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.bold,
                  }}
                >
                  Retry Download
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: theme.space.sm }}>
                {!file.exists ? (
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id)}
                    style={{
                      flex: 1,
                      padding: theme.space.md,
                      background: theme.colors.primary,
                      border: 'none',
                      borderRadius: theme.radius.sm,
                      color: '#fff',
                      cursor: downloadingFiles.has(file.id) ? 'wait' : 'pointer',
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.bold,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.space.sm,
                      opacity: downloadingFiles.has(file.id) ? 0.7 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloadingFiles.has(file.id) ? 'Starting...' : 'Download'}
                  </button>
                ) : hasUpdate(file) ? (
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id)}
                    style={{
                      flex: 1,
                      padding: theme.space.md,
                      background: theme.colors.warning,
                      border: 'none',
                      borderRadius: theme.radius.sm,
                      color: '#fff',
                      cursor: downloadingFiles.has(file.id) ? 'wait' : 'pointer',
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.bold,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.space.sm,
                      opacity: downloadingFiles.has(file.id) ? 0.7 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloadingFiles.has(file.id) ? 'Starting...' : 'Update'}
                  </button>
                ) : (
                  <div style={{
                    flex: 1,
                    padding: theme.space.md,
                    background: `${theme.colors.success}30`,
                    border: 'none',
                    borderRadius: theme.radius.sm,
                    color: `${theme.colors.success}90`,
                    fontSize: theme.fontSize.sm,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: theme.space.sm,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Installed
                  </div>
                )}
                {file.exists && (
                  <button
                    onClick={() => handleDelete(file)}
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
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  // Render Advanced Tab
  const renderAdvancedTab = () => (
    <div>
      {/* Maps & Tiles subsection */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Map Tiles
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          Street Map
        </div>
        <input
          type="text"
          value={mapTileUrls.streetMap}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, streetMap: e.target.value })}
          style={{
            width: '100%',
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.xs,
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          Satellite Map
        </div>
        <input
          type="text"
          value={mapTileUrls.satelliteMap}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, satelliteMap: e.target.value })}
          style={{
            width: '100%',
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.xs,
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          Nautical Overlay
        </div>
        <input
          type="text"
          value={mapTileUrls.nauticalOverlay}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, nauticalOverlay: e.target.value })}
          style={{
            width: '100%',
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.xs,
            fontFamily: 'monospace',
          }}
        />
      </div>

      <button
        onClick={() => setMapTileUrls({
          streetMap: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          satelliteMap: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          nauticalOverlay: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
        })}
        style={{
          padding: `${theme.space.sm} ${theme.space.md}`,
          background: theme.colors.bgCardActive,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.sm,
          color: theme.colors.textMuted,
          cursor: 'pointer',
          fontSize: theme.fontSize.xs,
          marginBottom: theme.space.xl,
        }}
      >
        Reset Map Tiles to Defaults
      </button>

      {/* API Endpoints subsection */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        API Endpoints
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          Geocoding API (location search)
        </div>
        <input
          type="text"
          value={apiUrls.nominatimUrl}
          onChange={(e) => setApiUrls({ ...apiUrls, nominatimUrl: e.target.value })}
          style={{
            width: '100%',
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.xs,
            fontFamily: 'monospace',
          }}
        />
      </div>

      <button
        onClick={() => setApiUrls({
          nominatimUrl: 'https://photon.komoot.io',
        })}
        style={{
          padding: `${theme.space.sm} ${theme.space.md}`,
          background: theme.colors.bgCardActive,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.sm,
          color: theme.colors.textMuted,
          cursor: 'pointer',
          fontSize: theme.fontSize.xs,
        }}
      >
        Reset API Endpoints to Defaults
      </button>

      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.xs,
        color: theme.colors.textMuted,
        marginTop: theme.space.xl,
        lineHeight: 1.5,
      }}>
        <strong>Map Tiles:</strong> Use standard XYZ tile format with placeholders: {'{z}'} for zoom, {'{x}'}/{'{y}'} for coordinates, {'{s}'} for subdomains.
        <br /><br />
        <strong>Geocoding:</strong> Used for location search. Default uses Photon (free, CORS-enabled).
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'units':
        return renderUnitsTab();
      case 'downloads':
        return renderDownloadsTab();
      case 'offline-maps':
        return <OfflineMapsTab formatFileSize={formatFileSize} />;
      case 'advanced':
        return renderAdvancedTab();
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: theme.colors.bgPrimary,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* CSS for extraction animation */}
      <style>{`
        @keyframes extracting {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Unified Tab Bar with Home Button */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.bgCard,
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: theme.space.xs,
              padding: `${theme.space.md} ${theme.space.sm}`,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
              color: activeTab === tab.id ? theme.colors.primary : theme.colors.textMuted,
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: '60px',
            }}
          >
            {tab.icon}
            <span style={{ fontSize: theme.fontSize.xs, fontWeight: activeTab === tab.id ? theme.fontWeight.bold : theme.fontWeight.normal }}>
              {tab.label}
            </span>
          </button>
        ))}
        {/* Home button */}
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: theme.space.xs,
            padding: `${theme.space.md} ${theme.space.lg}`,
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid transparent',
            color: theme.colors.textMuted,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span style={{ fontSize: theme.fontSize.xs }}>Home</span>
        </button>
      </div>

      {/* Tab Content */}
      <div style={{
        flex: 1,
        padding: theme.space.lg,
        overflowY: 'auto',
      }}>
        {renderActiveTab()}
      </div>

      {/* Footer */}
      <div style={{
        padding: theme.space.md,
        borderTop: `1px solid ${theme.colors.border}`,
        textAlign: 'center',
        fontSize: theme.fontSize.xs,
        color: theme.colors.textMuted,
      }}>
        BigaOS v1.0
      </div>
    </div>
  );
};
