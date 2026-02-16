import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { SensorData } from '../../types';
import {
  DashboardItemConfig,
  DashboardItemType,
  DEFAULT_DASHBOARD_ITEMS,
  ViewType,
} from '../../types/dashboard';
import { DashboardItem } from './DashboardItem';
import {
  SpeedItem,
  HeadingItem,
  DepthItem,
  WindItem,
  PositionItem,
  BatteryItem,
  COGItem,
  ChartMiniItem,
  WeatherForecastItem,
} from './items';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

const LAYOUT_STORAGE_KEY = 'bigaos-dashboard-layout';
const GRID_CONFIG_KEY = 'bigaos-grid-config';
const DEFAULT_GRID_COLS = 6;
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
  'position': { label: 'Position', targetView: 'position', defaultSize: { w: 1, h: 1 } },
  'battery': { label: 'Battery', targetView: 'battery', defaultSize: { w: 1, h: 1 } },
  'cog': { label: 'COG', targetView: 'cog', defaultSize: { w: 1, h: 1 } },
  'chart-mini': { label: 'Chart', targetView: 'chart', defaultSize: { w: 2, h: 2 } },
  'weather-forecast': { label: 'Weather', targetView: 'weather', defaultSize: { w: 2, h: 1 } },
};

// Migrate old items to use new targetView values
const migrateItems = (items: DashboardItemConfig[]): DashboardItemConfig[] => {
  return items.map(item => {
    // Update targetView to match the item type (each widget gets its own view now)
    const config = ITEM_TYPE_CONFIG[item.type];
    if (config && item.targetView !== config.targetView) {
      return { ...item, targetView: config.targetView };
    }
    return item;
  });
};

