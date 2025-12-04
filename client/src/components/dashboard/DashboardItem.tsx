import React, { useRef, useCallback } from 'react';
import { ViewType } from '../../types/dashboard';

interface DashboardItemProps {
  children: React.ReactNode;
  targetView: ViewType;
  onNavigate: (view: ViewType) => void;
  editMode?: boolean;
  onDelete?: () => void;
  onLongPress?: () => void;
}

const LONG_PRESS_DURATION = 500; // ms

export const DashboardItem: React.FC<DashboardItemProps> = ({
  children,
  targetView,
  onNavigate,
  editMode = false,
  onDelete,
  onLongPress,
}) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handlePressStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (onLongPress) {
        onLongPress();
      }
    }, LONG_PRESS_DURATION);
  }, [onLongPress]);

  const handlePressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = () => {
    if (editMode || isLongPress.current) {
      return;
    }
    onNavigate(targetView);
  };

  const handleDeleteMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleDeleteClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      style={{
        width: '100%',
        height: '100%',
        background: editMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        border: editMode ? '2px dashed rgba(25, 118, 210, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
        cursor: editMode ? 'move' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border 0.2s ease, background 0.2s ease',
        position: 'relative',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: editMode ? 'none' : 'auto',
      }}
      onMouseEnter={(e) => {
        if (!editMode) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (!editMode) {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }
        handlePressEnd();
      }}
    >
      {/* Content */}
      <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}>
        {children}
      </div>

      {/* Delete Button (only in edit mode) */}
      {editMode && onDelete && (
        <button
          onMouseDown={handleDeleteMouseDown}
          onTouchStart={handleDeleteMouseDown}
          onClick={handleDeleteClick}
          onTouchEnd={handleDeleteClick}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(239, 83, 80, 1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            transition: 'all 0.15s',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(244, 67, 54, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 83, 80, 1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Delete widget"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
    </div>
  );
};
