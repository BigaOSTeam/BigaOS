import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  SettingsItem,
} from './items';

const LAYOUT_STORAGE_KEY = 'bigaos-dashboard-layout';
const GRID_COLS = 12;
const GRID_ROWS = 6;
const ADD_ITEM_ID = '__add_item__';

interface DashboardProps {
  sensorData: SensorData;
  onNavigate: (view: ViewType) => void;
}

const ITEM_TYPE_CONFIG: Record<DashboardItemType, { label: string; targetView: ViewType; defaultSize: { w: number; h: number } }> = {
  'speed': { label: 'Speed', targetView: 'chart', defaultSize: { w: 2, h: 2 } },
  'heading': { label: 'Heading', targetView: 'chart', defaultSize: { w: 2, h: 2 } },
  'depth': { label: 'Depth', targetView: 'depth', defaultSize: { w: 2, h: 2 } },
  'wind': { label: 'Wind', targetView: 'wind', defaultSize: { w: 2, h: 2 } },
  'position': { label: 'Position', targetView: 'chart', defaultSize: { w: 2, h: 2 } },
  'battery': { label: 'Battery', targetView: 'electrical', defaultSize: { w: 2, h: 2 } },
  'cog': { label: 'COG', targetView: 'chart', defaultSize: { w: 2, h: 2 } },
  'chart-mini': { label: 'Chart', targetView: 'chart', defaultSize: { w: 4, h: 4 } },
  'settings': { label: 'Settings', targetView: 'settings', defaultSize: { w: 2, h: 2 } },
};

