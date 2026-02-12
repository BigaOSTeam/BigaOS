import React, { useEffect, useState } from 'react';
import { weatherAPI, WeatherForecastResponse } from '../../../services/api';
import { useSettings } from '../../../context/SettingsContext';
import { theme } from '../../../styles/theme';
import { wsService } from '../../../services/websocket';
import { getWindColor, formatWindDirection } from '../../../utils/weather.utils';
import { radToDeg } from '../../../utils/angle';
import { useLanguage } from '../../../i18n/LanguageContext';

interface WeatherForecastItemProps {
  latitude: number;
  longitude: number;
}

export const WeatherForecastItem: React.FC<WeatherForecastItemProps> = ({
  latitude,
  longitude,
}) => {
  const { t } = useLanguage();
  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { weatherSettings } = useSettings();

  // Fetch weather data
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

    // Listen for weather updates via WebSocket
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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: theme.space.md,
        color: theme.colors.textMuted,
      }}>
        <div style={{ fontSize: theme.fontSize.sm }}>{t('dashboard_item.loading_weather')}</div>
      </div>
    );
  }

  if (error || !forecast) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: theme.space.md,
        color: theme.colors.textMuted,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ fontSize: theme.fontSize.sm, marginTop: theme.space.sm }}>{error || t('dashboard_item.no_data')}</div>
      </div>
    );
  }

  const current = forecast.current;
  const windColor = getWindColor(current.wind.speed);

  // Get next 6 hours of forecast
  const nextHours = forecast.hourly?.slice(0, 6) || [];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: theme.space.md,
    }}>
      {/* Header */}
      <div style={{
        fontSize: theme.fontSize.sm,
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        textAlign: 'center',
      }}>
        {t('dashboard.weather')}
      </div>

      {/* Current conditions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.md,
        flex: 1,
        minHeight: 0,
      }}>
        {/* Wind arrow */}
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          style={{
            transform: `rotate(${radToDeg(current.wind.direction + Math.PI)}deg)`,
            transition: `transform ${theme.transition.slow}`,
            flexShrink: 0,
          }}
        >
          <path
            d="M12 2L8 10h3v10h2V10h3L12 2z"
            fill={windColor}
            stroke="#000"
            strokeWidth="0.5"
          />
        </svg>

        {/* Wind info */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: theme.fontSize['2xl'],
            fontWeight: theme.fontWeight.bold,
            color: windColor,
            lineHeight: 1,
          }}>
            {Math.round(current.wind.speed)}
          </div>
          <div style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
            kt {formatWindDirection(current.wind.direction)}
          </div>
          {current.wind.gusts > current.wind.speed + 5 && (
            <div style={{ fontSize: theme.fontSize.xs, color: '#FF9800' }}>
              G{Math.round(current.wind.gusts)}
            </div>
          )}
        </div>

        {/* Additional info */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space.xs,
          fontSize: theme.fontSize.xs,
          color: theme.colors.textSecondary,
        }}>
          {current.waves && (
            <div>
              <span style={{ color: '#4FC3F7' }}>{current.waves.height.toFixed(1)}m</span> {t('dashboard_item.waves')}
            </div>
          )}
          {current.pressure && (
            <div>{current.pressure} hPa</div>
          )}
        </div>
      </div>

      {/* Mini forecast strip */}
      {nextHours.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: theme.space.xs,
          borderTop: `1px solid ${theme.colors.border}`,
          paddingTop: theme.space.sm,
          marginTop: theme.space.sm,
        }}>
          {nextHours.map((hour, i) => {
            const time = new Date(hour.timestamp);
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: theme.fontSize.xs,
                flex: 1,
              }}>
                <div style={{ color: theme.colors.textMuted }}>
                  {time.getHours().toString().padStart(2, '0')}h
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  style={{
                    transform: `rotate(${radToDeg(hour.wind.direction + Math.PI)}deg)`,
                    margin: '2px 0',
                  }}
                >
                  <path
                    d="M12 2L8 10h3v10h2V10h3L12 2z"
                    fill={getWindColor(hour.wind.speed)}
                    stroke="#000"
                    strokeWidth="0.5"
                  />
                </svg>
                <div style={{ color: getWindColor(hour.wind.speed), fontWeight: 'bold' }}>
                  {Math.round(hour.wind.speed)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Attribution */}
      <div style={{
        fontSize: '9px',
        color: theme.colors.textMuted,
        textAlign: 'center',
        marginTop: theme.space.xs,
        opacity: 0.6,
      }}>
        Open-Meteo.com (CC-BY 4.0)
      </div>
    </div>
  );
};
