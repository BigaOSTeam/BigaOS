import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { SensorData } from '../../types';
import {
  DashboardItemConfig,
  DashboardItemType,
  DashboardSidebarPosition,
  DEFAULT_DASHBOARD_ITEMS,
  ViewType,
} from '../../types/dashboard';
import { DashboardItem } from './DashboardItem';
import {
  SpeedItem,
  HeadingItem,
  DepthItem,
  WindItem,
  WindRoseItem,
  PositionItem,
  BatteryItem,
  BatteryDrawItem,
  WeatherForecastItem,
  WaveForecastItem,
  PressureForecastItem,
  GustForecastItem,
  SeaTempForecastItem,
  TempForecastItem,
  RollItem,
  PitchItem,
} from './items';
import { DashboardSidebar } from './DashboardSidebar';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useClient } from '../../context/ClientContext';
import { wsService } from '../../services/websocket';

const LAYOUT_STORAGE_KEY = 'bigaos-dashboard-layout';
const GRID_CONFIG_KEY = 'bigaos-grid-config';
const SIDEBAR_POSITION_KEY = 'bigaos-dashboard-sidebar-position';
const IS_REMOTE_CLIENT = typeof window !== 'undefined' && localStorage.getItem('bigaos-client-type') === 'remote';
const DEFAULT_GRID_COLS = IS_REMOTE_CLIENT ? 2 : 6;
const DEFAULT_GRID_ROWS = 3;

interface DashboardProps {
  sensorData: SensorData;
  onNavigate: (view: ViewType) => void;
}

