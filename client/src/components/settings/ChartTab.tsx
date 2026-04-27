import React, { useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings, SidebarPosition } from '../../context/SettingsContext';
import { useClientSetting } from '../../context/ClientSettingsContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { SLabel, SOptionGroup, SToggle } from '../ui/SettingsUI';

export const ChartTab: React.FC = () => {
  const { theme } = useTheme();
  // sidebarPosition is owned by SettingsContext (which now reads from
  // ClientSettings under the hood); we drive it through the same setter.
  const { sidebarPosition, setSidebarPosition } = useSettings();
  const { t } = useLanguage();

  const [chartOnly, setChartOnly] = useClientSetting<boolean>('chartOnly', false);
  const [, setStoredSidebarPosition] = useClientSetting<SidebarPosition>('sidebarPosition', 'left');

  const handleChartOnlyChange = useCallback((enabled: boolean) => {
    setChartOnly(enabled);
  }, [setChartOnly]);

  const handleSidebarPositionChange = useCallback((position: SidebarPosition) => {
    setSidebarPosition(position);
    setStoredSidebarPosition(position);
  }, [setSidebarPosition, setStoredSidebarPosition]);

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
          onChange={handleSidebarPositionChange}
        />
      </div>

      <div style={{ marginBottom: theme.space.xl }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <SLabel style={{ marginBottom: 0 }}>{t('settings.chart_only')}</SLabel>
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              marginTop: '2px',
            }}>
              {t('settings.chart_only_desc')}
            </div>
          </div>
          <SToggle
            checked={chartOnly}
            onChange={handleChartOnlyChange}
          />
        </div>
      </div>
    </div>
  );
};
