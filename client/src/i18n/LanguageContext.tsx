import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { LANGUAGES, LanguageCode, DEFAULT_LANGUAGE } from './languages';
import { parseTxt } from './parseTxt';

// Import .txt files as raw strings (Vite ?raw import)
import enTxt from './en.txt?raw';
import deTxt from './de.txt?raw';

// To add a new language: import the .txt file and add it here
const TRANSLATION_FILES: Record<string, string> = {
  en: enTxt,
  de: deTxt,
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Register extra translations (e.g. from plugins). Merged into t() lookups. */
  registerExtraTranslations: (translations: Record<string, string>) => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [extraTranslations, setExtraTranslations] = useState<Record<string, string>>({});

  // Parse all translations at startup
  const allTranslations = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};
    for (const [code, content] of Object.entries(TRANSLATION_FILES)) {
      result[code] = parseTxt(content);
    }
    return result;
  }, []);

  // Current language translations
  const translations = useMemo(() => {
    return allTranslations[language] || allTranslations[DEFAULT_LANGUAGE] || {};
  }, [language, allTranslations]);

  // English fallback
  const fallback = useMemo(() => {
    return allTranslations[DEFAULT_LANGUAGE] || {};
  }, [allTranslations]);

  // Translation function: t("key") or t("key", { param: value })
  // Checks: current language -> english fallback -> plugin translations -> raw key
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let value = translations[key] ?? fallback[key] ?? extraTranslations[key] ?? key;
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
    }
    return value;
  }, [translations, fallback, extraTranslations]);

  const setLanguage = useCallback((lang: LanguageCode) => {
    if (LANGUAGES[lang]) {
      setLanguageState(lang);
    }
  }, []);

  // Register extra translations (from plugins) — replaces entire set
  const registerExtraTranslations = useCallback((translations: Record<string, string>) => {
    setExtraTranslations(translations);
  }, []);

  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t,
    registerExtraTranslations,
  }), [language, setLanguage, t, registerExtraTranslations]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// Convenience alias
export const useLang = useLanguage;
