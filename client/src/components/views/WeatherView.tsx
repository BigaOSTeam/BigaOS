import React, { useState, useEffect, useMemo } from 'react';
import { WeatherPoint } from '../../types';
import { weatherAPI, WeatherForecastResponse } from '../../services/api';
import { useSettings, windConversions } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { wsService } from '../../services/websocket';
import { radToDeg } from '../../utils/angle';
import { getWindColor, getWaveColor, formatWindDirection } from '../../utils/weather.utils';
import { ViewLayout } from './shared';

interface WeatherViewProps {
  latitude: number;
  longitude: number;
  onClose: () => void;
}

interface DaySummary {
  label: string;
  shortLabel: string;
  date: string;
  hours: WeatherPoint[];
  avgWind: number;
  maxWind: number;
  maxGusts: number;
  maxWaves: number;
  avgWaves: number;
  maxSwell: number;
  avgPressure: number;
  avgSeaTemp: number;
  dominantDirection: number;
}

const computeDaySummary = (label: string, shortLabel: string, date: string, hours: WeatherPoint[]): DaySummary => {
  const winds = hours.map(h => h.wind.speed);
  const gusts = hours.map(h => h.wind.gusts);
  const waves = hours.filter(h => h.waves).map(h => h.waves!.height);
  const swells = hours.filter(h => h.swell).map(h => h.swell!.height);
  const pressures = hours.filter(h => h.pressure).map(h => h.pressure!);
  const temps = hours.filter(h => h.seaTemperature !== undefined).map(h => h.seaTemperature!);

  // Dominant direction: circular mean
  let sinSum = 0, cosSum = 0;
  hours.forEach(h => {
    sinSum += Math.sin(h.wind.direction);
    cosSum += Math.cos(h.wind.direction);
  });
  const dominantDirection = Math.atan2(sinSum, cosSum);

  return {
    label,
    shortLabel,
    date,
    hours,
    avgWind: winds.length ? winds.reduce((a, b) => a + b, 0) / winds.length : 0,
    maxWind: winds.length ? Math.max(...winds) : 0,
    maxGusts: gusts.length ? Math.max(...gusts) : 0,
    maxWaves: waves.length ? Math.max(...waves) : 0,
    avgWaves: waves.length ? waves.reduce((a, b) => a + b, 0) / waves.length : 0,
    maxSwell: swells.length ? Math.max(...swells) : 0,
    avgPressure: pressures.length ? Math.round(pressures.reduce((a, b) => a + b, 0) / pressures.length) : 0,
    avgSeaTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0,
    dominantDirection,
  };
};

