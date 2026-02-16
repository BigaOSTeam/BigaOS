import { useState, useEffect, useCallback, useRef } from 'react';
import { SensorData } from './types';
import { ViewType } from './types/dashboard';
import { Dashboard } from './components/dashboard';
import { MapPage } from './components/navigation/MapPage';
import { WindView } from './components/views/WindView';
import { DepthView } from './components/views/DepthView';
import { SettingsView } from './components/views/SettingsView';
import { SpeedView } from './components/views/SpeedView';
import { HeadingView } from './components/views/HeadingView';
import { COGView } from './components/views/COGView';
import { PositionView } from './components/views/PositionView';
import { BatteryView } from './components/views/BatteryView';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AlertProvider, useAlerts } from './context/AlertContext';
import { PluginProvider, usePlugins } from './context/PluginContext';
import { AlertContainer } from './components/alerts';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { useClient } from './context/ClientContext';
import { wsService } from './services/websocket';
import { sensorAPI } from './services/api';
import './styles/globals.css';

// Extracted as a top-level component so React doesn't recreate the DOM on
// every parent re-render, which would reset the CSS spin animation.
function SystemUpdatingOverlay({ updating, rebooting, shuttingDown }: {
  updating: boolean; rebooting: boolean; shuttingDown: boolean;
}) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  if (!updating && !rebooting && !shuttingDown) return null;
  const title = shuttingDown
    ? t('shutdown.overlay_title')
    : rebooting ? t('reboot.overlay_title') : t('update.overlay_title');
  const message = shuttingDown
    ? t('shutdown.overlay_message')
    : rebooting ? t('reboot.overlay_message') : t('update.overlay_message');
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: theme.colors.bgOverlayHeavy,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20000,
      gap: '24px',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: `3px solid ${theme.colors.border}`,
        borderTopColor: theme.colors.info,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <div style={{
        fontSize: '1.5rem',
        fontWeight: 600,
        color: theme.colors.textPrimary,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '0.9rem',
        color: theme.colors.textMuted,
        textAlign: 'center',
        maxWidth: '300px',
      }}>
        {message}
      </div>
    </div>
  );
}

