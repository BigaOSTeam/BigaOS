/**
 * ChartControlContext - imperative handles to the chart view.
 *
 * The Leaflet map instance and follow-GPS state are owned by ChartView.
 * This context lets non-chart code (UiActionListener, future hot-keys, ...)
 * trigger the same actions the user can perform with on-screen buttons.
 *
 * ChartView calls `register({...})` on mount and `register(null)` on unmount.
 * If no chart is currently mounted, the action methods are no-ops.
 */

import React, { createContext, useContext, useRef, useCallback, ReactNode } from 'react';

export interface ChartHandle {
  recenter: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface ChartControlContextType {
  register: (handle: ChartHandle | null) => void;
  recenter: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const ChartControlContext = createContext<ChartControlContextType | null>(null);

export const ChartControlProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const handleRef = useRef<ChartHandle | null>(null);

  const register = useCallback((handle: ChartHandle | null) => {
    handleRef.current = handle;
  }, []);

  const recenter = useCallback(() => {
    handleRef.current?.recenter();
  }, []);
  const zoomIn = useCallback(() => {
    handleRef.current?.zoomIn();
  }, []);
  const zoomOut = useCallback(() => {
    handleRef.current?.zoomOut();
  }, []);

  return (
    <ChartControlContext.Provider value={{ register, recenter, zoomIn, zoomOut }}>
      {children}
    </ChartControlContext.Provider>
  );
};

export const useChartControl = (): ChartControlContextType => {
  const context = useContext(ChartControlContext);
  if (!context) {
    throw new Error('useChartControl must be used within a ChartControlProvider');
  }
  return context;
};
