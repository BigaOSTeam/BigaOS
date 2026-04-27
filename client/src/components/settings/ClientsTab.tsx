import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useClient } from '../../context/ClientContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { wsService } from '../../services/websocket';
import { SButton, SCard, SLabel, SSection } from '../ui/SettingsUI';
import { AddPhoneDialog } from './AddPhoneDialog';
import { ClientSettingsDialog } from './ClientSettingsDialog';
import { CreateClientDialog } from './CreateClientDialog';

// Raw client data from server (snake_case fields)
interface RawClient {
  id: string;
  name: string;
  user_agent?: string;
  client_type?: string;
  created_at: string;
  last_seen_at: string;
}

export const ClientsTab: React.FC = () => {
  const { theme } = useTheme();
  const { clientId } = useClient();
  const { t } = useLanguage();
  const { confirm } = useConfirmDialog();
  const [clients, setClients] = useState<RawClient[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [settingsClient, setSettingsClient] = useState<RawClient | null>(null);

  const fetchClients = useCallback(() => {
    wsService.emit('get_clients');
  }, []);

  useEffect(() => {
    fetchClients();

    const handleSync = (data: { clients: RawClient[]; onlineIds?: string[] }) => {
      setClients(data.clients || []);
      setOnlineIds(new Set(data.onlineIds || []));
      setLoading(false);
    };

    const handleChanged = () => {
      fetchClients();
    };

    wsService.on('clients_sync', handleSync);
    wsService.on('clients_changed', handleChanged);

    return () => {
      wsService.off('clients_sync', handleSync);
      wsService.off('clients_changed', handleChanged);
    };
  }, [fetchClients]);

  const handleDelete = async (client: RawClient) => {
    const isSelf = client.id === clientId;
    const confirmed = await confirm({
      title: t('clients.delete'),
      message: isSelf ? t('clients.delete_self_confirm') : t('clients.delete_confirm'),
    });
    if (confirmed) {
      wsService.emit('client_delete', { id: client.id });
      if (isSelf) {
        try {
          localStorage.removeItem('bigaos-client-id');
        } catch { /* read-only */ }
        window.location.reload();
      }
    }
  };

  const formatLastSeen = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'Z');
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return t('clients.just_now');
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div>
      <SSection>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.md }}>
          <SLabel style={{ marginBottom: 0 }}>{t('clients.title')}</SLabel>
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <SButton variant="outline" onClick={() => setShowCreateClient(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: theme.space.xs }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {t('clients.create_new')}
            </SButton>
            <SButton variant="primary" onClick={() => setShowAddPhone(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: theme.space.xs }}>
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              {t('clients.add_phone')}
            </SButton>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: theme.space.xl, color: theme.colors.textMuted }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
              animation: 'spin 1s linear infinite',
            }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        ) : clients.length === 0 ? (
          <SCard style={{ textAlign: 'center', padding: theme.space.xl }}>
            <p style={{ color: theme.colors.textMuted, margin: 0 }}>{t('clients.no_clients')}</p>
          </SCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
            {clients.map((client) => {
              const isSelf = client.id === clientId;
              const isOnline = onlineIds.has(client.id);

              return (
                <SCard
                  key={client.id}
                  highlight="default"
                  style={{ padding: theme.space.lg }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: theme.space.sm,
                        marginBottom: theme.space.xs,
                      }}>
                        <span style={{
                          fontSize: theme.fontSize.base,
                          fontWeight: theme.fontWeight.medium,
                          color: theme.colors.textPrimary,
                        }}>
                          {client.name}
                        </span>
                        {isSelf && (
                          <span style={{
                            fontSize: theme.fontSize.xs,
                            color: theme.colors.success,
                            background: theme.colors.successLight,
                            padding: `2px ${theme.space.sm}`,
                            borderRadius: theme.radius.sm,
                            fontWeight: theme.fontWeight.medium,
                          }}>
                            {t('clients.this_client')}
                          </span>
                        )}
                        {client.client_type === 'remote' && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: theme.colors.primaryLight,
                            padding: `2px ${theme.space.sm}`,
                            borderRadius: theme.radius.sm,
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                              <line x1="12" y1="18" x2="12.01" y2="18" />
                            </svg>
                          </span>
                        )}
                      </div>

                      <div style={{
                        fontSize: theme.fontSize.xs,
                        color: theme.colors.textMuted,
                      }}>
                        {isOnline ? (
                          <span style={{
                            color: theme.colors.success,
                            fontWeight: theme.fontWeight.medium,
                          }}>
                            {t('clients.online')}
                          </span>
                        ) : (
                          <span>{t('clients.last_seen')}: {formatLastSeen(client.last_seen_at)}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: theme.space.sm, flexShrink: 0 }}>
                      <SButton
                        variant="outline"
                        onClick={() => setSettingsClient(client)}
                        style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
                      >
                        {/* Gear / settings icon */}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </SButton>
                      <SButton
                        variant="danger"
                        onClick={() => handleDelete(client)}
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
      </SSection>

      {showAddPhone && <AddPhoneDialog onClose={() => setShowAddPhone(false)} />}
      {showCreateClient && <CreateClientDialog onClose={() => { setShowCreateClient(false); fetchClients(); }} />}
      {settingsClient && <ClientSettingsDialog client={settingsClient} onClose={() => setSettingsClient(null)} />}
    </div>
  );
};
