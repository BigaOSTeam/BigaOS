import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useSettings, distanceConversions } from '../../../context/SettingsContext';
import { wsService } from '../../../services/websocket';
import { logbookAPI, LogbookDaySummary } from '../../../services/api';

const M_TO_NM = 1 / 1852;

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Today's logbook glance: total distance and time underway for today, with
 * a hint of how many days the boat has logged at all (lifetime entry count).
 */
export const LogbookItem = React.memo(() => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { distanceUnit, convertDistance } = useSettings();
  const [today, setToday] = useState<LogbookDaySummary | null>(null);
  const [totalDays, setTotalDays] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await logbookAPI.listDays({ limit: 365 });
      const todayDate = todayLocalDate();
      const todayRow = res.data.days.find(d => d.date === todayDate) || null;
      setToday(todayRow);
      setTotalDays(res.data.days.length);
    } catch {
      // Tile is best-effort; transient API failures shouldn't blow it up.
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => { refresh(); };
    wsService.on('logbook_segment_closed', handler);
    // Refresh once a minute so the tile catches new segments opening even
    // without a close event (e.g. between the boat starting to move and any
    // segment closing later that day).
    const interval = setInterval(refresh, 60_000);
    return () => {
      wsService.off('logbook_segment_closed', handler);
      clearInterval(interval);
    };
  }, [refresh]);

  const dist = today ? convertDistance(today.distance_m * M_TO_NM) : 0;
  const distLabel = distanceConversions[distanceUnit].label;
  const dur = today?.underway_ms ?? 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 'clamp(4px, 4cqmin, 24px)',
    }}>
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        {t('logbook.today')}
      </div>
      <div style={{
        fontSize: 'clamp(14px, 22cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color: theme.colors.dataPosition,
        lineHeight: 1,
        marginTop: 'clamp(2px, 1cqmin, 8px)',
      }}>
        {dist.toFixed(1)}
      </div>
      <div style={{ fontSize: 'clamp(9px, 8cqmin, 32px)', color: theme.colors.textMuted }}>
        {distLabel}
      </div>
      <div style={{
        fontSize: 'clamp(9px, 8cqmin, 32px)',
        color: theme.colors.textSecondary,
        marginTop: 'clamp(2px, 1.5cqmin, 8px)',
      }}>
        {formatDuration(dur)}
        {totalDays > 0 && (
          <span style={{ marginLeft: 8, color: theme.colors.textMuted, fontSize: '0.85em' }}>
            · {totalDays}
          </span>
        )}
      </div>
    </div>
  );
});
