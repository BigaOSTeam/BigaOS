/**
 * ButtonOverlay - Slim edge bars labeling physical buttons mounted near the display.
 *
 * - Each enabled bar takes real screen space by setting CSS variables on
 *   :root that inset #root via globals.css. Underlying UI is shrunk into the
 *   remaining area instead of being covered.
 * - Bars are rendered via createPortal to document.body so they sit at the
 *   actual viewport edges (siblings of #root).
 * - Each pill is positioned along the bar by `overlayPercent` (0–100, the
 *   center of the pill). A small arrow on the pill points outward toward the
 *   physical button beyond the screen edge.
 * - For toggle_switch actions the pill also shows the switch's current state.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useButtons } from '../context/ButtonContext';
import { useSwitches } from '../context/SwitchContext';
import { useClient } from '../context/ClientContext';
import { useTheme } from '../context/ThemeContext';
import type { ButtonDefinition, ButtonOverlayEdge } from '../types/buttons';

const HORIZONTAL_BAR_HEIGHT = 32; // px (top/bottom)
const VERTICAL_BAR_WIDTH = 36;    // px (left/right)

interface PillStatus {
  kind: 'switch';
  on: boolean;
}

interface PillProps {
  label: string;
  edge: ButtonOverlayEdge;
  status: PillStatus | null;
}

const ARROW_SIZE = 5; // px (half-base of the triangle)

const Pill: React.FC<PillProps> = ({ label, edge, status }) => {
  const { theme } = useTheme();
  const isSwitch = status?.kind === 'switch';
  const isSwitchOn = isSwitch && status!.on;
  const isSwitchOff = isSwitch && !status!.on;

  // ON: bright green + glow. OFF: noticeably dim. Non-switch: regular text.
  const color = isSwitchOn ? theme.colors.success
              : isSwitchOff ? theme.colors.textMuted
              : theme.colors.textPrimary;
  const opacity = isSwitchOff ? 0.55 : 1;
  const textShadow = isSwitchOn ? `0 0 6px ${theme.colors.success}66` : undefined;

  let arrowStyle: React.CSSProperties;
  let pillFlexDir: React.CSSProperties['flexDirection'];
  switch (edge) {
    case 'top':
      pillFlexDir = 'column-reverse';
      arrowStyle = {
        width: 0, height: 0,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE + 2}px solid ${color}`,
      };
      break;
    case 'bottom':
      pillFlexDir = 'column';
      arrowStyle = {
        width: 0, height: 0,
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE + 2}px solid ${color}`,
      };
      break;
    case 'left':
      pillFlexDir = 'row-reverse';
      arrowStyle = {
        width: 0, height: 0,
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE + 2}px solid ${color}`,
      };
      break;
    case 'right':
      pillFlexDir = 'row';
      arrowStyle = {
        width: 0, height: 0,
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE + 2}px solid ${color}`,
      };
      break;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: pillFlexDir,
      alignItems: 'center',
      gap: 3,
      opacity,
      transition: 'opacity 0.15s ease',
    }}>
      <span style={{
        color,
        fontSize: 10.5,
        fontWeight: isSwitchOn ? theme.fontWeight.semibold : theme.fontWeight.medium,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        textShadow,
        transition: 'color 0.15s ease, text-shadow 0.15s ease',
        // writing-mode changes the actual layout box dimensions on left/right
        // edges so the flex arrangement with the arrow stays correct.
        writingMode: edge === 'left' ? 'sideways-lr'
                    : edge === 'right' ? 'vertical-rl'
                    : undefined,
      }}>
        {label}
      </span>
      <span style={arrowStyle} />
    </div>
  );
};

interface BarProps {
  edge: ButtonOverlayEdge;
  buttons: ButtonDefinition[];
  switches: ReturnType<typeof useSwitches>['switches'];
}

const Bar: React.FC<BarProps> = ({ edge, buttons, switches }) => {
  const isHorizontal = edge === 'top' || edge === 'bottom';

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    background: 'var(--color-bg-secondary)',
    borderColor: 'var(--color-border)',
    borderStyle: 'solid',
    pointerEvents: 'none',
    zIndex: 9000,
  };

  if (edge === 'top') {
    Object.assign(containerStyle, {
      top: 0, left: 0, right: 0,
      height: HORIZONTAL_BAR_HEIGHT,
      borderWidth: '0 0 1px 0',
    });
  } else if (edge === 'bottom') {
    Object.assign(containerStyle, {
      bottom: 0, left: 0, right: 0,
      height: HORIZONTAL_BAR_HEIGHT,
      borderWidth: '1px 0 0 0',
    });
  } else if (edge === 'left') {
    Object.assign(containerStyle, {
      top: 0, bottom: 0, left: 0,
      width: VERTICAL_BAR_WIDTH,
      borderWidth: '0 1px 0 0',
    });
  } else {
    Object.assign(containerStyle, {
      top: 0, bottom: 0, right: 0,
      width: VERTICAL_BAR_WIDTH,
      borderWidth: '0 0 0 1px',
    });
  }

  return (
    <div style={containerStyle}>
      {buttons.map((b) => {
        const action = b.action;
        let status: PillStatus | null = null;
        if (action.type === 'toggle_switch') {
          const sw = switches.find(s => s.id === action.switchId);
          if (sw) status = { kind: 'switch', on: sw.state };
        }

        // Clamp percent so pills don't overflow the bar
        const pct = Math.max(0, Math.min(100, b.overlayPercent));

        const pillContainerStyle: React.CSSProperties = isHorizontal
          ? {
              position: 'absolute',
              top: '50%',
              left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
            }
          : {
              position: 'absolute',
              left: '50%',
              top: `${pct}%`,
              transform: 'translate(-50%, -50%)',
            };

        return (
          <div key={b.id} style={pillContainerStyle}>
            <Pill label={b.name} edge={edge} status={status} />
          </div>
        );
      })}
    </div>
  );
};

const EDGES: ButtonOverlayEdge[] = ['top', 'right', 'bottom', 'left'];

export const ButtonOverlay: React.FC = () => {
  const { buttons, preview } = useButtons();
  const { switches } = useSwitches();
  const { clientId } = useClient();

  // Merge the in-progress edit-dialog preview on top of the synced list so
  // position/edge/name changes show live without needing a save round-trip.
  const merged: ButtonDefinition[] = (() => {
    if (!preview) return buttons;
    if (preview.id) {
      return buttons.map(b => b.id === preview.id ? {
        ...b,
        name: preview.name,
        sourceClientId: preview.sourceClientId,
        action: preview.action,
        overlayEnabled: preview.overlayEnabled,
        overlayEdge: preview.overlayEdge,
        overlayPercent: preview.overlayPercent,
      } : b);
    }
    // New button being created — synthesize an entry so the preview pill shows up
    return [...buttons, {
      id: '__preview__',
      name: preview.name || '…',
      sourceClientId: preview.sourceClientId,
      deviceType: 'rpi4b',
      gpioPin: 0,
      pull: 'up',
      trigger: 'falling',
      debounceMs: 0,
      enabled: true,
      action: preview.action,
      overlayEnabled: preview.overlayEnabled,
      overlayEdge: preview.overlayEdge,
      overlayPercent: preview.overlayPercent,
    }];
  })();

  const visible = merged.filter(b => b.overlayEnabled && b.sourceClientId === clientId);

  // Group by edge, ordered by percent so pills are predictable
  const byEdge: Record<ButtonOverlayEdge, ButtonDefinition[]> = {
    top: [], right: [], bottom: [], left: [],
  };
  for (const b of visible) byEdge[b.overlayEdge].push(b);
  for (const edge of EDGES) byEdge[edge].sort((a, b) => a.overlayPercent - b.overlayPercent);

  // Set CSS variables on :root so #root insets accordingly (defined in globals.css)
  useEffect(() => {
    const root = document.documentElement;
    const set = (varName: string, px: number) => {
      if (px > 0) root.style.setProperty(varName, `${px}px`);
      else root.style.removeProperty(varName);
    };
    set('--bigaos-overlay-top', byEdge.top.length > 0 ? HORIZONTAL_BAR_HEIGHT : 0);
    set('--bigaos-overlay-bottom', byEdge.bottom.length > 0 ? HORIZONTAL_BAR_HEIGHT : 0);
    set('--bigaos-overlay-left', byEdge.left.length > 0 ? VERTICAL_BAR_WIDTH : 0);
    set('--bigaos-overlay-right', byEdge.right.length > 0 ? VERTICAL_BAR_WIDTH : 0);
    return () => {
      root.style.removeProperty('--bigaos-overlay-top');
      root.style.removeProperty('--bigaos-overlay-bottom');
      root.style.removeProperty('--bigaos-overlay-left');
      root.style.removeProperty('--bigaos-overlay-right');
    };
  }, [byEdge.top.length, byEdge.right.length, byEdge.bottom.length, byEdge.left.length]);

  if (visible.length === 0) return null;

  return createPortal(
    <>
      {EDGES.map((edge) => {
        if (byEdge[edge].length === 0) return null;
        return <Bar key={edge} edge={edge} buttons={byEdge[edge]} switches={switches} />;
      })}
    </>,
    document.body,
  );
};
