import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useButtons } from '../../context/ButtonContext';
import { useSwitches } from '../../context/SwitchContext';
import { wsService } from '../../services/websocket';
import { SButton, SCard, SLabel, SSection } from '../ui/SettingsUI';
import { ButtonEditDialog } from './ButtonEditDialog';
import type { ButtonDefinition, ButtonAction } from '../../types/buttons';

interface RawClient {
  id: string;
  name: string;
}

function describeAction(
  action: ButtonAction,
  t: (key: string, params?: Record<string, string | number>) => string,
  getClientName: (id: string) => string,
  getSwitchName: (id: string) => string,
): string {
  switch (action.type) {
    case 'toggle_switch':
      return t('buttons.summary_toggle_switch', { name: getSwitchName(action.switchId) });
    case 'chart_recenter':
      return t('buttons.summary_chart_recenter', { client: getClientName(action.targetClientId) });
    case 'chart_zoom_in':
      return t('buttons.summary_chart_zoom_in', { client: getClientName(action.targetClientId) });
    case 'chart_zoom_out':
      return t('buttons.summary_chart_zoom_out', { client: getClientName(action.targetClientId) });
    case 'navigate':
      return t('buttons.summary_navigate', { client: getClientName(action.targetClientId), view: action.view });
    case 'settings_tab':
      return t('buttons.summary_settings_tab', { client: getClientName(action.targetClientId), tab: action.tab });
  }
}

export const ButtonsTab: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const { buttons, deleteButton } = useButtons();
  const { switches } = useSwitches();

  const [editButton, setEditButton] = useState<ButtonDefinition | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [clients, setClients] = useState<RawClient[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    wsService.emit('get_clients');
    const handleSync = (data: { clients: RawClient[]; onlineIds?: string[] }) => {
      setClients(data.clients || []);
      setOnlineIds(new Set(data.onlineIds || []));
    };
    const handleChanged = () => { wsService.emit('get_clients'); };
    wsService.on('clients_sync', handleSync);
    wsService.on('clients_changed', handleChanged);
    return () => {
      wsService.off('clients_sync', handleSync);
      wsService.off('clients_changed', handleChanged);
    };
  }, []);

  const getClientName = (clientId: string) =>
    clients.find(c => c.id === clientId)?.name || (clientId ? clientId.slice(0, 8) : '—');
  const getSwitchName = (switchId: string) =>
    switches.find(s => s.id === switchId)?.name || (switchId ? switchId.slice(0, 8) : '—');

  const handleDelete = async (b: ButtonDefinition) => {
    const confirmed = await confirm({
      title: t('buttons.delete'),
      message: t('buttons.delete_confirm'),
    });
    if (confirmed) deleteButton(b.id);
  };

  return (
    <div>
      <SSection>
        <div style={{ marginBottom: theme.space.md }}>
          <SLabel style={{ marginBottom: theme.space.xs }}>{t('buttons.title')}</SLabel>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
            {t('buttons.description')}
          </div>
        </div>

        {buttons.length === 0 ? (
          <SCard style={{ textAlign: 'center', padding: theme.space.xl }}>
            <p style={{ color: theme.colors.textMuted, margin: 0 }}>{t('buttons.no_buttons')}</p>
          </SCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
            {buttons.map((b) => {
              const isSourceOnline = onlineIds.has(b.sourceClientId);

              return (
                <SCard key={b.id} highlight="default" style={{ padding: theme.space.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md, flex: 1, minWidth: 0 }}>
                      {/* Icon (generic button glyph) */}
                      <div style={{
                        width: 36, height: 36,
                        borderRadius: theme.radius.sm,
                        background: theme.colors.bgCard,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                        color: b.enabled ? theme.colors.textPrimary : theme.colors.textMuted,
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="12" r="4" />
                        </svg>
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: theme.space.sm,
                          marginBottom: 2,
                        }}>
                          <span style={{
                            fontSize: theme.fontSize.base,
                            fontWeight: theme.fontWeight.medium,
                            color: theme.colors.textPrimary,
                          }}>
                            {b.name}
                          </span>
                          {!b.enabled && (
                            <span style={{
                              fontSize: theme.fontSize.xs,
                              color: theme.colors.textMuted,
                              background: theme.colors.bgCard,
                              padding: `1px ${theme.space.sm}`,
                              borderRadius: theme.radius.sm,
                            }}>
                              {t('buttons.disabled')}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: theme.fontSize.xs,
                          color: theme.colors.textMuted,
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.space.sm,
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            width: 6, height: 6,
                            borderRadius: '50%',
                            background: isSourceOnline ? theme.colors.success : theme.colors.textMuted,
                            display: 'inline-block',
                            flexShrink: 0,
                          }} />
                          <span>{getClientName(b.sourceClientId)}</span>
                          <span style={{ opacity: 0.5 }}>GPIO {b.gpioPin}</span>
                          <span style={{ opacity: 0.5 }}>→</span>
                          <span>{describeAction(b.action, t, getClientName, getSwitchName)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: theme.space.sm, flexShrink: 0 }}>
                      <SButton
                        variant="outline"
                        onClick={() => setEditButton(b)}
                        style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </SButton>
                      <SButton
                        variant="danger"
                        onClick={() => handleDelete(b)}
                        style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </SButton>
                    </div>
                  </div>
                </SCard>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: theme.space.lg }}>
          <SButton variant="primary" onClick={() => setShowCreate(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: theme.space.xs }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('buttons.add')}
          </SButton>
        </div>
      </SSection>

      {showCreate && <ButtonEditDialog onClose={() => setShowCreate(false)} />}
      {editButton && <ButtonEditDialog buttonDef={editButton} onClose={() => setEditButton(undefined)} />}
    </div>
  );
};
