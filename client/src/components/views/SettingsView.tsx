import React, { useState, useEffect, useCallback } from 'react';
import {
  useSettings,
  SpeedUnit,
  WindUnit,
  DepthUnit,
  DistanceUnit,
  WeightUnit,
  TemperatureUnit,
  TimeFormat,
  DateFormat,
  ChainType,
  speedConversions,
  windConversions,
  depthConversions,
  distanceConversions,
  weightConversions,
  temperatureConversions,
} from '../../context/SettingsContext';
import { theme } from '../../styles/theme';
import { dataAPI, DataFileInfo, DownloadProgress, offlineMapsAPI, StorageStats, systemAPI, UpdateInfo } from '../../services/api';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { AlertsTab } from '../settings/AlertsTab';
import { PluginsTab } from '../settings/PluginsTab';

import { wsService } from '../../services/websocket';
import { useLanguage } from '../../i18n/LanguageContext';
import { LANGUAGES, LanguageCode } from '../../i18n/languages';
import { CustomSelect } from '../ui/CustomSelect';

type SettingsTab = 'general' | 'vessel' | 'units' | 'downloads' | 'alerts' | 'plugins' | 'advanced';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: SettingsTab;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose, initialTab }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');
  const [dataFiles, setDataFiles] = useState<DataFileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set());
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const { confirm } = useConfirmDialog();
  const { t } = useLanguage();

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
        f => f.downloadStatus && (f.downloadStatus.status === 'downloading' || f.downloadStatus.status === 'extracting' || f.downloadStatus.status === 'converting' || f.downloadStatus.status === 'indexing')
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

  // Check for updates when General tab is active
  const checkForUpdate = useCallback(async (force: boolean = false) => {
    setUpdateChecking(true);
    try {
      const response = await systemAPI.checkForUpdate(force);
      setUpdateInfo(response.data);
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setUpdateChecking(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'general') {
      checkForUpdate();
    }
  }, [activeTab, checkForUpdate]);

  const handleInstallUpdate = useCallback(async () => {
    setUpdateInstalling(true);
    try {
      await systemAPI.installUpdate();
      // Server will broadcast system_updating via WebSocket
      // The overlay in App.tsx will handle it
    } catch (error) {
      console.error('Failed to install update:', error);
      setUpdateInstalling(false);
    }
  }, []);

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
      if (data.status === 'downloading' || data.status === 'extracting' || data.status === 'converting' || data.status === 'indexing') {
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

  const settings = useSettings();

  const {
    speedUnit,
    windUnit,
    depthUnit,
    distanceUnit,
    weightUnit,
    temperatureUnit,
    timeFormat,
    dateFormat,
    setSpeedUnit,
    setWindUnit,
    setDepthUnit,
    setDistanceUnit,
    setWeightUnit,
    setTemperatureUnit,
    setTimeFormat,
    setDateFormat,
    mapTileUrls,
    setMapTileUrls,
    apiUrls,
    setApiUrls,
    vesselSettings,
    setVesselSettings,
    weatherSettings,
    setWeatherSettings,
  } = settings;

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
      label: t('settings.general'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: 'vessel',
      label: t('settings.vessel'),
      icon: (
        <svg width="18" height="18" viewBox="-12 -18 24 28" fill="none">
          {/* Hull - flat stern (left), pointy bow (right) */}
          <path
            d="M -10 4 L -10 8 L 10 8 L 12 4 Z"
            fill="currentColor"
            fillOpacity="0.3"
            stroke="currentColor"
            strokeWidth="1"
          />
          {/* Mast */}
          <line x1="0" y1="4" x2="0" y2="-16" stroke="currentColor" strokeWidth="1.5" />
          {/* Mainsail */}
          <path
            d="M -1 -14 L -8 2 L -1 2 Z"
            fill="currentColor"
            fillOpacity="0.5"
            stroke="currentColor"
            strokeWidth="0.5"
          />
          {/* Foresail (jib) */}
          <path
            d="M 1 -14 L 10 2 L 1 2 Z"
            fill="currentColor"
            fillOpacity="0.4"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </svg>
      ),
    },
    {
      id: 'units',
      label: t('settings.units'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* Sliders/adjustment icon - represents configurable units */}
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      ),
    },
    {
      id: 'downloads',
      label: t('settings.downloads'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      ),
    },
    {
      id: 'alerts',
      label: t('settings.alerts'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      id: 'plugins' as SettingsTab,
      label: t('settings.plugins'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="8" height="8" rx="1" />
          <rect x="14" y="2" width="8" height="8" rx="1" />
          <rect x="2" y="14" width="8" height="8" rx="1" />
          <path d="M18 14v4h-4" />
          <path d="M14 18h4v-4" />
        </svg>
      ),
    },
    {
      id: 'advanced',
      label: t('settings.advanced'),
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
  const formatLastChecked = (iso: string): string => {
    if (!iso) return t('update.never_checked');
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return t('update.just_now');
    if (diff < 3600_000) return t('update.ago', { time: `${Math.floor(diff / 60_000)}m` });
    if (diff < 86400_000) return t('update.ago', { time: `${Math.floor(diff / 3600_000)}h` });
    return t('update.ago', { time: `${Math.floor(diff / 86400_000)}d` });
  };

  const renderGeneralTab = () => (
    <div>
      {/* Language Selector */}
      <div style={{ marginBottom: theme.space.xl }}>
        <div style={{
          fontSize: theme.fontSize.sm,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: theme.space.md,
        }}>
          {t('language.label')}
        </div>
        <CustomSelect
          value={settings.language}
          options={Object.entries(LANGUAGES).map(([code, info]) => ({
            value: code,
            label: info.name,
          }))}
          onChange={(code) => settings.setLanguage(code as LanguageCode)}
        />
      </div>

      {/* Software Update Section */}
      <div style={{
        padding: theme.space.lg,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        border: `1px solid ${updateInfo?.available ? theme.colors.primary : theme.colors.border}`,
        marginBottom: theme.space.xl,
      }}>
        <div style={{
          fontSize: theme.fontSize.sm,
          fontWeight: theme.fontWeight.bold,
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: theme.space.md,
        }}>
          {t('update.title')}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.space.md,
        }}>
          <div>
            <div style={{ fontSize: theme.fontSize.base, color: theme.colors.textPrimary }}>
              {t('update.current_version')}: <strong>v{updateInfo?.currentVersion || '...'}</strong>
            </div>
            {updateInfo?.lastChecked && (
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: theme.space.xs }}>
                {t('update.last_checked')}: {formatLastChecked(updateInfo.lastChecked)}
              </div>
            )}
          </div>
          <button
            onClick={() => checkForUpdate(true)}
            disabled={updateChecking}
            style={{
              padding: `${theme.space.sm} ${theme.space.md}`,
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              color: theme.colors.textPrimary,
              cursor: updateChecking ? 'wait' : 'pointer',
              fontSize: theme.fontSize.sm,
              opacity: updateChecking ? 0.7 : 1,
            }}
          >
            {updateChecking ? t('update.checking') : t('update.check')}
          </button>
        </div>

        {updateInfo && !updateInfo.available && !updateChecking && !updateInfo.error && (
          <div style={{
            padding: theme.space.md,
            background: `${theme.colors.success}15`,
            borderRadius: theme.radius.sm,
            color: theme.colors.success,
            fontSize: theme.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.space.sm,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t('update.up_to_date')}
          </div>
        )}

        {updateInfo?.error && !updateChecking && (
          <div style={{
            padding: theme.space.md,
            background: `${theme.colors.warning}15`,
            borderRadius: theme.radius.sm,
            color: theme.colors.warning,
            fontSize: theme.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.space.sm,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
            </svg>
            {t('update.check_failed')}
          </div>
        )}

        {updateInfo?.available && (
          <>
            <div style={{
              padding: theme.space.md,
              background: `${theme.colors.primary}15`,
              borderRadius: theme.radius.sm,
              marginBottom: theme.space.md,
            }}>
              <div style={{
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.bold,
                color: theme.colors.primary,
                marginBottom: theme.space.xs,
              }}>
                {t('update.available')}: v{updateInfo.latestVersion}
              </div>
              {updateInfo.releaseNotes && (
                <div style={{
                  fontSize: theme.fontSize.sm,
                  color: theme.colors.textMuted,
                  lineHeight: 1.5,
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {updateInfo.releaseNotes}
                </div>
              )}
            </div>
            <button
              onClick={handleInstallUpdate}
              disabled={updateInstalling}
              style={{
                width: '100%',
                padding: theme.space.md,
                background: theme.colors.primary,
                border: 'none',
                borderRadius: theme.radius.md,
                color: '#fff',
                cursor: updateInstalling ? 'wait' : 'pointer',
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.bold,
                opacity: updateInstalling ? 0.7 : 1,
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
              {updateInstalling ? t('update.installing') : t('update.install')}
            </button>
          </>
        )}
      </div>

    </div>
  );

  // Local state for vessel number inputs to allow clearing
  const [vesselInputValues, setVesselInputValues] = useState<Record<string, string>>({});

  // Helper for vessel setting number inputs
  const renderVesselNumberInput = (
    label: string,
    value: number | undefined,
    onChange: (value: number) => void,
    unit: string,
    _step: number = 0.1,
    min: number = 0,
    _description?: string,
    noMargin: boolean = false
  ) => {
    const safeValue = value ?? 0;
    const inputKey = label.toLowerCase().replace(/\s+/g, '_');
    const localValue = vesselInputValues[inputKey];
    const displayValue = localValue !== undefined ? localValue : safeValue.toString();

    // Check if the current input is valid
    const isValidNumber = (val: string) => {
      if (val === '' || val === '-') return true; // Allow empty or typing minus
      const num = parseFloat(val);
      return !isNaN(num) && isFinite(num);
    };

    const hasError = localValue !== undefined && localValue !== '' && !isValidNumber(localValue);
    const isBelowMin = localValue !== undefined && localValue !== '' && isValidNumber(localValue) && parseFloat(localValue) < min;

    return (
    <div style={{ marginBottom: noMargin ? 0 : theme.space.lg }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.space.xs,
        minHeight: '20px',
      }}>
        <div style={{
          fontSize: theme.fontSize.sm,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
        }}>
          {unit}
        </div>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => {
          const newValue = e.target.value;
          setVesselInputValues(prev => ({ ...prev, [inputKey]: newValue }));
          const parsed = parseFloat(newValue);
          if (!isNaN(parsed) && parsed >= min) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          // Clear local state on blur to sync with actual value
          setVesselInputValues(prev => {
            const newState = { ...prev };
            delete newState[inputKey];
            return newState;
          });
        }}
        style={{
          width: '100%',
          padding: theme.space.md,
          background: theme.colors.bgCardActive,
          border: `1px solid ${hasError || isBelowMin ? theme.colors.error : theme.colors.border}`,
          borderRadius: theme.radius.md,
          color: hasError || isBelowMin ? theme.colors.error : theme.colors.textPrimary,
          fontSize: theme.fontSize.base,
        }}
      />
      {hasError && (
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.error,
          marginTop: theme.space.xs,
        }}>
          {t('validation.invalid_number')}
        </div>
      )}
      {isBelowMin && (
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.error,
          marginTop: theme.space.xs,
        }}>
          {t('validation.min_value', { min })}
        </div>
      )}
    </div>
    );
  };

  // Helper for vessel text inputs
  const renderVesselTextInput = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder?: string,
    noMargin: boolean = false
  ) => (
    <div style={{ marginBottom: noMargin ? 0 : theme.space.lg }}>
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: theme.space.xs,
        minHeight: '20px',
      }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: theme.space.md,
          background: theme.colors.bgCardActive,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          color: theme.colors.textPrimary,
          fontSize: theme.fontSize.base,
        }}
      />
    </div>
  );

  // Render Vessel Tab (My Vessel)
  const renderVesselTab = () => (
    <div>
      {/* Vessel Name */}
      <div style={{ marginBottom: theme.space.xl }}>
        <div style={{
          fontSize: theme.fontSize.sm,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: theme.space.sm,
        }}>
          {t('vessel.name')}
        </div>
        <input
          type="text"
          value={vesselSettings.name}
          onChange={(e) => setVesselSettings({ ...vesselSettings, name: e.target.value })}
          placeholder={t('vessel.name_placeholder')}
          style={{
            width: '100%',
            padding: theme.space.md,
            background: theme.colors.bgCardActive,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.bold,
          }}
        />
      </div>

      {/* Identification Section */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('vessel.identification')}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselTextInput(
          t('vessel.registration_no'),
          vesselSettings.registrationNumber,
          (v) => setVesselSettings({ ...vesselSettings, registrationNumber: v }),
          t('vessel.registration_placeholder'),
          true
        )}
        {renderVesselTextInput(
          t('vessel.call_sign'),
          vesselSettings.callSign,
          (v) => setVesselSettings({ ...vesselSettings, callSign: v }),
          t('vessel.call_sign_placeholder'),
          true
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselTextInput(
          t('vessel.mmsi'),
          vesselSettings.mmsi,
          (v) => setVesselSettings({ ...vesselSettings, mmsi: v }),
          t('vessel.mmsi_placeholder'),
          true
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.xl,
      }}>
        {renderVesselTextInput(
          t('vessel.home_port'),
          vesselSettings.homePort,
          (v) => setVesselSettings({ ...vesselSettings, homePort: v }),
          t('vessel.home_port_placeholder'),
          true
        )}
        {renderVesselTextInput(
          t('vessel.flag'),
          vesselSettings.flag,
          (v) => setVesselSettings({ ...vesselSettings, flag: v }),
          t('vessel.flag_placeholder'),
          true
        )}
      </div>

      {/* Vessel Dimensions Section */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('vessel.dimensions')}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          t('vessel.length_loa'),
          vesselSettings.length,
          (v) => setVesselSettings({ ...vesselSettings, length: v }),
          'meters',
          0.1,
          1,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          t('vessel.waterline_length'),
          vesselSettings.waterlineLength,
          (v) => setVesselSettings({ ...vesselSettings, waterlineLength: v }),
          'meters',
          0.1,
          1,
          undefined,
          true
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          t('vessel.beam'),
          vesselSettings.beam,
          (v) => setVesselSettings({ ...vesselSettings, beam: v }),
          'meters',
          0.1,
          0.5,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          t('vessel.draft'),
          vesselSettings.draft,
          (v) => setVesselSettings({ ...vesselSettings, draft: v }),
          'meters',
          0.1,
          0.3,
          undefined,
          true
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          t('vessel.freeboard'),
          vesselSettings.freeboardHeight,
          (v) => setVesselSettings({ ...vesselSettings, freeboardHeight: v }),
          'meters',
          0.1,
          0.3,
          t('vessel.freeboard_desc'),
          true
        )}
        {renderVesselNumberInput(
          t('vessel.displacement'),
          vesselSettings.displacement,
          (v) => setVesselSettings({ ...vesselSettings, displacement: v }),
          'tons',
          0.5,
          0.5,
          undefined,
          true
        )}
      </div>

      {/* Chain Section */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        marginTop: theme.space.lg,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('vessel.chain')}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          t('vessel.total_chain'),
          vesselSettings.totalChainLength,
          (v) => setVesselSettings({ ...vesselSettings, totalChainLength: v }),
          'meters',
          5,
          10,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          t('vessel.chain_diameter'),
          vesselSettings.chainDiameter,
          (v) => setVesselSettings({ ...vesselSettings, chainDiameter: v }),
          'mm',
          1,
          4,
          undefined,
          true
        )}
      </div>

      {/* Chain Type Selector */}
      <div style={{ marginBottom: theme.space.md }}>
        <div style={{
          fontSize: theme.fontSize.sm,
          color: theme.colors.textMuted,
          marginBottom: theme.space.xs,
        }}>
          {t('vessel.chain_type')}
        </div>
        <div style={{
          display: 'flex',
          gap: theme.space.sm,
        }}>
          {([
            { value: 'galvanized' as ChainType, label: t('vessel.galvanized') },
            { value: 'stainless-steel' as ChainType, label: t('vessel.stainless_steel') },
          ]).map((option) => (
            <button
              key={option.value}
              onClick={() => setVesselSettings({ ...vesselSettings, chainType: option.value })}
              style={{
                flex: 1,
                padding: theme.space.sm,
                background: vesselSettings.chainType === option.value ? theme.colors.primaryMedium : theme.colors.bgCardActive,
                border: vesselSettings.chainType === option.value ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
                borderRadius: theme.radius.md,
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                fontSize: theme.fontSize.sm,
                fontWeight: vesselSettings.chainType === option.value ? theme.fontWeight.bold : theme.fontWeight.normal,
                transition: `all ${theme.transition.normal}`,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Info box */}
      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        marginTop: theme.space.lg,
        lineHeight: 1.5,
      }}>
        {t('vessel.why_matters')}
      </div>
    </div>
  );

  // Render Units Tab
  const renderUnitsTab = () => (
    <div>
      {renderUnitSelector<SpeedUnit>(
        t('units.speed'),
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
        t('units.wind'),
        windUnit,
        ['kt', 'km/h', 'mph', 'm/s', 'bft'],
        {
          'kt': windConversions['kt'].label,
          'km/h': windConversions['km/h'].label,
          'mph': windConversions['mph'].label,
          'm/s': windConversions['m/s'].label,
          'bft': 'Beaufort',
        },
        setWindUnit
      )}

      {renderUnitSelector<DepthUnit>(
        t('units.depth'),
        depthUnit,
        ['m', 'ft'],
        {
          'm': depthConversions['m'].label,
          'ft': depthConversions['ft'].label,
        },
        setDepthUnit
      )}

      {renderUnitSelector<DistanceUnit>(
        t('units.distance'),
        distanceUnit,
        ['nm', 'km', 'mi'],
        {
          'nm': distanceConversions['nm'].label,
          'km': distanceConversions['km'].label,
          'mi': distanceConversions['mi'].label,
        },
        setDistanceUnit
      )}

      {renderUnitSelector<WeightUnit>(
        t('units.weight'),
        weightUnit,
        ['kg', 'lbs'],
        {
          'kg': weightConversions['kg'].label,
          'lbs': weightConversions['lbs'].label,
        },
        setWeightUnit
      )}

      {renderUnitSelector<TemperatureUnit>(
        t('units.temperature'),
        temperatureUnit,
        ['°C', '°F'],
        {
          '°C': temperatureConversions['°C'].label,
          '°F': temperatureConversions['°F'].label,
        },
        setTemperatureUnit
      )}

      {renderUnitSelector<TimeFormat>(
        t('units.time_format'),
        timeFormat,
        ['24h', '12h'],
        {
          '24h': '24h',
          '12h': 'AM/PM',
        },
        setTimeFormat
      )}

      {renderUnitSelector<DateFormat>(
        t('units.date_format'),
        dateFormat,
        ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
        {
          'DD/MM/YYYY': 'DD/MM/YYYY',
          'MM/DD/YYYY': 'MM/DD/YYYY',
          'YYYY-MM-DD': 'YYYY-MM-DD',
        },
        setDateFormat
      )}

      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        marginTop: theme.space.lg,
      }}>
        {t('units.change_note')}
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
        {t('downloads.description')}
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
            {t('downloads.storage')} {storageStats.deviceStorage.availableFormatted} {t('downloads.free')}
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
          {t('downloads.loading_data')}
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
            {/* Header with name */}
            <div style={{
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.bold,
              color: theme.colors.textPrimary,
              marginBottom: theme.space.sm,
            }}>
              {file.name}
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
                  <span>{t('downloads.installed')}</span>
                  <span>{formatDate(getInstalledDate(file))}</span>
                </>
              )}
              {hasUpdate(file) && file.remoteDate && (
                <>
                  <span style={{ color: theme.colors.warning }}>{t('downloads.update')}</span>
                  <span style={{ color: theme.colors.warning }}>{formatDate(file.remoteDate)} {t('downloads.available')}</span>
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
                {t('downloads.custom_url')}
                {editingUrls[file.id] !== file.defaultUrl && (
                  <span style={{ color: theme.colors.primary, marginLeft: theme.space.xs }}>
                    {t('downloads.modified')}
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
                      placeholder={t('downloads.enter_url')}
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
                        {savingUrl === file.id ? t('downloads.saving') : t('common.save')}
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
            {file.downloadStatus && (file.downloadStatus.status === 'downloading' || file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing') ? (
              <div style={{ marginTop: theme.space.sm }}>
                <div style={{
                  marginBottom: theme.space.sm,
                  background: theme.colors.bgCardActive,
                  borderRadius: theme.radius.sm,
                  overflow: 'hidden',
                  height: '8px',
                  position: 'relative',
                }}>
                  {file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing' ? (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: `linear-gradient(90deg, transparent 0%, ${file.downloadStatus.status === 'converting' ? theme.colors.info : file.downloadStatus.status === 'indexing' ? theme.colors.success : theme.colors.warning} 50%, transparent 100%)`,
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
                    {file.downloadStatus.status === 'extracting' ? t('downloads.extracting') :
                     file.downloadStatus.status === 'converting' ? t('downloads.converting') :
                     file.downloadStatus.status === 'indexing' ? t('downloads.indexing') : (
                      `${formatFileSize(file.downloadStatus.bytesDownloaded)} / ${formatFileSize(file.downloadStatus.totalBytes)}`
                    )}
                  </span>
                  <span>{file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing' ? '' : `${file.downloadStatus.progress}%`}</span>
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
                  {t('downloads.cancel_download')}
                </button>
              </div>
            ) : file.downloadStatus && file.downloadStatus.status === 'error' ? (
              <div style={{ marginTop: theme.space.sm }}>
                {!downloadingFiles.has(file.id) && (
                  <div style={{
                    padding: theme.space.md,
                    background: `${theme.colors.error}10`,
                    border: `1px solid ${theme.colors.error}40`,
                    borderRadius: theme.radius.sm,
                    color: theme.colors.error,
                    fontSize: theme.fontSize.xs,
                    marginBottom: theme.space.sm,
                  }}>
                    {t('downloads.error_download_failed')}{file.downloadStatus.error ? `: ${file.downloadStatus.error}` : ''}
                  </div>
                )}
                <button
                  onClick={() => handleDownload(file)}
                  disabled={downloadingFiles.has(file.id)}
                  style={{
                    width: '100%',
                    padding: theme.space.md,
                    background: downloadingFiles.has(file.id) ? theme.colors.bgCardActive : theme.colors.primary,
                    border: 'none',
                    borderRadius: theme.radius.sm,
                    color: '#fff',
                    cursor: downloadingFiles.has(file.id) ? 'wait' : 'pointer',
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.bold,
                    opacity: downloadingFiles.has(file.id) ? 0.7 : 1,
                  }}
                >
                  {downloadingFiles.has(file.id) ? t('downloads.starting') : t('downloads.retry_download')}
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
                    {downloadingFiles.has(file.id) ? t('downloads.starting') : `${t('downloads.download')}${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
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
                    {downloadingFiles.has(file.id) ? t('downloads.starting') : `${t('downloads.update')}${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
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
                    {t('downloads.installed_label')}{file.size ? ` (${formatFileSize(file.size)})` : ''}
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

      {/* Attribution */}
      {!loadingFiles && (
        <div style={{
          marginTop: theme.space.lg,
          padding: `${theme.space.sm} ${theme.space.md}`,
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          <a
            href="https://global-hydrodynamics.github.io/OSM_WaterLayer/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}
          >
            {t('downloads.attribution')}
          </a>
          {' · '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}
          >
            {t('downloads.license_link')}
          </a>
        </div>
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
        {t('advanced.map_tiles')}
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          {t('advanced.street_map')}
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
          {t('advanced.satellite_map')}
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
          {t('advanced.nautical_overlay')}
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
        {t('advanced.reset_map_tiles')}
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
        {t('advanced.api_endpoints')}
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          marginBottom: theme.space.sm,
        }}>
          {t('advanced.geocoding_api')}
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
        {t('advanced.reset_api')}
      </button>

      {/* Weather subsection */}
      <div style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.bold,
        marginBottom: theme.space.md,
        marginTop: theme.space.xl,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {t('advanced.weather_data')}
      </div>

      {/* Weather enabled toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.border}`,
        marginBottom: theme.space.md,
      }}>
        <div>
          <div style={{ fontWeight: theme.fontWeight.medium, marginBottom: theme.space.xs, fontSize: theme.fontSize.sm }}>
            {t('advanced.weather_service')}
          </div>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
            {t('advanced.weather_service_desc')}
          </div>
        </div>
        <button
          onClick={() => setWeatherSettings({ ...weatherSettings, enabled: !weatherSettings.enabled })}
          style={{
            width: '56px',
            height: '32px',
            borderRadius: '16px',
            background: weatherSettings.enabled ? theme.colors.primary : theme.colors.bgCardActive,
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
            left: weatherSettings.enabled ? '28px' : '4px',
            transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {weatherSettings.enabled && (
        <>
          {/* Refresh interval */}
          <div style={{ marginBottom: theme.space.md }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.space.xs,
            }}>
              <div style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
              }}>
                {t('advanced.refresh_interval')}
              </div>
              <div style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textPrimary,
              }}>
                {weatherSettings.refreshIntervalMinutes} min
              </div>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={weatherSettings.refreshIntervalMinutes}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, refreshIntervalMinutes: parseInt(e.target.value) })}
              style={{
                width: '100%',
                accentColor: theme.colors.primary,
              }}
            />
          </div>

          {/* Weather API URL */}
          <div style={{ marginBottom: theme.space.md }}>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginBottom: theme.space.sm,
            }}>
              {t('advanced.weather_api')}
            </div>
            <input
              type="text"
              value={weatherSettings.weatherApiUrl}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, weatherApiUrl: e.target.value })}
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

          {/* Marine API URL */}
          <div style={{ marginBottom: theme.space.md }}>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginBottom: theme.space.sm,
            }}>
              {t('advanced.marine_api')}
            </div>
            <input
              type="text"
              value={weatherSettings.marineApiUrl}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, marineApiUrl: e.target.value })}
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
            onClick={() => setWeatherSettings({
              ...weatherSettings,
              weatherApiUrl: 'https://api.open-meteo.com/v1/forecast',
              marineApiUrl: 'https://marine-api.open-meteo.com/v1/marine',
              refreshIntervalMinutes: 15,
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
            {t('advanced.reset_weather')}
          </button>
        </>
      )}

      <div style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.xs,
        color: theme.colors.textMuted,
        marginTop: theme.space.xl,
        lineHeight: 1.5,
      }}>
        {t('advanced.map_tiles_info')}
        <br /><br />
        {t('advanced.geocoding_info')}
        <br /><br />
        {t('advanced.weather_info')}
      </div>
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'vessel':
        return renderVesselTab();
      case 'units':
        return renderUnitsTab();
      case 'downloads':
        return renderDownloadsTab();
      case 'alerts':
        return <AlertsTab />;
      case 'plugins':
        return <PluginsTab />;
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
          <span style={{ fontSize: theme.fontSize.xs }}>{t('settings.home')}</span>
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
        BigaOS v{updateInfo?.currentVersion || '...'}
      </div>
    </div>
  );
};
