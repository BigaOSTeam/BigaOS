import React, { useEffect, useState } from 'react';
import { weatherAPI, WeatherForecastResponse } from '../../../services/api';
import { useSettings } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { wsService } from '../../../services/websocket';
import { getWaterTempColor } from '../../../utils/weather.utils';
import { useLanguage } from '../../../i18n/LanguageContext';

interface SeaTempForecastItemProps {
  latitude: number;
  longitude: number;
}

export const SeaTempForecastItem = React.memo<SeaTempForecastItemProps>(({
  latitude,
  longitude,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { weatherSettings, timeFormat } = useSettings();

  useEffect(() => {
    if (!weatherSettings?.enabled) { setLoading(false); setError('Weather disabled'); return; }
    const fetchForecast = async () => {
      try { setLoading(true); setError(null); const r = await weatherAPI.getForecast(latitude, longitude, 24); setForecast(r.data); }
      catch { setError(t('dashboard_item.failed_load')); }
      finally { setLoading(false); }
    };
    fetchForecast();
    const handler = (data: WeatherForecastResponse) => setForecast(data);
    wsService.on('weather', handler);
    return () => { wsService.off('weather', handler); };
  }, [latitude, longitude, weatherSettings?.enabled]);

  if (loading || error || !forecast) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.textMuted }}>
        <div style={{ fontSize: 'clamp(8px, 7cqmin, 28px)' }}>{loading ? t('dashboard_item.loading_weather') : (error || t('dashboard_item.no_data'))}</div>
      </div>
    );
  }

  const current = forecast.current;
  const temp = current.seaTemperature ?? 0;
  const tempColor = temp > 0 ? getWaterTempColor(temp) : theme.colors.textMuted;
  const nowMs = Date.now();
  const nextHours = (forecast.hourly || []).filter(h => new Date(h.timestamp).getTime() >= nowMs - 3600000).slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'clamp(4px, 3cqmin, 16px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 'clamp(8px, 7cqmin, 28px)', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.2 }}>
          {t('weather.forecast_label')}<br />{t('weather.sea_temperature')}
        </div>
        <div style={{ fontSize: 'clamp(14px, 22cqmin, 96px)', fontWeight: theme.fontWeight.bold, color: tempColor, lineHeight: 1, marginTop: 'clamp(2px, 1cqmin, 8px)' }}>
          {temp > 0 ? temp.toFixed(1) : '--'}
        </div>
        <div style={{ fontSize: 'clamp(8px, 8cqmin, 32px)', color: theme.colors.textMuted }}>
          °C
        </div>
      </div>

      {nextHours.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'clamp(2px, 1cqmin, 6px)', borderTop: `1px solid ${theme.colors.border}`, paddingTop: 'clamp(4px, 2cqmin, 12px)', marginTop: 'clamp(4px, 2cqmin, 12px)' }}>
          {nextHours.map((hour, i) => {
            const time = new Date(hour.timestamp);
            const t2 = hour.seaTemperature ?? 0;
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 'clamp(7px, 5cqmin, 20px)', flex: 1 }}>
                <div style={{ color: theme.colors.textMuted }}>
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}
                </div>
                <div style={{ color: t2 > 0 ? getWaterTempColor(t2) : theme.colors.textDisabled, fontWeight: 'bold' }}>
                  {t2 > 0 ? `${t2.toFixed(1)}°` : '--'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
