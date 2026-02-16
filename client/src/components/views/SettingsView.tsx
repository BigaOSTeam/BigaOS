import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { dataAPI, DataFileInfo, DownloadProgress, offlineMapsAPI, StorageStats, systemAPI, UpdateInfo } from '../../services/api';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { AlertsTab } from '../settings/AlertsTab';
import { PluginsTab } from '../settings/PluginsTab';
import { TerminalPanel } from '../settings/TerminalPanel';
import { ChartTab } from '../settings/ChartTab';
import type { ThemeMode } from '../../styles/themes';
import { ClientsTab } from '../settings/ClientsTab';

import { wsService } from '../../services/websocket';
import { useLanguage } from '../../i18n/LanguageContext';
import { LANGUAGES, LanguageCode } from '../../i18n/languages';
import { CustomSelect } from '../ui/CustomSelect';
import {
  SLabel,
  SSection,
  SInput,
  SButton,
  SToggle,
  SOptionGroup,
  SCard,
  SInfoBox,
} from '../ui/SettingsUI';

type SettingsTab = 'general' | 'chart' | 'vessel' | 'units' | 'downloads' | 'alerts' | 'plugins' | 'clients' | 'advanced';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: SettingsTab;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose, initialTab }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');
  const [dataFiles, setDataFiles] = useState<DataFileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [minCheckSpin, setMinCheckSpin] = useState(false);
  const [dotCount, setDotCount] = useState(1);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { confirm } = useConfirmDialog();
  const { t } = useLanguage();

  const isCheckingVisible = minCheckSpin || updateChecking;

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

  // Animated dots for checking state
  useEffect(() => {
    if (isCheckingVisible) {
      setDotCount(1);
      dotIntervalRef.current = setInterval(() => setDotCount(d => (d % 3) + 1), 400);
    } else {
      if (dotIntervalRef.current) clearInterval(dotIntervalRef.current);
    }
    return () => { if (dotIntervalRef.current) clearInterval(dotIntervalRef.current); };
  }, [isCheckingVisible]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); }, []);

  // Check for updates when General tab is active
  const checkForUpdate = useCallback(async (force: boolean = false) => {
    setUpdateChecking(true);
    if (force) {
      setMinCheckSpin(true);
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      checkTimerRef.current = setTimeout(() => setMinCheckSpin(false), 1200);
    }
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

      if (data.status === 'downloading' || data.status === 'extracting' || data.status === 'converting' || data.status === 'indexing') {
        setDownloadingFiles(prev => new Set([...prev, data.fileId]));
      } else {
        setDownloadingFiles(prev => {
          const next = new Set(prev);
          next.delete(data.fileId);
          return next;
        });
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
    const d = new Date(isoDate);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const datePart = dateFormat === 'MM/DD/YYYY' ? `${mm}/${dd}/${yyyy}`
      : dateFormat === 'YYYY-MM-DD' ? `${yyyy}-${mm}-${dd}`
      : dateFormat === 'DD.MM.YYYY' ? `${dd}.${mm}.${yyyy}`
      : `${dd}/${mm}/${yyyy}`;
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    };
    return datePart + ' ' + d.toLocaleTimeString([], timeOptions);
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

  // ================================================================
  // Unit selector helper (uses SLabel + SOptionGroup)
  // ================================================================

  const renderUnitSelector = <T extends string>(
    label: string,
    currentValue: T,
    options: T[],
    labels: Record<T, string>,
    onChange: (value: T) => void
  ) => (
    <div style={{ marginBottom: theme.space.xl }}>
      <SLabel>{label}</SLabel>
      <SOptionGroup options={options} labels={labels} value={currentValue} onChange={onChange} />
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
      id: 'chart',
      label: t('settings.chart'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      ),
    },
    {
      id: 'vessel',
      label: t('settings.vessel'),
      icon: (
        <svg width="18" height="18" viewBox="-12 -18 24 28" fill="none">
          <path d="M -10 4 L -10 8 L 10 8 L 12 4 Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1="4" x2="0" y2="-16" stroke="currentColor" strokeWidth="1.5" />
          <path d="M -1 -14 L -8 2 L -1 2 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="0.5" />
          <path d="M 1 -14 L 10 2 L 1 2 Z" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      ),
    },
    {
      id: 'units',
      label: t('settings.units'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      id: 'plugins',
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
      id: 'clients',
      label: t('settings.clients'),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
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

  // ================================================================
  // General Tab
  // ================================================================

  const renderGeneralTab = () => (
    <div>
      {/* Language Selector */}
      <div style={{ marginBottom: theme.space.xl }}>
        <SLabel>{t('language.label')}</SLabel>
        <CustomSelect
          value={settings.language}
          options={Object.entries(LANGUAGES).map(([code, info]) => ({
            value: code,
            label: info.name,
          }))}
          onChange={(code) => settings.setLanguage(code as LanguageCode)}
        />
      </div>

      {/* Theme Selector */}
      <div style={{ marginBottom: theme.space.xl }}>
        <SLabel>{t('settings.theme')}</SLabel>
        <SOptionGroup
          options={['dark', 'light'] as ThemeMode[]}
          labels={{ dark: t('settings.theme_dark'), light: t('settings.theme_light') }}
          value={settings.themeMode}
          onChange={settings.setThemeMode}
        />
      </div>

      {/* Software Update Section */}
      <SLabel>{t('update.title')}</SLabel>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: theme.space.sm, marginBottom: theme.space.xl }}>
        {/* Version info box */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
          flexWrap: 'wrap',
          padding: '0.5rem 0.75rem',
          lineHeight: 1,
          background: theme.colors.bgCard,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          minHeight: '42px',
          boxSizing: 'border-box' as const,
        }}>
          <span style={{ fontSize: theme.fontSize.md, color: theme.colors.textPrimary }}>
            v{updateInfo?.currentVersion || '...'}
          </span>
          {updateInfo?.available && (
            <>
              <span style={{ color: theme.colors.textMuted }}>→</span>
              <span style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: theme.colors.primary }}>
                v{updateInfo.latestVersion}
              </span>
              <a
                href={`https://github.com/BigaOSTeam/BigaOS/releases/tag/v${updateInfo.latestVersion}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: theme.fontSize.md,
                  color: theme.colors.textSecondary,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Release Notes
              </a>
            </>
          )}
          {!isCheckingVisible && updateInfo && !updateInfo.available && !updateInfo.error && (
            <>
              <span style={{ color: theme.colors.textMuted }}>→</span>
              <span style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: theme.colors.success }}>
                {t('update.up_to_date')}
              </span>
            </>
          )}
          {isCheckingVisible && (
            <>
              <span style={{ color: theme.colors.textMuted }}>→</span>
              <span style={{
                fontSize: theme.fontSize.md,
                color: theme.colors.textMuted,
                display: 'inline-flex',
                alignItems: 'center',
                gap: theme.space.xs,
              }}>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: 'spin 0.6s linear infinite', flexShrink: 0 }}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {t('update.checking').replace(/\.+$/, '') + '.'.repeat(dotCount)}
              </span>
            </>
          )}
        </div>

        {/* Button: check / install */}
        {updateInfo?.available ? (
          <SButton
            variant="primary"
            onClick={handleInstallUpdate}
            disabled={updateInstalling}
            style={{ flexShrink: 0 }}
          >
            {updateInstalling ? t('update.installing') : t('update.install')}
          </SButton>
        ) : (
          <SButton
            variant="secondary"
            onClick={() => checkForUpdate(true)}
            disabled={isCheckingVisible}
            style={{ flexShrink: 0 }}
          >
            {t('update.check')}
          </SButton>
        )}
      </div>

      {updateInfo?.error && !isCheckingVisible && (
        <div style={{
          marginTop: `-${theme.space.md}`,
          marginBottom: theme.space.xl,
          color: theme.colors.warning,
          fontSize: theme.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.space.sm,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
          </svg>
          {t('update.check_failed')}
        </div>
      )}
    </div>
  );

  // ================================================================
  // Vessel Tab
  // ================================================================

  const [vesselInputValues, setVesselInputValues] = useState<Record<string, string>>({});

  const renderVesselNumberInput = (
    label: string,
    value: number | undefined,
    onChange: (value: number) => void,
    unit: string,
    min: number = 0,
    noMargin: boolean = false
  ) => {
    const safeValue = value ?? 0;
    const inputKey = label.toLowerCase().replace(/\s+/g, '_');
    const localValue = vesselInputValues[inputKey];
    const displayValue = localValue !== undefined ? localValue : safeValue.toString();

    const isValidNumber = (val: string) => {
      if (val === '' || val === '-') return true;
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
          <SLabel style={{ marginBottom: 0 }}>{label}</SLabel>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{unit}</div>
        </div>
        <SInput
          type="text"
          inputMode="decimal"
          value={displayValue}
          error={hasError || isBelowMin}
          onChange={(e) => {
            const newValue = e.target.value;
            setVesselInputValues(prev => ({ ...prev, [inputKey]: newValue }));
            const parsed = parseFloat(newValue);
            if (!isNaN(parsed) && parsed >= min) {
              onChange(parsed);
            }
          }}
          onBlur={() => {
            setVesselInputValues(prev => {
              const newState = { ...prev };
              delete newState[inputKey];
              return newState;
            });
          }}
        />
        {hasError && (
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.error, marginTop: theme.space.xs }}>
            {t('validation.invalid_number')}
          </div>
        )}
        {isBelowMin && (
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.error, marginTop: theme.space.xs }}>
            {t('validation.min_value', { min })}
          </div>
        )}
      </div>
    );
  };

  const renderVesselTextInput = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder?: string,
    noMargin: boolean = false
  ) => (
    <div style={{ marginBottom: noMargin ? 0 : theme.space.lg }}>
      <SLabel>{label}</SLabel>
      <SInput
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  const renderVesselTab = () => (
    <div>
      {/* Vessel Name */}
      <div style={{ marginBottom: theme.space.xl }}>
        <SLabel>{t('vessel.name')}</SLabel>
        <SInput
          type="text"
          value={vesselSettings.name}
          onChange={(e) => setVesselSettings({ ...vesselSettings, name: e.target.value })}
          placeholder={t('vessel.name_placeholder')}
          inputStyle={{ fontWeight: theme.fontWeight.bold }}
        />
      </div>

      {/* Identification Section */}
      <SSection>{t('vessel.identification')}</SSection>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselTextInput(t('vessel.registration_no'), vesselSettings.registrationNumber, (v) => setVesselSettings({ ...vesselSettings, registrationNumber: v }), t('vessel.registration_placeholder'), true)}
        {renderVesselTextInput(t('vessel.call_sign'), vesselSettings.callSign, (v) => setVesselSettings({ ...vesselSettings, callSign: v }), t('vessel.call_sign_placeholder'), true)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselTextInput(t('vessel.mmsi'), vesselSettings.mmsi, (v) => setVesselSettings({ ...vesselSettings, mmsi: v }), t('vessel.mmsi_placeholder'), true)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.xl }}>
        {renderVesselTextInput(t('vessel.home_port'), vesselSettings.homePort, (v) => setVesselSettings({ ...vesselSettings, homePort: v }), t('vessel.home_port_placeholder'), true)}
        {renderVesselTextInput(t('vessel.flag'), vesselSettings.flag, (v) => setVesselSettings({ ...vesselSettings, flag: v }), t('vessel.flag_placeholder'), true)}
      </div>

      {/* Vessel Dimensions Section */}
      <SSection>{t('vessel.dimensions')}</SSection>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselNumberInput(t('vessel.length_loa'), vesselSettings.length, (v) => setVesselSettings({ ...vesselSettings, length: v }), t('units.meters'), 1, true)}
        {renderVesselNumberInput(t('vessel.waterline_length'), vesselSettings.waterlineLength, (v) => setVesselSettings({ ...vesselSettings, waterlineLength: v }), t('units.meters'), 1, true)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselNumberInput(t('vessel.beam'), vesselSettings.beam, (v) => setVesselSettings({ ...vesselSettings, beam: v }), t('units.meters'), 0.5, true)}
        {renderVesselNumberInput(t('vessel.draft'), vesselSettings.draft, (v) => setVesselSettings({ ...vesselSettings, draft: v }), t('units.meters'), 0.3, true)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselNumberInput(t('vessel.freeboard'), vesselSettings.freeboardHeight, (v) => setVesselSettings({ ...vesselSettings, freeboardHeight: v }), t('units.meters'), 0.3, true)}
        {renderVesselNumberInput(t('vessel.displacement'), vesselSettings.displacement, (v) => setVesselSettings({ ...vesselSettings, displacement: v }), t('units.tons'), 0.5, true)}
      </div>

      {/* Chain Section */}
      <SSection style={{ marginTop: theme.space.lg }}>{t('vessel.chain')}</SSection>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.space.md, marginBottom: theme.space.md }}>
        {renderVesselNumberInput(t('vessel.total_chain'), vesselSettings.totalChainLength, (v) => setVesselSettings({ ...vesselSettings, totalChainLength: v }), t('units.meters'), 10, true)}
        {renderVesselNumberInput(t('vessel.chain_diameter'), vesselSettings.chainDiameter, (v) => setVesselSettings({ ...vesselSettings, chainDiameter: v }), t('units.mm'), 4, true)}
      </div>

      {/* Chain Type Selector */}
      <div style={{ marginBottom: theme.space.md }}>
        <SLabel>{t('vessel.chain_type')}</SLabel>
        <SOptionGroup
          options={['galvanized' as ChainType, 'stainless-steel' as ChainType]}
          labels={{ 'galvanized': t('vessel.galvanized'), 'stainless-steel': t('vessel.stainless_steel') } as Record<ChainType, string>}
          value={vesselSettings.chainType}
          onChange={(v) => setVesselSettings({ ...vesselSettings, chainType: v })}
        />
      </div>

      <SInfoBox>{t('vessel.why_matters')}</SInfoBox>
    </div>
  );

  // ================================================================
  // Units Tab
  // ================================================================

  const renderUnitsTab = () => (
    <div>
      {renderUnitSelector<SpeedUnit>(
        t('units.speed'), speedUnit,
        ['kt', 'km/h', 'mph', 'm/s'],
        { 'kt': speedConversions['kt'].label, 'km/h': speedConversions['km/h'].label, 'mph': speedConversions['mph'].label, 'm/s': speedConversions['m/s'].label },
        setSpeedUnit
      )}
      {renderUnitSelector<WindUnit>(
        t('units.wind'), windUnit,
        ['kt', 'km/h', 'mph', 'm/s', 'bft'],
        { 'kt': windConversions['kt'].label, 'km/h': windConversions['km/h'].label, 'mph': windConversions['mph'].label, 'm/s': windConversions['m/s'].label, 'bft': t('units.beaufort') },
        setWindUnit
      )}
      {renderUnitSelector<DepthUnit>(
        t('units.depth'), depthUnit,
        ['m', 'ft'],
        { 'm': depthConversions['m'].label, 'ft': depthConversions['ft'].label },
        setDepthUnit
      )}
      {renderUnitSelector<DistanceUnit>(
        t('units.distance'), distanceUnit,
        ['nm', 'km', 'mi'],
        { 'nm': distanceConversions['nm'].label, 'km': distanceConversions['km'].label, 'mi': distanceConversions['mi'].label },
        setDistanceUnit
      )}
      {renderUnitSelector<WeightUnit>(
        t('units.weight'), weightUnit,
        ['kg', 'lbs'],
        { 'kg': weightConversions['kg'].label, 'lbs': weightConversions['lbs'].label },
        setWeightUnit
      )}
      {renderUnitSelector<TemperatureUnit>(
        t('units.temperature'), temperatureUnit,
        ['°C', '°F'],
        { '°C': temperatureConversions['°C'].label, '°F': temperatureConversions['°F'].label },
        setTemperatureUnit
      )}
      {renderUnitSelector<TimeFormat>(
        t('units.time_format'), timeFormat,
        ['24h', '12h'],
        { '24h': '24h', '12h': 'AM/PM' },
        setTimeFormat
      )}
      {renderUnitSelector<DateFormat>(
        t('units.date_format'), dateFormat,
        ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
        { 'DD.MM.YYYY': 'DD.MM.YYYY', 'DD/MM/YYYY': 'DD/MM/YYYY', 'MM/DD/YYYY': 'MM/DD/YYYY', 'YYYY-MM-DD': 'YYYY-MM-DD' },
        setDateFormat
      )}
      <SInfoBox>{t('units.change_note')}</SInfoBox>
    </div>
  );

  // ================================================================
  // Downloads Tab
  // ================================================================

  const renderDownloadsTab = () => (
    <div>
      {loadingFiles ? (
        <div style={{ color: theme.colors.textMuted, padding: theme.space.lg }}>{t('downloads.loading_data')}</div>
      ) : (
        navigationFiles.map((file) => (
          <div
            key={file.id}
            style={{ marginBottom: theme.space.sm, paddingBottom: theme.space.sm, borderBottom: `1px solid ${theme.colors.border}` }}
          >
            {/* Header: name + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.space.sm }}>
              <div style={{ fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: theme.colors.textPrimary }}>
                {file.name}
              </div>
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textAlign: 'right' }}>
                {file.exists && !hasUpdate(file) && (
                  <span>{t('downloads.installed')} {formatDate(getInstalledDate(file))}</span>
                )}
                {hasUpdate(file) && file.remoteDate && (
                  <span style={{ color: theme.colors.warning }}>{t('downloads.update')} {formatDate(file.remoteDate)}</span>
                )}
              </div>
            </div>

            {/* Download Progress or Actions */}
            {file.downloadStatus && (file.downloadStatus.status === 'downloading' || file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing') ? (
              <div style={{ marginTop: theme.space.sm }}>
                <div style={{ marginBottom: theme.space.sm, background: theme.colors.bgCardActive, borderRadius: theme.radius.sm, overflow: 'hidden', height: '8px', position: 'relative' }}>
                  {file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing' ? (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: `linear-gradient(90deg, transparent 0%, ${file.downloadStatus.status === 'converting' ? theme.colors.info : file.downloadStatus.status === 'indexing' ? theme.colors.success : theme.colors.warning} 50%, transparent 100%)`,
                      animation: 'extracting 1.5s ease-in-out infinite',
                    }} />
                  ) : (
                    <div style={{ width: `${file.downloadStatus.progress}%`, height: '100%', background: theme.colors.primary, transition: 'width 0.3s ease' }} />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: theme.space.sm }}>
                  <span>
                    {file.downloadStatus.status === 'extracting' ? t('downloads.extracting') :
                     file.downloadStatus.status === 'converting' ? t('downloads.converting') :
                     file.downloadStatus.status === 'indexing' ? t('downloads.indexing') : (
                      `${formatFileSize(file.downloadStatus.bytesDownloaded)} / ${formatFileSize(file.downloadStatus.totalBytes)}`
                    )}
                  </span>
                  <span>{file.downloadStatus.status === 'extracting' || file.downloadStatus.status === 'converting' || file.downloadStatus.status === 'indexing' ? '' : `${file.downloadStatus.progress}%`}</span>
                </div>
                <SButton variant="danger" fullWidth onClick={() => handleCancelDownload(file)}>
                  {t('downloads.cancel_download')}
                </SButton>
              </div>
            ) : file.downloadStatus && file.downloadStatus.status === 'error' ? (
              <div style={{ marginTop: theme.space.sm }}>
                {!downloadingFiles.has(file.id) && (
                  <div style={{
                    padding: theme.space.md,
                    background: `${theme.colors.error}10`,
                    border: `1px solid ${theme.colors.error}40`,
                    borderRadius: theme.radius.md,
                    color: theme.colors.error,
                    fontSize: theme.fontSize.xs,
                    marginBottom: theme.space.sm,
                  }}>
                    {t('downloads.error_download_failed')}{file.downloadStatus.error ? `: ${file.downloadStatus.error}` : ''}
                  </div>
                )}
                <SButton
                  variant="primary"
                  fullWidth
                  onClick={() => handleDownload(file)}
                  disabled={downloadingFiles.has(file.id)}
                >
                  {downloadingFiles.has(file.id) ? t('downloads.starting') : t('downloads.retry_download')}
                </SButton>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: theme.space.sm }}>
                {!file.exists ? (
                  <SButton
                    variant="primary"
                    fullWidth
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id)}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    }
                  >
                    {downloadingFiles.has(file.id) ? t('downloads.starting') : `${t('downloads.download')}${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
                  </SButton>
                ) : hasUpdate(file) ? (
                  <SButton
                    variant="warning"
                    fullWidth
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFiles.has(file.id)}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    }
                  >
                    {downloadingFiles.has(file.id) ? t('downloads.starting') : `${t('downloads.update')}${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
                  </SButton>
                ) : (
                  <div style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: `${theme.colors.success}30`,
                    border: 'none',
                    borderRadius: theme.radius.md,
                    color: theme.colors.success,
                    fontSize: theme.fontSize.sm,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: theme.space.sm,
                    minHeight: '44px',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('downloads.installed_label')}{file.size ? ` (${formatFileSize(file.size)})` : ''}
                  </div>
                )}
                {file.exists && (
                  <SButton
                    variant="danger"
                    onClick={() => handleDelete(file)}
                    style={{ flexShrink: 0, width: '42px', padding: 0 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </SButton>
                )}
              </div>
            )}

          </div>
        ))
      )}

      {/* Storage + attribution */}
      {!loadingFiles && (
        <div style={{
          marginTop: theme.space.sm,
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <a href="https://global-hydrodynamics.github.io/OSM_WaterLayer/" target="_blank" rel="noopener noreferrer"
              style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}>
              {t('downloads.attribution')}
            </a>
            {' · '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer"
              style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}>
              {t('downloads.license_link')}
            </a>
          </div>
          {storageStats?.deviceStorage && (
            <div style={{ whiteSpace: 'nowrap' }}>
              {t('downloads.storage')} {storageStats.deviceStorage.availableFormatted} {t('downloads.free')}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ================================================================
  // Advanced Tab
  // ================================================================

  const renderAdvancedTab = () => (
    <div>
      <TerminalPanel />

      <div style={{ borderTop: `1px solid ${theme.colors.border}`, margin: `${theme.space.lg} 0` }} />

      {/* Maps & Tiles */}
      <SSection>{t('advanced.map_tiles')}</SSection>

      <div style={{ marginBottom: theme.space.lg }}>
        <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.street_map')}</SLabel>
        <SInput
          type="text"
          value={mapTileUrls.streetMap}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, streetMap: e.target.value })}
          monospace
        />
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.satellite_map')}</SLabel>
        <SInput
          type="text"
          value={mapTileUrls.satelliteMap}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, satelliteMap: e.target.value })}
          monospace
        />
      </div>

      <div style={{ marginBottom: theme.space.lg }}>
        <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.nautical_overlay')}</SLabel>
        <SInput
          type="text"
          value={mapTileUrls.nauticalOverlay}
          onChange={(e) => setMapTileUrls({ ...mapTileUrls, nauticalOverlay: e.target.value })}
          monospace
        />
      </div>

      <SButton
        variant="outline"
        onClick={() => setMapTileUrls({
          streetMap: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          satelliteMap: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          nauticalOverlay: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
        })}
        style={{ marginBottom: theme.space.xl }}
      >
        {t('advanced.reset_map_tiles')}
      </SButton>

      {/* API Endpoints */}
      <SSection>{t('advanced.api_endpoints')}</SSection>

      <div style={{ marginBottom: theme.space.lg }}>
        <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.geocoding_api')}</SLabel>
        <SInput
          type="text"
          value={apiUrls.nominatimUrl}
          onChange={(e) => setApiUrls({ ...apiUrls, nominatimUrl: e.target.value })}
          monospace
        />
      </div>

      <SButton
        variant="outline"
        onClick={() => setApiUrls({ nominatimUrl: 'https://photon.komoot.io' })}
      >
        {t('advanced.reset_api')}
      </SButton>

      {/* Navigation Data URLs */}
      <SSection style={{ marginTop: theme.space.xl }}>{t('downloads.custom_url')}</SSection>

      {navigationFiles.map((file) => (
        <div key={file.id} style={{ marginBottom: theme.space.lg }}>
          <SLabel style={{ fontSize: theme.fontSize.xs }}>
            {file.name}
            {editingUrls[file.id] !== file.defaultUrl && (
              <span style={{ color: theme.colors.primary, marginLeft: theme.space.xs }}>{t('downloads.modified')}</span>
            )}
          </SLabel>
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <SInput
              type="text"
              value={editingUrls[file.id] || ''}
              onChange={(e) => handleUrlChange(file.id, e.target.value)}
              monospace
              placeholder={t('downloads.enter_url')}
              inputStyle={{
                border: `1px solid ${editingUrls[file.id] !== file.url ? theme.colors.primary : theme.colors.border}`,
              }}
            />
            {editingUrls[file.id] !== file.url && (
              <SButton
                variant="primary"
                onClick={() => handleUrlSave(file)}
                disabled={savingUrl === file.id}
                style={{ flexShrink: 0 }}
              >
                {savingUrl === file.id ? t('downloads.saving') : t('common.save')}
              </SButton>
            )}
            {editingUrls[file.id] !== file.defaultUrl && (
              <SButton
                variant="outline"
                onClick={() => handleResetUrl(file)}
                title="Reset to default URL"
                style={{ padding: theme.space.sm, flexShrink: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </SButton>
            )}
          </div>
        </div>
      ))}

      {/* Weather */}
      <SSection style={{ marginTop: theme.space.xl }}>{t('advanced.weather_data')}</SSection>

      <SCard style={{ marginBottom: theme.space.md }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: theme.fontWeight.medium, marginBottom: theme.space.xs, fontSize: theme.fontSize.sm }}>
              {t('advanced.weather_service')}
            </div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
              {t('advanced.weather_service_desc')}
            </div>
          </div>
          <SToggle checked={weatherSettings.enabled} onChange={(v) => setWeatherSettings({ ...weatherSettings, enabled: v })} />
        </div>
      </SCard>

      {weatherSettings.enabled && (
        <>
          <div style={{ marginBottom: theme.space.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.xs }}>
              <SLabel style={{ marginBottom: 0, fontSize: theme.fontSize.xs }}>{t('advanced.refresh_interval')}</SLabel>
              <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textPrimary }}>{weatherSettings.refreshIntervalMinutes} min</div>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={weatherSettings.refreshIntervalMinutes}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, refreshIntervalMinutes: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: theme.colors.primary }}
            />
          </div>

          <div style={{ marginBottom: theme.space.md }}>
            <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.weather_api')}</SLabel>
            <SInput
              type="text"
              value={weatherSettings.weatherApiUrl}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, weatherApiUrl: e.target.value })}
              monospace
            />
          </div>

          <div style={{ marginBottom: theme.space.md }}>
            <SLabel style={{ fontSize: theme.fontSize.xs }}>{t('advanced.marine_api')}</SLabel>
            <SInput
              type="text"
              value={weatherSettings.marineApiUrl}
              onChange={(e) => setWeatherSettings({ ...weatherSettings, marineApiUrl: e.target.value })}
              monospace
            />
          </div>

          <SButton
            variant="outline"
            onClick={() => setWeatherSettings({
              ...weatherSettings,
              weatherApiUrl: 'https://api.open-meteo.com/v1/forecast',
              marineApiUrl: 'https://marine-api.open-meteo.com/v1/marine',
              refreshIntervalMinutes: 15,
            })}
          >
            {t('advanced.reset_weather')}
          </SButton>
        </>
      )}

      <SInfoBox>
        {t('advanced.map_tiles_info')}
        <br /><br />
        {t('advanced.geocoding_info')}
        <br /><br />
        {t('advanced.weather_info')}
      </SInfoBox>
    </div>
  );

  // ================================================================
  // Tab Router
  // ================================================================

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'chart':
        return <ChartTab />;
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
      case 'clients':
        return <ClientsTab />;
      case 'advanced':
        return renderAdvancedTab();
    }
  };

  const [menuOpen, setMenuOpen] = useState(false);

  const sidebarTab = (tab: typeof tabs[0]) => (
    <button
      key={tab.id}
      className="s-tab-btn"
      onClick={() => {
        setActiveTab(tab.id);
        setMenuOpen(false);
        localStorage.setItem('bigaos-nav-params', JSON.stringify({ settings: { tab: tab.id } }));
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.sm,
        padding: `${theme.space.sm} ${theme.space.md}`,
        background: activeTab === tab.id ? theme.colors.primaryLight : 'transparent',
        border: 'none',
        borderLeft: activeTab === tab.id ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
        color: activeTab === tab.id ? theme.colors.textPrimary : theme.colors.textMuted,
        cursor: 'pointer',
        transition: `all ${theme.transition.fast}`,
        width: '100%',
        minHeight: '40px',
        fontSize: theme.fontSize.md,
        textAlign: 'left',
      }}
    >
      {tab.icon}
      <span style={{ fontWeight: activeTab === tab.id ? theme.fontWeight.bold : theme.fontWeight.normal }}>
        {tab.label}
      </span>
    </button>
  );

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: theme.colors.bgPrimary,
      display: 'flex',
      flexDirection: 'row',
    }}>
      {/* CSS for extraction animation */}
      <style>{`
        @keyframes extracting {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Sidebar — wide screens */}
      <div
        className="settings-sidebar"
        style={{
          width: '200px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${theme.colors.border}`,
          background: theme.colors.bgSecondary,
          overflowY: 'auto',
        }}
      >
        <div style={{ flex: 1, paddingTop: theme.space.sm }}>
          {tabs.map(sidebarTab)}
        </div>
        {/* Home + version at bottom */}
        <div style={{ borderTop: `1px solid ${theme.colors.border}`, padding: theme.space.sm }}>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.space.sm,
              padding: `${theme.space.sm} ${theme.space.md}`,
              background: 'transparent',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: 'pointer',
              width: '100%',
              minHeight: '40px',
              fontSize: theme.fontSize.md,
              textAlign: 'left',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {t('settings.home')}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile header with hamburger — small screens only */}
        <div
          className="settings-mobile-header"
          style={{
            display: 'none',
            alignItems: 'center',
            gap: theme.space.sm,
            padding: `${theme.space.sm} ${theme.space.md}`,
            borderBottom: `1px solid ${theme.colors.border}`,
            background: theme.colors.bgSecondary,
          }}
        >
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              padding: theme.space.xs,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: theme.colors.textPrimary }}>
            {tabs.find(t => t.id === activeTab)?.label}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.textMuted,
              cursor: 'pointer',
              padding: theme.space.xs,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div
            className="settings-mobile-menu"
            style={{
              display: 'none',
              position: 'absolute',
              top: '48px',
              left: 0,
              right: 0,
              background: theme.colors.bgSecondary,
              borderBottom: `1px solid ${theme.colors.border}`,
              boxShadow: theme.shadow.lg,
              zIndex: theme.zIndex.dropdown,
              flexDirection: 'column',
            }}
          >
            {tabs.map(sidebarTab)}
          </div>
        )}

        {/* Tab Content */}
        <div
          className="settings-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: theme.space.xl,
          }}
        >
          {renderActiveTab()}
        </div>
      </div>

      {/* CSS for responsive layout */}
      <style>{`
        .settings-sidebar { display: flex !important; }
        .settings-mobile-header { display: none !important; }
        .settings-mobile-menu { display: none !important; }

        @media (max-width: 700px), (orientation: portrait) {
          .settings-sidebar { display: none !important; }
          .settings-mobile-header { display: flex !important; }
          .settings-mobile-menu { display: flex !important; }
        }
      `}</style>
    </div>
  );
};
