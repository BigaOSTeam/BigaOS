import React, { useEffect, useState } from 'react';
import { weatherAPI, WeatherForecastResponse } from '../../../services/api';
import { useSettings, depthConversions } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { wsService } from '../../../services/websocket';
import { getWaveColor } from '../../../utils/weather.utils';
import { useLanguage } from '../../../i18n/LanguageContext';

interface WaveForecastItemProps {
  latitude: number;
  longitude: number;
}

export const WaveForecastItem: React.FC<WaveForecastItemProps> = ({
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
    if (!weatherSettings?.enabled) {
      setLoading(false);
      setError('Weather disabled');
      return;
    }

    const fetchForecast = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await weatherAPI.getForecast(latitude, longitude, 24);
        setForecast(response.data);
      } catch (err) {
        console.error('Failed to fetch weather:', err);
        setError(t('dashboard_item.failed_load'));
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();

    const handleWeatherUpdate = (data: WeatherForecastResponse) => {
      setForecast(data);
    };
    wsService.on('weather', handleWeatherUpdate);

    return () => {
      wsService.off('weather', handleWeatherUpdate);
    };
  }, [latitude, longitude, weatherSettings?.enabled]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.textMuted }}>
        <div style={{ fontSize: 'clamp(8px, 7cqmin, 28px)' }}>{t('dashboard_item.loading_weather')}</div>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.textMuted }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 'clamp(16px, 15cqmin, 64px)', height: 'clamp(16px, 15cqmin, 64px)' }}>
          <path d="M2 12c2-2 4-3 6-3s4 2 6 0 4-3 6-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 17c2-2 4-3 6-3s4 2 6 0 4-3 6-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontSize: 'clamp(8px, 7cqmin, 28px)', marginTop: 'clamp(4px, 2cqmin, 12px)' }}>{error || t('dashboard_item.no_data')}</div>
      </div>
    );
  }

  const current = forecast.current;
  const waveHeight = current.waves?.height ?? 0;
  const swellHeight = current.swell?.height ?? 0;
  const waveColor = getWaveColor(waveHeight);
  const nowMs = Date.now();
  const futureHours = (forecast.hourly || []).filter(h => new Date(h.timestamp).getTime() >= nowMs - 3600000);
  const nextHours = futureHours.slice(0, 6);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: 'clamp(4px, 3cqmin, 16px)',
    }}>
      {/* Current waves */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 0,
      }}>
        <div style={{
          fontSize: 'clamp(8px, 7cqmin, 28px)',
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          textAlign: 'center',
          lineHeight: 1.2,
        }}>
          {t('weather.forecast_label')}<br />{t('weather.waves')}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 'clamp(4px, 4cqmin, 20px)',
          marginTop: 'clamp(2px, 1cqmin, 8px)',
        }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 'clamp(12px, 18cqmin, 80px)',
            fontWeight: theme.fontWeight.bold,
            color: waveColor,
            lineHeight: 1,
          }}>
            {waveHeight > 0 ? convertDepth(waveHeight).toFixed(1) : '--'}
          </div>
          <div style={{ fontSize: 'clamp(7px, 5cqmin, 20px)', color: theme.colors.textMuted }}>
            {dLabel} {t('weather.waves')}
          </div>
        </div>
        {swellHeight > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 'clamp(12px, 18cqmin, 80px)',
              fontWeight: theme.fontWeight.bold,
              color: getWaveColor(swellHeight),
              lineHeight: 1,
            }}>
              {convertDepth(swellHeight).toFixed(1)}
            </div>
            <div style={{ fontSize: 'clamp(7px, 5cqmin, 20px)', color: theme.colors.textMuted }}>
              {dLabel} {t('weather.swell')}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* 6h forecast strip */}
      {nextHours.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'clamp(2px, 1cqmin, 6px)',
          borderTop: `1px solid ${theme.colors.border}`,
          paddingTop: 'clamp(4px, 2cqmin, 12px)',
          marginTop: 'clamp(4px, 2cqmin, 12px)',
        }}>
          {nextHours.map((hour, i) => {
            const time = new Date(hour.timestamp);
            const h = hour.waves?.height ?? 0;
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: 'clamp(7px, 5cqmin, 20px)',
                flex: 1,
              }}>
                <div style={{ color: theme.colors.textMuted }}>
                  {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}
                </div>
                <div style={{ color: getWaveColor(h), fontWeight: 'bold' }}>
                  {h > 0 ? `${convertDepth(h).toFixed(1)}${dLabel}` : '--'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
