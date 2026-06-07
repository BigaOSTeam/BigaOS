import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useNightMode } from '../../context/NightModeContext';
import type { NightMode, NightAutoSource, NightIntensity } from '../../types/nightMode';
import { SLabel, SSection, SOptionGroup, SButton } from '../ui/SettingsUI';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';

const HOUR_OPTIONS: SelectOption<string>[] = Array.from({ length: 24 }, (_, h) => {
  const v = String(h).padStart(2, '0');
  return { value: v, label: v };
});

// 5-minute granularity — plenty for a night-mode schedule, keeps the list short.
const MINUTE_OPTIONS: SelectOption<string>[] = Array.from({ length: 12 }, (_, i) => {
  const v = String(i * 5).padStart(2, '0');
  return { value: v, label: v };
});

function splitHM(value: string): { h: string; m: string } {
  const [h = '00', m = '00'] = value.split(':');
  return { h: h.padStart(2, '0'), m: m.padStart(2, '0') };
}

/**
 * HH:MM picker built from the app's CustomSelect dropdowns, so it matches the
 * rest of the settings UI exactly (no native time-input chrome).
 */
const TimeSelect: React.FC<{ value: string; onChange: (value: string) => void }> = ({
  value,
  onChange,
}) => {
  const { theme } = useTheme();
  const { h, m } = splitHM(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.xs }}>
      <div style={{ flex: 1 }}>
        <CustomSelect value={h} options={HOUR_OPTIONS} onChange={(nh) => onChange(`${nh}:${m}`)} />
      </div>
      <span style={{ color: theme.colors.textMuted, fontWeight: theme.fontWeight.bold }}>:</span>
      <div style={{ flex: 1 }}>
        <CustomSelect value={m} options={MINUTE_OPTIONS} onChange={(nm) => onChange(`${h}:${nm}`)} />
      </div>
    </div>
  );
};

/**
 * Per-device night mode (red display) controls, shown in the Display tab.
 * Reads/writes the per-client `nightMode` config via NightModeContext.
 */
export const NightModeSection: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { config, setConfig, applyToAll } = useNightMode();

  // Brightness only takes effect while the red filter is showing, so there's
  // nothing to adjust when the mode is off — dim and disable it then.
  const brightnessDisabled = config.mode === 'off';

  const modeOptions: NightMode[] = ['off', 'on', 'auto'];
  const modeLabels: Record<NightMode, string> = {
    off: t('night.mode_off'),
    on: t('night.mode_on'),
    auto: t('night.mode_auto'),
  };

  const sourceOptions: NightAutoSource[] = ['sun', 'schedule'];
  const sourceLabels: Record<NightAutoSource, string> = {
    sun: t('night.source_sun'),
    schedule: t('night.source_schedule'),
  };

  const intensityOptions: NightIntensity[] = ['low', 'medium', 'high'];
  const intensityLabels: Record<NightIntensity, string> = {
    low: t('night.brightness_low'),
    medium: t('night.brightness_medium'),
    high: t('night.brightness_high'),
  };

  return (
    <div style={{ marginBottom: theme.space.xl }}>
      <SSection description={t('night.section_desc')}>{t('night.section_title')}</SSection>

      {/* Mode */}
      <div style={{ marginBottom: theme.space.lg }}>
        <SOptionGroup
          options={modeOptions}
          labels={modeLabels}
          value={config.mode}
          onChange={(mode) => setConfig({ ...config, mode })}
          equalWidth
        />
      </div>

      {/* Auto sub-options */}
      {config.mode === 'auto' && (
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('night.auto_source')}</SLabel>
          <SOptionGroup
            options={sourceOptions}
            labels={sourceLabels}
            value={config.source}
            onChange={(source) => setConfig({ ...config, source })}
            equalWidth
          />

          {config.source === 'sun' && (
            <div
              style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
                marginTop: theme.space.sm,
                lineHeight: 1.5,
              }}
            >
              {t('night.sun_hint')}
            </div>
          )}

          {config.source === 'schedule' && (
            <div style={{ display: 'flex', gap: theme.space.md, marginTop: theme.space.md }}>
              <div style={{ flex: 1 }}>
                <SLabel>{t('night.start')}</SLabel>
                <TimeSelect
                  value={config.start}
                  onChange={(v) => setConfig({ ...config, start: v })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <SLabel>{t('night.end')}</SLabel>
                <TimeSelect value={config.end} onChange={(v) => setConfig({ ...config, end: v })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brightness */}
      <div
        style={{
          marginBottom: theme.space.lg,
          opacity: brightnessDisabled ? 0.5 : 1,
          pointerEvents: brightnessDisabled ? 'none' : 'auto',
        }}
      >
        <SLabel>{t('night.brightness')}</SLabel>
        <SOptionGroup
          options={intensityOptions}
          labels={intensityLabels}
          value={config.intensity}
          onChange={(intensity) => setConfig({ ...config, intensity })}
          equalWidth
        />
      </div>

      <div
        style={{
          marginTop: theme.space.lg,
          paddingTop: theme.space.lg,
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        <SButton variant="secondary" onClick={applyToAll} fullWidth>
          {t('night.apply_all')}
        </SButton>
      </div>
    </div>
  );
};
