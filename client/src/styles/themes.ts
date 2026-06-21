/**
 * BigaOS Theme Definitions
 *
 * Dark theme: original marine/navy theme for night use
 * Light theme: bright/white theme with blue accents
 */

export type ThemeMode = 'dark' | 'light' | 'marine';

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
  dataBattery: string;

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
    dataBattery: '#66bb6a',

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

// Light theme — tuned for direct-sunlight readability: a pure-white page for
// maximum screen brightness, near-black text, clearly visible mid-grey borders,
// and semantic/data colours deeply darkened (the dark theme's bright cyan/green/
// amber wash out on white). Instrument readouts use the data* colours, so those
// in particular must hold contrast under glare.
export const lightTheme: ThemeDefinition = {
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#eef2f7',
    bgTertiary: '#e2e8f0',
    bgCard: '#eef2f7',
    bgCardHover: '#e4ebf2',
    bgCardActive: '#d9e2ec',
    bgOverlay: 'rgba(0, 0, 0, 0.4)',
    bgOverlayHeavy: 'rgba(0, 0, 0, 0.7)',

    textPrimary: '#0a1722',
    textSecondary: '#2b3a48',
    textMuted: '#51606e',
    textDisabled: '#8795a1',

    primary: '#0b5fa5',
    primaryLight: '#d6e7f6',
    primaryMedium: '#4a8cc4',
    primaryDark: '#094a80',
    primarySolid: '#0b5fa5',

    success: '#2e7d32',
    successLight: '#cdeccd',
    successSolid: '#2e7d32',
    warning: '#b26a00',
    warningLight: '#f6e2bf',
    error: '#c62828',
    errorLight: '#f6cdcd',
    errorSolid: '#c62828',
    info: '#0277bd',
    infoLight: '#cce5f3',

    dataSpeed: '#0277bd',
    dataDepth: '#2e7d32',
    dataHeading: '#6a1b9a',
    dataWind: '#b26a00',
    dataPosition: '#0277bd',
    dataBattery: '#2e7d32',

    border: '#aab6c2',
    borderHover: '#7d8b99',
    borderFocus: '#0b5fa5',
    borderDashed: '#b8c2cd',
  },
  shadow: {
    sm: '0 1px 3px rgba(9, 30, 50, 0.14)',
    md: '0 2px 8px rgba(9, 30, 50, 0.18)',
    lg: '0 4px 16px rgba(9, 30, 50, 0.22)',
  },
  ...shared,
};

// Marine theme — a softer middle ground between dark and the stark sunlight
// white: muted light-blue surfaces with navy text and nautical blue/teal
// accents. Contrast is deliberately gentler than the white theme (navy on light
// blue, not near-black on white) for easier, less glary cabin/daylight use,
// while staying well clear of the dark theme's low daytime legibility.
export const marineTheme: ThemeDefinition = {
  colors: {
    bgPrimary: '#d7e4f0',
    bgSecondary: '#c6d6e6',
    bgTertiary: '#bacce0',
    bgCard: '#cddbea',
    bgCardHover: '#c2d3e4',
    bgCardActive: '#b3c8dd',
    bgOverlay: 'rgba(12, 28, 46, 0.42)',
    bgOverlayHeavy: 'rgba(12, 28, 46, 0.68)',

    textPrimary: '#21405a',
    textSecondary: '#355068',
    textMuted: '#5a7488',
    textDisabled: '#8aa0b2',

    primary: '#1565a8',
    primaryLight: '#b9d3ea',
    primaryMedium: '#5b93c0',
    primaryDark: '#0f4d82',
    primarySolid: '#1565a8',

    success: '#2e7d50',
    successLight: '#bfe0cc',
    successSolid: '#2e7d50',
    warning: '#b5701a',
    warningLight: '#ecd6b3',
    error: '#c0392b',
    errorLight: '#ecc6c1',
    errorSolid: '#c0392b',
    info: '#1976a8',
    infoLight: '#bcd9e8',

    dataSpeed: '#1976a8',
    dataDepth: '#2e7d50',
    dataHeading: '#6d4a9c',
    dataWind: '#b5701a',
    dataPosition: '#1976a8',
    dataBattery: '#2e7d50',

    border: '#a3b8cd',
    borderHover: '#7d97b0',
    borderFocus: '#1565a8',
    borderDashed: '#aabfd1',
  },
  shadow: {
    sm: '0 1px 3px rgba(12, 35, 60, 0.16)',
    md: '0 2px 8px rgba(12, 35, 60, 0.20)',
    lg: '0 4px 16px rgba(12, 35, 60, 0.24)',
  },
  ...shared,
};

export const themes: Record<ThemeMode, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
  marine: marineTheme,
};
