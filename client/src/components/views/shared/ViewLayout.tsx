import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';

interface ViewLayoutProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Common layout wrapper for detail views with header
 */
export const ViewLayout: React.FC<ViewLayoutProps> = ({
  title,
  onClose,
  children,
}) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: theme.colors.bgPrimary,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <button
          onClick={onClose}
          className="touch-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.colors.textPrimary,
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
            borderRadius: theme.radius.md,
          }}
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
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
};

interface MainValueDisplayProps {
  value: string | number;
  unit: string;
  color?: string;
}

/**
 * Large centered value display for detail views
 */
export const MainValueDisplay: React.FC<MainValueDisplayProps> = ({
  value,
  unit,
  color,
}) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        flex: '0 0 auto',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '6rem',
          fontWeight: 'bold',
          color: color || theme.colors.textPrimary,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '1.5rem',
          opacity: 0.6,
          marginTop: '0.5rem',
        }}
      >
        {unit}
      </div>
    </div>
  );
};

interface StatItem {
  label: string;
  value: string | number;
  color: string;
}

interface StatsRowProps {
  stats: StatItem[];
}

/**
 * Row of statistics (avg, max, min, etc.)
 */
export const StatsRow: React.FC<StatsRowProps> = ({ stats }) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '1rem',
        borderTop: `1px solid ${theme.colors.border}`,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {stats.map((stat, index) => (
        <div key={index} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '0.75rem',
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {stat.label}
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: stat.color,
            }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
};

interface TimeframeOption {
  key: string;
  label: string;
}

interface TimeframeSelectorProps {
  options: TimeframeOption[];
  selected: string;
  onSelect: (key: string) => void;
  title?: string;
}

/**
 * Timeframe selector buttons for history charts
 */
export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  options,
  selected,
  onSelect,
  title = 'History',
}) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {options.map((option) => (
          <button
            key={option.key}
            onClick={() => onSelect(option.key)}
            className="s-option-btn"
            style={{
              padding: '0.25rem 0.5rem',
              background:
                selected === option.key
                  ? theme.colors.primaryMedium
                  : theme.colors.bgCardActive,
              border:
                selected === option.key
                  ? `1px solid ${theme.colors.primarySolid}`
                  : '1px solid transparent',
              borderRadius: '4px',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: selected === option.key ? 'bold' : 'normal',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface ChartContainerProps {
  isLoading: boolean;
  hasData: boolean;
  children: React.ReactNode;
}

/**
 * Container for time series charts with loading state
 */
export const ChartContainer: React.FC<ChartContainerProps> = ({
  isLoading,
  hasData,
  children,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
    <div
      style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          background: theme.colors.bgCard,
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {isLoading && !hasData && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.5,
              fontSize: '0.9rem',
            }}
          >
            {t('common.loading_history')}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
