import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

interface LogbookCalendarPickerProps {
  selectedDate: string;        // 'YYYY-MM-DD'
  entryDates: Set<string>;     // dates with logbook entries
  onSelect: (date: string) => void;
  onClose: () => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function todayKey(): string {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export const LogbookCalendarPicker: React.FC<LogbookCalendarPickerProps> = ({
  selectedDate,
  entryDates,
  onSelect,
  onClose,
}) => {
  const { theme } = useTheme();
  const { language } = useLanguage();

  // View month state — defaults to the month containing the selected date.
  const [view, setView] = useState(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const today = todayKey();

  // Build the 6×7 grid for the current month (some days from neighbouring months).
  // Week starts Monday — matches European convention which is what BigaOS targets.
  const grid = useMemo(() => {
    const firstOfMonth = new Date(view.year, view.month, 1);
    const dow = firstOfMonth.getDay();              // 0 = Sun ... 6 = Sat
    const offset = (dow + 6) % 7;                   // 0 = Mon ... 6 = Sun
    const start = new Date(view.year, view.month, 1 - offset);

    const cells: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({
        date: dateKey(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: d.getMonth() === view.month,
      });
    }
    return cells;
  }, [view]);

  // Localized weekday short names (Mon, Tue, ...) starting Monday.
  const weekdayLabels = useMemo(() => {
    // Use a known Monday (2024-01-01) to seed the locale formatter.
    const base = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return d.toLocaleDateString(language, { weekday: 'short' });
    });
  }, [language]);

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(language, {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: theme.colors.bgOverlay,
          zIndex: theme.zIndex.modal,
        }}
      />
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.borderHover}`,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
          zIndex: theme.zIndex.modal + 1,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: theme.shadow.lg,
          minWidth: 320,
        }}
      >
        {/* Month header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.space.md,
        }}>
          <button
            onClick={() => shiftMonth(-1)}
            className="touch-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              padding: theme.space.sm,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Previous month"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold }}>
            {monthLabel}
          </div>
          <button
            onClick={() => shiftMonth(1)}
            className="touch-btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              padding: theme.space.sm,
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="Next month"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Weekday header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          marginBottom: theme.space.xs,
        }}>
          {weekdayLabels.map((label, i) => (
            <div
              key={i}
              style={{
                fontSize: theme.fontSize.xs,
                color: theme.colors.textMuted,
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: theme.space.xs,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
        }}>
          {grid.map(cell => {
            const isSelected = cell.date === selectedDate;
            const isToday = cell.date === today;
            const hasEntry = entryDates.has(cell.date);
            return (
              <button
                key={cell.date}
                onClick={() => { onSelect(cell.date); onClose(); }}
                className="touch-btn"
                style={{
                  position: 'relative',
                  width: 40,
                  height: 40,
                  borderRadius: theme.radius.md,
                  background: isSelected ? theme.colors.primary : 'transparent',
                  border: isToday && !isSelected ? `1px solid ${theme.colors.primary}` : '1px solid transparent',
                  color: isSelected
                    ? theme.colors.textPrimary
                    : cell.inMonth
                      ? theme.colors.textPrimary
                      : theme.colors.textDisabled,
                  fontSize: theme.fontSize.md,
                  fontWeight: isSelected || hasEntry ? theme.fontWeight.semibold : theme.fontWeight.normal,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {cell.day}
                {hasEntry && (
                  <span style={{
                    position: 'absolute',
                    bottom: 4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: isSelected ? theme.colors.textPrimary : theme.colors.dataSpeed,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
