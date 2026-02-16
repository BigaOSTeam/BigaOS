/**
 * Shared Settings UI primitives
 *
 * Unified, touch-friendly components matching the chart view design language.
 * All interactive elements have >=44px touch targets.
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

/* ========================================
   SLabel — Field label
   ======================================== */

interface SLabelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const SLabel: React.FC<SLabelProps> = ({ children, style }) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        fontSize: theme.fontSize.sm,
        fontWeight: theme.fontWeight.medium,
        color: theme.colors.textSecondary,
        marginBottom: theme.space.xs,
        minHeight: '20px',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ========================================
   SSection — Section header
   ======================================== */

interface SSectionProps {
  children: React.ReactNode;
  description?: string;
  style?: React.CSSProperties;
}

export const SSection: React.FC<SSectionProps> = ({ children, description, style }) => {
  const { theme } = useTheme();
  return (
    <div style={{ marginBottom: theme.space.md, ...style }}>
      <div
        style={{
          fontSize: theme.fontSize.md,
          fontWeight: theme.fontWeight.semibold,
          color: theme.colors.textPrimary,
        }}
      >
        {children}
      </div>
      {description && (
        <div
          style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
};

/* ========================================
   SInput — Text / number input
   ======================================== */

interface SInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> {
  error?: boolean;
  monospace?: boolean;
  inputStyle?: React.CSSProperties;
}

export const SInput = React.forwardRef<HTMLInputElement, SInputProps>(
  ({ error, monospace, inputStyle, ...props }, ref) => {
    const { theme } = useTheme();
    return (
      <input
        ref={ref}
        {...props}
        className="s-input"
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: theme.colors.bgCard,
          border: `1px solid ${error ? theme.colors.error : theme.colors.border}`,
          borderRadius: theme.radius.md,
          color: error ? theme.colors.error : theme.colors.textPrimary,
          fontSize: theme.fontSize.md,
          minHeight: '42px',
          boxSizing: 'border-box',
          outline: 'none',
          transition: `border-color ${theme.transition.fast}, background ${theme.transition.fast}`,
          ...(monospace
            ? { fontFamily: '"Cascadia Code", "Fira Code", "Source Code Pro", monospace', fontSize: theme.fontSize.xs }
            : {}),
          ...inputStyle,
        }}
      />
    );
  },
);

SInput.displayName = 'SInput';

/* ========================================
   SButton — Unified button with variants
   ======================================== */

type SButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'warning';

interface SButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: SButtonVariant;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const SButton: React.FC<SButtonProps> = ({
  variant = 'secondary',
  fullWidth,
  icon,
  children,
  style,
  disabled,
  ...props
}) => {
  const { theme } = useTheme();
  const variantStyles: Record<SButtonVariant, React.CSSProperties> = {
    primary: {
      background: theme.colors.primaryMedium,
      border: 'none',
      color: theme.colors.textPrimary,
      fontWeight: theme.fontWeight.bold,
    },
    secondary: {
      background: theme.colors.bgCardActive,
      border: 'none',
      color: theme.colors.textPrimary,
    },
    outline: {
      background: theme.colors.bgCard,
      border: 'none',
      color: theme.colors.textSecondary,
    },
    danger: {
      background: theme.colors.errorLight,
      border: 'none',
      color: theme.colors.error,
    },
    warning: {
      background: theme.colors.warningLight,
      border: 'none',
      color: theme.colors.warning,
      fontWeight: theme.fontWeight.bold,
    },
    ghost: {
      background: 'transparent',
      border: 'none',
      color: theme.colors.textMuted,
    },
  };
  return (
    <button
      disabled={disabled}
      className="s-btn"
      {...props}
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.md,
        cursor: disabled ? 'default' : 'pointer',
        transition: `all ${theme.transition.normal}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.sm,
        minHeight: '42px',
        opacity: disabled ? 0.5 : 1,
        ...(fullWidth ? { width: '100%' } : {}),
        ...variantStyles[variant],
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  );
};

/* ========================================
   SToggle — Unified toggle switch (56×32)
   ======================================== */

interface SToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  color?: string;
}

export const SToggle: React.FC<SToggleProps> = ({
  checked,
  onChange,
  disabled,
  color,
}) => {
  const { theme } = useTheme();
  const resolvedColor = color ?? theme.colors.primary;
  return (
    <button
      className="s-toggle"
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: '56px',
        height: '32px',
        borderRadius: '16px',
        background: checked ? resolvedColor : theme.colors.bgCardActive,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        position: 'relative',
        transition: `background ${theme.transition.fast}`,
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: '3px',
          left: checked ? '27px' : '3px',
          transition: `left ${theme.transition.fast}`,
        }}
      />
    </button>
  );
};

/* ========================================
   SOptionGroup — Toggle button group
   ======================================== */

interface SOptionGroupProps<T extends string> {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  colorMap?: Partial<Record<T, string>>;
}

export function SOptionGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
  colorMap,
}: SOptionGroupProps<T>) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', gap: theme.space.sm, flexWrap: 'wrap' }}>
      {options.map((option) => {
        const isSelected = value === option;
        const accentBg = colorMap?.[option]
          ? `${colorMap[option]}80`
          : theme.colors.primaryMedium;
        return (
          <button
            key={option}
            className="s-option-btn"
            onClick={() => onChange(option)}
            style={{
              flex: '1 1 auto',
              minWidth: '60px',
              padding: '0.5rem 0.75rem',
              background: isSelected ? accentBg : theme.colors.bgCardActive,
              border: 'none',
              borderRadius: theme.radius.md,
              color: isSelected ? '#fff' : theme.colors.textPrimary,
              cursor: 'pointer',
              fontSize: theme.fontSize.md,
              fontWeight: isSelected ? theme.fontWeight.bold : theme.fontWeight.normal,
              transition: `all ${theme.transition.normal}`,
              minHeight: '42px',
            }}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}

/* ========================================
   SCard — Card container
   ======================================== */

interface SCardProps {
  children: React.ReactNode;
  highlight?: 'default' | 'success' | 'warning' | 'primary' | 'error';
  style?: React.CSSProperties;
}

export const SCard: React.FC<SCardProps> = ({ children, highlight = 'default', style }) => {
  const { theme } = useTheme();
  const cardBorderColors: Record<NonNullable<SCardProps['highlight']>, string> = {
    default: theme.colors.border,
    success: `${theme.colors.success}40`,
    warning: theme.colors.warning,
    primary: theme.colors.primary,
    error: theme.colors.error,
  };
  return (
    <div
      style={{
        padding: theme.space.lg,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        border: `1px solid ${cardBorderColors[highlight]}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ========================================
   SInfoBox — Help / info text
   ======================================== */

interface SInfoBoxProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const SInfoBox: React.FC<SInfoBoxProps> = ({ children, style }) => {
  const { theme } = useTheme();
  return (
    <div
      style={{
        padding: theme.space.md,
        background: theme.colors.bgCard,
        borderRadius: theme.radius.md,
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        lineHeight: 1.5,
        marginTop: theme.space.lg,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
