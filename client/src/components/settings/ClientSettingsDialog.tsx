import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { wsService } from '../../services/websocket';
import { API_BASE_URL } from '../../utils/urls';
import { SButton, SInput, SLabel, SToggle } from '../ui/SettingsUI';
import { CustomSelect, type SelectOption } from '../ui/CustomSelect';
import type { ViewType } from '../../types/dashboard';

type StartPage = '' | ViewType | 'dashboard';

interface RawClient {
  id: string;
  name: string;
  user_agent?: string;
  client_type?: string;
  created_at: string;
  last_seen_at: string;
}

interface ClientSettingsDialogProps {
  client: RawClient;
  onClose: () => void;
}

export const ClientSettingsDialog: React.FC<ClientSettingsDialogProps> = ({ client, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const startPageOptions = useMemo<SelectOption<StartPage>[]>(() => [
    { value: '', label: t('clients.start_page_default') },
    { value: 'dashboard', label: t('dashboard.title') },
    { value: 'chart', label: t('dashboard.chart') },
    { value: 'instruments', label: t('instruments.title') },
    { value: 'switches', label: t('switches.title') },
    { value: 'settings', label: t('common.settings') },
    { value: 'battery', label: t('dashboard.battery') },
    { value: 'wind', label: t('dashboard.wind') },
    { value: 'depth', label: t('dashboard.depth') },
    { value: 'speed', label: t('dashboard.speed') },
    { value: 'heading', label: t('dashboard.heading') },
    { value: 'position', label: t('dashboard.position') },
    { value: 'weather', label: t('dashboard.weather') },
    { value: 'roll', label: t('dashboard.roll') },
    { value: 'pitch', label: t('dashboard.pitch') },
  ], [t]);
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(client.name);
  const [isRemote, setIsRemote] = useState(client.client_type === 'remote');
  const [startPage, setStartPage] = useState<StartPage>('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [copied, setCopied] = useState<string | false>(false);

  // Build the direct URL for this client
  const clientUrl = `${window.location.origin}/c/${client.id}`;

  // Fetch current client settings from server via REST (avoids interfering with
  // the WS client_settings_sync handler in AppContent)
  useEffect(() => {
    fetch(`${API_BASE_URL}/clients/${client.id}/settings`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: { settings: Record<string, any> }) => {
        if (data.settings.startPage) {
          setStartPage(data.settings.startPage as StartPage);
        }
        setSettingsLoaded(true);
      })
      .catch(() => { setSettingsLoaded(true); });
  }, [client.id]);

  const handleSave = () => {
    // Update client name + type
    const newType = isRemote ? 'remote' : 'display';
    if (name.trim() !== client.name || newType !== (client.client_type || 'display')) {
      wsService.emit('client_update', { id: client.id, name: name.trim() || client.name, clientType: newType });
    }
    // Update startup page via client_settings
    wsService.emit('client_settings_update', { clientId: client.id, key: 'startPage', value: startPage || '' });
    onClose();
  };

  const handleCopyValue = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(field);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopy = () => handleCopyValue(clientUrl, 'url');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
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
          {t('clients.settings_title')}
        </h2>

        {/* Name */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('clients.name')}</SLabel>
          <SInput
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('clients.name_placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        {/* Remote/Mobile toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.space.lg,
            padding: `${theme.space.md} 0`,
          }}
        >
          <div>
            <div style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium, color: theme.colors.textPrimary }}>
              {t('clients.mobile_device')}
            </div>
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
              {t('clients.mobile_device_hint')}
            </div>
          </div>
          <SToggle checked={isRemote} onChange={setIsRemote} />
        </div>

        {/* Start Page */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('clients.start_page')}</SLabel>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: theme.space.sm }}>
            {t('clients.start_page_hint')}
          </div>
          {settingsLoaded ? (
            <CustomSelect
              value={startPage}
              options={startPageOptions}
              onChange={setStartPage}
              placeholder={t('clients.start_page_default')}
            />
          ) : (
            <div style={{ height: '42px', display: 'flex', alignItems: 'center', color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
              {t('common.loading')}
            </div>
          )}
        </div>

        {/* Client ID */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('clients.client_id')}</SLabel>
          <div style={{
            display: 'flex',
            gap: theme.space.sm,
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1,
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              background: theme.colors.bgCard,
              padding: `${theme.space.sm} ${theme.space.md}`,
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`,
              wordBreak: 'break-all',
              fontFamily: '"Cascadia Code", "Fira Code", "Source Code Pro", monospace',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'all',
              minHeight: '42px',
            }}>
              {client.id}
            </div>
            <SButton
              variant={copied === 'id' ? 'primary' : 'outline'}
              onClick={() => handleCopyValue(client.id, 'id')}
              style={{ padding: `${theme.space.sm} ${theme.space.md}`, flexShrink: 0 }}
            >
              {copied === 'id' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </SButton>
          </div>
        </div>

        {/* Server Address */}
        <div style={{ marginBottom: theme.space.lg }}>
          <SLabel>{t('clients.server_address')}</SLabel>
          <div style={{
            display: 'flex',
            gap: theme.space.sm,
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1,
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              background: theme.colors.bgCard,
              padding: `${theme.space.sm} ${theme.space.md}`,
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`,
              wordBreak: 'break-all',
              fontFamily: '"Cascadia Code", "Fira Code", "Source Code Pro", monospace',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'all',
              minHeight: '42px',
            }}>
              {window.location.host}
            </div>
            <SButton
              variant={copied === 'server' ? 'primary' : 'outline'}
              onClick={() => handleCopyValue(window.location.host, 'server')}
              style={{ padding: `${theme.space.sm} ${theme.space.md}`, flexShrink: 0 }}
            >
              {copied === 'server' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </SButton>
          </div>
        </div>

        {/* Direct URL */}
        <div style={{ marginBottom: theme.space.xl }}>
          <SLabel>{t('clients.direct_url')}</SLabel>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginBottom: theme.space.sm }}>
            {t('clients.direct_url_hint')}
          </div>
          <div style={{
            display: 'flex',
            gap: theme.space.sm,
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1,
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              background: theme.colors.bgCard,
              padding: `${theme.space.sm} ${theme.space.md}`,
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`,
              wordBreak: 'break-all',
              fontFamily: '"Cascadia Code", "Fira Code", "Source Code Pro", monospace',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'all',
              minHeight: '42px',
            }}>
              {clientUrl}
            </div>
            <SButton
              variant={copied === 'url' ? 'primary' : 'outline'}
              onClick={handleCopy}
              style={{ padding: `${theme.space.sm} ${theme.space.md}`, flexShrink: 0 }}
            >
              {copied === 'url' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </SButton>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: theme.space.md }}>
          <SButton variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            {t('common.cancel')}
          </SButton>
          <SButton variant="primary" onClick={handleSave} disabled={!name.trim()} style={{ flex: 1 }}>
            {t('common.save')}
          </SButton>
        </div>
      </div>
    </div>
  );
};
