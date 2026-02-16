import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ViewType } from '../types/dashboard';

// Navigation parameters for different views
export interface NavigationParams {
  settings?: {
    tab?: 'general' | 'chart' | 'vessel' | 'units' | 'downloads' | 'alerts' | 'plugins' | 'clients' | 'advanced';
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

function getInitialView(): { view: ActiveView; params: NavigationParams } {
  const chartOnly = localStorage.getItem('bigaos-chart-only') === '1';

  // Restore last view from localStorage
  const savedView = localStorage.getItem('bigaos-active-view') as ActiveView | null;
  const savedParamsRaw = localStorage.getItem('bigaos-nav-params');
  let savedParams: NavigationParams = {};
  if (savedParamsRaw) {
    try { savedParams = JSON.parse(savedParamsRaw); } catch { /* ignore */ }
  }

  if (savedView) {
    // In chart-only mode, dashboard becomes chart; other views are kept
    if (chartOnly && savedView === 'dashboard') {
      return { view: 'chart', params: {} };
    }
    return { view: savedView, params: savedParams };
  }

  // No saved view — default to chart (if chart-only) or dashboard
  return { view: chartOnly ? 'chart' : 'dashboard', params: {} };
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const initial = getInitialView();
  const [activeView, setActiveView] = useState<ActiveView>(initial.view);
  const [navigationParams, setNavigationParams] = useState<NavigationParams>(initial.params);

  const navigate = useCallback((view: ActiveView, params?: NavigationParams) => {
    setActiveView(view);
    setNavigationParams(params || {});
    localStorage.setItem('bigaos-active-view', view);
    if (params && Object.keys(params).length > 0) {
      localStorage.setItem('bigaos-nav-params', JSON.stringify(params));
    } else {
      localStorage.removeItem('bigaos-nav-params');
    }
  }, []);

  const goBack = useCallback(() => {
    setActiveView('dashboard');
    setNavigationParams({});
    localStorage.setItem('bigaos-active-view', 'dashboard');
    localStorage.removeItem('bigaos-nav-params');
  }, []);

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
