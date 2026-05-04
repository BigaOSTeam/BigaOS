import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useButtons } from '../../context/ButtonContext';
import { useSwitches } from '../../context/SwitchContext';
import { wsService } from '../../services/websocket';
import { SButton, SInput, SLabel } from '../ui/SettingsUI';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import type {
  ButtonDefinition,
  ButtonAction,
  ButtonActionType,
  ButtonPull,
  ButtonTrigger,
  ButtonOverlayEdge,
} from '../../types/buttons';
import type { DeviceType } from '../../types/switches';

interface RawClient {
  id: string;
  name: string;
}

interface ButtonEditDialogProps {
  buttonDef?: ButtonDefinition;
  onClose: () => void;
}

const DEVICE_TYPE_OPTIONS: SelectOption<DeviceType>[] = [
  { value: 'rpi4b', label: 'RPi 4B' },
  { value: 'rpi5', label: 'RPi 5' },
];

const PULL_OPTIONS: SelectOption<ButtonPull>[] = [
  { value: 'up', label: 'Pull Up' },
  { value: 'down', label: 'Pull Down' },
  { value: 'none', label: 'None' },
];

const TRIGGER_OPTIONS: SelectOption<ButtonTrigger>[] = [
  { value: 'falling', label: 'Falling Edge (HIGH → LOW)' },
  { value: 'rising', label: 'Rising Edge (LOW → HIGH)' },
];

const GPIO_PINS: SelectOption<number>[] = Array.from({ length: 26 }, (_, i) => ({
  value: i + 2,
  label: `GPIO ${i + 2}`,
}));

const VIEW_OPTIONS: SelectOption<string>[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'chart', label: 'Chart' },
  { value: 'instruments', label: 'Instruments' },
  { value: 'wind', label: 'Wind' },
  { value: 'engine', label: 'Engine' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'depth', label: 'Depth' },
  { value: 'speed', label: 'Speed' },
  { value: 'heading', label: 'Heading' },
  { value: 'position', label: 'Position' },
  { value: 'battery', label: 'Battery' },
  { value: 'weather', label: 'Weather' },
  { value: 'roll', label: 'Roll' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'switches', label: 'Relays' },
  { value: 'settings', label: 'Settings' },
];

const OVERLAY_EDGE_OPTIONS: SelectOption<ButtonOverlayEdge>[] = [
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
];

/** Always returns a ButtonAction so the live preview can render even when
 *  the user hasn't filled in target client / switch yet. The action's
 *  status is only used by the overlay for the toggle_switch dot color. */
function builtActionForPreview(
  actionType: ButtonActionType,
  actionSwitchId: string,
  actionTargetClientId: string,
  actionView: string,
  actionTab: string,
): ButtonAction {
  switch (actionType) {
    case 'toggle_switch': return { type: 'toggle_switch', switchId: actionSwitchId };
    case 'chart_recenter': return { type: 'chart_recenter', targetClientId: actionTargetClientId };
    case 'chart_zoom_in': return { type: 'chart_zoom_in', targetClientId: actionTargetClientId };
    case 'chart_zoom_out': return { type: 'chart_zoom_out', targetClientId: actionTargetClientId };
    case 'navigate': return { type: 'navigate', targetClientId: actionTargetClientId, view: actionView };
    case 'settings_tab': return { type: 'settings_tab', targetClientId: actionTargetClientId, tab: actionTab };
  }
}

const SETTINGS_TAB_OPTIONS: SelectOption<string>[] = [
  { value: 'general', label: 'General' },
  { value: 'chart', label: 'Chart' },
  { value: 'vessel', label: 'Vessel' },
  { value: 'units', label: 'Units' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'switches', label: 'Relays' },
  { value: 'buttons', label: 'Buttons' },
  { value: 'tanks', label: 'Tanks' },
  { value: 'plugins', label: 'Plugins' },
  { value: 'clients', label: 'Clients' },
  { value: 'display', label: 'Display' },
  { value: 'advanced', label: 'Advanced' },
];

