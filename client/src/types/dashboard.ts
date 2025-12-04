import { Layout } from 'react-grid-layout';

export type ViewType = 'chart' | 'wind' | 'engine' | 'electrical' | 'anchor' | 'depth' | 'settings';

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
  | 'cog'
  | 'chart-mini'
  | 'settings';

export interface DashboardLayout {
  items: DashboardItemConfig[];
  cols: number;
  rowHeight: number;
}

// 12 columns x 6 rows grid
export const DEFAULT_DASHBOARD_ITEMS: DashboardItemConfig[] = [
  { id: 'speed', type: 'speed', targetView: 'chart', layout: { i: 'speed', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'heading', type: 'heading', targetView: 'chart', layout: { i: 'heading', x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'depth', type: 'depth', targetView: 'depth', layout: { i: 'depth', x: 4, y: 0, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'wind', type: 'wind', targetView: 'wind', layout: { i: 'wind', x: 0, y: 2, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'cog', type: 'cog', targetView: 'chart', layout: { i: 'cog', x: 2, y: 2, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'position', type: 'position', targetView: 'chart', layout: { i: 'position', x: 4, y: 2, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'battery', type: 'battery', targetView: 'electrical', layout: { i: 'battery', x: 0, y: 4, w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'chart-mini', type: 'chart-mini', targetView: 'chart', layout: { i: 'chart-mini', x: 6, y: 0, w: 6, h: 4, minW: 2, minH: 2 } },
];
