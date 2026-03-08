/**
 * BigaOS Theme Definitions
 *
 * Dark theme: original marine/navy theme for night use
 * Light theme: bright/white theme with blue accents
 */

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgCard: string;
  bgCardHover: string;
  bgCardActive: string;
  bgOverlay: string;
  bgOverlayHeavy: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;

  primary: string;
  primaryLight: string;
  primaryMedium: string;
  primaryDark: string;
  primarySolid: string;

  success: string;
  successLight: string;
  successSolid: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  errorSolid: string;
  info: string;
  infoLight: string;

  dataSpeed: string;
  dataDepth: string;
  dataHeading: string;
  dataWind: string;
  dataPosition: string;

  border: string;
  borderHover: string;
  borderFocus: string;
  borderDashed: string;
}

export interface ThemeDefinition {
  colors: ThemeColors;
  radius: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  space: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };
  fontWeight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
  transition: {
    fast: string;
    normal: string;
    slow: string;
  };
  zIndex: {
    base: number;
    dropdown: number;
    sticky: number;
    modal: number;
    tooltip: number;
  };
}

// Shared values (same in both themes)
const shared = {
  radius: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '32px',
  },
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
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  transition: {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease-out',
  },
  zIndex: {
    base: 1,
    dropdown: 100,
    sticky: 500,
    modal: 1000,
    tooltip: 9999,
  },
} as const;

export const darkTheme: ThemeDefinition = {
  colors: {
    bgPrimary: '#0a1929',
    bgSecondary: '#0a1929',
    bgTertiary: '#0a1929',
    bgCard: 'rgba(255, 255, 255, 0.05)',
    bgCardHover: 'rgba(255, 255, 255, 0.08)',
    bgCardActive: 'rgba(255, 255, 255, 0.1)',
    bgOverlay: 'rgba(0, 0, 0, 0.5)',
    bgOverlayHeavy: 'rgba(0, 0, 0, 0.85)',

    textPrimary: '#e0e0e0',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    textDisabled: 'rgba(255, 255, 255, 0.3)',

    primary: '#1976d2',
    primaryLight: 'rgba(25, 118, 210, 0.3)',
    primaryMedium: 'rgba(25, 118, 210, 0.5)',
    primaryDark: '#1565c0',
    primarySolid: 'rgba(25, 118, 210, 0.9)',

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

    dataSpeed: '#4fc3f7',
    dataDepth: '#66bb6a',
    dataHeading: '#ab47bc',
    dataWind: '#ffa726',
    dataPosition: '#4fc3f7',

    border: 'rgba(255, 255, 255, 0.1)',
    borderHover: 'rgba(255, 255, 255, 0.2)',
    borderFocus: 'rgba(255, 255, 255, 0.3)',
    borderDashed: 'rgba(255, 255, 255, 0.15)',
  },
  shadow: {
    sm: '0 2px 4px rgba(0, 0, 0, 0.3)',
    md: '0 4px 12px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  ...shared,
};

export const lightTheme: ThemeDefinition = {
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f2f3f5',
    bgTertiary: '#e5e8ec',
    bgCard: '#ffffff',
    bgCardHover: '#f0f2f4',
    bgCardActive: '#e0e4e8',
    bgOverlay: 'rgba(0, 0, 0, 0.4)',
    bgOverlayHeavy: 'rgba(0, 0, 0, 0.7)',

    textPrimary: '#040e18',
    textSecondary: '#0d2440',
    textMuted: '#345068',
    textDisabled: '#6a7f90',

    primary: '#1c75b9',
    primaryLight: '#1c75b9',
    primaryMedium: '#145a8f',
    primaryDark: '#1484b3',
    primarySolid: '#1c75b9',

    success: '#66bb6a',
    successLight: '#c8e6c9',
    successSolid: '#66bb6a',
    warning: '#ffa726',
    warningLight: '#ffe0b2',
    error: '#ef5350',
    errorLight: '#ffcdd2',
    errorSolid: '#ef5350',
    info: '#4fc3f7',
    infoLight: '#b3e5fc',

    dataSpeed: '#4fc3f7',
    dataDepth: '#66bb6a',
    dataHeading: '#ab47bc',
    dataWind: '#ffa726',
    dataPosition: '#4fc3f7',

    border: '#bcc5cf',
    borderHover: '#8c9fae',
    borderFocus: '#0ea7aa',
    borderDashed: '#b4bec8',
  },
  shadow: {
    sm: '0 1px 3px rgba(9, 30, 50, 0.14)',
    md: '0 2px 8px rgba(9, 30, 50, 0.18)',
    lg: '0 4px 16px rgba(9, 30, 50, 0.22)',
  },
  ...shared,
};

export const themes: Record<ThemeMode, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
};
