import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings, windConversions, speedConversions, depthConversions, temperatureConversions } from '../../context/SettingsContext';
import { useAlerts } from '../../context/AlertContext';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  AlertDefinition,
  OPERATOR_LABELS,
  getSeverityColor,
  isWeatherDataSource,
  getUnitForDataSource,
  getDataSourceLabel,
} from '../../types/alerts';
import { SButton, SCard, SToggle } from '../ui/SettingsUI';
import { AlertEditDialog } from './AlertEditDialog';

export const AlertsTab: React.FC = () => {
  const { theme } = useTheme();
  const {
    alertSettings,
    windUnit,
    speedUnit,
    depthUnit,
    temperatureUnit,
  } = useSettings();
  const { deleteAlert, createAlert, updateAlert, setGlobalEnabled } = useAlerts();
  const { t } = useLanguage();
  const [editingAlert, setEditingAlert] = useState<AlertDefinition | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const formatCondition = (alert: AlertDefinition) => {
    const sourceLabel = getDataSourceLabel(alert.dataSource, t);
    const unit = getUnitForDataSource(
      alert.dataSource,
      windConversions[windUnit].label,
      speedConversions[speedUnit].label,
      depthConversions[depthUnit].label,
      temperatureConversions[temperatureUnit].label
    );
    const operatorLabel = OPERATOR_LABELS[alert.operator];
    const thresholdStr = alert.threshold.toFixed(1);

    if (isWeatherDataSource(alert.dataSource) && alert.forecastHours) {
      return `${sourceLabel} ${operatorLabel} ${thresholdStr}${unit} in ${alert.forecastHours}h`;
    }
    return `${sourceLabel} ${operatorLabel} ${thresholdStr}${unit}`;
  };

  const renderAlertItem = (alert: AlertDefinition) => {
    const severityColor = getSeverityColor(alert.severity);

    return (
      <div
        key={alert.id}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          padding: theme.space.md,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.md,
          borderLeft: `3px solid ${severityColor}`,
          marginBottom: theme.space.sm,
          opacity: alertSettings.globalEnabled ? 1 : 0.6,
        }}
      >
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: theme.space.sm,
              marginBottom: theme.space.xs,
            }}
          >
            <span
              style={{
                fontWeight: theme.fontWeight.semibold,
                color: theme.colors.textPrimary,
                fontSize: theme.fontSize.md,
              }}
            >
              {alert.name}
            </span>
            <span
              style={{
                fontSize: theme.fontSize.xs,
                padding: `2px ${theme.space.xs}`,
                borderRadius: theme.radius.sm,
                background: `${severityColor}30`,
                color: severityColor,
                textTransform: 'uppercase',
              }}
            >
              {alert.severity}
            </span>
          </div>
          <div
            style={{
              fontSize: theme.fontSize.sm,
              color: theme.colors.textMuted,
            }}
          >
            {formatCondition(alert)}
          </div>
        </div>

        {/* Edit Button */}
        <SButton
          variant="outline"
          onClick={() => setEditingAlert(alert)}
          style={{ padding: `${theme.space.sm} ${theme.space.md}`, marginRight: theme.space.sm }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </SButton>

        {/* Delete Button */}
        <SButton
          variant="danger"
          onClick={() => deleteAlert(alert.id)}
          style={{ padding: `${theme.space.sm} ${theme.space.md}` }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </SButton>
      </div>
    );
  };

  return (
    <div>
      {/* Global Toggle */}
      <SCard
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.space.xl,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: theme.fontWeight.semibold,
              color: theme.colors.textPrimary,
              fontSize: theme.fontSize.md,
              marginBottom: theme.space.xs,
            }}
          >
            {t('alerts.enable_alerts')}
          </div>
          <div
            style={{
              fontSize: theme.fontSize.sm,
              color: theme.colors.textMuted,
            }}
          >
            {t('alerts.master_toggle')}
          </div>
        </div>
        <SToggle
          checked={alertSettings.globalEnabled}
          onChange={setGlobalEnabled}
        />
      </SCard>

      {/* Alerts List */}
      <div style={{ marginBottom: theme.space.lg }}>
        {alertSettings.alerts.map(renderAlertItem)}
        {alertSettings.alerts.length === 0 && (
          <div
            style={{
              padding: theme.space.lg,
              color: theme.colors.textMuted,
              textAlign: 'center',
              background: theme.colors.bgCard,
              borderRadius: theme.radius.md,
              marginBottom: theme.space.md,
            }}
          >
            {t('alerts.no_alerts')}
          </div>
        )}
      </div>

      {/* Add Custom Alert Button */}
      <SButton
        variant="secondary"
        fullWidth
        onClick={() => setIsCreating(true)}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        }
      >
        {t('alerts.add_alert')}
      </SButton>

      {/* Edit Dialog */}
      {editingAlert && (
        <AlertEditDialog
          alert={editingAlert}
          onSave={(updated) => {
            updateAlert(updated as AlertDefinition);
            setEditingAlert(null);
          }}
          onDelete={() => {
            deleteAlert(editingAlert.id);
            setEditingAlert(null);
          }}
          onClose={() => setEditingAlert(null)}
        />
      )}

      {/* Create Dialog */}
      {isCreating && (
        <AlertEditDialog
          alert={null}
          onSave={(newAlert) => {
            createAlert(newAlert);
            setIsCreating(false);
          }}
          onClose={() => setIsCreating(false)}
        />
      )}
    </div>
  );
};
