import React from 'react';
import { ViewType } from '../../types/dashboard';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

interface DashboardItemProps {
  children: React.ReactNode;
  targetView: ViewType;
  onNavigate: (view: ViewType) => void;
  editMode?: boolean;
  onDelete?: () => void;
}

export const DashboardItem: React.FC<DashboardItemProps> = ({
  children,
  targetView,
  onNavigate,
  editMode = false,
  onDelete,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const handleClick = () => {
    if (editMode) {
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
      className={editMode ? '' : 'touch-btn'}
      style={{
        width: '100%',
        height: '100%',
        background: editMode ? theme.colors.bgCardHover : theme.colors.bgCard,
        backdropFilter: 'blur(10px)',
        borderRadius: theme.radius.md,
        border: editMode
          ? `2px dashed ${theme.colors.primaryMedium}`
          : `1px solid ${theme.colors.border}`,
        cursor: editMode ? 'move' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: `border ${theme.transition.normal}, background ${theme.transition.normal}`,
        position: 'relative',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: editMode ? 'none' : 'auto',
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
          className="touch-btn"
          style={{
            position: 'absolute',
            top: theme.space.sm,
            right: theme.space.sm,
            width: '36px',
            height: '36px',
            borderRadius: theme.radius.sm,
            background: theme.colors.errorSolid,
            border: `2px solid ${theme.colors.borderFocus}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: theme.zIndex.tooltip,
            boxShadow: theme.shadow.md,
          }}
          title={t('dashboard.delete_widget')}
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