export const Dashboard: React.FC<DashboardProps> = ({ sensorData, onNavigate }) => {
  const [items, setItems] = useState<DashboardItemConfig[]>(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_DASHBOARD_ITEMS;
      }
    }
    return DEFAULT_DASHBOARD_ITEMS;
  });

  const [editMode, setEditMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setContainerSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const margin = 8;
  const rowHeight = Math.floor((containerSize.height - margin * (GRID_ROWS + 1)) / GRID_ROWS);
  const gridWidth = containerSize.width - margin * 2;

  const findNextAvailablePosition = useCallback((w: number, h: number): { x: number; y: number } | null => {
    const grid: boolean[][] = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(false));

    items.forEach((item) => {
      for (let row = item.layout.y; row < item.layout.y + item.layout.h && row < GRID_ROWS; row++) {
        for (let col = item.layout.x; col < item.layout.x + item.layout.w && col < GRID_COLS; col++) {
          if (row >= 0 && col >= 0) {
            grid[row][col] = true;
          }
        }
      }
    });

    for (let y = 0; y <= GRID_ROWS - h; y++) {
      for (let x = 0; x <= GRID_COLS - w; x++) {
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
  }, [items]);

  // Calculate add item position (use 2x2 to find available space)
  const addItemPosition = useMemo(() => {
    return findNextAvailablePosition(2, 2);
  }, [findNextAvailablePosition]);

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    // Filter out the add item from layout changes
    const filteredLayout = newLayout.filter(l => l.i !== ADD_ITEM_ID);

    // Enforce bounds - prevent items from going below the grid
    const boundedLayout = filteredLayout.map(layoutItem => {
      let { x, y, w, h } = layoutItem;

      // Clamp x position
      if (x < 0) x = 0;
      if (x + w > GRID_COLS) x = GRID_COLS - w;

      // Clamp y position - prevent going below grid
      if (y < 0) y = 0;
      if (y + h > GRID_ROWS) y = GRID_ROWS - h;

      // Clamp size if item would exceed bounds
      if (w > GRID_COLS) w = GRID_COLS;
      if (h > GRID_ROWS) h = GRID_ROWS;

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
  }, [items]);

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
        minW: 2,
        minH: 2,
      },
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(updatedItems));
    setShowAddMenu(false);
  };

  const handleLongPress = useCallback(() => {
    setEditMode(true);
  }, []);

  const handleExitEditMode = useCallback(() => {
    setEditMode(false);
    setShowAddMenu(false);
  }, []);

  const renderItemContent = (item: DashboardItemConfig) => {
    switch (item.type) {
      case 'speed':
        return <SpeedItem speed={sensorData.navigation.speedOverGround} />;
      case 'heading':
        return <HeadingItem heading={sensorData.navigation.headingMagnetic} />;
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
            heading={sensorData.navigation.headingMagnetic}
          />
        );
      case 'settings':
        return <SettingsItem />;
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
      case 'settings':
        return (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Build layout including the add item if there's space
  const layout: Layout[] = useMemo(() => {
    const itemLayouts = items.map((item) => ({
      ...item.layout,
      isDraggable: editMode,
      isResizable: editMode,
      minW: 2,
      minH: 2,
      maxH: GRID_ROWS,
    }));

    // Add the "+" item if in edit mode and there's space
    if (editMode && addItemPosition) {
      itemLayouts.push({
        i: ADD_ITEM_ID,
        x: addItemPosition.x,
        y: addItemPosition.y,
        w: 2,
        h: 2,
        minW: 2,
        minH: 2,
        maxH: GRID_ROWS,
        isDraggable: false,
        isResizable: false,
      });
    }

    return itemLayouts;
  }, [items, editMode, addItemPosition]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Grid */}
      <div style={{ padding: `${margin}px` }}>
        <GridLayout
          className="layout"
          layout={layout}
          cols={GRID_COLS}
          rowHeight={rowHeight}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}
          isDraggable={editMode}
          isResizable={editMode}
          isBounded={true}
          compactType={null}
          preventCollision={true}
          margin={[margin, margin]}
          containerPadding={[0, 0]}
          useCSSTransforms={true}
          maxRows={GRID_ROWS}
          resizeHandles={['se', 'sw', 'ne', 'nw']}
          onResize={(_layout, _oldItem, newItem, _placeholder) => {
            // Prevent resize beyond grid bounds
            if (newItem.y + newItem.h > GRID_ROWS) {
              newItem.h = GRID_ROWS - newItem.y;
            }
            if (newItem.x + newItem.w > GRID_COLS) {
              newItem.w = GRID_COLS - newItem.x;
            }
          }}
          onDrag={(_layout, _oldItem, newItem) => {
            // Prevent drag beyond grid bounds
            if (newItem.y + newItem.h > GRID_ROWS) {
              newItem.y = GRID_ROWS - newItem.h;
            }
            if (newItem.x + newItem.w > GRID_COLS) {
              newItem.x = GRID_COLS - newItem.w;
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
                onLongPress={handleLongPress}
              >
                {renderItemContent(item)}
              </DashboardItem>
            </div>
          ))}

          {/* Add Item Button - only in edit mode */}
          {editMode && addItemPosition && (
            <div key={ADD_ITEM_ID}>
              <div
                onClick={() => setShowAddMenu(!showAddMenu)}
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '12px',
                  border: '2px dashed rgba(255, 255, 255, 0.15)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
            </div>
          )}
        </GridLayout>
      </div>

      {/* Add Item Menu - Grid of miniature items */}
      {showAddMenu && addItemPosition && (
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
              background: 'rgba(0, 0, 0, 0.5)',
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              background: 'rgba(10, 25, 41, 0.98)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{
              fontSize: '0.75rem',
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '12px',
              textAlign: 'center',
            }}>
              Add Widget
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 100px)',
              gap: '10px',
            }}>
              {(Object.keys(ITEM_TYPE_CONFIG) as DashboardItemType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => handleAddItem(type)}
                  style={{
                    width: '100px',
                    height: '100px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <div style={{
                    width: '100%',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'scale(0.5)',
                    transformOrigin: 'center center',
                  }}>
                    {renderMiniPreview(type)}
                  </div>
                  <div style={{
                    fontSize: '0.65rem',
                    opacity: 0.7,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: '4px',
                  }}>
                    {ITEM_TYPE_CONFIG[type].label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Edit Mode Indicator & Done Button */}
      {editMode && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              background: 'rgba(25, 118, 210, 0.9)',
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '0.875rem',
              color: '#fff',
            }}
          >
            Edit Mode
          </div>
          <button
            onClick={handleExitEditMode}
            style={{
              background: 'rgba(102, 187, 106, 0.9)',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '0.875rem',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Done
          </button>
        </div>
      )}
    </div>
  );
};
