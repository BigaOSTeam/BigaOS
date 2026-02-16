import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings, SidebarPosition } from '../../context/SettingsContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { SLabel, SOptionGroup } from '../ui/SettingsUI';

export const ChartTab: React.FC = () => {
  const { theme } = useTheme();
  const { sidebarPosition, setSidebarPosition } = useSettings();
  const { t } = useLanguage();

  const sidebarPositionOptions: SidebarPosition[] = ['left', 'right'];
  const sidebarPositionLabels: Record<SidebarPosition, string> = {
    left: t('settings.sidebar_left'),
    right: t('settings.sidebar_right'),
  };

  return (
    <div>
      <div style={{ marginBottom: theme.space.xl }}>
        <SLabel>{t('settings.sidebar_position')}</SLabel>
        <SOptionGroup
          options={sidebarPositionOptions}
          labels={sidebarPositionLabels}
          value={sidebarPosition}
          onChange={setSidebarPosition}
        />
      </div>
    </div>
  );
};
