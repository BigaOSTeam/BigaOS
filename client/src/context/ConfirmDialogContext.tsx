import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTheme } from './ThemeContext';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export const useConfirmDialog = (): ConfirmDialogContextType => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
  }
  return context;
};

interface DialogState extends ConfirmDialogOptions {
  resolve: (value: boolean) => void;
}

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    dialog?.resolve(true);
    setDialog(null);
  };

  const handleCancel = () => {
    dialog?.resolve(false);
    setDialog(null);
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={handleCancel}
        >
          <div
            style={{
              background: theme.colors.bgSecondary,
              borderRadius: theme.radius.lg,
              padding: theme.space.xl,
              minWidth: '280px',
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              border: `1px solid ${theme.colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.bold,
                color: theme.colors.textPrimary,
                marginBottom: theme.space.md,
              }}
            >
              {dialog.title}
            </div>
            <div
              style={{
                fontSize: theme.fontSize.base,
                color: theme.colors.textSecondary,
                marginBottom: theme.space.xl,
                lineHeight: 1.5,
              }}
            >
              {dialog.message}
            </div>
            <div style={{ display: 'flex', gap: theme.space.md }}>
              <button
                onClick={handleCancel}
                className="s-btn"
                style={{
                  flex: 1,
                  padding: theme.space.md,
                  background: theme.colors.bgCardActive,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radius.md,
                  color: theme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.bold,
                }}
              >
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={handleConfirm}
                className="s-btn"
                style={{
                  flex: 1,
                  padding: theme.space.md,
                  background: dialog.confirmColor || theme.colors.error,
                  border: 'none',
                  borderRadius: theme.radius.md,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.bold,
                }}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};