const ITEM_TYPE_CONFIG: Record<DashboardItemType, { label: string; targetView: ViewType; defaultSize: { w: number; h: number } }> = {
  'speed': { label: 'Speed', targetView: 'speed', defaultSize: { w: 1, h: 1 } },
  'heading': { label: 'Heading', targetView: 'heading', defaultSize: { w: 1, h: 1 } },
  'depth': { label: 'Depth', targetView: 'depth', defaultSize: { w: 1, h: 1 } },
  'wind': { label: 'Wind', targetView: 'wind', defaultSize: { w: 1, h: 1 } },
  'wind-rose': { label: 'Wind Rose', targetView: 'wind', defaultSize: { w: 1, h: 1 } },
  'position': { label: 'Position', targetView: 'position', defaultSize: { w: 1, h: 1 } },
  'battery': { label: 'Battery', targetView: 'battery', defaultSize: { w: 1, h: 1 } },
  'battery-draw': { label: 'Battery Draw', targetView: 'battery', defaultSize: { w: 1, h: 1 } },
  'weather-forecast': { label: 'Weather', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'wave-forecast': { label: 'Waves', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'gust-forecast': { label: 'Gusts', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'pressure-forecast': { label: 'Pressure', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'sea-temp-forecast': { label: 'Sea Temp', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'temp-forecast': { label: 'Air Temp', targetView: 'weather', defaultSize: { w: 1, h: 1 } },
  'roll': { label: 'Roll', targetView: 'roll', defaultSize: { w: 1, h: 1 } },
  'pitch': { label: 'Pitch', targetView: 'pitch', defaultSize: { w: 1, h: 1 } },
};

// Migrate old items to use new targetView values
const migrateItems = (items: DashboardItemConfig[]): DashboardItemConfig[] => {
  return items
    .filter(item => item.type in ITEM_TYPE_CONFIG)
    .map(item => {
      const config = ITEM_TYPE_CONFIG[item.type];
      if (config && item.targetView !== config.targetView) {
        return { ...item, targetView: config.targetView };
      }
      return item;
    });
};

export const Dashboard: React.FC<DashboardProps> = ({ sensorData, onNavigate }) => {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const { clientId } = useClient();

  // Dashboard sidebar position - independent from chart sidebar, saved per client
  const [sidebarPosition, setSidebarPosition] = useState<DashboardSidebarPosition>(() => {
    const saved = localStorage.getItem(SIDEBAR_POSITION_KEY);
    if (saved && ['left', 'right', 'top', 'bottom'].includes(saved)) {
      return saved as DashboardSidebarPosition;
    }
    return 'left';
  });

  const getItemTypeLabel = (type: DashboardItemType): string => {
    const labelKeys: Record<DashboardItemType, string> = {
      'speed': 'dashboard.speed',
      'heading': 'dashboard.heading',
      'depth': 'dashboard.depth',
      'wind': 'dashboard.wind',
      'wind-rose': 'dashboard.wind_rose',
      'position': 'dashboard.position',
      'battery': 'dashboard.battery',
      'battery-draw': 'dashboard.battery_draw',
      'weather-forecast': 'dashboard.weather_wind',
      'wave-forecast': 'dashboard.weather_waves',
      'gust-forecast': 'dashboard.weather_gusts',
      'pressure-forecast': 'dashboard.weather_pressure',
      'sea-temp-forecast': 'dashboard.weather_sea_temp',
      'temp-forecast': 'dashboard.weather_air_temp',
      'roll': 'dashboard.roll',
      'pitch': 'dashboard.pitch',
    };
    return t(labelKeys[type]);
  };

  const [items, setItems] = useState<DashboardItemConfig[]>(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = migrateItems(parsed);
        if (JSON.stringify(parsed) !== JSON.stringify(migrated)) {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(migrated));
        }
        return migrated;
      } catch {
        return DEFAULT_DASHBOARD_ITEMS;
      }
    }
    return DEFAULT_DASHBOARD_ITEMS;
  });

  const [editMode, setEditMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showColsPicker, setShowColsPicker] = useState(false);
  const [showRowsPicker, setShowRowsPicker] = useState(false);

  // Grid configuration state
  const [gridCols, setGridCols] = useState(() => {
    const saved = localStorage.getItem(GRID_CONFIG_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        return config.cols || DEFAULT_GRID_COLS;
      } catch {
        return DEFAULT_GRID_COLS;
      }
    }
    return DEFAULT_GRID_COLS;
  });

  const [gridRows, setGridRows] = useState(() => {
    const saved = localStorage.getItem(GRID_CONFIG_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        return config.rows || DEFAULT_GRID_ROWS;
      } catch {
        return DEFAULT_GRID_ROWS;
      }
    }
    return DEFAULT_GRID_ROWS;
  });

  // Sync layout and grid config to server for cross-device persistence
  const syncLayoutToServer = useCallback((layout: DashboardItemConfig[], gridConfig: { cols: number; rows: number }) => {
    wsService.emit('client_settings_update', { clientId, key: 'dashboardLayout', value: layout });
    wsService.emit('client_settings_update', { clientId, key: 'dashboardGridConfig', value: gridConfig });
  }, [clientId]);

  const handleSidebarPositionChange = useCallback((position: DashboardSidebarPosition) => {
    setSidebarPosition(position);
    localStorage.setItem(SIDEBAR_POSITION_KEY, position);
    wsService.emit('client_settings_update', { clientId, key: 'dashboardSidebarPosition', value: position });
  }, [clientId]);

  // Listen for layout changes from server (e.g. when switching to existing client)
  useEffect(() => {
    const handleDashboardChanged = () => {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
      const savedGrid = localStorage.getItem(GRID_CONFIG_KEY);
      const savedSidebarPos = localStorage.getItem(SIDEBAR_POSITION_KEY);
      if (savedLayout) {
        try { setItems(migrateItems(JSON.parse(savedLayout))); } catch {}
      }
      if (savedGrid) {
        try {
          const config = JSON.parse(savedGrid);
          if (config.cols) setGridCols(config.cols);
          if (config.rows) setGridRows(config.rows);
        } catch {}
      }
      if (savedSidebarPos && ['left', 'right', 'top', 'bottom'].includes(savedSidebarPos)) {
        setSidebarPosition(savedSidebarPos as DashboardSidebarPosition);
      }
    };
    window.addEventListener('bigaos-dashboard-changed', handleDashboardChanged);
    return () => window.removeEventListener('bigaos-dashboard-changed', handleDashboardChanged);
  }, []);

  // Save grid config and clear items when grid size changes
  const handleGridColsChange = useCallback((newCols: number) => {
    setGridCols(newCols);
    setItems([]);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify({ cols: newCols, rows: gridRows }));
    syncLayoutToServer([], { cols: newCols, rows: gridRows });
  }, [gridRows, syncLayoutToServer]);

  const handleGridRowsChange = useCallback((newRows: number) => {
    setGridRows(newRows);
    setItems([]);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify({ cols: gridCols, rows: newRows }));
    syncLayoutToServer([], { cols: gridCols, rows: newRows });
  }, [gridCols, syncLayoutToServer]);

  useEffect(() => {
    const handleResize = () => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sidebar sizing
  const isMobile = containerSize.width <= 600;
  const sidebarSize = isMobile ? 56 : 100;
  const isHorizontal = sidebarPosition === 'top' || sidebarPosition === 'bottom';

  // On mobile, swap cols/rows when orientation changes
  // Portrait (tall): use saved config as-is. Landscape (wide): swap cols<->rows.
  const isLandscape = isMobile && containerSize.width > containerSize.height;
  const savedPortrait = gridCols <= gridRows; // User configured in portrait orientation
  const shouldSwap = isMobile && (isLandscape ? savedPortrait : !savedPortrait);
  const effectiveCols = shouldSwap ? gridRows : gridCols;
  const effectiveRows = shouldSwap ? gridCols : gridRows;

  // Grid area calculations accounting for sidebar
  const margin = 2;
  const availableWidth = isHorizontal ? containerSize.width : containerSize.width - sidebarSize;
  const availableHeight = isHorizontal ? containerSize.height - sidebarSize : containerSize.height;
  const rowHeight = Math.floor((availableHeight - margin * 2 - margin * (effectiveRows - 1)) / effectiveRows);
  const gridWidth = availableWidth;

  const findNextAvailablePosition = useCallback((w: number, h: number): { x: number; y: number } | null => {
    const grid: boolean[][] = Array(effectiveRows).fill(null).map(() => Array(effectiveCols).fill(false));

    items.forEach((item) => {
      for (let row = item.layout.y; row < item.layout.y + item.layout.h && row < effectiveRows; row++) {
        for (let col = item.layout.x; col < item.layout.x + item.layout.w && col < effectiveCols; col++) {
          if (row >= 0 && col >= 0) {
            grid[row][col] = true;
          }
        }
      }
    });

    for (let y = 0; y <= effectiveRows - h; y++) {
      for (let x = 0; x <= effectiveCols - w; x++) {
        let fits = true;
        for (let row = y; row < y + h && fits; row++) {
          for (let col = x; col < x + w && fits; col++) {
            if (grid[row][col]) {
              fits = false;
            }
          }
        }
        if (fits) {
          return { x, y };
        }
      }
    }
    return null;
  }, [items, effectiveRows, effectiveCols]);

  const hasSpaceForNewItem = useMemo(() => {
    return findNextAvailablePosition(1, 1) !== null;
  }, [findNextAvailablePosition]);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    const boundedLayout = newLayout.map(layoutItem => {
      let { x, y, w, h } = layoutItem;
      if (x < 0) x = 0;
      if (x + w > effectiveCols) x = effectiveCols - w;
      if (y < 0) y = 0;
      if (y + h > effectiveRows) y = effectiveRows - h;
      if (w > effectiveCols) w = effectiveCols;
      if (h > effectiveRows) h = effectiveRows;
      return { ...layoutItem, x, y, w, h };
    });

    const updatedItems = items.map((item) => {
      const layoutItem = boundedLayout.find((l) => l.i === item.id);
      if (layoutItem) {
        return { ...item, layout: layoutItem };
      }
      return item;
    });
    setItems(updatedItems);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedItems));
    syncLayoutToServer(updatedItems, { cols: gridCols, rows: gridRows });
  }, [items, gridCols, gridRows, syncLayoutToServer]);

  const handleDeleteItem = useCallback((id: string) => {
    setItems(prevItems => {
      const updatedItems = prevItems.filter((item) => item.id !== id);
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedItems));
      syncLayoutToServer(updatedItems, { cols: gridCols, rows: gridRows });
      return updatedItems;
    });
  }, [gridCols, gridRows, syncLayoutToServer]);

  const handleAddItem = (type: DashboardItemType) => {
    const config = ITEM_TYPE_CONFIG[type];
    const position = findNextAvailablePosition(config.defaultSize.w, config.defaultSize.h);

    if (!position) {
      setShowAddMenu(false);
      return;
    }

    const newId = `${type}-${Date.now()}`;
    const newItem: DashboardItemConfig = {
      id: newId,
      type,
      targetView: config.targetView,
      layout: {
        i: newId,
        x: position.x,
        y: position.y,
        w: config.defaultSize.w,
        h: config.defaultSize.h,
        minW: 1,
        minH: 1,
      },
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedItems));
    syncLayoutToServer(updatedItems, { cols: gridCols, rows: gridRows });
    setShowAddMenu(false);
  };

  const handleExitEditMode = useCallback(() => {
    setEditMode(false);
    setShowAddMenu(false);
    setShowColsPicker(false);
    setShowRowsPicker(false);
  }, []);

  const handleToggleEditMode = useCallback(() => {
    if (editMode) {
      handleExitEditMode();
    } else {
      setEditMode(true);
    }
  }, [editMode, handleExitEditMode]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColsPicker) {
          setShowColsPicker(false);
        } else if (showRowsPicker) {
          setShowRowsPicker(false);
        } else if (showAddMenu) {
          setShowAddMenu(false);
        } else if (editMode) {
          handleExitEditMode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showColsPicker, showRowsPicker, showAddMenu, editMode, handleExitEditMode]);

  const renderItemContent = (item: DashboardItemConfig) => {
    switch (item.type) {
      case 'speed':
        return <SpeedItem speed={sensorData.navigation.speedOverGround} />;
      case 'heading':
        return <HeadingItem heading={sensorData.navigation.heading} />;
      case 'depth':
        return <DepthItem depth={sensorData.environment.depth.belowTransducer} />;
      case 'wind':
        return (
          <WindItem
            speedApparent={sensorData.environment.wind.speedApparent}
            angleApparent={sensorData.environment.wind.angleApparent}
          />
        );
      case 'wind-rose':
        return (
          <WindRoseItem
            speedApparent={sensorData.environment.wind.speedApparent}
            angleApparent={sensorData.environment.wind.angleApparent}
            angleTrue={sensorData.environment.wind.angleTrue}
          />
        );
      case 'position':
        return <PositionItem position={sensorData.navigation.position} />;
      case 'battery':
        return (
          <BatteryItem
            voltage={sensorData.electrical.battery.voltage}
            temperature={sensorData.electrical.battery.temperature}
            stateOfCharge={sensorData.electrical.battery.stateOfCharge}
            timeRemaining={sensorData.electrical.battery.timeRemaining}
          />
        );
      case 'battery-draw':
        return (
          <BatteryDrawItem
            current={sensorData.electrical.battery.current}
            power={sensorData.electrical.battery.power}
            temperature={sensorData.electrical.battery.temperature}
            timeRemaining={sensorData.electrical.battery.timeRemaining}
          />
        );
      case 'weather-forecast':
        return (
          <WeatherForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'wave-forecast':
        return (
          <WaveForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'gust-forecast':
        return (
          <GustForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'pressure-forecast':
        return (
          <PressureForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'sea-temp-forecast':
        return (
          <SeaTempForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'temp-forecast':
        return (
          <TempForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
      case 'roll':
        return <RollItem roll={sensorData.navigation.attitude.roll} />;
      case 'pitch':
        return <PitchItem pitch={sensorData.navigation.attitude.pitch} />;
      default:
        return null;
    }
  };

  // Render mini preview icons for add menu
  const renderMiniPreview = (type: DashboardItemType) => {
    const iconStyle = { opacity: 0.8 };
    switch (type) {
      case 'speed':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1 }}>5.2</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>kt</div>
          </div>
        );
      case 'heading':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1 }}>247°</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>{t('dashboard_item.hdg')}</div>
          </div>
        );
      case 'depth':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#4fc3f7' }}>8.3</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>m</div>
          </div>
        );
      case 'wind':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#ffa726' }}>12.5</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>kt AWA</div>
          </div>
        );
      case 'wind-rose':
        return (
          <svg width="50" height="50" viewBox="0 0 350 350" style={iconStyle}>
            <circle cx="175" cy="175" r="165" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.3" />
            <path d="M175 140 L165 180 L175 175 L185 180 Z" fill="currentColor" opacity="0.3" />
            <line x1="175" y1="175" x2="175" y2="30" stroke="#ffa726" strokeWidth="10" strokeLinecap="round" />
            <polygon points="175,18 160,52 190,52" fill="#ffa726" />
            <line x1="175" y1="175" x2="175" y2="60" stroke="#4fc3f7" strokeWidth="6" strokeDasharray="12 6" strokeLinecap="round" />
          </svg>
        );
      case 'position':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        );
      case 'battery':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="32" height="40" viewBox="0 0 80 90" fill="none" style={iconStyle}>
              <rect x="20" y="12" width="14" height="8" rx="3" fill="#66bb6a" opacity="0.6" />
              <rect x="46" y="12" width="14" height="8" rx="3" fill="#66bb6a" opacity="0.6" />
              <rect x="6" y="18" width="68" height="62" rx="5" stroke="#66bb6a" strokeWidth="3" fill="none" />
              <rect x="10" y="32" width="60" height="44" rx="3" fill="#66bb6a" opacity="0.3" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '-2px' }}>85%</div>
          </div>
        );
      case 'battery-draw':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#4fc3f7' }}>-4.2A</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>560W</div>
          </div>
        );
      case 'weather-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffa726" strokeWidth="1.5" style={iconStyle}>
              <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>15kt</div>
          </div>
        );
      case 'wave-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="30" viewBox="0 0 24 18" fill="none" stroke="#4FC3F7" strokeWidth="1.5" style={iconStyle}>
              <path d="M2 8c2-3 4-4 6-4s4 3 6 0 4-4 6-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 14c2-3 4-4 6-4s4 3 6 0 4-4 6-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>1.2m</div>
          </div>
        );
      case 'gust-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#FF9800' }}>18</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>kt</div>
          </div>
        );
      case 'pressure-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', lineHeight: 1 }}>1013</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>hPa</div>
          </div>
        );
      case 'sea-temp-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#4FC3F7' }}>18.5°</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>Sea</div>
          </div>
        );
      case 'temp-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1, color: '#FFB74D' }}>22.3°</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>Air</div>
          </div>
        );
      case 'roll':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="30" viewBox="0 0 100 40" style={iconStyle}>
              <path d="M10 35 Q50 0 90 35" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <line x1="50" y1="35" x2="62" y2="12" stroke="#81C784" strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="35" r="3" fill="#81C784" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '-2px' }}>3.2°</div>
          </div>
        );
      case 'pitch':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="30" viewBox="0 0 100 40" style={iconStyle}>
              <line x1="10" y1="20" x2="90" y2="20" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <line x1="25" y1="24" x2="75" y2="16" stroke="#81C784" strokeWidth="3" strokeLinecap="round" />
              <circle cx="50" cy="20" r="3" fill="#81C784" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '-2px' }}>1.5°</div>
          </div>
        );
      default:
        return null;
    }
  };

  // Build layout for grid items
  const layout: Layout[] = useMemo(() => {
    return items.map((item) => ({
      ...item.layout,
      isDraggable: editMode,
      isResizable: editMode,
      minW: 1,
      minH: 1,
      maxH: effectiveRows,
    }));
  }, [items, editMode, effectiveRows]);

  // Compute grid container offset based on sidebar position
  const gridContainerStyle: React.CSSProperties = {
    position: 'absolute',
    ...(sidebarPosition === 'left' && { left: sidebarSize, top: 0, right: 0, bottom: 0 }),
    ...(sidebarPosition === 'right' && { left: 0, top: 0, right: sidebarSize, bottom: 0 }),
    ...(sidebarPosition === 'top' && { left: 0, top: sidebarSize, right: 0, bottom: 0 }),
    ...(sidebarPosition === 'bottom' && { left: 0, top: 0, right: 0, bottom: sidebarSize }),
    overflow: 'hidden',
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Fixed Sidebar */}
      <DashboardSidebar
        sidebarPosition={sidebarPosition}
        sidebarWidth={sidebarSize}
        onNavigate={onNavigate}
        onEditMode={handleToggleEditMode}
        editMode={editMode}
      />

      {/* Grid Container */}
      <div style={gridContainerStyle}>
        <GridLayout
          className="layout"
          layout={layout}
          cols={effectiveCols}
          rowHeight={rowHeight}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}
          isDraggable={editMode}
          isResizable={editMode}
          isBounded={true}
          compactType={null}
          preventCollision={true}
          margin={[margin, margin]}
          containerPadding={[margin, margin]}
          useCSSTransforms={true}
          maxRows={effectiveRows}
          style={{ minHeight: availableHeight }}
          resizeHandles={['se', 'sw', 'ne', 'nw']}
          onResize={(_layout, _oldItem, newItem, _placeholder) => {
            if (newItem.y + newItem.h > effectiveRows) {
              newItem.h = effectiveRows - newItem.y;
            }
            if (newItem.x + newItem.w > effectiveCols) {
              newItem.w = effectiveCols - newItem.x;
            }
          }}
          onDrag={(_layout, _oldItem, newItem) => {
            if (newItem.y + newItem.h > effectiveRows) {
              newItem.y = effectiveRows - newItem.h;
            }
            if (newItem.x + newItem.w > effectiveCols) {
              newItem.x = effectiveCols - newItem.w;
            }
          }}
        >
          {items.map((item) => (
            <div key={item.id}>
              <DashboardItem
                targetView={item.targetView}
                onNavigate={onNavigate}
                editMode={editMode}
                onDelete={() => handleDeleteItem(item.id)}
              >
                {renderItemContent(item)}
              </DashboardItem>
            </div>
          ))}
        </GridLayout>

        {/* Edit Mode Toolbar */}
        {editMode && (
          <div
            style={{
              position: 'absolute',
              bottom: theme.space.xl,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '6px' : '12px',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.lg,
              padding: isMobile ? `${theme.space.xs} ${theme.space.sm}` : `${theme.space.sm} ${theme.space.md}`,
              boxShadow: theme.shadow.lg,
              zIndex: 100,
              maxWidth: 'calc(100vw - 16px)',
            }}
          >
            {/* Add button */}
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              disabled={!hasSpaceForNewItem}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '36px' : '48px',
                height: isMobile ? '36px' : '48px',
                borderRadius: theme.radius.md,
                background: hasSpaceForNewItem ? 'rgba(255, 167, 38, 0.9)' : 'rgba(100, 100, 100, 0.5)',
                border: 'none',
                cursor: hasSpaceForNewItem ? 'pointer' : 'not-allowed',
                opacity: hasSpaceForNewItem ? 1 : 0.5,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textPrimary} strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* Grid size: Cols button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowColsPicker(true);
                setShowRowsPicker(false);
              }}
              style={{
                background: theme.colors.warningLight,
                border: 'none',
                borderRadius: theme.radius.md,
                color: theme.colors.textPrimary,
                padding: isMobile ? '0 8px' : '0 16px',
                height: isMobile ? '36px' : '48px',
                fontSize: isMobile ? theme.fontSize.md : theme.fontSize.lg,
                fontWeight: theme.fontWeight.bold,
                cursor: 'pointer',
                minWidth: isMobile ? '36px' : '50px',
                textAlign: 'center',
              }}
            >
              {gridCols}
            </button>
            <span style={{ fontSize: isMobile ? theme.fontSize.md : theme.fontSize.lg, color: theme.colors.textSecondary, fontWeight: theme.fontWeight.bold }}>×</span>
            {/* Grid size: Rows button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowRowsPicker(true);
                setShowColsPicker(false);
              }}
              style={{
                background: theme.colors.warningLight,
                border: 'none',
                borderRadius: theme.radius.md,
                color: theme.colors.textPrimary,
                padding: isMobile ? '0 8px' : '0 16px',
                height: isMobile ? '36px' : '48px',
                fontSize: isMobile ? theme.fontSize.md : theme.fontSize.lg,
                fontWeight: theme.fontWeight.bold,
                cursor: 'pointer',
                minWidth: isMobile ? '36px' : '50px',
                textAlign: 'center',
              }}
            >
              {gridRows}
            </button>

            {/* Sidebar position cycle button */}
            <button
              onClick={() => {
                const positions: DashboardSidebarPosition[] = ['left', 'right', 'top', 'bottom'];
                const idx = positions.indexOf(sidebarPosition);
                handleSidebarPositionChange(positions[(idx + 1) % positions.length]);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '36px' : '48px',
                height: isMobile ? '36px' : '48px',
                borderRadius: theme.radius.md,
                background: theme.colors.primaryLight,
                border: 'none',
                cursor: 'pointer',
                color: theme.colors.textPrimary,
              }}
              title={t('settings.sidebar_position')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sidebarPosition === 'left' && (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </>
                )}
                {sidebarPosition === 'right' && (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </>
                )}
                {sidebarPosition === 'top' && (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                  </>
                )}
                {sidebarPosition === 'bottom' && (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                  </>
                )}
              </svg>
            </button>

            {/* Done button */}
            <button
              onClick={handleExitEditMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '36px' : '48px',
                height: isMobile ? '36px' : '48px',
                borderRadius: theme.radius.md,
                background: 'rgba(102, 187, 106, 0.9)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textPrimary} strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Add Item Menu */}
      {showAddMenu && hasSpaceForNewItem && (
        <>
          <div
            onClick={() => setShowAddMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998,
              background: theme.colors.bgOverlay,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: theme.zIndex.modal,
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.borderHover}`,
              borderRadius: theme.radius.lg,
              padding: '24px',
              boxShadow: theme.shadow.lg,
              width: '90vw',
              maxWidth: '500px',
              maxHeight: '85vh',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <div style={{
              fontSize: theme.fontSize.lg,
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              {t('dashboard.add_widget')}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              width: '100%',
            }}>
              {(Object.keys(ITEM_TYPE_CONFIG) as DashboardItemType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleAddItem(type)}
                  className="touch-btn"
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    minWidth: '90px',
                    minHeight: '90px',
                    background: theme.colors.bgCard,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.md,
                    color: theme.colors.textPrimary,
                    cursor: 'pointer',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: isMobile ? 'scale(0.9)' : 'scale(1.1)',
                    transformOrigin: 'center center',
                  }}>
                    {renderMiniPreview(type)}
                  </div>
                  <div
                    lang={language}
                    style={{
                      fontSize: theme.fontSize.sm,
                      color: theme.colors.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: theme.fontWeight.medium,
                      marginTop: '4px',
                      textAlign: 'center',
                      overflowWrap: 'break-word',
                      lineHeight: 1.2,
                      width: '100%',
                      hyphens: 'auto',
                    }}>
                    {getItemTypeLabel(type)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Grid Columns Picker */}
      {showColsPicker && (
        <>
          <div
            onClick={() => setShowColsPicker(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: theme.colors.bgOverlay,
              zIndex: theme.zIndex.modal,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.borderHover}`,
              borderRadius: theme.radius.lg,
              padding: '24px',
              zIndex: theme.zIndex.modal + 1,
              maxHeight: '90vh',
              maxWidth: '95vw',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: theme.fontSize.lg, color: theme.colors.textMuted, textAlign: 'center', marginBottom: '20px' }}>
              {t('dashboard.select_columns')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '10px' }}>
              {Array.from({ length: 32 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    handleGridColsChange(n);
                    setShowColsPicker(false);
                  }}
                  style={{
                    width: '60px',
                    height: '60px',
                    background: n === gridCols ? theme.colors.warning : theme.colors.bgCard,
                    border: n === gridCols ? `2px solid ${theme.colors.warning}` : `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.md,
                    color: theme.colors.textPrimary,
                    fontSize: theme.fontSize.xl,
                    fontWeight: n === gridCols ? theme.fontWeight.bold : theme.fontWeight.normal,
                    cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Grid Rows Picker */}
      {showRowsPicker && (
        <>
          <div
            onClick={() => setShowRowsPicker(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: theme.colors.bgOverlay,
              zIndex: theme.zIndex.modal,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: theme.colors.bgSecondary,
              border: `1px solid ${theme.colors.borderHover}`,
              borderRadius: theme.radius.lg,
              padding: '24px',
              zIndex: theme.zIndex.modal + 1,
              maxHeight: '90vh',
              maxWidth: '95vw',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: theme.fontSize.lg, color: theme.colors.textMuted, textAlign: 'center', marginBottom: '20px' }}>
              {t('dashboard.select_rows')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '10px' }}>
              {Array.from({ length: 32 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    handleGridRowsChange(n);
                    setShowRowsPicker(false);
                  }}
                  style={{
                    width: '60px',
                    height: '60px',
                    background: n === gridRows ? theme.colors.warning : theme.colors.bgCard,
                    border: n === gridRows ? `2px solid ${theme.colors.warning}` : `1px solid ${theme.colors.border}`,
                    borderRadius: theme.radius.md,
                    color: theme.colors.textPrimary,
                    fontSize: theme.fontSize.xl,
                    fontWeight: n === gridRows ? theme.fontWeight.bold : theme.fontWeight.normal,
                    cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
