import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTanks } from '../../../context/TankContext';
import { fluidColor, tankWarnDirection, FluidType } from '../../../types/tanks';

interface TankItemProps {
  /** Optional tank id — falls back to the first configured tank if unset/unknown. */
  tankId?: string;
}

/**
 * Tank dashboard tile.
 *
 * For "low is bad" tanks (fuel, fresh water) the big number is % full.
 * For "high is bad" tanks (waste, gray water) the big number is liters
 * remaining — what most people actually want to know is "how much room
 * before I have to deal with this tank".
 *
 * Colour follows the warn direction: low fuel/water and almost-full waste
 * both turn warning/critical.
 */
export const TankItem = React.memo<TankItemProps>(({ tankId }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tanks, readings } = useTanks();

  const tank = (tankId && tanks.find(x => x.id === tankId)) || tanks[0];

  if (!tank) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(4px, 4cqmin, 24px)',
        color: theme.colors.textMuted,
        fontSize: 'clamp(8px, 6cqmin, 24px)',
        textAlign: 'center',
      }}>
        {t('tanks.widget_no_tank')}
      </div>
    );
  }

  const reading = readings[tank.id];
  const accent = fluidColor(tank.fluidType as FluidType);
  const direction = tankWarnDirection(tank.fluidType as FluidType);

  const level = reading?.level ?? null;            // % full
  const volume = reading?.volume ?? null;          // L in tank
  const capacity = reading?.capacity ?? tank.capacityLiters;
  const free = volume !== null ? Math.max(0, capacity - volume) : null;

  // Severity colour matches direction.
  const stateColor = (() => {
    if (level === null) return theme.colors.textMuted;
    if (direction === 'low') {
      if (level < 10) return theme.colors.error;
      if (level < 20) return theme.colors.warning;
    } else {
      if (level > 90) return theme.colors.error;
      if (level > 80) return theme.colors.warning;
    }
    return accent;
  })();

  // Big number choice.
  const isInverted = direction === 'high';
  const bigText = level === null
    ? '--'
    : isInverted
      ? (free === null ? '--' : `${Math.round(free)}`)
      : `${Math.round(level)}%`;
  const bigSuffix = level === null ? '' : isInverted ? 'L' : '';
  const subText = level === null
    ? t('tanks.widget_no_signal')
    : isInverted
      ? t('tanks.widget_sub_free', { capacity: String(Math.round(capacity)) })
      : t('tanks.widget_sub_full', {
          volume: String(Math.round(volume ?? 0)),
          capacity: String(Math.round(capacity)),
        });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 'clamp(4px, 4cqmin, 24px)',
      gap: 'clamp(1px, 1cqmin, 6px)',
    }}>
      {/* Top label: tank name */}
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}>
        {tank.name}
      </div>

      {/* Big number — matches BatteryItem proportions */}
      <div style={{
        fontSize: 'clamp(12px, 20cqmin, 96px)',
        fontWeight: theme.fontWeight.bold,
        color: stateColor,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'baseline',
        gap: 'clamp(2px, 1.5cqmin, 8px)',
      }}>
        {bigText}
        {bigSuffix && (
          <span style={{
            fontSize: 'clamp(8px, 10cqmin, 40px)',
            fontWeight: theme.fontWeight.medium,
            color: theme.colors.textMuted,
          }}>
            {bigSuffix}
          </span>
        )}
      </div>

      {/* Subline: liters or status */}
      <div style={{
        fontSize: 'clamp(8px, 7cqmin, 28px)',
        color: theme.colors.textMuted,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}>
        {subText}
      </div>
    </div>
  );
});

TankItem.displayName = 'TankItem';