export const Dashboard: React.FC<DashboardProps> = ({ sensorData, onNavigate }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const getItemTypeLabel = (type: DashboardItemType): string => {
    const labelKeys: Record<DashboardItemType, string> = {
      'speed': 'dashboard.speed',
      'heading': 'dashboard.heading',
      'depth': 'dashboard.depth',
      'wind': 'dashboard.wind',
      'position': 'dashboard.position',
      'battery': 'dashboard.battery',
      'cog': 'dashboard.cog',
      'chart-mini': 'dashboard.chart',
      'weather-forecast': 'dashboard.weather',
    };
    return t(labelKeys[type]);
  };

  const [items, setItems] = useState<DashboardItemConfig[]>(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const migrated = migrateItems(parsed);
        // Save migrated items back to localStorage
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

  // Save grid config and clear items when grid size changes
  const handleGridColsChange = useCallback((newCols: number) => {
    setGridCols(newCols);
    setItems([]);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify({ cols: newCols, rows: gridRows }));
  }, [gridRows]);

  const handleGridRowsChange = useCallback((newRows: number) => {
    setGridRows(newRows);
    setItems([]);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify({ cols: gridCols, rows: newRows }));
  }, [gridCols]);

  // Pull-down menu with settings and edit icons
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showColsPicker, setShowColsPicker] = useState(false);
  const [showRowsPicker, setShowRowsPicker] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const isValidPullStart = useRef(false);
  const TOP_ZONE = 60; // Only start pull if touch begins in top 60px
  const PULL_THRESHOLD = 80; // Distance needed to open menu
  const MENU_HEIGHT = 140; // Height of open menu

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (editMode) return;
    // Don't close menu if a picker is open
    if (showColsPicker || showRowsPicker) return;

    const startY = e.touches[0].clientY;

    // If menu is open, check if touch is outside menu to close it
    if (menuOpen) {
      if (startY > MENU_HEIGHT) {
        setMenuOpen(false);
        setPullDistance(0);
      }
      return;
    }

    // Only allow pull-down if starting from top zone
    if (startY <= TOP_ZONE) {
      touchStartY.current = startY;
      isValidPullStart.current = true;
      setIsPulling(true);
    } else {
      isValidPullStart.current = false;
    }
  }, [editMode, menuOpen, showColsPicker, showRowsPicker]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (menuOpen || !isValidPullStart.current || touchStartY.current === null) return;

    const currentY = e.touches[0].clientY;
    const delta = Math.max(0, currentY - touchStartY.current);
    // Apply resistance - pull slows down as it gets further
    const resistedDelta = Math.min(MENU_HEIGHT, delta * 0.7);
    setPullDistance(resistedDelta);
  }, [menuOpen]);

  const handleTouchEnd = useCallback(() => {
    if (menuOpen || !isValidPullStart.current) {
      return;
    }

    // Use functional update to get current pullDistance value
    setPullDistance(currentPullDistance => {
      if (currentPullDistance >= PULL_THRESHOLD) {
        // Open the menu
        setMenuOpen(true);
        return MENU_HEIGHT;
      } else {
        // Snap back
        return 0;
      }
    });

    setIsPulling(false);
    touchStartY.current = null;
    isValidPullStart.current = false;
  }, [menuOpen]);

  const handleSettingsClick = useCallback(() => {
    setMenuOpen(false);
    setPullDistance(0);
    onNavigate('settings');
  }, [onNavigate]);

  const handleEditClick = useCallback(() => {
    setMenuOpen(false);
    setPullDistance(0);
    setEditMode(true);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const margin = 2;
  // Account for containerPadding (margin on all sides) and gaps between items
  const rowHeight = Math.floor((containerSize.height - margin * 2 - margin * (gridRows - 1)) / gridRows);
  const gridWidth = containerSize.width;

  const findNextAvailablePosition = useCallback((w: number, h: number): { x: number; y: number } | null => {
    const grid: boolean[][] = Array(gridRows).fill(null).map(() => Array(gridCols).fill(false));

    items.forEach((item) => {
      for (let row = item.layout.y; row < item.layout.y + item.layout.h && row < gridRows; row++) {
        for (let col = item.layout.x; col < item.layout.x + item.layout.w && col < gridCols; col++) {
          if (row >= 0 && col >= 0) {
            grid[row][col] = true;
          }
        }
      }
    });

    for (let y = 0; y <= gridRows - h; y++) {
      for (let x = 0; x <= gridCols - w; x++) {
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
  }, [items, gridRows, gridCols]);

  // Check if there's space to add a new item
  const hasSpaceForNewItem = useMemo(() => {
    return findNextAvailablePosition(1, 1) !== null;
  }, [findNextAvailablePosition]);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    // Enforce bounds - prevent items from going below the grid
    const boundedLayout = newLayout.map(layoutItem => {
      let { x, y, w, h } = layoutItem;

      // Clamp x position
      if (x < 0) x = 0;
      if (x + w > gridCols) x = gridCols - w;

      // Clamp y position - prevent going below grid
      if (y < 0) y = 0;
      if (y + h > gridRows) y = gridRows - h;

      // Clamp size if item would exceed bounds
      if (w > gridCols) w = gridCols;
      if (h > gridRows) h = gridRows;

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
  }, [items, gridCols, gridRows]);

  const handleDeleteItem = useCallback((id: string) => {
    setItems(prevItems => {
      const updatedItems = prevItems.filter((item) => item.id !== id);
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedItems));
      return updatedItems;
    });
  }, []);

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
    setShowAddMenu(false);
  };

  const handleExitEditMode = useCallback(() => {
    setEditMode(false);
    setShowAddMenu(false);
  }, []);

  // Handle Escape key to toggle/close settings menu
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
        } else if (menuOpen) {
          // Close menu
          setMenuOpen(false);
          setPullDistance(0);
        } else {
          // Open menu
          setMenuOpen(true);
          setPullDistance(MENU_HEIGHT);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, showColsPicker, showRowsPicker, showAddMenu, editMode, handleExitEditMode]);

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
      case 'position':
        return <PositionItem position={sensorData.navigation.position} />;
      case 'battery':
        return (
          <BatteryItem
            voltage={sensorData.electrical.battery.voltage}
            stateOfCharge={sensorData.electrical.battery.stateOfCharge}
          />
        );
      case 'cog':
        return <COGItem cog={sensorData.navigation.courseOverGround} />;
      case 'chart-mini':
        return (
          <ChartMiniItem
            position={sensorData.navigation.position}
            heading={sensorData.navigation.heading}
            speed={sensorData.navigation.speedOverGround}
            depth={sensorData.environment.depth.belowTransducer}
          />
        );
      case 'weather-forecast':
        return (
          <WeatherForecastItem
            latitude={sensorData.navigation.position.latitude}
            longitude={sensorData.navigation.position.longitude}
          />
        );
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
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>HDG</div>
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round" />
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
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#66bb6a" strokeWidth="1.5" style={iconStyle}>
              <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
              <line x1="23" y1="10" x2="23" y2="14" />
              <rect x="3" y="8" width="10" height="8" fill="#66bb6a" opacity="0.3" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '-4px' }}>85%</div>
          </div>
        );
      case 'cog':
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', lineHeight: 1 }}>125°</div>
            <div style={{ fontSize: '0.6rem', opacity: 0.5 }}>COG</div>
          </div>
        );
      case 'chart-mini':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
        );
      case 'weather-forecast':
        return (
          <div style={{ textAlign: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4FC3F7" strokeWidth="1.5" style={iconStyle}>
              <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontSize: '0.6rem', opacity: 0.5, marginTop: '2px' }}>15kt</div>
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
      maxH: gridRows,
    }));
  }, [items, editMode, gridRows]);

  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Pull-down menu */}
      {(isPulling || menuOpen || pullDistance > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${pullDistance}px`,
            background: `linear-gradient(to bottom, ${theme.colors.bgSecondary}, ${theme.colors.bgTertiary})`,
            borderBottom: menuOpen ? `1px solid ${theme.colors.border}` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: theme.zIndex.modal,
            transition: isPulling ? 'none' : `height ${theme.transition.slow}`,
          }}
        >
          {/* Center group: Grid + Edit */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Grid size dropdowns */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.space.sm,
                opacity: pullProgress,
                transform: `scale(${0.5 + pullProgress * 0.5})`,
                transition: isPulling ? 'none' : `all ${theme.transition.slow}`,
                padding: theme.space.md,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.space.xs }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColsPicker(true);
                    setShowRowsPicker(false);
                  }}
                  style={{
                    background: theme.colors.warningLight,
                    border: 'none',
                    borderRadius: theme.radius.lg,
                    color: theme.colors.textPrimary,
                    padding: '16px 24px',
                    fontSize: theme.fontSize.xl,
                    fontWeight: theme.fontWeight.bold,
                    cursor: 'pointer',
                    minWidth: '70px',
                    textAlign: 'center',
                  }}
                >
                  {gridCols}
                </button>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>{t('dashboard.width')}</span>
              </div>
              <span style={{ fontSize: theme.fontSize.xl, color: theme.colors.textSecondary, fontWeight: theme.fontWeight.bold, marginBottom: '20px' }}>×</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.space.xs }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRowsPicker(true);
                    setShowColsPicker(false);
                  }}
                  style={{
                    background: theme.colors.warningLight,
                    border: 'none',
                    borderRadius: theme.radius.lg,
                    color: theme.colors.textPrimary,
                    padding: '16px 24px',
                    fontSize: theme.fontSize.xl,
                    fontWeight: theme.fontWeight.bold,
                    cursor: 'pointer',
                    minWidth: '70px',
                    textAlign: 'center',
                  }}
                >
                  {gridRows}
                </button>
                <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>{t('dashboard.height')}</span>
              </div>
            </div>

            {/* Edit button */}
            <button
              onClick={handleEditClick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: theme.space.sm,
                background: 'transparent',
                border: 'none',
                cursor: menuOpen ? 'pointer' : 'default',
                opacity: pullProgress,
                transform: `scale(${0.5 + pullProgress * 0.5})`,
                transition: isPulling ? 'none' : `all ${theme.transition.slow}`,
                padding: theme.space.md,
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: theme.radius.lg,
                  background: theme.colors.successLight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={theme.colors.textPrimary}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>{t('common.edit')}</span>
            </button>
          </div>

          {/* Settings button - positioned on right */}
          <button
            onClick={handleSettingsClick}
            style={{
              position: 'absolute',
              right: theme.space.xl,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: theme.space.sm,
              background: 'transparent',
              border: 'none',
              cursor: menuOpen ? 'pointer' : 'default',
              opacity: pullProgress,
              transform: `scale(${0.5 + pullProgress * 0.5})`,
              transition: isPulling ? 'none' : `all ${theme.transition.slow}`,
              padding: theme.space.md,
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: theme.radius.lg,
                background: theme.colors.primaryLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.textPrimary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <span style={{ fontSize: theme.fontSize.sm, color: theme.colors.textSecondary }}>Settings</span>
          </button>
        </div>
      )}

      {/* Grid overlay for visualization when menu is open */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: theme.zIndex.base,
          }}
        >
          {/* Container padding - edges */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: margin, background: theme.colors.primary, opacity: 0.7 }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: margin, background: theme.colors.primary, opacity: 0.7 }} />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: margin, background: theme.colors.primary, opacity: 0.7 }} />
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: margin, background: theme.colors.primary, opacity: 0.7 }} />

          {/* Vertical gaps between columns */}
          {Array.from({ length: gridCols - 1 }, (_, i) => {
            const availableWidth = gridWidth - margin * 2 - margin * (gridCols - 1);
            const colWidth = availableWidth / gridCols;
            // Gap starts after column i: margin + (i+1)*colWidth + i*margin
            const x = margin + (i + 1) * colWidth + i * margin;
            return (
              <div
                key={`vgap-${i}`}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: margin,
                  bottom: margin,
                  width: `${margin}px`,
                  background: theme.colors.primary,
                  opacity: 0.7,
                }}
              />
            );
          })}

          {/* Horizontal gaps between rows */}
          {Array.from({ length: gridRows - 1 }, (_, i) => {
            // Gap starts after row i: margin + (i+1)*rowHeight + i*margin
            const y = margin + (i + 1) * rowHeight + i * margin;
            return (
              <div
                key={`hgap-${i}`}
                style={{
                  position: 'absolute',
                  top: `${y}px`,
                  left: margin,
                  right: margin,
                  height: `${margin}px`,
                  background: theme.colors.primary,
                  opacity: 0.7,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Grid */}
      <GridLayout
        className="layout"
        layout={layout}
        cols={gridCols}
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
        maxRows={gridRows}
        resizeHandles={['se', 'sw', 'ne', 'nw']}
        onResize={(_layout, _oldItem, newItem, _placeholder) => {
          // Prevent resize beyond grid bounds
          if (newItem.y + newItem.h > gridRows) {
            newItem.h = gridRows - newItem.y;
          }
          if (newItem.x + newItem.w > gridCols) {
            newItem.w = gridCols - newItem.x;
          }
        }}
        onDrag={(_layout, _oldItem, newItem) => {
          // Prevent drag beyond grid bounds
          if (newItem.y + newItem.h > gridRows) {
            newItem.y = gridRows - newItem.h;
          }
          if (newItem.x + newItem.w > gridCols) {
            newItem.x = gridCols - newItem.w;
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

      {/* Add Item Menu - Grid of miniature items */}
      {showAddMenu && hasSpaceForNewItem && (
        <>
          {/* Backdrop to close menu */}
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
              gridTemplateColumns: 'repeat(4, 1fr)',
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
                    transform: 'scale(0.85)',
                    transformOrigin: 'center center',
                  }}>
                    {renderMiniPreview(type)}
                  </div>
                  <div style={{
                    fontSize: theme.fontSize.md,
                    color: theme.colors.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: theme.fontWeight.medium,
                    marginTop: '4px',
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

      {/* Edit Mode Indicator & Buttons */}
      {editMode && (
        <div
          style={{
            position: 'absolute',
            bottom: theme.space.xl,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {/* Add button */}
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            disabled={!hasSpaceForNewItem}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: theme.space.sm,
              background: 'transparent',
              border: 'none',
              cursor: hasSpaceForNewItem ? 'pointer' : 'not-allowed',
              opacity: hasSpaceForNewItem ? 1 : 0.5,
              padding: theme.space.md,
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: theme.radius.lg,
                background: hasSpaceForNewItem ? 'rgba(255, 167, 38, 0.9)' : 'rgba(100, 100, 100, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textPrimary} strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </button>
          {/* Done button */}
          <button
            onClick={handleExitEditMode}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: theme.space.sm,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: theme.space.md,
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: theme.radius.lg,
                background: 'rgba(102, 187, 106, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textPrimary} strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