// Inner app component that uses settings context
function AppContent() {
  const { theme } = useTheme();
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverReachable, setServerReachable] = useState(true);
  const [, forceUpdate] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const [systemUpdating, setSystemUpdating] = useState(false);
  const [systemRebooting, setSystemRebooting] = useState(false);
  const [systemShuttingDown, setSystemShuttingDown] = useState(false);
  const systemUpdatingRef = useRef(false);
  const wasOfflineRef = useRef<boolean | null>(null);
  const { setCurrentDepth } = useSettings();
  const { isChartOnly: chartOnly, installingPlugins } = usePlugins();
  const { activeView, navigationParams, navigate, goBack } = useNavigation();
  const { clientId } = useClient();
  const repaintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // In chart-only mode, redirect dashboard to chart
  useEffect(() => {
    if (chartOnly && activeView === 'dashboard') {
      navigate('chart');
    }
  }, [chartOnly, activeView, navigate]);

  // In chart-only mode, "go back" means go to chart instead of dashboard
  const handleGoBack = useCallback(() => {
    if (chartOnly) {
      navigate('chart');
    } else {
      goBack();
    }
  }, [chartOnly, navigate, goBack]);

  // Force a repaint periodically to recover from rendering freezes
  const forceRepaint = useCallback(() => {
    // Trigger a minimal re-render
    forceUpdate(n => n + 1);

    // Also force browser repaint by toggling a style
    const root = document.getElementById('root');
    if (root) {
      root.style.transform = 'translateZ(1px)';
      requestAnimationFrame(() => {
        root.style.transform = 'translateZ(0)';
      });
    }
  }, []);

  // Set up periodic repaint check (every 3 seconds)
  useEffect(() => {
    repaintIntervalRef.current = setInterval(forceRepaint, 3000);
    return () => {
      if (repaintIntervalRef.current) {
        clearInterval(repaintIntervalRef.current);
      }
    };
  }, [forceRepaint]);

  useEffect(() => {
    wsService.connect(clientId);

    wsService.on('sensor_update', (data: any) => {
      if (data.data) {
        setSensorData(data.data);
        // Update current depth for alarm checking
        if (data.data.environment?.depth?.belowTransducer !== undefined) {
          setCurrentDepth(data.data.environment.depth.belowTransducer);
        }
      }
    });

    // Listen for connectivity changes from server (internet connectivity)
    wsService.on('connectivity_change', (data: { online: boolean }) => {
      const isOnline = data.online;

      // Detect transition from offline to online
      if (wasOfflineRef.current === true && isOnline) {
        // Show "ONLINE" banner briefly
        setShowOnlineBanner(true);
        setTimeout(() => setShowOnlineBanner(false), 3000);
      }

      wasOfflineRef.current = !isOnline;
      setIsOfflineMode(!isOnline);
    });

    // Listen for server reachability changes (WebSocket connection health)
    wsService.on('server_reachability', (data: { reachable: boolean }) => {
      setServerReachable(data.reachable);
      // After an update, reload when server comes back to get new client assets
      if (data.reachable && systemUpdatingRef.current) {
        window.location.reload();
      }
    });

    // Listen for system update/reboot events
    const startReloadPoll = () => {
      // Fallback: poll the server health endpoint in case WebSocket
      // reconnection event doesn't fire reliably after a full reboot.
      const poll = setInterval(() => {
        fetch('/health').then(r => {
          if (r.ok) { clearInterval(poll); window.location.reload(); }
        }).catch(() => {});
      }, 3000);
    };

    wsService.on('system_updating', () => {
      setSystemUpdating(true);
      systemUpdatingRef.current = true;
      startReloadPoll();
    });

    wsService.on('system_rebooting', () => {
      setSystemRebooting(true);
      systemUpdatingRef.current = true;
      startReloadPoll();
    });

    wsService.on('system_shutting_down', () => {
      setSystemShuttingDown(true);
      // Keep overlay until server becomes unreachable, then clear so
      // the normal "Server Unreachable" banner takes over
      const checkGone = setInterval(() => {
        fetch('/health').then(() => {}).catch(() => {
          clearInterval(checkGone);
          setSystemShuttingDown(false);
        });
      }, 2000);
    });

    // Listen for new version available (broadcast once by server per new version)
    wsService.on('update_available', (data: { version: string }) => {
      pushNotification({
        message: t('update.new_version_available', { version: data.version }),
        severity: 'info',
        tone: 'none',
      });
    });

    fetchInitialData();

    return () => {
      wsService.disconnect();
    };
  }, [setCurrentDepth]);

  const fetchInitialData = async () => {
    try {
      const sensorResponse = await sensorAPI.getAllSensors();
      setSensorData(sensorResponse.data);
      // Update depth in settings context
      if (sensorResponse.data.environment?.depth?.belowTransducer !== undefined) {
        setCurrentDepth(sensorResponse.data.environment.depth.belowTransducer);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
      setLoading(false);
    }
  };

  const handleNavigate = (view: ViewType) => {
    navigate(view);
  };

  // Translation hook - safe to use here since LanguageProvider wraps SettingsProvider
  const langContext = useLanguage();
  const t = langContext.t;
  const { pushNotification } = useAlerts();

  if (loading || !sensorData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100dvh',
        background: theme.colors.bgPrimary,
        color: theme.colors.textPrimary,
      }}>
        <div style={{ fontSize: '1.5rem' }}>{t('common.loading')}</div>
      </div>
    );
  }

  // Demo mode indicator (shown when demo driver plugin is active)
  const DemoModeBanner = () => {
    const { isDemoActive } = usePlugins();
    if (!isDemoActive) return null;
    return (
      <div style={{
        position: 'fixed',
        top: '4px',
        right: '4px',
        background: 'rgba(245, 158, 11, 0.85)',
        color: '#000',
        padding: '2px 6px',
        fontSize: '9px',
        fontWeight: 600,
        zIndex: 10000,
        borderRadius: '3px',
        opacity: 0.8,
      }}>
        {t('app.demo')}
      </div>
    );
  };

  // Connectivity status indicator (offline/online)
  const ConnectivityBanner = () => {
    // Show green "ONLINE" banner briefly when coming back online
    if (showOnlineBanner) {
      return (
        <div style={{
          position: 'fixed',
          top: '4px',
          right: '50px',
          background: 'rgba(34, 197, 94, 0.9)',
          color: '#fff',
          padding: '2px 6px',
          fontSize: '9px',
          fontWeight: 600,
          zIndex: 10000,
          borderRadius: '3px',
          animation: 'fadeOut 3s ease-in-out forwards',
        }}>
          {t('app.online')}
          <style>
            {`
              @keyframes fadeOut {
                0% { opacity: 1; }
                70% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}
          </style>
        </div>
      );
    }

    // Show red "OFFLINE" banner when offline
    if (isOfflineMode) {
      return (
        <div style={{
          position: 'fixed',
          top: '4px',
          right: '50px',
          background: 'rgba(239, 68, 68, 0.85)',
          color: '#fff',
          padding: '2px 6px',
          fontSize: '9px',
          fontWeight: 600,
          zIndex: 10000,
          borderRadius: '3px',
          opacity: 0.8,
        }}>
          {t('app.offline')}
        </div>
      );
    }

    return null;
  };

  const overlayProps = { updating: systemUpdating, rebooting: systemRebooting, shuttingDown: systemShuttingDown };

  // Server unreachable banner (shown at top of screen)
  // Suppress during plugin installs — server blocks on execSync (npm install / setup.sh)
  const ServerUnreachableBanner = () => {
    if (serverReachable || installingPlugins.size > 0) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'rgba(239, 68, 68, 0.95)',
        color: '#fff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        zIndex: 10001,
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#fff',
          animation: 'blink 1s ease-in-out infinite',
        }} />
        <span>{t('app.server_unreachable')}</span>
        <style>
          {`
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}
        </style>
      </div>
    );
  };

  // Render full-screen views
  if (activeView === 'chart') {
    return (
      <>
        <MapPage
          onClose={chartOnly ? undefined : handleGoBack}
          onOpenSettings={chartOnly ? () => navigate('settings') : undefined}
        />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'wind') {
    return (
      <>
        <WindView sensorData={sensorData} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'depth') {
    return (
      <>
        <DepthView depth={sensorData.environment.depth.belowTransducer} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'settings') {
    return (
      <>
        <SettingsView onClose={handleGoBack} initialTab={navigationParams.settings?.tab} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'speed') {
    return (
      <>
        <SpeedView speed={sensorData.navigation.speedOverGround} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'heading') {
    return (
      <>
        <HeadingView heading={sensorData.navigation.heading} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'cog') {
    return (
      <>
        <COGView cog={sensorData.navigation.courseOverGround} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'position') {
    return (
      <>
        <PositionView position={sensorData.navigation.position} onClose={handleGoBack} />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  if (activeView === 'battery') {
    return (
      <>
        <BatteryView
          voltage={sensorData.electrical.battery.voltage}
          current={sensorData.electrical.battery.current}
          temperature={sensorData.electrical.battery.temperature}
          stateOfCharge={sensorData.electrical.battery.stateOfCharge}
          onClose={handleGoBack}
        />
        <DemoModeBanner />
        <ConnectivityBanner />
        <ServerUnreachableBanner />
        <SystemUpdatingOverlay {...overlayProps} />
      </>
    );
  }

  // Default: Dashboard view
  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: theme.colors.bgPrimary,
      color: theme.colors.textPrimary,
      overflow: 'hidden',
    }}>
      <Dashboard sensorData={sensorData} onNavigate={handleNavigate} />
      <DemoModeBanner />
      <ConnectivityBanner />
      <ServerUnreachableBanner />
      <SystemUpdatingOverlay {...overlayProps} />
    </div>
  );
}

// Bridge component to sync language setting with LanguageContext
function LanguageSyncBridge() {
  const { language } = useSettings();
  const { setLanguage } = useLanguage();

  useEffect(() => {
    setLanguage(language);
  }, [language, setLanguage]);

  return null;
}

// Bridge component to sync plugin translations into LanguageContext
function PluginI18nBridge() {
  const { getPluginTranslations } = usePlugins();
  const { language, registerExtraTranslations } = useLanguage();

  useEffect(() => {
    const translations = getPluginTranslations(language);
    registerExtraTranslations(translations);
  }, [language, getPluginTranslations, registerExtraTranslations]);

  return null;
}

// Main App component with providers
function App() {
  return (
    <NavigationProvider>
      <LanguageProvider>
        <SettingsProvider>
          <ThemeProvider>
          <LanguageSyncBridge />
          <PluginProvider>
            <PluginI18nBridge />
            <AlertProvider>
              <ConfirmDialogProvider>
                <AppContent />
                <AlertContainer />
              </ConfirmDialogProvider>
            </AlertProvider>
          </PluginProvider>
          </ThemeProvider>
        </SettingsProvider>
      </LanguageProvider>
    </NavigationProvider>
  );
}

export default App;
