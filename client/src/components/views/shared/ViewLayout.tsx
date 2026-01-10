import React from 'react';

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
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0a1929',
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
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
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
  color = '#fff',
}) => {
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
          color,
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
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
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
            style={{
              padding: '0.25rem 0.5rem',
              background:
                selected === option.key
                  ? 'rgba(25, 118, 210, 0.5)'
                  : 'rgba(255, 255, 255, 0.1)',
              border:
                selected === option.key
                  ? '1px solid rgba(25, 118, 210, 0.8)'
                  : '1px solid transparent',
              borderRadius: '4px',
              color: '#fff',
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
          background: 'rgba(255,255,255,0.03)',
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
            Loading history...
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
