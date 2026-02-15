/**
 * BigaOS Design System Theme
 *
 * This file provides TypeScript constants that mirror the CSS variables
 * defined in globals.css. Use these for inline styles in React components.
 *
 * For CSS files, use var(--variable-name) instead.
 */

export const theme = {
  // Colors - Background
  colors: {
    bgPrimary: '#0a1929',
    bgSecondary: 'rgba(10, 25, 41, 0.98)',
    bgTertiary: 'rgba(10, 25, 41, 0.9)',
    bgCard: 'rgba(255, 255, 255, 0.05)',
    bgCardHover: 'rgba(255, 255, 255, 0.08)',
    bgCardActive: 'rgba(255, 255, 255, 0.1)',
    bgOverlay: 'rgba(0, 0, 0, 0.5)',
    bgOverlayHeavy: 'rgba(0, 0, 0, 0.85)',

    // Text
    textPrimary: '#e0e0e0',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    textDisabled: 'rgba(255, 255, 255, 0.3)',

    // Brand
    primary: '#1976d2',
    primaryLight: 'rgba(25, 118, 210, 0.3)',
    primaryMedium: 'rgba(25, 118, 210, 0.5)',
    primaryDark: '#1565c0',
    primarySolid: 'rgba(25, 118, 210, 0.9)',

    // Semantic
    success: '#66bb6a',
    successLight: 'rgba(102, 187, 106, 0.3)',
    successSolid: 'rgba(102, 187, 106, 0.9)',
    warning: '#ffa726',
    warningLight: 'rgba(255, 167, 38, 0.3)',
    error: '#ef5350',
    errorLight: 'rgba(239, 83, 80, 0.3)',
    errorSolid: 'rgba(239, 83, 80, 1)',
    info: '#4fc3f7',
    infoLight: 'rgba(79, 195, 247, 0.3)',

    // Data visualization
    dataSpeed: '#66bb6a',
    dataDepth: '#4fc3f7',
    dataHeading: '#ab47bc',
    dataWind: '#ffa726',
    dataCog: '#29b6f6',
    dataPosition: '#4fc3f7',

    // Border
    border: 'rgba(255, 255, 255, 0.1)',
    borderHover: 'rgba(255, 255, 255, 0.2)',
    borderFocus: 'rgba(255, 255, 255, 0.3)',
    borderDashed: 'rgba(255, 255, 255, 0.15)',
  },

  // Border Radius
  radius: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
  },

  // Spacing
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
  },

  // Font Sizes
  fontSize: {
    xs: '0.65rem',
    sm: '0.75rem',
    md: '0.875rem',
    base: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '2rem',
    '3xl': '2.5rem',
  },

  // Font Weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Shadows
  shadow: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.3)',
    md: '0 4px 12px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },

  // Transitions
  transition: {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease-out',
  },

  // Z-Index
  zIndex: {
    base: 1,
    dropdown: 100,
    sticky: 500,
    modal: 1000,
    tooltip: 9999,
  },
} as const;

// Type for the theme
export type Theme = typeof theme;

// Helper to get CSS variable reference (for hybrid usage)
export const cssVar = (name: string) => `var(--${name})`;
