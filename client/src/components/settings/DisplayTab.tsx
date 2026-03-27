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

// Common resolutions (shown even if not detected by wlr-randr)
const COMMON_RESOLUTIONS = [
  '1920x1080', '1280x720', '1024x768', '1024x600',
  '800x600', '800x480', '480x320',
];

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
  const [customResolution, setCustomResolution] = useState('');
  const [showCustomRes, setShowCustomRes] = useState(false);

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
        setSelectedResolution(data.currentMode || data.config?.resolution || '');
        setSelectedRotation(data.currentTransform || data.config?.rotation || 'normal');
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

  // Build resolution options: detected modes + common + current config
  const resolutionOptions = React.useMemo(() => {
    const modesSet = new Set<string>();

    // Add detected modes (strip Hz for display)
    displayInfo?.availableModes.forEach(m => modesSet.add(m));

    // Add common resolutions that aren't already detected
    COMMON_RESOLUTIONS.forEach(r => {
      if (![...modesSet].some(m => m.startsWith(r))) {
        modesSet.add(r);
      }
    });

    // Add current config resolution if custom
    const configRes = displayInfo?.config?.resolution;
    if (configRes && !modesSet.has(configRes)) {
      modesSet.add(configRes);
    }

    const options = [...modesSet].map(m => {
      const isDetected = displayInfo?.availableModes.includes(m);
      const isCurrent = m === displayInfo?.currentMode;
      let label = m;
      if (isCurrent) label += ` (${t('clients.display_current').toLowerCase()})`;
      else if (!isDetected) label += ' *';
      return { value: m, label };
    });

    return options;
  }, [displayInfo, t]);

  // Apply display settings via agent
  const handleApply = useCallback(() => {
    setApplying(true);
    setError('');
    setSuccess('');

    const resolution = showCustomRes && customResolution
      ? customResolution.trim()
      : selectedResolution || undefined;

    wsService.emit('display_set', {
      clientId,
      resolution,
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
        setShowCustomRes(false);
        fetchDisplayInfo();
      }
      wsService.off('display_set_result', handler);
    };
    wsService.on('display_set_result', handler);
  }, [clientId, selectedResolution, selectedRotation, selectedScale, customResolution, showCustomRes, t, fetchDisplayInfo]);

  const rotationOptions = [
    { value: 'normal', label: t('clients.rotation_normal') },
    { value: '90', label: t('clients.rotation_90') },
    { value: '180', label: t('clients.rotation_180') },
    { value: '270', label: t('clients.rotation_270') },
  ];

  const scaleChanged = displayInfo && selectedScale !== (displayInfo.config?.scale ?? 1.0);

  const cardStyle: React.CSSProperties = {
    background: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    marginBottom: theme.space.md,
  };

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
          {/* Current display info bar */}
          {displayInfo?.output && (
            <div style={{
              ...cardStyle,
              display: 'flex',
              gap: theme.space.lg,
              flexWrap: 'wrap',
              fontSize: theme.fontSize.sm,
            }}>
              <div>
                <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: '2px' }}>
                  {t('clients.display_output')}
                </div>
                <div style={{ fontWeight: 500 }}>{displayInfo.output}</div>
              </div>
              {displayInfo.currentMode && (
                <div>
                  <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: '2px' }}>
                    {t('clients.resolution')}
                  </div>
                  <div style={{ fontWeight: 500 }}>{displayInfo.currentMode}</div>
                </div>
              )}
              <div>
                <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: '2px' }}>
                  {t('clients.rotation')}
                </div>
                <div style={{ fontWeight: 500 }}>
                  {rotationOptions.find(r => r.value === displayInfo.currentTransform)?.label || displayInfo.currentTransform}
                </div>
              </div>
              <div>
                <div style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: '2px' }}>
                  {t('clients.zoom')}
                </div>
                <div style={{ fontWeight: 500 }}>{(displayInfo.config?.scale ?? 1.0).toFixed(1)}x</div>
              </div>
            </div>
          )}

          {/* Resolution */}
          <div style={cardStyle}>
            <SLabel>{t('clients.resolution')}</SLabel>
            {!showCustomRes ? (
              <>
                <CustomSelect
                  value={selectedResolution}
                  options={resolutionOptions}
                  onChange={setSelectedResolution}
                  placeholder="Auto"
                />
                <button
                  onClick={() => setShowCustomRes(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.colors.primary,
                    fontSize: theme.fontSize.xs,
                    cursor: 'pointer',
                    padding: `${theme.space.xs} 0`,
                    marginTop: theme.space.xs,
                  }}
                >
                  {t('clients.custom_resolution')}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: theme.space.sm, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={customResolution}
                    onChange={(e) => setCustomResolution(e.target.value)}
                    placeholder="1024x600"
                    autoFocus
                    style={{
                      flex: 1,
                      padding: theme.space.sm,
                      background: theme.colors.bgCardActive,
                      border: `1px solid ${theme.colors.borderHover}`,
                      borderRadius: theme.radius.md,
                      color: theme.colors.textPrimary,
                      fontSize: theme.fontSize.sm,
                    }}
                  />
                  <button
                    onClick={() => { setShowCustomRes(false); setCustomResolution(''); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.sm,
                      cursor: 'pointer',
                      padding: theme.space.sm,
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
                <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: theme.space.xs }}>
                  {t('clients.custom_resolution_hint')}
                </div>
              </>
            )}
          </div>

          {/* Rotation */}
          <div style={cardStyle}>
            <SLabel>{t('clients.rotation')}</SLabel>
            <CustomSelect
              value={selectedRotation}
              options={rotationOptions}
              onChange={setSelectedRotation}
            />
          </div>

          {/* Scale / Zoom */}
          <div style={cardStyle}>
            <SLabel>{t('clients.zoom')}</SLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.space.md }}>
              <button
                onClick={() => setSelectedScale(Math.max(0.8, Math.round((selectedScale - 0.1) * 10) / 10))}
                disabled={selectedScale <= 0.8}
                className="touch-btn"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: theme.radius.md,
                  background: theme.colors.bgCardActive,
                  border: `1px solid ${theme.colors.borderHover}`,
                  color: theme.colors.textPrimary,
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  opacity: selectedScale <= 0.8 ? 0.3 : 1,
                }}
              >
                -
              </button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                fontSize: theme.fontSize.lg,
                fontWeight: 600,
              }}>
                {selectedScale.toFixed(1)}x
              </div>
              <button
                onClick={() => setSelectedScale(Math.min(2.0, Math.round((selectedScale + 0.1) * 10) / 10))}
                disabled={selectedScale >= 2.0}
                className="touch-btn"
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: theme.radius.md,
                  background: theme.colors.bgCardActive,
                  border: `1px solid ${theme.colors.borderHover}`,
                  color: theme.colors.textPrimary,
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  opacity: selectedScale >= 2.0 ? 0.3 : 1,
                }}
              >
                +
              </button>
            </div>
            {scaleChanged && (
              <div style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.warning,
                marginTop: theme.space.sm,
              }}>
                {t('clients.zoom_restart_hint')}
              </div>
            )}
          </div>

          {/* Apply button */}
          <SButton
            variant="primary"
            onClick={handleApply}
            disabled={applying}
            style={{ width: '100%', marginTop: theme.space.sm }}
          >
            {applying ? t('clients.display_applying') : t('clients.display_apply')}
          </SButton>

          {error && (
            <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.error, marginTop: theme.space.sm, textAlign: 'center' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: theme.fontSize.sm, color: theme.colors.success, marginTop: theme.space.sm, textAlign: 'center' }}>
              {success}
            </div>
          )}
        </>
      )}
    </div>
  );
};
