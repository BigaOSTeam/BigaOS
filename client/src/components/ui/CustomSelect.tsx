import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

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
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position the dropdown relative to the trigger button via portal
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%' }}>
      <button
        type="button"
        className="s-input"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '100%',
          padding: compact ? `${theme.space.xs} ${theme.space.sm}` : '0.5rem 0.75rem',
          minHeight: compact ? '36px' : '42px',
          boxSizing: 'border-box',
          background: theme.colors.bgCard,
          border: `1px solid ${isOpen ? theme.colors.primary : theme.colors.border}`,
          borderRadius: compact ? theme.radius.sm : theme.radius.md,
          color: selectedOption ? theme.colors.textPrimary : theme.colors.textMuted,
          fontSize: compact ? theme.fontSize.sm : theme.fontSize.md,
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

      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="settings-scroll"
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            background: theme.colors.bgSecondary,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.lg,
            zIndex: 10000,
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
                padding: compact
                  ? `${theme.space.xs} ${theme.space.sm}`
                  : `${theme.space.sm} 0.75rem`,
                minHeight: compact ? '36px' : '38px',
                background: option.value === value ? theme.colors.primaryLight : 'transparent',
                border: 'none',
                color: option.value === value ? theme.colors.primary : theme.colors.textPrimary,
                fontSize: compact ? theme.fontSize.sm : theme.fontSize.md,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
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
        </div>,
        document.body
      )}
    </div>
  );
}
