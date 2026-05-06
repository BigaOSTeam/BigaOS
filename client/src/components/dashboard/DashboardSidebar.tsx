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
  const isMobile = sidebarWidth <= 60;
  const hideLabels = isMobile;

  const borderSide = (() => {
    switch (sidebarPosition) {
      case 'left': return 'borderRight';
      case 'right': return 'borderLeft';
      case 'top': return 'borderBottom';
      case 'bottom': return 'borderTop';
    }
  })();

  const separator = `1px solid ${theme.colors.border}`;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    [sidebarPosition]: 0,
    ...(isHorizontal
      ? { left: 0, right: 0, height: `${sidebarWidth}px` }
      : { top: 0, bottom: 0, width: `${sidebarWidth}px` }),
    [borderSide]: separator,
    background: theme.colors.bgTertiary,
    zIndex: 1000,
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    ...(isHorizontal ? { justifyContent: 'center' } : {}),
    overflow: 'hidden auto',
  };

  return (
    <div style={containerStyle}>
      {/* Chart button */}
      <button
        onClick={() => onNavigate('chart')}
        className="chart-sidebar-btn with-label"
        style={{
          ...(isHorizontal
            ? { borderRight: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderBottom: separator }),
        }}
        title={t('dashboard.chart')}
      >
        <svg
          width="24"
          height="24"
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
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('dashboard.chart')}</span>}
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Instruments button */}
      <button
        onClick={() => onNavigate('instruments')}
        className="chart-sidebar-btn with-label"
        style={{
          ...(isHorizontal
            ? { borderLeft: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderTop: separator }),
        }}
        title={t('instruments.title')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('instruments.title')}</span>}
      </button>

      {/* Switches button */}
      <button
        onClick={() => onNavigate('switches')}
        className="chart-sidebar-btn with-label"
        style={{
          ...(isHorizontal
            ? { borderLeft: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderTop: separator }),
        }}
        title={t('switches.title')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="1" y="5" width="22" height="14" rx="7" />
          <circle cx="16" cy="12" r="4" />
        </svg>
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('switches.title')}</span>}
      </button>

      {/* Edit button */}
      <button
        onClick={onEditMode}
        className={`chart-sidebar-btn with-label ${editMode ? 'active' : ''}`}
        style={{
          ...(isHorizontal
            ? { borderLeft: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderTop: separator }),
        }}
        title={t('common.edit')}
      >
        <svg
          width="24"
          height="24"
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
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('common.edit')}</span>}
      </button>

      {/* Help button */}
      <button
        onClick={() => onNavigate('help')}
        className="chart-sidebar-btn with-label"
        style={{
          ...(isHorizontal
            ? { borderLeft: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderTop: separator }),
        }}
        title={t('help.title')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('help.title')}</span>}
      </button>

      {/* Settings button */}
      <button
        onClick={() => onNavigate('settings')}
        className="chart-sidebar-btn with-label"
        style={{
          ...(isHorizontal
            ? { borderLeft: separator, width: `${sidebarWidth}px`, height: '100%' }
            : { borderTop: separator }),
        }}
        title={t('common.settings')}
      >
        <svg
          width="24"
          height="24"
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
        {!hideLabels && <span style={{ opacity: 0.7 }}>{t('common.settings')}</span>}
      </button>
    </div>
  );
};
