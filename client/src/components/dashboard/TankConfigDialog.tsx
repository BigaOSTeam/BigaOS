import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTanks } from '../../context/TankContext';
import { SButton, SLabel } from '../ui/SettingsUI';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import { fluidLabelKey, FluidType } from '../../types/tanks';
import type { TankDashboardConfig } from '../../types/dashboard';

interface TankConfigDialogProps {
  config?: TankDashboardConfig;
  onSave: (config: TankDashboardConfig) => void;
  onClose: () => void;
}

export const TankConfigDialog: React.FC<TankConfigDialogProps> = ({ config, onSave, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tanks } = useTanks();

  const [tankId, setTankId] = useState(config?.tankId || tanks[0]?.id || '');

  const tankOptions: SelectOption<string>[] = tanks.map(tk => ({
    value: tk.id,
    label: `${tk.name} — ${t(fluidLabelKey(tk.fluidType as FluidType))}`,
  }));

  const handleSave = () => {
    if (!tankId) return;
    onSave({ tankId });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: theme.colors.bgOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: theme.zIndex.modal,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.colors.bgSecondary,
          borderRadius: theme.radius.lg,
          padding: theme.space['2xl'],
          width: '100%',
          maxWidth: '360px',
          boxShadow: theme.shadow.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{
          margin: `0 0 ${theme.space.xl} 0`,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.bold,
          color: theme.colors.textPrimary,
        }}>
          {t('tanks.widget_configure')}
        </h2>

        {tanks.length === 0 ? (
          <div style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            marginBottom: theme.space.xl,
          }}>
            {t('tanks.widget_none_available')}
          </div>
        ) : (
          <div style={{ marginBottom: theme.space.xl }}>
            <SLabel>{t('tanks.widget_pick_tank')}</SLabel>
            <CustomSelect
              value={tankId}
              options={tankOptions}
              onChange={setTankId}
              placeholder={t('tanks.widget_pick_tank')}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: theme.space.md }}>
          <SButton variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            {t('common.cancel')}
          </SButton>
          <SButton variant="primary" onClick={handleSave} disabled={!tankId} style={{ flex: 1 }}>
            {t('common.save')}
          </SButton>
        </div>
      </div>
    </div>
  );
};
