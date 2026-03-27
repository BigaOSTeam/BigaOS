import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useSwitches } from '../../context/SwitchContext';
import { wsService } from '../../services/websocket';
import { SButton, SInput, SLabel } from '../ui/SettingsUI';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import type { SwitchDefinition, SwitchIcon, RelayType, StartupBehavior } from '../../types/switches';

interface RawClient {
  id: string;
  name: string;
  client_type?: string;
}

interface SwitchEditDialogProps {
  switchDef?: SwitchDefinition; // undefined = create mode
  onClose: () => void;
}

const ICON_OPTIONS: SelectOption<SwitchIcon>[] = [
  { value: 'lightbulb', label: 'Light' },
  { value: 'nav-light', label: 'Nav Light' },
  { value: 'anchor-light', label: 'Anchor Light' },
  { value: 'spotlight', label: 'Spotlight' },
  { value: 'pump', label: 'Pump' },
  { value: 'water-pump', label: 'Water Pump' },
  { value: 'bilge-pump', label: 'Bilge Pump' },
  { value: 'fan', label: 'Fan' },
  { value: 'horn', label: 'Horn' },
  { value: 'heater', label: 'Heater' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'inverter', label: 'Inverter' },
  { value: 'outlet', label: 'Outlet' },
  { value: 'radio', label: 'Radio' },
  { value: 'generic', label: 'Generic' },
];

const RELAY_TYPE_OPTIONS: SelectOption<RelayType>[] = [
  { value: 'active-low', label: 'Active Low' },
  { value: 'active-high', label: 'Active High' },
];

const STARTUP_BEHAVIOR_OPTIONS: SelectOption<StartupBehavior>[] = [
  { value: 'keep-state', label: 'Keep State' },
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

// BCM GPIO pins available on RPi (2-27)
const GPIO_PINS: SelectOption<number>[] = Array.from({ length: 26 }, (_, i) => ({
  value: i + 2,
  label: `GPIO ${i + 2}`,
}));

export const SwitchEditDialog: React.FC<SwitchEditDialogProps> = ({ switchDef, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { switches, createSwitch, updateSwitch } = useSwitches();
  const isEdit = !!switchDef;

  const [name, setName] = useState(switchDef?.name || '');
  const [icon, setIcon] = useState<SwitchIcon>(switchDef?.icon || 'lightbulb');
  const [targetClientId, setTargetClientId] = useState(switchDef?.targetClientId || '');
  const [relayType, setRelayType] = useState<RelayType>(switchDef?.relayType || 'active-low');
  const [startupBehavior, setStartupBehavior] = useState<StartupBehavior>(switchDef?.startupBehavior || 'keep-state');
  const [gpioPin, setGpioPin] = useState<number>(switchDef?.gpioPin || 2);
  const [clients, setClients] = useState<RawClient[]>([]);

  // Fetch available clients
  useEffect(() => {
    wsService.emit('get_clients');
    const handleSync = (data: { clients: RawClient[] }) => {
      setClients(data.clients || []);
    };
    wsService.on('clients_sync', handleSync);
    return () => { wsService.off('clients_sync', handleSync); };
  }, []);

  const clientOptions: SelectOption<string>[] = clients.map(c => ({
    value: c.id,
    label: c.name,
  }));

  // Check if pin is already used on the selected client
  const pinInUse = switches.some(s =>
    s.targetClientId === targetClientId &&
    s.gpioPin === gpioPin &&
    s.id !== switchDef?.id
  );

  const handleSave = () => {
    if (!name.trim() || !targetClientId) return;
    if (pinInUse) return;

    if (isEdit && switchDef) {
      updateSwitch(switchDef.id, { name: name.trim(), icon, targetClientId, relayType, startupBehavior, gpioPin });
    } else {
      createSwitch({ name: name.trim(), icon, targetClientId, deviceType: 'rpi4b', relayType, startupBehavior, gpioPin });
    }
    onClose();
  };

  const canSave = name.trim() && targetClientId && !pinInUse;

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
          maxWidth: '420px',
          maxHeight: '90dvh',
          overflowY: 'auto',
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
          {isEdit ? t('switches.edit') : t('switches.add')}
        </h2>

        {/* Name */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('switches.name')}</SLabel>
          <SInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navigation Lights"
            autoFocus
          />
        </div>

        {/* Icon */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('switches.icon')}</SLabel>
          <CustomSelect
            value={icon}
            options={ICON_OPTIONS}
            onChange={setIcon}
          />
        </div>

        {/* Target Client */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('switches.target_client')}</SLabel>
          <CustomSelect
            value={targetClientId}
            options={clientOptions}
            onChange={setTargetClientId}
            placeholder={t('switches.target_client')}
          />
        </div>

        {/* GPIO Pin */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('switches.gpio_pin')}</SLabel>
          <CustomSelect
            value={gpioPin}
            options={GPIO_PINS}
            onChange={setGpioPin}
          />
          {pinInUse && (
            <div style={{
              color: theme.colors.error,
              fontSize: theme.fontSize.xs,
              marginTop: theme.space.xs,
            }}>
              {t('switches.pin_in_use')}
            </div>
          )}
        </div>

        {/* Relay Type */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('switches.relay_type')}</SLabel>
          <CustomSelect
            value={relayType}
            options={RELAY_TYPE_OPTIONS}
            onChange={setRelayType}
          />
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
          }}>
            {relayType === 'active-low'
              ? t('switches.relay_type_desc_low')
              : t('switches.relay_type_desc_high')
            }
          </div>
        </div>

        {/* Startup Behavior */}
        <div style={{ marginBottom: theme.space.xl }}>
          <SLabel>{t('switches.startup_behavior')}</SLabel>
          <CustomSelect
            value={startupBehavior}
            options={STARTUP_BEHAVIOR_OPTIONS}
            onChange={setStartupBehavior}
          />
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
          }}>
            {startupBehavior === 'keep-state'
              ? t('switches.startup_keep')
              : startupBehavior === 'off'
              ? t('switches.startup_off')
              : t('switches.startup_on')
            }
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: theme.space.md }}>
          <SButton variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            {t('common.cancel')}
          </SButton>
          <SButton variant="primary" onClick={handleSave} disabled={!canSave} style={{ flex: 1 }}>
            {t('common.save')}
          </SButton>
        </div>
      </div>
    </div>
  );
};
