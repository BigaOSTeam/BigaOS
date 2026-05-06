import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useClient } from '../../context/ClientContext';
import { useTutorial } from '../../context/TutorialContext';

/** A single tutorial card. Body strings are looked up via the i18n key registry. */
interface TutorialStep {
  /** Translation key for the heading. */
  titleKey: string;
  /** Translation key for the body text. */
  bodyKey: string;
  /** Inline SVG illustration. Kept simple so it renders without assets. */
  icon: React.ReactNode;
}

const ICON_PROPS = {
  width: 56,
  height: 56,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const IconWelcome = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);
const IconDashboard = (
  <svg {...ICON_PROPS}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
    <rect x="3" y="15" width="7" height="6" rx="1.5" />
  </svg>
);
const IconChart = (
  <svg {...ICON_PROPS}>
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);
const IconPlugins = (
  <svg {...ICON_PROPS}>
    <path d="M9 3v4M15 3v4" />
    <path d="M5 7h14v5a7 7 0 0 1-14 0z" />
    <path d="M12 19v3" />
  </svg>
);
const IconAlerts = (
  <svg {...ICON_PROPS}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);
const IconDone = (
  <svg {...ICON_PROPS}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const STEPS_DISPLAY: TutorialStep[] = [
  { titleKey: 'tutorial.welcome.title',   bodyKey: 'tutorial.welcome.body',   icon: IconWelcome },
  { titleKey: 'tutorial.dashboard.title', bodyKey: 'tutorial.dashboard.body', icon: IconDashboard },
  { titleKey: 'tutorial.chart.title',     bodyKey: 'tutorial.chart.body',     icon: IconChart },
  { titleKey: 'tutorial.plugins.title',   bodyKey: 'tutorial.plugins.body',   icon: IconPlugins },
  { titleKey: 'tutorial.monitoring.title', bodyKey: 'tutorial.monitoring.body', icon: IconAlerts },
  { titleKey: 'tutorial.done.title',      bodyKey: 'tutorial.done.body',      icon: IconDone },
];

const STEPS_REMOTE: TutorialStep[] = [
  { titleKey: 'tutorial.welcome.title',         bodyKey: 'tutorial.welcome.body_remote',  icon: IconWelcome },
  { titleKey: 'tutorial.dashboard.title',       bodyKey: 'tutorial.dashboard.body_remote', icon: IconDashboard },
  { titleKey: 'tutorial.chart.title',           bodyKey: 'tutorial.chart.body_remote',    icon: IconChart },
  { titleKey: 'tutorial.plugins.title',         bodyKey: 'tutorial.plugins.body_remote',  icon: IconPlugins },
  { titleKey: 'tutorial.done.title',            bodyKey: 'tutorial.done.body',            icon: IconDone },
];

export const TutorialOverlay: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { clientType } = useClient();
  const { isOpen, close } = useTutorial();

  const steps = useMemo(
    () => (clientType === 'remote' ? STEPS_REMOTE : STEPS_DISPLAY),
    [clientType],
  );

  const [stepIndex, setStepIndex] = useState(0);

  // Reset to the first card every time the overlay opens, so a replay starts
  // from the beginning rather than wherever the previous run ended.
  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  // ESC = skip. Bound at the document level so it works even when focus is
  // outside the overlay (e.g. focus is still on the underlying app).
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(true);
      } else if (e.key === 'ArrowRight') {
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((i) => Math.max(i - 1, 0));
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, steps.length, close]);

  if (!isOpen) return null;

  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      close(true);
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.space.lg,
        zIndex: 19000,
        animation: 'tutorial-fade 200ms ease-out',
      }}
    >
      <style>
        {`
          @keyframes tutorial-fade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes tutorial-card-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <div
        key={stepIndex}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.xl,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
          padding: `${theme.space['2xl']} ${theme.space.xl} ${theme.space.lg}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'tutorial-card-in 220ms ease-out',
          color: theme.colors.textPrimary,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: theme.colors.primaryLight,
            color: theme.colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: theme.space.lg,
          }}
        >
          {step.icon}
        </div>

        <h2
          id="tutorial-title"
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            margin: `0 0 ${theme.space.sm} 0`,
            color: theme.colors.textPrimary,
          }}
        >
          {t(step.titleKey)}
        </h2>

        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.55,
            color: theme.colors.textSecondary,
            margin: `0 0 ${theme.space.xl} 0`,
            whiteSpace: 'pre-line',
          }}
        >
          {t(step.bodyKey)}
        </p>

        {/* Step dots */}
        <div
          aria-hidden
          style={{
            display: 'flex',
            gap: '6px',
            marginBottom: theme.space.lg,
          }}
        >
          {steps.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === stepIndex ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: i === stepIndex ? theme.colors.primary : theme.colors.border,
                transition: 'all 200ms ease',
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: theme.space.sm,
            width: '100%',
          }}
        >
          <button
            onClick={() => close(true)}
            className="touch-btn"
            style={{
              flex: 1,
              padding: `${theme.space.md} ${theme.space.lg}`,
              background: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              color: theme.colors.textMuted,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            {t('tutorial.skip')}
          </button>

          {!isFirst && (
            <button
              onClick={handleBack}
              className="touch-btn"
              style={{
                flex: 1,
                padding: `${theme.space.md} ${theme.space.lg}`,
                background: theme.colors.bgCard,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.md,
                color: theme.colors.textPrimary,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {t('tutorial.back')}
            </button>
          )}

          <button
            onClick={handleNext}
            className="touch-btn"
            style={{
              flex: 2,
              padding: `${theme.space.md} ${theme.space.lg}`,
              background: theme.colors.primary,
              border: `1px solid ${theme.colors.primarySolid}`,
              borderRadius: theme.radius.md,
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isLast ? t('tutorial.done') : t('tutorial.next')}
          </button>
        </div>
      </div>
    </div>
  );
};