export const ButtonEditDialog: React.FC<ButtonEditDialogProps> = ({ buttonDef, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { buttons, createButton, updateButton, setPreview } = useButtons();
  const { switches } = useSwitches();
  const isEdit = !!buttonDef;

  const [name, setName] = useState(buttonDef?.name || '');
  const [sourceClientId, setSourceClientId] = useState(buttonDef?.sourceClientId || '');
  const [deviceType, setDeviceType] = useState<DeviceType>(buttonDef?.deviceType || 'rpi4b');
  const [gpioPin, setGpioPin] = useState<number>(buttonDef?.gpioPin || 2);
  const [pull, setPull] = useState<ButtonPull>(buttonDef?.pull || 'up');
  const [trigger, setTrigger] = useState<ButtonTrigger>(buttonDef?.trigger || 'falling');
  const [debounceMs, setDebounceMs] = useState<number>(buttonDef?.debounceMs ?? 50);
  const [enabled, setEnabled] = useState<boolean>(buttonDef?.enabled ?? true);

  const [overlayEnabled, setOverlayEnabled] = useState<boolean>(buttonDef?.overlayEnabled ?? false);
  const [overlayEdge, setOverlayEdge] = useState<ButtonOverlayEdge>(buttonDef?.overlayEdge || 'bottom');
  const [overlayPercent, setOverlayPercent] = useState<number>(buttonDef?.overlayPercent ?? 50);

  const [actionType, setActionType] = useState<ButtonActionType>(buttonDef?.action.type || 'toggle_switch');
  const [actionSwitchId, setActionSwitchId] = useState<string>(
    buttonDef?.action.type === 'toggle_switch' ? buttonDef.action.switchId : ''
  );
  const [actionTargetClientId, setActionTargetClientId] = useState<string>(
    buttonDef && 'targetClientId' in buttonDef.action ? buttonDef.action.targetClientId : ''
  );
  const [actionView, setActionView] = useState<string>(
    buttonDef?.action.type === 'navigate' ? buttonDef.action.view : 'chart'
  );
  const [actionTab, setActionTab] = useState<string>(
    buttonDef?.action.type === 'settings_tab' ? buttonDef.action.tab : 'general'
  );

  const [clients, setClients] = useState<RawClient[]>([]);

  useEffect(() => {
    wsService.emit('get_clients');
    const handleSync = (data: { clients: RawClient[] }) => {
      setClients(data.clients || []);
    };
    wsService.on('clients_sync', handleSync);
    return () => { wsService.off('clients_sync', handleSync); };
  }, []);

  const clientOptions: SelectOption<string>[] = clients.map(c => ({ value: c.id, label: c.name }));
  const switchOptions: SelectOption<string>[] = switches.map(s => ({ value: s.id, label: s.name }));

  const actionTypeOptions: SelectOption<ButtonActionType>[] = [
    { value: 'toggle_switch', label: t('buttons.action_toggle_switch') },
    { value: 'chart_recenter', label: t('buttons.action_chart_recenter') },
    { value: 'chart_zoom_in', label: t('buttons.action_chart_zoom_in') },
    { value: 'chart_zoom_out', label: t('buttons.action_chart_zoom_out') },
    { value: 'navigate', label: t('buttons.action_navigate') },
    { value: 'settings_tab', label: t('buttons.action_settings_tab') },
  ];

  const pinInUse = buttons.some(b =>
    b.sourceClientId === sourceClientId &&
    b.gpioPin === gpioPin &&
    b.id !== buttonDef?.id
  );

  // Live preview: publish the in-progress overlay state to the overlay component
  // so the user can see position/edge changes update in real time.
  useEffect(() => {
    if (!sourceClientId) {
      setPreview(null);
      return;
    }
    setPreview({
      id: buttonDef?.id,
      sourceClientId,
      name: name.trim() || (isEdit ? buttonDef!.name : '…'),
      action: builtActionForPreview(actionType, actionSwitchId, actionTargetClientId, actionView, actionTab),
      overlayEnabled,
      overlayEdge,
      overlayPercent: Math.max(0, Math.min(100, Math.round(overlayPercent))),
    });
    return () => { setPreview(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceClientId, name, actionType, actionSwitchId, actionTargetClientId,
    actionView, actionTab, overlayEnabled, overlayEdge, overlayPercent,
  ]);

  const builtAction = useMemo<ButtonAction | null>(() => {
    switch (actionType) {
      case 'toggle_switch':
        return actionSwitchId ? { type: 'toggle_switch', switchId: actionSwitchId } : null;
      case 'chart_recenter':
        return actionTargetClientId ? { type: 'chart_recenter', targetClientId: actionTargetClientId } : null;
      case 'chart_zoom_in':
        return actionTargetClientId ? { type: 'chart_zoom_in', targetClientId: actionTargetClientId } : null;
      case 'chart_zoom_out':
        return actionTargetClientId ? { type: 'chart_zoom_out', targetClientId: actionTargetClientId } : null;
      case 'navigate':
        return actionTargetClientId && actionView ? { type: 'navigate', targetClientId: actionTargetClientId, view: actionView } : null;
      case 'settings_tab':
        return actionTargetClientId && actionTab ? { type: 'settings_tab', targetClientId: actionTargetClientId, tab: actionTab } : null;
    }
  }, [actionType, actionSwitchId, actionTargetClientId, actionView, actionTab]);

  const handleSave = () => {
    if (!name.trim() || !sourceClientId || pinInUse || !builtAction) return;

    const payload = {
      name: name.trim(),
      sourceClientId,
      deviceType,
      gpioPin,
      pull,
      trigger,
      debounceMs: Number.isFinite(debounceMs) ? Math.max(0, Math.floor(debounceMs)) : 50,
      enabled,
      action: builtAction,
      overlayEnabled,
      overlayEdge,
      overlayPercent: Math.max(0, Math.min(100, Math.round(overlayPercent))),
    };

    if (isEdit && buttonDef) {
      updateButton(buttonDef.id, payload);
    } else {
      createButton(payload);
    }
    onClose();
  };

  const canSave = !!name.trim() && !!sourceClientId && !pinInUse && !!builtAction;

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
          maxWidth: '460px',
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
          {isEdit ? t('buttons.edit') : t('buttons.add')}
        </h2>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.name')}</SLabel>
          <SInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Helm Button"
            autoFocus
          />
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.source_client')}</SLabel>
          <CustomSelect
            value={sourceClientId}
            options={clientOptions}
            onChange={setSourceClientId}
            placeholder={t('buttons.source_client')}
          />
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.device_type')}</SLabel>
          <CustomSelect
            value={deviceType}
            options={DEVICE_TYPE_OPTIONS}
            onChange={setDeviceType}
          />
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.gpio_pin')}</SLabel>
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
              {t('buttons.pin_in_use')}
            </div>
          )}
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.pull')}</SLabel>
          <CustomSelect value={pull} options={PULL_OPTIONS} onChange={setPull} />
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
            lineHeight: 1.5,
          }}>
            {pull === 'up'
              ? t('buttons.pull_desc_up')
              : pull === 'down'
              ? t('buttons.pull_desc_down')
              : t('buttons.pull_desc_none')}
          </div>
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.trigger')}</SLabel>
          <CustomSelect value={trigger} options={TRIGGER_OPTIONS} onChange={setTrigger} />
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
            lineHeight: 1.5,
          }}>
            {trigger === 'falling'
              ? t('buttons.trigger_desc_falling')
              : t('buttons.trigger_desc_rising')}
          </div>
        </div>

        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('buttons.debounce_ms')}</SLabel>
          <SInput
            type="number"
            value={String(debounceMs)}
            onChange={(e) => setDebounceMs(parseInt(e.target.value, 10) || 0)}
            min={0}
            max={5000}
          />
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginTop: theme.space.xs,
            lineHeight: 1.5,
          }}>
            {t('buttons.debounce_desc')}
          </div>
        </div>

        <div style={{ marginBottom: theme.space.lg, display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
          <input
            type="checkbox"
            id="button-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor="button-enabled" style={{
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            cursor: 'pointer',
          }}>
            {t('buttons.enabled')}
          </label>
        </div>

        <div style={{
          marginTop: theme.space.xl,
          marginBottom: theme.space.lg,
          paddingTop: theme.space.lg,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          <SLabel>{t('buttons.action')}</SLabel>
          <CustomSelect value={actionType} options={actionTypeOptions} onChange={setActionType} />
        </div>

        {actionType === 'toggle_switch' && (
          <div style={{ marginBottom: theme.space.xl }}>
            <SLabel>{t('buttons.action_switch')}</SLabel>
            <CustomSelect
              value={actionSwitchId}
              options={switchOptions}
              onChange={setActionSwitchId}
              placeholder={t('buttons.action_switch')}
            />
          </div>
        )}

        {(actionType === 'chart_recenter' || actionType === 'chart_zoom_in' || actionType === 'chart_zoom_out') && (
          <div style={{ marginBottom: theme.space.xl }}>
            <SLabel>{t('buttons.action_target_client')}</SLabel>
            <CustomSelect
              value={actionTargetClientId}
              options={clientOptions}
              onChange={setActionTargetClientId}
              placeholder={t('buttons.action_target_client')}
            />
          </div>
        )}

        {actionType === 'navigate' && (
          <>
            <div style={{ marginBottom: theme.space.lg }}>
              <SLabel>{t('buttons.action_target_client')}</SLabel>
              <CustomSelect
                value={actionTargetClientId}
                options={clientOptions}
                onChange={setActionTargetClientId}
                placeholder={t('buttons.action_target_client')}
              />
            </div>
            <div style={{ marginBottom: theme.space.xl }}>
              <SLabel>{t('buttons.action_view')}</SLabel>
              <CustomSelect value={actionView} options={VIEW_OPTIONS} onChange={setActionView} />
            </div>
          </>
        )}

        {actionType === 'settings_tab' && (
          <>
            <div style={{ marginBottom: theme.space.lg }}>
              <SLabel>{t('buttons.action_target_client')}</SLabel>
              <CustomSelect
                value={actionTargetClientId}
                options={clientOptions}
                onChange={setActionTargetClientId}
                placeholder={t('buttons.action_target_client')}
              />
            </div>
            <div style={{ marginBottom: theme.space.xl }}>
              <SLabel>{t('buttons.action_tab')}</SLabel>
              <CustomSelect value={actionTab} options={SETTINGS_TAB_OPTIONS} onChange={setActionTab} />
            </div>
          </>
        )}

        {/* Overlay (on-screen label) */}
        <div style={{
          marginTop: theme.space.xl,
          paddingTop: theme.space.lg,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          <div style={{ marginBottom: theme.space.lg, display: 'flex', alignItems: 'center', gap: theme.space.sm }}>
            <input
              type="checkbox"
              id="button-overlay-enabled"
              checked={overlayEnabled}
              onChange={(e) => setOverlayEnabled(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="button-overlay-enabled" style={{
              color: theme.colors.textPrimary,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.medium,
              cursor: 'pointer',
            }}>
              {t('buttons.overlay_enabled')}
            </label>
          </div>
          <div style={{
            fontSize: theme.fontSize.xs,
            color: theme.colors.textMuted,
            marginBottom: theme.space.lg,
            lineHeight: 1.5,
          }}>
            {t('buttons.overlay_desc')}
          </div>

          {overlayEnabled && (
            <>
              <div style={{ marginBottom: theme.space.lg }}>
                <SLabel>{t('buttons.overlay_edge')}</SLabel>
                <CustomSelect value={overlayEdge} options={OVERLAY_EDGE_OPTIONS} onChange={setOverlayEdge} />
              </div>
              <div style={{ marginBottom: theme.space.xl }}>
                <SLabel>
                  {t('buttons.overlay_percent')} — <span style={{ color: theme.colors.textPrimary, fontWeight: theme.fontWeight.medium }}>{Math.round(overlayPercent)}%</span>
                </SLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={overlayPercent}
                    onChange={(e) => setOverlayPercent(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }}
                  />
                  <div style={{ width: 80 }}>
                    <SInput
                      type="number"
                      value={String(Math.round(overlayPercent))}
                      onChange={(e) => setOverlayPercent(parseInt(e.target.value, 10) || 0)}
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
                <div style={{
                  fontSize: theme.fontSize.xs,
                  color: theme.colors.textMuted,
                  marginTop: theme.space.xs,
                  lineHeight: 1.5,
                }}>
                  {(overlayEdge === 'top' || overlayEdge === 'bottom')
                    ? t('buttons.overlay_percent_desc_horizontal')
                    : t('buttons.overlay_percent_desc_vertical')}
                </div>
              </div>
            </>
          )}
        </div>

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
