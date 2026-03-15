import { Layout } from 'react-grid-layout';

export type DashboardSidebarPosition = 'left' | 'right' | 'top' | 'bottom';

export type ViewType = 'chart' | 'wind' | 'engine' | 'electrical' | 'anchor' | 'depth' | 'settings' | 'speed' | 'heading' | 'position' | 'battery' | 'weather';

export interface DashboardItemConfig {
  id: string;
  type: DashboardItemType;
  targetView: ViewType;
  layout: Layout;
}

export type DashboardItemType =
  | 'speed'
  | 'heading'
  | 'depth'
  | 'wind'
  | 'position'
  | 'battery'
  | 'battery-draw'
  | 'weather-forecast';

export interface DashboardLayout {
  items: DashboardItemConfig[];
  cols: number;
  rowHeight: number;
}

// 6 columns x 3 rows grid
export const DEFAULT_DASHBOARD_ITEMS: DashboardItemConfig[] = [
  { id: 'speed', type: 'speed', targetView: 'speed', layout: { i: 'speed', x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 } },
  { id: 'heading', type: 'heading', targetView: 'heading', layout: { i: 'heading', x: 1, y: 0, w: 1, h: 1, minW: 1, minH: 1 } },
  { id: 'depth', type: 'depth', targetView: 'depth', layout: { i: 'depth', x: 2, y: 0, w: 1, h: 1, minW: 1, minH: 1 } },
  { id: 'wind', type: 'wind', targetView: 'wind', layout: { i: 'wind', x: 0, y: 1, w: 1, h: 1, minW: 1, minH: 1 } },
  { id: 'position', type: 'position', targetView: 'position', layout: { i: 'position', x: 2, y: 1, w: 1, h: 1, minW: 1, minH: 1 } },
  { id: 'battery', type: 'battery', targetView: 'battery', layout: { i: 'battery', x: 0, y: 2, w: 1, h: 1, minW: 1, minH: 1 } },
];
