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
import { dataAPI, DataFileInfo, DownloadProgress, offlineMapsAPI, StorageStats } from '../../services/api';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { OfflineMapsTab } from '../settings/OfflineMapsTab';
import { wsService } from '../../services/websocket';

type SettingsTab = 'general' | 'vessel' | 'units' | 'downloads' | 'offline-maps' | 'advanced';

interface SettingsViewProps {
  onClose: () => void;
  initialTab?: SettingsTab;
}

// Chain type options
const chainTypeOptions: { value: ChainType; label: string }[] = [
  { value: 'galvanized', label: 'Galvanized' },
  { value: 'stainless-steel', label: 'Stainless Steel' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ onClose, initialTab }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'general');
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
      id: 'vessel',
      label: 'My Vessel',
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
      label: 'Units',
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
      label: 'Navigation Data',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      ),
    },
    // Offline Maps tab temporarily hidden due to legal concerns
    // {
    //   id: 'offline-maps',
    //   label: 'Offline Maps',
    //   icon: (
    //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    //       <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    //       <circle cx="12" cy="10" r="3" />
    //     </svg>
    //   ),
    // },
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
          Please enter a valid number
        </div>
      )}
      {isBelowMin && (
        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.error,
          marginTop: theme.space.xs,
        }}>
          Value must be at least {min}
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
          Vessel Name
        </div>
        <input
          type="text"
          value={vesselSettings.name}
          onChange={(e) => setVesselSettings({ ...vesselSettings, name: e.target.value })}
          placeholder="Enter your vessel's name..."
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
        Identification
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselTextInput(
          'Registration No.',
          vesselSettings.registrationNumber,
          (v) => setVesselSettings({ ...vesselSettings, registrationNumber: v }),
          'e.g., 123456-A',
          true
        )}
        {renderVesselTextInput(
          'Call Sign',
          vesselSettings.callSign,
          (v) => setVesselSettings({ ...vesselSettings, callSign: v }),
          'e.g., DA1234',
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
          'MMSI',
          vesselSettings.mmsi,
          (v) => setVesselSettings({ ...vesselSettings, mmsi: v }),
          '9-digit number',
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
          'Home Port',
          vesselSettings.homePort,
          (v) => setVesselSettings({ ...vesselSettings, homePort: v }),
          'e.g., Hamburg',
          true
        )}
        {renderVesselTextInput(
          'Flag',
          vesselSettings.flag,
          (v) => setVesselSettings({ ...vesselSettings, flag: v }),
          'e.g., Germany',
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
        Dimensions
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          'Length (LOA)',
          vesselSettings.length,
          (v) => setVesselSettings({ ...vesselSettings, length: v }),
          'meters',
          0.1,
          1,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          'Waterline Length',
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
          'Beam',
          vesselSettings.beam,
          (v) => setVesselSettings({ ...vesselSettings, beam: v }),
          'meters',
          0.1,
          0.5,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          'Draft',
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
          'Freeboard',
          vesselSettings.freeboardHeight,
          (v) => setVesselSettings({ ...vesselSettings, freeboardHeight: v }),
          'meters',
          0.1,
          0.3,
          'Height from waterline to deck',
          true
        )}
        {renderVesselNumberInput(
          'Displacement',
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
        Chain
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: theme.space.md,
        marginBottom: theme.space.md,
      }}>
        {renderVesselNumberInput(
          'Total Chain',
          vesselSettings.totalChainLength,
          (v) => setVesselSettings({ ...vesselSettings, totalChainLength: v }),
          'meters',
          5,
          10,
          undefined,
          true
        )}
        {renderVesselNumberInput(
          'Chain Diameter',
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
          Chain Type
        </div>
        <div style={{
          display: 'flex',
          gap: theme.space.sm,
        }}>
          {chainTypeOptions.map((option) => (
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
        <strong>Why this matters:</strong> Your vessel's dimensions and chain specifications help calculate recommended anchor chain length for safe anchoring. Heavier vessels and stronger winds require more chain.
      </div>
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

      {renderUnitSelector<WeightUnit>(
        'Weight',
        weightUnit,
        ['kg', 'lbs'],
        {
          'kg': weightConversions['kg'].label,
          'lbs': weightConversions['lbs'].label,
        },
        setWeightUnit
      )}

      {renderUnitSelector<TemperatureUnit>(
        'Temperature',
        temperatureUnit,
        ['°C', '°F'],
        {
          '°C': temperatureConversions['°C'].label,
          '°F': temperatureConversions['°F'].label,
        },
        setTemperatureUnit
      )}

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

      {renderUnitSelector<DateFormat>(
        'Date Format',
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
                  <span>Installed:</span>
                  <span>{formatDate(getInstalledDate(file))}</span>
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
                    {file.downloadStatus.status === 'extracting' ? 'Extracting...' :
                     file.downloadStatus.status === 'converting' ? 'Converting to shapefile...' :
                     file.downloadStatus.status === 'indexing' ? 'Indexing navigation data...' : (
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
                    {downloadingFiles.has(file.id) ? 'Starting...' : `Download${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
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
                    {downloadingFiles.has(file.id) ? 'Starting...' : `Update${file.remoteSize ? ` (${formatFileSize(file.remoteSize)})` : ''}`}
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
                    Installed{file.size ? ` (${formatFileSize(file.size)})` : ''}
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
        Weather Data
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
            Weather Service
          </div>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
            Wind and wave forecasts from Open-Meteo
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
                Refresh Interval
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
              Weather API (wind, pressure)
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
              Marine API (waves, swell)
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
            Reset Weather Settings to Defaults
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
        <strong>Map Tiles:</strong> Use standard XYZ tile format with placeholders: {'{z}'} for zoom, {'{x}'}/{'{y}'} for coordinates, {'{s}'} for subdomains.
        <br /><br />
        <strong>Geocoding:</strong> Used for location search. Default uses Photon (free, CORS-enabled).
        <br /><br />
        <strong>Weather:</strong> Uses Open-Meteo (free, no API key). Wind and marine data fetched automatically based on boat position.
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
