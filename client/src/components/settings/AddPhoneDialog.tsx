import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { SButton } from '../ui/SettingsUI';

interface AddPhoneDialogProps {
  onClose: () => void;
}

export const AddPhoneDialog: React.FC<AddPhoneDialogProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const url = `${window.location.origin}?remote=1`;

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
          padding: theme.space.xl,
          width: '100%',
          maxWidth: '360px',
          boxShadow: theme.shadow.lg,
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{
          margin: `0 0 ${theme.space.lg} 0`,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.bold,
          color: theme.colors.textPrimary,
        }}>
          {t('clients.add_phone')}
        </h2>

        <div style={{
          background: '#ffffff',
          borderRadius: theme.radius.md,
          padding: theme.space.lg,
          display: 'inline-block',
          marginBottom: theme.space.lg,
        }}>
          <QRCodeSVG value={url} size={200} level="M" />
        </div>

        <p style={{
          color: theme.colors.textSecondary,
          fontSize: theme.fontSize.sm,
          margin: `0 0 ${theme.space.sm} 0`,
        }}>
          {t('clients.add_phone_instructions')}
        </p>

        <div style={{
          fontSize: theme.fontSize.xs,
          color: theme.colors.textMuted,
          background: theme.colors.bgCard,
          padding: theme.space.sm,
          borderRadius: theme.radius.sm,
          wordBreak: 'break-all',
          marginBottom: theme.space.lg,
        }}>
          {url}
        </div>

        <SButton variant="secondary" onClick={onClose} fullWidth>
          {t('common.close')}
        </SButton>
      </div>
    </div>
  );
};
