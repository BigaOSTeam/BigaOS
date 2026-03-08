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
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
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
      {/* Scrollable content area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        {children}
      </div>
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
          fontSize: 'clamp(3rem, 12vw, 6rem)',
          fontWeight: 'bold',
          color: color || theme.colors.textPrimary,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 'clamp(1rem, 4vw, 1.5rem)',
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
              fontSize: 'clamp(0.7rem, 2vw, 0.9rem)',
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {stat.label}
          </div>
          <div
            style={{
              fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
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
          fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
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
              fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
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
  title?: string;
  timeframeOptions?: { key: string; label: string }[];
  selectedTimeframe?: string;
  onTimeframeSelect?: (key: string) => void;
  children: React.ReactNode;
}

/**
 * Container for time series charts with loading state and timeframe sidebar
 */
export const ChartContainer: React.FC<ChartContainerProps> = ({
  isLoading,
  hasData,
  title,
  timeframeOptions,
  selectedTimeframe,
  onTimeframeSelect,
  children,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
    <div
      style={{
        flex: '1 1 auto',
        padding: '0.5rem',
        minHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '0.5rem',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', gap: '0.5rem', minHeight: 0 }}>
        {/* Chart area */}
        <div
          style={{
            flex: 1,
            background: theme.colors.bgCard,
            borderRadius: '8px',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
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
                zIndex: 1,
              }}
            >
              {t('common.loading_history')}
            </div>
          )}
          {children}
        </div>
        {/* Timeframe sidebar */}
        {timeframeOptions && onTimeframeSelect && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              flexShrink: 0,
            }}
          >
            {timeframeOptions.map((option) => (
              <button
                key={option.key}
                onClick={() => selectedTimeframe !== option.key && onTimeframeSelect(option.key)}
                className="touch-btn"
                style={{
                  flex: 1,
                  padding: '0.5rem 1.25rem',
                  background:
                    selectedTimeframe === option.key
                      ? theme.colors.primaryMedium
                      : theme.colors.bgCard,
                  border:
                    selectedTimeframe === option.key
                      ? `1px solid ${theme.colors.primarySolid}`
                      : `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: 'clamp(1rem, 3vw, 1.25rem)',
                  fontWeight: selectedTimeframe === option.key ? 'bold' : 'normal',
                  minWidth: '3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
