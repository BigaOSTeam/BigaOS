import React, { useEffect, useState } from 'react';
import { weatherAPI, WeatherForecastResponse } from '../../../services/api';
import { useSettings, depthConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { wsService } from '../../../services/websocket';
import { getTideColor } from '../../../utils/weather.utils';
import { findTideExtrema, getTideRange, getTideStateAt } from '../../../utils/tide.utils';
import { useLanguage } from '../../../i18n/LanguageContext';

interface TideForecastItemProps {
  latitude: number;
  longitude: number;
}

// Low water = red (least depth / hazard), high water = blue — matches the chart overlay.
const HW_COLOR = '#4aa0e0';
const LW_COLOR = '#d75050';

export const TideForecastItem = React.memo<TideForecastItemProps>(({
  latitude,
  longitude,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { weatherSettings, timeFormat, depthUnit, convertDepth } = useSettings();
  const dLabel = depthConversions[depthUnit].label;

  useEffect(() => {
    if (!weatherSettings?.enabled) { setLoading(false); setError('Weather disabled'); return; }
    const fetchForecast = async () => {
      // 72h so high/low water can be found regardless of time of day.
      try { setLoading(true); setError(null); const r = await weatherAPI.getForecast(latitude, longitude, 72); setForecast(r.data); }
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

  const points = forecast.hourly || [];
  const range = getTideRange(points, 48);
  const state = getTideStateAt(points, 0);
  const height = state.height;
  const color = height != null ? getTideColor(height, range.min, range.max) : theme.colors.textMuted;
  const fmt = (m: number | null | undefined) => {
    if (m == null) return '--';
    const v = convertDepth(m);
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  };
  const trendLabel =
    state.trend === 'rising' ? `▲ ${t('weather.rising')}` :
    state.trend === 'falling' ? `▼ ${t('weather.falling')}` :
    state.trend === 'slack' ? `● ${t('weather.slack')}` : '';
  const trendColor = state.trend === 'rising' ? HW_COLOR : state.trend === 'falling' ? LW_COLOR : theme.colors.textMuted;

  const nextExtrema = findTideExtrema(points).filter((e) => e.hour > 0).slice(0, 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'clamp(4px, 3cqmin, 16px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 'clamp(8px, 7cqmin, 28px)', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.2 }}>
          {t('weather.forecast_label')}<br />{t('weather.tide')}
        </div>
        <div style={{ fontSize: 'clamp(14px, 22cqmin, 96px)', fontWeight: theme.fontWeight.bold, color, lineHeight: 1, marginTop: 'clamp(2px, 1cqmin, 8px)' }}>
          {fmt(height)}
        </div>
        <div style={{ fontSize: 'clamp(8px, 6cqmin, 24px)', color: theme.colors.textMuted }}>
          {dLabel}
        </div>
        {trendLabel && (
          <div style={{ fontSize: 'clamp(10px, 8cqmin, 30px)', fontWeight: theme.fontWeight.bold, color: trendColor, marginTop: 'clamp(1px, 1cqmin, 6px)' }}>
            {trendLabel}
          </div>
        )}
      </div>

      {nextExtrema.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'clamp(2px, 1cqmin, 6px)', borderTop: `1px solid ${theme.colors.border}`, paddingTop: 'clamp(4px, 2cqmin, 12px)', marginTop: 'clamp(4px, 2cqmin, 12px)' }}>
          {nextExtrema.map((e, i) => {
            const time = new Date(e.timestamp);
            const isHigh = e.type === 'high';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 'clamp(7px, 5cqmin, 20px)', flex: 1 }}>
                <div style={{ color: isHigh ? HW_COLOR : LW_COLOR, fontWeight: 'bold' }}>
                  {isHigh ? '▲' : '▼'} {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}
                </div>
                <div style={{ color: theme.colors.textMuted }}>
                  {fmt(e.height)}{dLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
