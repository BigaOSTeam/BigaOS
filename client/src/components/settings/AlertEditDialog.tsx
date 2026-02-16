import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSettings, windConversions, speedConversions, depthConversions, temperatureConversions } from '../../context/SettingsContext';
import { CustomSelect, SelectOption } from '../ui/CustomSelect';
import { useLanguage } from '../../i18n/LanguageContext';
import { ALERT_SOUNDS } from '../../utils/audio';
import { SLabel, SInput, SButton } from '../ui/SettingsUI';
import {
  AlertDefinition,
  AlertDataSource,
  AlertOperator,
  AlertSeverity,
  AlertTone,
  DATA_SOURCE_OPERATORS,
  OPERATOR_LABELS,
  SNOOZE_OPTIONS,
  PREMADE_ALERTS,
  isWeatherDataSource,
  getUnitForDataSource,
  getDataSourceLabel,
  getToneLabel,
  getOperatorSpokenLabel,
  getSeverityLabel,
} from '../../types/alerts';

interface AlertEditDialogProps {
  alert: AlertDefinition | null; // null = creating new
  onSave: (alert: AlertDefinition | Omit<AlertDefinition, 'id'>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const DATA_SOURCES: AlertDataSource[] = [
  'wind_speed',
  'speed_over_ground',
  'depth',
  'battery_voltage',
  'battery_soc',
  'wind_gusts',
  'wave_height',
  'temperature_air',
  'temperature_water',
  'wind_forecast',
  'wave_forecast',
];

const SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];
const TONES: AlertTone[] = [
  'none', 'beep', 'notification', 'alarm', 'chime', 'warning',
  'sonar', 'bell', 'siren', 'gentle', 'urgent', 'foghorn',
  'triple', 'ascending', 'ding',
];

export const AlertEditDialog: React.FC<AlertEditDialogProps> = ({
  alert,
  onSave,
  onDelete,
  onClose,
}) => {
  const { theme } = useTheme();
  const {
    windUnit,
    speedUnit,
    depthUnit,
    temperatureUnit,
  } = useSettings();
  const { t } = useLanguage();

  const isNew = alert === null;
  const isPremade = alert?.isPremade ?? false;

  const [name, setName] = useState(alert?.name ?? '');
  const [dataSource, setDataSource] = useState<AlertDataSource>(
    alert?.dataSource ?? 'wind_forecast'
  );
  const [operator, setOperator] = useState<AlertOperator>(
    alert?.operator ?? 'greater_than'
  );
  const [threshold, setThreshold] = useState(alert?.threshold ?? 20);
  const [thresholdInput, setThresholdInput] = useState(String(alert?.threshold ?? 20));
  const [thresholdError, setThresholdError] = useState(false);
  const [forecastHours, setForecastHours] = useState(alert?.forecastHours ?? 1);
  const [snoozeDuration, setSnoozeDuration] = useState(
    alert?.snoozeDurationMinutes ?? 30
  );
  const [severity, setSeverity] = useState<AlertSeverity>(
    alert?.severity ?? 'warning'
  );
  const [tone, setTone] = useState<AlertTone>(alert?.tone ?? 'notification');
  const [message, setMessage] = useState(
    alert?.message ?? 'Value {condition} {threshold} (current: {value})'
  );

  const validOperators = DATA_SOURCE_OPERATORS[dataSource];
  const isForecastBased = isWeatherDataSource(dataSource);

  const currentUnit = getUnitForDataSource(
    dataSource,
    windConversions[windUnit].label,
    speedConversions[speedUnit].label,
    depthConversions[depthUnit].label,
    temperatureConversions[temperatureUnit].label
  );

  const dataSourceOptions: SelectOption<AlertDataSource>[] = DATA_SOURCES.map((source) => ({
    value: source,
    label: getDataSourceLabel(source, t),
  }));

  const operatorOptions: SelectOption<AlertOperator>[] = validOperators.map((op) => ({
    value: op,
    label: getOperatorSpokenLabel(op, t),
  }));

  const snoozeOptions: SelectOption<number>[] = SNOOZE_OPTIONS.map((mins) => ({
    value: mins,
    label: `${mins} ${t('alerts.minutes')}`,
  }));

  const toneOptions: SelectOption<AlertTone>[] = TONES.map((tone) => ({
    value: tone,
    label: getToneLabel(tone, t),
  }));

  const handleDataSourceChange = (newSource: AlertDataSource) => {
    setDataSource(newSource);
    const newValidOperators = DATA_SOURCE_OPERATORS[newSource];
    if (!newValidOperators.includes(operator)) {
      setOperator(newValidOperators[0]);
    }
  };

  const playTonePreview = () => {
    const playFn = ALERT_SOUNDS[tone];
    if (playFn) {
      playFn();
    }
  };

  const handleResetToDefault = () => {
    if (!alert?.premadeId) return;
    const defaultAlert = PREMADE_ALERTS.find(
      (a) => a.premadeId === alert.premadeId
    );
    if (defaultAlert) {
      setName(defaultAlert.name);
      setDataSource(defaultAlert.dataSource);
      setOperator(defaultAlert.operator);
      setThreshold(defaultAlert.threshold);
      setThresholdInput(String(defaultAlert.threshold));
      setThresholdError(false);
      setForecastHours(defaultAlert.forecastHours ?? 1);
      setSnoozeDuration(defaultAlert.snoozeDurationMinutes);
      setSeverity(defaultAlert.severity);
      setTone(defaultAlert.tone);
      setMessage(defaultAlert.message);
    }
  };

  const handleSave = () => {
    const alertData = {
      ...(alert ?? {}),
      name,
      enabled: alert?.enabled ?? true,
      dataSource,
      operator,
      threshold,
      forecastHours: isForecastBased ? forecastHours : undefined,
      snoozeDurationMinutes: snoozeDuration,
      severity,
      tone,
      message,
      isPremade: isPremade,
      premadeId: alert?.premadeId,
    };

    if (isNew) {
      onSave(alertData as Omit<AlertDefinition, 'id'>);
    } else {
      onSave({ ...alertData, id: alert!.id } as AlertDefinition);
    }
  };

  const getSeverityColor = (s: AlertSeverity) => {
    switch (s) {
      case 'info':
        return theme.colors.info;
      case 'warning':
        return theme.colors.warning;
      case 'critical':
        return theme.colors.error;
    }
  };

  const getSeverityLightColor = (s: AlertSeverity) => {
    switch (s) {
      case 'info':
        return theme.colors.infoLight;
      case 'warning':
        return theme.colors.warningLight;
      case 'critical':
        return theme.colors.errorLight;
    }
  };

  const canSave = name.trim() && !thresholdError && thresholdInput.trim() !== '';

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
        className="settings-scroll"
        style={{
          background: theme.colors.bgSecondary,
          borderRadius: theme.radius.lg,
          padding: theme.space.xl,
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: theme.shadow.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.space.xl,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: theme.fontSize.lg,
              fontWeight: theme.fontWeight.bold,
              color: theme.colors.textPrimary,
            }}
          >
            {isNew ? t('alerts.create_alert') : t('alerts.edit_alert')}
          </h2>
          <SButton variant="ghost" onClick={onClose} style={{ padding: theme.space.xs }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </SButton>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.lg }}>
          {/* Name */}
          <div>
            <SLabel>{t('alerts.alert_name')}</SLabel>
            <SInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('alerts.alert_name_placeholder')}
            />
          </div>

          {/* Data Source */}
          <div>
            <SLabel>{t('alerts.data_source')}</SLabel>
            <CustomSelect
              value={dataSource}
              options={dataSourceOptions}
              onChange={handleDataSourceChange}
            />
          </div>

          {/* Operator */}
          <div>
            <SLabel>{t('alerts.condition')}</SLabel>
            <CustomSelect
              value={operator}
              options={operatorOptions}
              onChange={setOperator}
            />
          </div>

          {/* Threshold and Forecast Hours */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isForecastBased ? '1fr 1fr' : '1fr',
              gap: theme.space.md,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SLabel style={{ flex: 1 }}>{t('alerts.threshold')} ({currentUnit})</SLabel>
              <SInput
                type="text"
                value={thresholdInput}
                error={thresholdError}
                onChange={(e) => {
                  const value = e.target.value;
                  setThresholdInput(value);
                  const parsed = parseFloat(value);
                  if (!isNaN(parsed) && value.trim() !== '') {
                    setThreshold(parsed);
                    setThresholdError(false);
                  } else {
                    setThresholdError(value.trim() !== '');
                  }
                }}
                onBlur={() => {
                  if (!thresholdError && thresholdInput.trim() !== '') {
                    setThresholdInput(String(threshold));
                  }
                }}
              />
            </div>

            {isForecastBased && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <SLabel style={{ flex: 1 }}>{t('alerts.forecast_window')}</SLabel>
                <SInput
                  type="number"
                  value={forecastHours}
                  onChange={(e) =>
                    setForecastHours(parseInt(e.target.value) || 1)
                  }
                  min={1}
                  max={6}
                />
              </div>
            )}
          </div>

          {/* Snooze Duration */}
          <div>
            <SLabel>{t('alerts.snooze_duration')}</SLabel>
            <CustomSelect
              value={snoozeDuration}
              options={snoozeOptions}
              onChange={setSnoozeDuration}
            />
          </div>

          {/* Severity */}
          <div>
            <SLabel>{t('alerts.severity')}</SLabel>
            <div style={{ display: 'flex', gap: theme.space.sm }}>
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    background:
                      severity === s
                        ? getSeverityLightColor(s)
                        : theme.colors.bgCardActive,
                    border: 'none',
                    borderRadius: theme.radius.md,
                    color: theme.colors.textPrimary,
                    fontSize: theme.fontSize.md,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                    transition: `all ${theme.transition.fast}`,
                    minHeight: '42px',
                    fontWeight: severity === s ? theme.fontWeight.bold : theme.fontWeight.normal,
                  }}
                >
                  {getSeverityLabel(s, t)}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <SLabel>{t('alerts.sound')}</SLabel>
            <div style={{ display: 'flex', gap: theme.space.sm }}>
              <div style={{ flex: 1 }}>
                <CustomSelect
                  value={tone}
                  options={toneOptions}
                  onChange={setTone}
                />
              </div>
              {tone !== 'none' && (
                <SButton variant="outline" onClick={playTonePreview}>
                  {t('alerts.preview')}
                </SButton>
              )}
            </div>
          </div>

          {/* Message */}
          <div>
            <SLabel>{t('alerts.message_template')}</SLabel>
            <SInput
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('alerts.message_placeholder')}
            />
            {/* Live preview */}
            <SLabel style={{ marginTop: theme.space.md }}>{t('alerts.preview_label')}</SLabel>
            <div
              style={{
                padding: theme.space.sm,
                background: theme.colors.bgCardActive,
                borderRadius: theme.radius.sm,
                borderLeft: `3px solid ${getSeverityColor(severity)}`,
              }}
            >
              <div
                style={{
                  fontSize: theme.fontSize.sm,
                  color: theme.colors.textPrimary,
                }}
              >
                {message
                  .replace('{value}', `${(threshold * 1.2).toFixed(1)}${currentUnit}`)
                  .replace('{threshold}', `${threshold.toFixed(1)}${currentUnit}`)
                  .replace('{condition}', OPERATOR_LABELS[operator])}
              </div>
            </div>
            {/* Placeholders */}
            <div
              style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
                marginTop: theme.space.md,
                lineHeight: 1.6,
              }}
            >
              <div style={{ marginBottom: theme.space.xs }}>
                <strong>{t('alerts.placeholders')}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
                <span><code style={{ background: theme.colors.bgCard, padding: '2px 4px', borderRadius: theme.radius.xs }}>{'{value}'}</code> {t('alerts.value_desc')}</span>
                <span><code style={{ background: theme.colors.bgCard, padding: '2px 4px', borderRadius: theme.radius.xs }}>{'{threshold}'}</code> {t('alerts.threshold_desc')}</span>
                <span><code style={{ background: theme.colors.bgCard, padding: '2px 4px', borderRadius: theme.radius.xs }}>{'{condition}'}</code> {t('alerts.condition_desc')} ({OPERATOR_LABELS[operator]})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: theme.space.xl,
            paddingTop: theme.space.lg,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <div>
            {isPremade && (
              <SButton variant="outline" onClick={handleResetToDefault}>
                {t('alerts.reset_to_default')}
              </SButton>
            )}
            {onDelete && !isPremade && (
              <SButton variant="danger" onClick={onDelete}>
                {t('common.delete')}
              </SButton>
            )}
          </div>
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <SButton variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </SButton>
            <SButton
              variant="primary"
              onClick={handleSave}
              disabled={!canSave}
            >
              {isNew ? t('alerts.create') : t('common.save')}
            </SButton>
          </div>
        </div>
      </div>
    </div>
  );
};
