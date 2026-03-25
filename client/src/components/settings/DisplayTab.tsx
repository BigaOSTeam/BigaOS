import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useClient } from '../../context/ClientContext';
import { wsService } from '../../services/websocket';
import { SButton, SLabel, SSection } from '../ui/SettingsUI';
import { CustomSelect } from '../ui/CustomSelect';

interface DisplayInfo {
  output: string;
  currentMode: string;
  currentTransform: string;
  currentScale: number;
  availableModes: string[];
  config: { resolution?: string; rotation?: string; scale?: number };
  error?: string;
}

export const DisplayTab: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { clientId } = useClient();

  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedResolution, setSelectedResolution] = useState('');
  const [selectedRotation, setSelectedRotation] = useState('normal');
  const [selectedScale, setSelectedScale] = useState(1.0);

  // Fetch display info from agent
  const fetchDisplayInfo = useCallback(() => {
    setLoading(true);
    setError('');
    wsService.emit('display_get_info', { clientId });

    const timeout = setTimeout(() => {
      setLoading(false);
      setError(t('clients.agent_not_connected'));
    }, 5000);

    const handler = (data: DisplayInfo & { clientId: string }) => {
      if (data.clientId !== clientId) return;
      clearTimeout(timeout);
      setDisplayInfo(data);
      setLoading(false);
      if (data.error) {
        setError(data.error);
      } else {
        setSelectedResolution(data.config?.resolution || data.currentMode || '');
        setSelectedRotation(data.config?.rotation || data.currentTransform || 'normal');
        setSelectedScale(data.config?.scale ?? data.currentScale ?? 1.0);
      }
      wsService.off('display_info', handler);
    };
    wsService.on('display_info', handler);

    return () => {
      clearTimeout(timeout);
      wsService.off('display_info', handler);
    };
  }, [clientId, t]);

  useEffect(() => {
    const cleanup = fetchDisplayInfo();
    return cleanup;
  }, [fetchDisplayInfo]);

  // Apply resolution + rotation + scale (all via agent / wlr-randr)
  const handleApply = useCallback(() => {
    setApplying(true);
    setError('');
    setSuccess('');

    wsService.emit('display_set', {
      clientId,
      resolution: selectedResolution || undefined,
      rotation: selectedRotation || undefined,
      scale: selectedScale,
    });

    const timeout = setTimeout(() => {
      setApplying(false);
      setError(t('clients.display_error'));
    }, 10000);

    const handler = (data: any) => {
      if (data.clientId !== clientId) return;
      clearTimeout(timeout);
      setApplying(false);
      if (!data.success) {
        setError(data.error || t('clients.display_error'));
      } else {
        setSuccess(t('clients.display_applied'));
        setTimeout(() => setSuccess(''), 3000);
        fetchDisplayInfo();
      }
      wsService.off('display_set_result', handler);
    };
    wsService.on('display_set_result', handler);
  }, [clientId, selectedResolution, selectedRotation, selectedScale, t, fetchDisplayInfo]);

  const rotationOptions = [
    { value: 'normal', label: t('clients.rotation_normal') },
    { value: '90', label: t('clients.rotation_90') },
    { value: '180', label: t('clients.rotation_180') },
    { value: '270', label: t('clients.rotation_270') },
  ];

  return (
    <div>
      <SSection description={t('clients.display_hint')}>{t('clients.display')}</SSection>

      {loading ? (
        <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm, padding: `${theme.space.lg} 0` }}>
          {t('common.loading')}
        </div>
      ) : error && !displayInfo ? (
        <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm, padding: `${theme.space.lg} 0` }}>
          {error}
        </div>
      ) : (
        <>
          {/* Resolution */}
          {displayInfo && displayInfo.availableModes.length > 0 && (
            <div style={{ marginBottom: theme.space.lg }}>
              <SLabel>{t('clients.resolution')}</SLabel>
              <CustomSelect
                value={selectedResolution}
                options={displayInfo.availableModes.map(m => ({ value: m, label: m }))}
                onChange={setSelectedResolution}
                placeholder="Auto"
              />
              {displayInfo.currentMode && (
                <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: theme.space.xs }}>
                  {t('clients.display_current')}: {displayInfo.currentMode}
                </div>
              )}
            </div>
          )}

          {/* Rotation */}
          <div style={{ marginBottom: theme.space.lg }}>
            <SLabel>{t('clients.rotation')}</SLabel>
            <CustomSelect
              value={selectedRotation}
              options={rotationOptions}
              onChange={setSelectedRotation}
            />
          </div>

          {/* Scale / Zoom */}
          <div style={{ marginBottom: theme.space.lg }}>
            <SLabel>{t('clients.zoom')}: {selectedScale.toFixed(1)}x</SLabel>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={selectedScale}
              onChange={(e) => setSelectedScale(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: theme.colors.primary }}
            />
          </div>

          {/* Apply button */}
          <SButton
            variant="primary"
            onClick={handleApply}
            disabled={applying}
            style={{ width: '100%' }}
          >
            {applying ? t('clients.display_applying') : t('clients.display_apply')}
          </SButton>
          {error && (
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.error, marginTop: theme.space.sm }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.success, marginTop: theme.space.sm }}>
              {success}
            </div>
          )}
        </>
      )}
    </div>
  );
};
