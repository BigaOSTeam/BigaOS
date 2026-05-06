import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { ViewType } from '../types/dashboard';
import { useClientSettings, useClientSetting } from './ClientSettingsContext';

// Navigation parameters for different views
export interface NavigationParams {
  settings?: {
    tab?: 'general' | 'chart' | 'vessel' | 'units' | 'downloads' | 'alerts' | 'switches' | 'buttons' | 'tanks' | 'plugins' | 'clients' | 'display' | 'advanced';
  };
  tank?: {
    tankId?: string;
  };
  help?: {
    slug?: string;
  };
}

type ActiveView = 'dashboard' | ViewType;

interface NavigationContextType {
  activeView: ActiveView;
  navigationParams: NavigationParams;
  navigate: (view: ActiveView, params?: NavigationParams) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const { settings, loaded } = useClientSettings();
  const [, setActiveViewSetting] = useClientSetting<ActiveView | undefined>('activeView', undefined);
  const [, setNavParamsSetting] = useClientSetting<NavigationParams | undefined>(
    'navigationParams',
    undefined
  );

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [navigationParams, setNavigationParams] = useState<NavigationParams>({});

  // Once client settings load from the server, restore the last active view.
  // In chart-only kiosk mode, dashboard collapses into chart.
  const restoredRef = React.useRef(false);
  useEffect(() => {
    if (!loaded || restoredRef.current) return;
    restoredRef.current = true;
    const chartOnly = !!settings.chartOnly;
    const savedView = settings.activeView as ActiveView | undefined;
    const savedParams = (settings.navigationParams as NavigationParams | undefined) || {};
    if (savedView) {
      setActiveView(chartOnly && savedView === 'dashboard' ? 'chart' : savedView);
      setNavigationParams(savedParams);
    } else if (chartOnly) {
      setActiveView('chart');
    }
  }, [loaded, settings]);

  const navigate = useCallback(
    (view: ActiveView, params?: NavigationParams) => {
      setActiveView(view);
      setNavigationParams(params || {});
      setActiveViewSetting(view);
      setNavParamsSetting(params && Object.keys(params).length > 0 ? params : undefined);
    },
    [setActiveViewSetting, setNavParamsSetting]
  );

  const goBack = useCallback(() => {
    setActiveView('dashboard');
    setNavigationParams({});
    setActiveViewSetting('dashboard');
    setNavParamsSetting(undefined);
  }, [setActiveViewSetting, setNavParamsSetting]);

  return (
    <NavigationContext.Provider value={{ activeView, navigationParams, navigate, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
