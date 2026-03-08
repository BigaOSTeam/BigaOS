import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { DashboardSidebarPosition, ViewType } from '../../types/dashboard';

interface DashboardSidebarProps {
  sidebarPosition: DashboardSidebarPosition;
  sidebarWidth: number;
  onNavigate: (view: ViewType) => void;
  onEditMode: () => void;
  editMode: boolean;
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  sidebarPosition,
  sidebarWidth,
  onNavigate,
  onEditMode,
  editMode,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isHorizontal = sidebarPosition === 'top' || sidebarPosition === 'bottom';

  const borderSide = (() => {
    switch (sidebarPosition) {
      case 'left': return 'borderRight';
      case 'right': return 'borderLeft';
      case 'top': return 'borderBottom';
      case 'bottom': return 'borderTop';
    }
  })();

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    [sidebarPosition]: 0,
    ...(isHorizontal
      ? { left: 0, right: 0, height: `${sidebarWidth}px` }
      : { top: 0, bottom: 0, width: `${sidebarWidth}px` }),
    [borderSide]: `1px solid ${theme.colors.border}`,
    background: theme.colors.bgTertiary,
    zIndex: 1000,
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    alignItems: 'center',
    padding: isHorizontal ? `0 ${theme.space.md}` : `${theme.space.md} 0`,
  };

  const btnSize = Math.min(sidebarWidth - 16, 48);
  const iconSize = Math.round(btnSize * 0.5);

  const buttonStyle: React.CSSProperties = {
    width: `${btnSize}px`,
    height: `${btnSize}px`,
    borderRadius: theme.radius.md,
    border: 'none',
    background: 'transparent',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: `background ${theme.transition.fast}`,
  };

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: theme.colors.primaryLight,
    color: theme.colors.primary,
  };

  return (
    <div style={containerStyle}>
      {/* Chart button - top/left */}
      <button
        onClick={() => onNavigate('chart')}
        style={buttonStyle}
        title={t('dashboard.chart')}
        className="chart-sidebar-btn"
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Edit button - above settings */}
      <button
        onClick={onEditMode}
        style={editMode ? activeButtonStyle : buttonStyle}
        title={t('common.edit')}
        className="chart-sidebar-btn"
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {/* Settings button - bottom/right */}
      <button
        onClick={() => onNavigate('settings')}
        style={buttonStyle}
        title={t('common.settings')}
        className="chart-sidebar-btn"
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
};
