import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ViewType } from '../types/dashboard';

// Navigation parameters for different views
export interface NavigationParams {
  settings?: {
    tab?: 'general' | 'vessel' | 'units' | 'downloads' | 'offline-maps' | 'advanced';
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
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [navigationParams, setNavigationParams] = useState<NavigationParams>({});

  const navigate = useCallback((view: ActiveView, params?: NavigationParams) => {
    setActiveView(view);
    setNavigationParams(params || {});
  }, []);

  const goBack = useCallback(() => {
    setActiveView('dashboard');
    setNavigationParams({});
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
