/**
 * ButtonService - Manages physical GPIO input buttons
 *
 * This service:
 * - Stores button definitions (CRUD)
 * - Receives input events from client agents and dispatches actions
 * - Applies a server-side debounce window in case the agent's debounce is bypassed
 * - Emits events for WebSocket broadcasting and agent re-config
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { dbWorker } from './database-worker.service';
import { buttonActionExecutor } from './button-action.service';
import {
  ButtonDefinition,
  ButtonCreateInput,
  ButtonUpdateInput,
  ButtonRow,
  InputAgentConfig,
  rowToButton,
} from '../types/button.types';

export class ButtonService extends EventEmitter {
  private buttons: Map<string, ButtonDefinition> = new Map();
  private lastFireMs: Map<string, number> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('[ButtonService] Initializing...');
    const rows: ButtonRow[] = await dbWorker.getAllButtons();
    for (const row of rows) {
      this.buttons.set(row.id, rowToButton(row));
    }
    console.log(`[ButtonService] Loaded ${this.buttons.size} buttons`);
    this.initialized = true;
  }

  // ==================== CRUD ====================

  getAllButtons(): ButtonDefinition[] {
    return Array.from(this.buttons.values());
  }

  getButtonById(id: string): ButtonDefinition | undefined {
    return this.buttons.get(id);
  }

  getButtonsForClient(clientId: string): ButtonDefinition[] {
    return this.getAllButtons().filter(b => b.sourceClientId === clientId);
  }

  /** Compact payload sent to the agent (one entry per button on that client). */
  getAgentConfigForClient(clientId: string): InputAgentConfig[] {
    return this.getButtonsForClient(clientId).map(b => ({
      buttonId: b.id,
      gpioPin: b.gpioPin,
      pull: b.pull,
      trigger: b.trigger,
      debounceMs: b.debounceMs,
      deviceType: b.deviceType,
      enabled: b.enabled,
    }));
  }

  async createButton(input: ButtonCreateInput): Promise<ButtonDefinition> {
    const id = randomUUID();
    await dbWorker.createButton(
      id,
      input.name,
      input.sourceClientId,
      input.deviceType,
      input.gpioPin,
      input.pull,
      input.trigger,
      input.debounceMs,
      input.enabled ? 1 : 0,
      JSON.stringify(input.action),
      input.overlayEnabled ? 1 : 0,
      input.overlayEdge,
      input.overlayPercent,
    );
    const button: ButtonDefinition = {
      id,
      name: input.name,
      sourceClientId: input.sourceClientId,
      deviceType: input.deviceType,
      gpioPin: input.gpioPin,
      pull: input.pull,
      trigger: input.trigger,
      debounceMs: input.debounceMs,
      enabled: input.enabled,
      action: input.action,
      overlayEnabled: input.overlayEnabled,
      overlayEdge: input.overlayEdge,
      overlayPercent: input.overlayPercent,
    };
    this.buttons.set(id, button);
    this.emit('buttons_changed', { affectedClientIds: [input.sourceClientId] });
    return button;
  }

  async updateButton(id: string, updates: ButtonUpdateInput): Promise<ButtonDefinition | null> {
    const button = this.buttons.get(id);
    if (!button) return null;

    const previousSourceClientId = button.sourceClientId;

    await dbWorker.updateButton(id, {
      name: updates.name,
      sourceClientId: updates.sourceClientId,
      deviceType: updates.deviceType,
      gpioPin: updates.gpioPin,
      pull: updates.pull,
      trigger: updates.trigger,
      debounceMs: updates.debounceMs,
      enabled: updates.enabled === undefined ? undefined : (updates.enabled ? 1 : 0),
      actionJson: updates.action === undefined ? undefined : JSON.stringify(updates.action),
      overlayEnabled: updates.overlayEnabled === undefined ? undefined : (updates.overlayEnabled ? 1 : 0),
      overlayEdge: updates.overlayEdge,
      overlayPercent: updates.overlayPercent,
    });

    if (updates.name !== undefined) button.name = updates.name;
    if (updates.sourceClientId !== undefined) button.sourceClientId = updates.sourceClientId;
    if (updates.deviceType !== undefined) button.deviceType = updates.deviceType;
    if (updates.gpioPin !== undefined) button.gpioPin = updates.gpioPin;
    if (updates.pull !== undefined) button.pull = updates.pull;
    if (updates.trigger !== undefined) button.trigger = updates.trigger;
    if (updates.debounceMs !== undefined) button.debounceMs = updates.debounceMs;
    if (updates.enabled !== undefined) button.enabled = updates.enabled;
    if (updates.action !== undefined) button.action = updates.action;
    if (updates.overlayEnabled !== undefined) button.overlayEnabled = updates.overlayEnabled;
    if (updates.overlayEdge !== undefined) button.overlayEdge = updates.overlayEdge;
    if (updates.overlayPercent !== undefined) button.overlayPercent = updates.overlayPercent;

    const affected = new Set<string>([previousSourceClientId, button.sourceClientId]);
    this.emit('buttons_changed', { affectedClientIds: Array.from(affected) });
    return button;
  }

  async deleteButton(id: string): Promise<boolean> {
    const button = this.buttons.get(id);
    if (!button) return false;
    await dbWorker.deleteButton(id);
    this.buttons.delete(id);
    this.lastFireMs.delete(id);
    this.emit('buttons_changed', { affectedClientIds: [button.sourceClientId] });
    return true;
  }

  // ==================== EVENT DISPATCH ====================

  /**
   * Receive an input edge event from a client agent and dispatch the action.
   * If the agent already debounced, this server-side debounce is a no-op for normal traffic.
   */
  handleInputEvent(data: { sourceClientId: string; buttonId?: string; gpioPin: number }): void {
    let button: ButtonDefinition | undefined;
    if (data.buttonId) {
      button = this.buttons.get(data.buttonId);
      if (button && button.sourceClientId !== data.sourceClientId) {
        // ID matches a button registered to a different client — ignore for safety
        button = undefined;
      }
    }
    if (!button) {
      // Fall back to looking up by source + pin
      button = this.getButtonsForClient(data.sourceClientId).find(b => b.gpioPin === data.gpioPin);
    }
    if (!button) {
      console.warn(`[ButtonService] No button matching client=${data.sourceClientId} pin=${data.gpioPin}`);
      return;
    }
    if (!button.enabled) return;

    const now = Date.now();
    const last = this.lastFireMs.get(button.id) || 0;
    const minGap = Math.max(0, button.debounceMs);
    if (now - last < minGap) return;
    this.lastFireMs.set(button.id, now);

    buttonActionExecutor.execute(button.action).catch((err: any) => {
      console.error(`[ButtonService] Action dispatch failed for ${button!.id}: ${err?.message || err}`);
    });
  }
}

export const buttonService = new ButtonService();
