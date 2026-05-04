/**
 * Button Types
 *
 * Type definitions for the Buttons feature — physical input buttons
 * wired to GPIO pins on Raspberry Pi clients. Each button maps to
 * one action (toggle a switch, navigate a UI, recenter chart, etc.).
 */

import { DeviceType } from './switch.types';

export type ButtonTrigger = 'rising' | 'falling';
export type ButtonPull = 'up' | 'down' | 'none';

export type ButtonOverlayEdge = 'top' | 'right' | 'bottom' | 'left';

/** All action kinds a button can dispatch */
export type ButtonAction =
  | { type: 'toggle_switch'; switchId: string }
  | { type: 'chart_recenter'; targetClientId: string }
  | { type: 'chart_zoom_in'; targetClientId: string }
  | { type: 'chart_zoom_out'; targetClientId: string }
  | { type: 'navigate'; targetClientId: string; view: string }
  | { type: 'settings_tab'; targetClientId: string; tab: string };

export type ButtonActionType = ButtonAction['type'];

/** Button definition as stored in memory / sent to clients */
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

/** Database row shape (snake_case, action stored as JSON TEXT) */
export interface ButtonRow {
  id: string;
  name: string;
  source_client_id: string;
  device_type: string;
  gpio_pin: number;
  pull: string;
  trigger: string;
  debounce_ms: number;
  enabled: number;
  action_json: string;
  overlay_enabled: number | null;
  overlay_edge: string | null;
  overlay_percent: number | null;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new button */
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

/** Input for updating an existing button */
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

/** Input event reported by an agent when a button edge fires */
export interface InputEvent {
  buttonId?: string;
  gpioPin: number;
  value: number;
  timestamp?: number;
}

/** Per-button payload sent to the agent on init / config change */
export interface InputAgentConfig {
  buttonId: string;
  gpioPin: number;
  pull: ButtonPull;
  trigger: ButtonTrigger;
  debounceMs: number;
  deviceType: DeviceType;
  enabled: boolean;
}

/** UI action sent over the wire to a target browser client */
export interface UiActionMessage {
  targetClientId: string;
  action:
    | { type: 'chart_recenter' }
    | { type: 'chart_zoom_in' }
    | { type: 'chart_zoom_out' }
    | { type: 'navigate'; view: string }
    | { type: 'settings_tab'; tab: string };
}

/** Convert a database row to a ButtonDefinition */
export function rowToButton(row: ButtonRow): ButtonDefinition {
  let action: ButtonAction;
  try {
    action = JSON.parse(row.action_json) as ButtonAction;
  } catch {
    // Fallback: row corrupted — disabled toggle so it's a no-op
    action = { type: 'toggle_switch', switchId: '' };
  }
  return {
    id: row.id,
    name: row.name,
    sourceClientId: row.source_client_id,
    deviceType: row.device_type as DeviceType,
    gpioPin: row.gpio_pin,
    pull: row.pull as ButtonPull,
    trigger: row.trigger as ButtonTrigger,
    debounceMs: row.debounce_ms,
    enabled: row.enabled === 1,
    action,
    overlayEnabled: row.overlay_enabled === 1,
    overlayEdge: (row.overlay_edge || 'bottom') as ButtonOverlayEdge,
    overlayPercent: row.overlay_percent ?? 50,
  };
}