export const WeatherView: React.FC<WeatherViewProps> = ({ latitude, longitude, onClose }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { weatherSettings, timeFormat, windUnit, convertWind } = useSettings();
  const { language } = useLanguage();
  const wLabel = windConversions[windUnit].label;
  const fmtWind = (kt: number) => {
    const v = convertWind(kt);
    return windUnit === 'bft' ? v.toFixed(0) : v.toFixed(1);
  };
  const [forecast, setForecast] = useState<WeatherForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    if (!weatherSettings?.enabled) {
      setLoading(false);
      return;
    }

    const fetchForecast = async () => {
      try {
        setLoading(true);
        const response = await weatherAPI.getForecast(latitude, longitude, 168);
        setForecast(response.data);
      } catch (err) {
        console.error('Failed to fetch weather:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();

    const handleWeatherUpdate = (data: WeatherForecastResponse) => {
      setForecast(data);
    };
    wsService.on('weather', handleWeatherUpdate);
    return () => { wsService.off('weather', handleWeatherUpdate); };
  }, [latitude, longitude, weatherSettings?.enabled]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
  };

  const formatAge = (fetchedAt: string) => {
    const mins = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000);
    if (mins < 1) return t('update.just_now');
    if (mins < 60) return t('update.ago', { time: `${mins}m` });
    const hours = Math.floor(mins / 60);
    return t('update.ago', { time: `${hours}h` });
  };

  const days = useMemo(() => {
    if (!forecast?.hourly) return [];
    const now = new Date();
    const groups: Map<string, { label: string; shortLabel: string; date: string; hours: WeatherPoint[] }> = new Map();

    for (const hour of forecast.hourly) {
      const d = new Date(hour.timestamp);
      const dateKey = d.toDateString();

      if (!groups.has(dateKey)) {
        let label: string;
        let shortLabel: string;
        if (d.toDateString() === now.toDateString()) {
          label = t('common.today');
          shortLabel = label;
        } else {
          const tomorrow = new Date(now);
          tomorrow.setDate(now.getDate() + 1);
          if (d.toDateString() === tomorrow.toDateString()) {
            label = t('common.tomorrow');
            shortLabel = label;
          } else {
            label = d.toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'short' });
            shortLabel = d.toLocaleDateString(language, { weekday: 'short', day: 'numeric' });
          }
        }
        groups.set(dateKey, { label, shortLabel, date: dateKey, hours: [] });
      }
      groups.get(dateKey)!.hours.push(hour);
    }

    return Array.from(groups.values()).map(g => computeDaySummary(g.label, g.shortLabel, g.date, g.hours));
  }, [forecast, t]);

  const selected = days[selectedDay];

  const statLabelStyle: React.CSSProperties = {
    fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '0.15rem',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 'clamp(1.1rem, 4vw, 1.6rem)',
    fontWeight: theme.fontWeight.bold,
  };

  if (loading) {
    return (
      <ViewLayout title={t('weather.marine_forecast')} onClose={onClose}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textMuted }}>
          {t('weather.loading')}
        </div>
      </ViewLayout>
    );
  }

  if (!forecast) {
    return (
      <ViewLayout title={t('weather.marine_forecast')} onClose={onClose}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.textMuted }}>
          {t('chart.no_forecast')}
        </div>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout title={t('weather.marine_forecast')} onClose={onClose}>
      {/* Selected day summary header */}
      {selected && (
        <div style={{
          padding: 'clamp(0.5rem, 1.5vw, 1rem) clamp(0.75rem, 2vw, 1.5rem)',
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(0.75rem, 2vw, 1.5rem)',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}>
          {/* Dominant wind arrow */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <svg
              viewBox="0 0 24 24"
              style={{
                width: 'min(15vw, 70px)',
                height: 'min(15vw, 70px)',
                transform: `rotate(${radToDeg(selected.dominantDirection + Math.PI)}deg)`,
              }}
            >
              <path d="M12 2L8 10h3v10h2V10h3L12 2z" fill={getWindColor(selected.maxWind)} stroke="#000" strokeWidth="0.5" />
            </svg>
            <div style={{ fontSize: 'clamp(0.65rem, 2vw, 0.85rem)', color: theme.colors.textMuted, marginTop: '0.15rem' }}>
              {formatWindDirection(selected.dominantDirection)}
            </div>
            <div style={{ fontSize: 'clamp(0.5rem, 1.3vw, 0.65rem)', color: theme.colors.textDisabled, marginTop: '0.1rem' }}>
              {t('weather.avg_direction')}
            </div>
          </div>

          {/* Stats grid for selected day */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'clamp(0.3rem, 1vw, 0.6rem)',
            flex: 1,
            minWidth: 0,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={statLabelStyle}>{t('speed.avg')} {t('weather.wind')}</div>
              <div style={{ ...statValueStyle, color: getWindColor(selected.avgWind) }}>
                {fmtWind(selected.avgWind)} <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{wLabel}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={statLabelStyle}>{t('speed.max')} {t('weather.wind')}</div>
              <div style={{ ...statValueStyle, color: getWindColor(selected.maxWind) }}>
                {fmtWind(selected.maxWind)} <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{wLabel}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={statLabelStyle}>{t('speed.max')} {t('weather.gusts')}</div>
              <div style={{ ...statValueStyle, color: selected.maxGusts > 30 ? '#FF9800' : theme.colors.textSecondary }}>
                {fmtWind(selected.maxGusts)} <span style={{ fontSize: '0.6em', opacity: 0.7 }}>{wLabel}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={statLabelStyle}>{t('speed.max')} {t('weather.waves')}</div>
              <div style={{ ...statValueStyle, color: selected.maxWaves > 0 ? getWaveColor(selected.maxWaves) : theme.colors.textMuted }}>
                {selected.maxWaves > 0 ? selected.maxWaves.toFixed(1) : '--'}
                <span style={{ fontSize: '0.6em', opacity: 0.7 }}> m</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={statLabelStyle}>{t('speed.max')} {t('weather.swell')}</div>
              <div style={{ ...statValueStyle, color: selected.maxSwell > 0 ? getWaveColor(selected.maxSwell) : theme.colors.textMuted }}>
                {selected.maxSwell > 0 ? selected.maxSwell.toFixed(1) : '--'}
                <span style={{ fontSize: '0.6em', opacity: 0.7 }}> m</span>
              </div>
            </div>
            {selected.avgSeaTemp > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={statLabelStyle}>{t('weather.sea_temperature')}</div>
                <div style={{ ...statValueStyle, color: theme.colors.dataSpeed }}>
                  {selected.avgSeaTemp.toFixed(1)}<span style={{ fontSize: '0.6em', opacity: 0.7 }}>°C</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Updated timestamp */}
      <div style={{
        padding: 'clamp(0.25rem, 0.6vw, 0.4rem) clamp(0.75rem, 2vw, 1.5rem)',
        fontSize: 'clamp(0.6rem, 1.5vw, 0.75rem)',
        color: theme.colors.textDisabled,
        textAlign: 'right',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {t('weather.powered_by')} &middot; {formatAge(forecast.fetchedAt)}
      </div>

      {/* Day selector cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, 1fr)`,
        gap: 'clamp(0.25rem, 0.6vw, 0.5rem)',
        padding: 'clamp(0.4rem, 1vw, 0.6rem) clamp(0.5rem, 1.5vw, 0.75rem)',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        {days.map((day, i) => {
          const isSelected = i === selectedDay;
          return (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className="touch-btn"
              style={{
                padding: 'clamp(0.3rem, 0.8vw, 0.5rem) clamp(0.4rem, 1vw, 0.6rem)',
                background: isSelected ? theme.colors.primaryMedium : theme.colors.bgCard,
                border: isSelected ? `1px solid ${theme.colors.primarySolid}` : `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
                color: theme.colors.textPrimary,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              {/* Day label */}
              <div style={{
                fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)',
                fontWeight: isSelected ? theme.fontWeight.bold : theme.fontWeight.medium,
                whiteSpace: 'nowrap',
              }}>
                {day.shortLabel}
              </div>
              {/* Wind arrow + max */}
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: 'clamp(14px, 3.5vw, 20px)',
                  height: 'clamp(14px, 3.5vw, 20px)',
                  transform: `rotate(${radToDeg(day.dominantDirection + Math.PI)}deg)`,
                }}
              >
                <path d="M12 2L8 10h3v10h2V10h3L12 2z" fill={getWindColor(day.avgWind)} stroke="#000" strokeWidth="0.5" />
              </svg>
              <div style={{
                fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
                fontWeight: theme.fontWeight.bold,
                color: getWindColor(day.avgWind),
              }}>
                {fmtWind(day.avgWind)} {wLabel}
              </div>
              {/* Avg waves */}
              {day.avgWaves > 0 && (
                <div style={{
                  fontSize: 'clamp(0.55rem, 1.5vw, 0.7rem)',
                  color: getWaveColor(day.avgWaves),
                }}>
                  {day.avgWaves.toFixed(1)}m
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day hourly detail */}
      {selected && (
        <div>
          <div style={{ padding: '0 clamp(0.25rem, 0.6vw, 0.5rem)' }}>
            {/* Column header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: 'clamp(0.25rem, 0.6vw, 0.4rem) clamp(0.25rem, 0.6vw, 0.5rem)',
              gap: 'clamp(0.4rem, 1vw, 0.75rem)',
              fontSize: 'clamp(0.55rem, 1.5vw, 0.7rem)',
              color: theme.colors.textDisabled,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderBottom: `1px solid ${theme.colors.border}`,
            }}>
              <div style={{ width: 'clamp(3rem, 10vw, 4.5rem)' }}>{t('weather.time')}</div>
              <div style={{ width: 'clamp(16px, 4vw, 24px)' }} />
              <div style={{ width: 'clamp(3rem, 8vw, 4rem)', textAlign: 'right' }}>{t('weather.wind')}</div>
              <div style={{ width: 'clamp(2.5rem, 7vw, 3.5rem)', textAlign: 'right' }}>{t('weather.gusts')}</div>
              <div style={{ flex: 1, textAlign: 'right' }}>{t('weather.waves')}</div>
              <div style={{ width: 'clamp(2rem, 5vw, 2.5rem)', textAlign: 'right' }}>{t('weather.period')}</div>
              <div style={{ flex: 1, textAlign: 'right' }}>{t('weather.swell')}</div>
              <div style={{ width: 'clamp(2rem, 5vw, 2.5rem)', textAlign: 'right' }}>{t('weather.period')}</div>
              <div style={{ width: 'clamp(3.5rem, 8vw, 4.5rem)', textAlign: 'right' }}>{t('weather.pressure')}</div>
            </div>

            {selected.hours.map((hour, hi) => {
              const windColor = getWindColor(hour.wind.speed);
              const gustsSignificant = hour.wind.gusts > 0;
              return (
                <div
                  key={hi}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 'clamp(0.35rem, 0.9vw, 0.55rem) clamp(0.25rem, 0.6vw, 0.5rem)',
                    borderBottom: `1px solid ${theme.colors.border}`,
                    gap: 'clamp(0.4rem, 1vw, 0.75rem)',
                    fontSize: 'clamp(0.75rem, 2.2vw, 0.95rem)',
                  }}
                >
                  <div style={{ width: 'clamp(3rem, 10vw, 4.5rem)', color: theme.colors.textMuted, flexShrink: 0, fontFamily: 'monospace' }}>
                    {formatTime(hour.timestamp)}
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    style={{
                      width: 'clamp(16px, 4vw, 24px)',
                      height: 'clamp(16px, 4vw, 24px)',
                      transform: `rotate(${radToDeg(hour.wind.direction + Math.PI)}deg)`,
                      flexShrink: 0,
                    }}
                  >
                    <path d="M12 2L8 10h3v10h2V10h3L12 2z" fill={windColor} stroke="#000" strokeWidth="0.5" />
                  </svg>
                  <div style={{ width: 'clamp(3rem, 8vw, 4rem)', fontWeight: theme.fontWeight.bold, color: windColor, flexShrink: 0, textAlign: 'right' }}>
                    {fmtWind(hour.wind.speed)} {wLabel}
                  </div>
                  <div style={{ width: 'clamp(2.5rem, 7vw, 3.5rem)', color: gustsSignificant ? '#FF9800' : theme.colors.textDisabled, flexShrink: 0, textAlign: 'right' }}>
                    {gustsSignificant ? `${fmtWind(hour.wind.gusts)} ${wLabel}` : ''}
                  </div>
                  <div style={{ flex: 1, textAlign: 'right', color: hour.waves ? getWaveColor(hour.waves.height) : theme.colors.textDisabled }}>
                    {hour.waves ? `${hour.waves.height.toFixed(1)}m` : ''}
                  </div>
                  <div style={{ width: 'clamp(2rem, 5vw, 2.5rem)', textAlign: 'right', color: theme.colors.textDisabled, fontSize: '0.85em' }}>
                    {hour.waves?.period ? `${hour.waves.period.toFixed(0)}s` : ''}
                  </div>
                  <div style={{ flex: 1, textAlign: 'right', color: hour.swell ? getWaveColor(hour.swell.height) : theme.colors.textDisabled }}>
                    {hour.swell ? `${hour.swell.height.toFixed(1)}m` : ''}
                  </div>
                  <div style={{ width: 'clamp(2rem, 5vw, 2.5rem)', textAlign: 'right', color: theme.colors.textDisabled, fontSize: '0.85em' }}>
                    {hour.swell?.period ? `${hour.swell.period.toFixed(0)}s` : ''}
                  </div>
                  <div style={{ width: 'clamp(3.5rem, 8vw, 4.5rem)', textAlign: 'right', color: theme.colors.textDisabled }}>
                    {hour.pressure ? `${hour.pressure} hPa` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ViewLayout>
  );
};
