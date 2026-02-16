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
  dataCog: string;
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
    bgSecondary: 'rgba(10, 25, 41, 0.98)',
    bgTertiary: 'rgba(10, 25, 41, 0.9)',
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

    dataSpeed: '#66bb6a',
    dataDepth: '#4fc3f7',
    dataHeading: '#ab47bc',
    dataWind: '#ffa726',
    dataCog: '#29b6f6',
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
    bgSecondary: '#f5f7fa',
    bgTertiary: '#eef1f6',
    bgCard: '#ffffff',
    bgCardHover: '#f0f4f8',
    bgCardActive: '#e3e8ef',
    bgOverlay: 'rgba(0, 0, 0, 0.3)',
    bgOverlayHeavy: 'rgba(0, 0, 0, 0.6)',

    textPrimary: '#1a202c',
    textSecondary: '#4a5568',
    textMuted: '#a0aec0',
    textDisabled: '#cbd5e0',

    primary: '#2196f3',
    primaryLight: 'rgba(33, 150, 243, 0.12)',
    primaryMedium: 'rgba(33, 150, 243, 0.3)',
    primaryDark: '#1976d2',
    primarySolid: 'rgba(33, 150, 243, 0.9)',

    success: '#43a047',
    successLight: 'rgba(67, 160, 71, 0.15)',
    successSolid: 'rgba(67, 160, 71, 0.9)',
    warning: '#ef6c00',
    warningLight: 'rgba(239, 108, 0, 0.15)',
    error: '#e53935',
    errorLight: 'rgba(229, 57, 53, 0.12)',
    errorSolid: 'rgba(229, 57, 53, 1)',
    info: '#039be5',
    infoLight: 'rgba(3, 155, 229, 0.12)',

    dataSpeed: '#43a047',
    dataDepth: '#039be5',
    dataHeading: '#8e24aa',
    dataWind: '#ef6c00',
    dataCog: '#0288d1',
    dataPosition: '#039be5',

    border: 'rgba(0, 0, 0, 0.1)',
    borderHover: 'rgba(0, 0, 0, 0.18)',
    borderFocus: 'rgba(33, 150, 243, 0.4)',
    borderDashed: 'rgba(0, 0, 0, 0.12)',
  },
  shadow: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.08)',
    md: '0 2px 8px rgba(0, 0, 0, 0.1)',
    lg: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
  ...shared,
};

export const themes: Record<ThemeMode, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
};
