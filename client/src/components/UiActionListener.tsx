/**
 * UiActionListener - routes 'ui_action' WebSocket events to the local UI.
 *
 * The server emits these when a button's action targets a browser client.
 * Mount this once below the Navigation/Chart/Client providers.
 */

import { useEffect } from 'react';
import { wsService } from '../services/websocket';
import { useNavigation } from '../context/NavigationContext';
import { useChartControl } from '../context/ChartControlContext';
import type { UiAction } from '../types/buttons';
import type { ViewType } from '../types/dashboard';

const ALLOWED_TABS = new Set([
  'general', 'chart', 'vessel', 'units', 'downloads', 'alerts',
  'switches', 'buttons', 'tanks', 'plugins', 'clients', 'display', 'advanced',
]);

export const UiActionListener: React.FC = () => {
  const { navigate } = useNavigation();
  const chartControl = useChartControl();

  useEffect(() => {
    const handler = (data: { action: UiAction }) => {
      const action = data?.action;
      if (!action || typeof action.type !== 'string') return;

      switch (action.type) {
        case 'chart_recenter':
          chartControl.recenter();
          return;
        case 'chart_zoom_in':
          chartControl.zoomIn();
          return;
        case 'chart_zoom_out':
          chartControl.zoomOut();
          return;
        case 'navigate':
          if (action.view) {
            navigate(action.view as ViewType);
          }
          return;
        case 'settings_tab':
          if (action.tab && ALLOWED_TABS.has(action.tab)) {
            navigate('settings', { settings: { tab: action.tab as any } });
          }
          return;
      }
    };

    wsService.on('ui_action', handler);
    return () => {
      wsService.off('ui_action', handler);
    };
  }, [navigate, chartControl]);

  return null;
};
