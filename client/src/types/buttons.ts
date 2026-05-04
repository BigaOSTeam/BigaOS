/**
 * Button Types (client-side)
 *
 * Mirror of the server `button.types.ts`. Buttons are physical GPIO inputs
 * wired to a client Pi that dispatch a single action when triggered.
 */

import type { DeviceType } from './switches';

export type ButtonTrigger = 'rising' | 'falling';
export type ButtonPull = 'up' | 'down' | 'none';

export type ButtonOverlayEdge = 'top' | 'right' | 'bottom' | 'left';

export type ButtonAction =
  | { type: 'toggle_switch'; switchId: string }
  | { type: 'chart_recenter'; targetClientId: string }
  | { type: 'chart_zoom_in'; targetClientId: string }
  | { type: 'chart_zoom_out'; targetClientId: string }
  | { type: 'navigate'; targetClientId: string; view: string }
  | { type: 'settings_tab'; targetClientId: string; tab: string };

export type ButtonActionType = ButtonAction['type'];

export interface ButtonDefinition {
  id: string;
  name: string;
  sourceClientId: string;
  deviceType: DeviceType;
  gpioPin: number;
  pull: ButtonPull;
  trigger: ButtonTrigger;
  debounceMs: number;
  enabled: boolean;
  action: ButtonAction;
  overlayEnabled: boolean;
  overlayEdge: ButtonOverlayEdge;
  overlayPercent: number;
}

export interface ButtonCreateInput {
  name: string;
  sourceClientId: string;
  deviceType: DeviceType;
  gpioPin: number;
  pull: ButtonPull;
  trigger: ButtonTrigger;
  debounceMs: number;
  enabled: boolean;
  action: ButtonAction;
  overlayEnabled: boolean;
  overlayEdge: ButtonOverlayEdge;
  overlayPercent: number;
}

export interface ButtonUpdateInput {
  name?: string;
  sourceClientId?: string;
  deviceType?: DeviceType;
  gpioPin?: number;
  pull?: ButtonPull;
  trigger?: ButtonTrigger;
  debounceMs?: number;
  enabled?: boolean;
  action?: ButtonAction;
  overlayEnabled?: boolean;
  overlayEdge?: ButtonOverlayEdge;
  overlayPercent?: number;
}

/** Wire format for an incoming UI action from the server */
export type UiAction =
  | { type: 'chart_recenter' }
  | { type: 'chart_zoom_in' }
  | { type: 'chart_zoom_out' }
  | { type: 'navigate'; view: string }
  | { type: 'settings_tab'; tab: string };

export const BUTTON_ACTION_TYPES: ButtonActionType[] = [
  'toggle_switch',
  'chart_recenter',
  'chart_zoom_in',
  'chart_zoom_out',
  'navigate',
  'settings_tab',
];
