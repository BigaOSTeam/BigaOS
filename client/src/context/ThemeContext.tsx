import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSettings } from './SettingsContext';
import { themes, type ThemeDefinition, type ThemeMode } from '../styles/themes';

interface ThemeContextType {
  theme: ThemeDefinition;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

// CSS variable name mapping from theme keys
const colorVarMap: Record<string, string> = {
  bgPrimary: '--color-bg-primary',
  bgSecondary: '--color-bg-secondary',
  bgTertiary: '--color-bg-tertiary',
  bgCard: '--color-bg-card',
  bgCardHover: '--color-bg-card-hover',
  bgCardActive: '--color-bg-card-active',
  bgOverlay: '--color-bg-overlay',
  bgOverlayHeavy: '--color-bg-overlay-heavy',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  textDisabled: '--color-text-disabled',
  primary: '--color-primary',
  primaryLight: '--color-primary-light',
  primaryMedium: '--color-primary-medium',
  primaryDark: '--color-primary-dark',
  primarySolid: '--color-primary-solid',
  success: '--color-success',
  successLight: '--color-success-light',
  successSolid: '--color-success-solid',
  warning: '--color-warning',
  warningLight: '--color-warning-light',
  error: '--color-error',
  errorLight: '--color-error-light',
  errorSolid: '--color-error-solid',
  info: '--color-info',
  infoLight: '--color-info-light',
  border: '--color-border',
  borderHover: '--color-border-hover',
  borderFocus: '--color-border-focus',
  borderDashed: '--color-border-dashed',
};

const shadowVarMap: Record<string, string> = {
  sm: '--shadow-sm',
  md: '--shadow-md',
  lg: '--shadow-lg',
};

export function applyThemeToDOM(themeObj: ThemeDefinition) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(colorVarMap)) {
    const value = themeObj.colors[key as keyof typeof themeObj.colors];
    if (value) root.style.setProperty(cssVar, value);
  }
  for (const [key, cssVar] of Object.entries(shadowVarMap)) {
    const value = themeObj.shadow[key as keyof typeof themeObj.shadow];
    if (value) root.style.setProperty(cssVar, value);
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useSettings();

  const currentTheme = useMemo(() => themes[themeMode] || themes.dark, [themeMode]);

  useEffect(() => {
    applyThemeToDOM(currentTheme);
    localStorage.setItem('bigaos-theme-mode', themeMode);
  }, [currentTheme, themeMode]);

  const value = useMemo(() => ({
    theme: currentTheme,
    themeMode,
  }), [currentTheme, themeMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * Standalone ThemeProvider that reads from localStorage instead of SettingsContext.
 * Use this for components rendered outside the main provider tree (e.g. SetupWizard).
 */
export const StandaloneThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mode = (localStorage.getItem('bigaos-theme-mode') || 'dark') as ThemeMode;
  const currentTheme = themes[mode] || themes.dark;

  const value = useMemo(() => ({
    theme: currentTheme,
    themeMode: mode,
  }), [currentTheme, mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
