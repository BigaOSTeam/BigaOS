import { useState, useRef, useEffect } from 'react';
import { theme } from '../../styles/theme';

export interface SelectOption<T> {
  value: T;
  label: string;
}

interface CustomSelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  compact?: boolean;
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  compact = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '100%',
          padding: compact ? `${theme.space.xs} ${theme.space.sm}` : theme.space.md,
          boxSizing: 'border-box',
          background: theme.colors.bgCardActive,
          border: `1px solid ${isOpen ? theme.colors.primary : theme.colors.border}`,
          borderRadius: compact ? theme.radius.sm : theme.radius.md,
          color: selectedOption ? theme.colors.textPrimary : theme.colors.textMuted,
          fontSize: compact ? theme.fontSize.xs : theme.fontSize.md,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
          transition: `border-color ${theme.transition.fast}`,
        }}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <svg
          width={compact ? '12' : '16'}
          height={compact ? '12' : '16'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: `transform ${theme.transition.fast}`,
            opacity: 0.5,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.lg,
            zIndex: 1000,
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: compact ? `${theme.space.xs} ${theme.space.sm}` : `${theme.space.sm} ${theme.space.md}`,
                background: option.value === value ? theme.colors.primaryLight : 'transparent',
                border: 'none',
                color: option.value === value ? theme.colors.primary : theme.colors.textPrimary,
                fontSize: compact ? theme.fontSize.xs : theme.fontSize.md,
                cursor: 'pointer',
                textAlign: 'left',
                transition: `background ${theme.transition.fast}`,
              }}
              onMouseEnter={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = theme.colors.bgCardHover;
                }
              }}
              onMouseLeave={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
