/**
 * SwitchService - Manages physical relay switches
 *
 * This service:
 * - Stores switch definitions (CRUD)
 * - Manages switch state (server is single source of truth)
 * - Handles the lock-toggle-callback flow
 * - Resets states on boot based on relay type
 * - Emits events for WebSocket broadcasting
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { dbWorker } from './database-worker.service';
import { gpioService } from './gpio.service';
import {
  SwitchDefinition,
  SwitchCreateInput,
  SwitchUpdateInput,
  SwitchRow,
  GpioCommand,
  GpioResult,
  rowToSwitch,
} from '../types/switch.types';

export class SwitchService extends EventEmitter {
  private switches: Map<string, SwitchDefinition> = new Map();
  private initialized = false;

  /**
   * Initialize: load from DB and reset states based on relay type.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[SwitchService] Initializing...');

    // Reset states based on startup behavior (simulates power loss recovery)
    // 'keep-state' switches retain their last state from the database
    await dbWorker.resetSwitchStatesByStartupBehavior('off', 0);
    await dbWorker.resetSwitchStatesByStartupBehavior('on', 1);

    // Load all switches from DB
    const rows: SwitchRow[] = await dbWorker.getAllSwitches();
    for (const row of rows) {
      this.switches.set(row.id, rowToSwitch(row));
    }

    console.log(`[SwitchService] Loaded ${this.switches.size} switches`);
    this.initialized = true;
  }

  // ==================== CRUD ====================

  getAllSwitches(): SwitchDefinition[] {
    return Array.from(this.switches.values());
  }

  getSwitchById(id: string): SwitchDefinition | undefined {
    return this.switches.get(id);
  }

  getSwitchesForClient(clientId: string): SwitchDefinition[] {
    return this.getAllSwitches().filter(s => s.targetClientId === clientId);
  }

  async createSwitch(input: SwitchCreateInput): Promise<SwitchDefinition> {
    const id = randomUUID();

    await dbWorker.createSwitch(
      id, input.name, input.icon, input.targetClientId,
      input.deviceType, input.relayType, input.startupBehavior, input.gpioPin
    );

    const sw: SwitchDefinition = {
      id,
      name: input.name,
      icon: input.icon,
      targetClientId: input.targetClientId,
      deviceType: input.deviceType,
      relayType: input.relayType,
      startupBehavior: input.startupBehavior,
      gpioPin: input.gpioPin,
      state: false,
      locked: false,
    };

    this.switches.set(id, sw);
    this.emit('switches_changed');
    return sw;
  }

  async updateSwitch(id: string, updates: SwitchUpdateInput): Promise<SwitchDefinition | null> {
    const sw = this.switches.get(id);
    if (!sw) return null;

    await dbWorker.updateSwitch(id, {
      name: updates.name,
      icon: updates.icon,
      targetClientId: updates.targetClientId,
      deviceType: updates.deviceType,
      relayType: updates.relayType,
      startupBehavior: updates.startupBehavior,
      gpioPin: updates.gpioPin,
    });

    // Update in-memory
    if (updates.name !== undefined) sw.name = updates.name;
    if (updates.icon !== undefined) sw.icon = updates.icon;
    if (updates.targetClientId !== undefined) sw.targetClientId = updates.targetClientId;
    if (updates.deviceType !== undefined) sw.deviceType = updates.deviceType;
    if (updates.relayType !== undefined) sw.relayType = updates.relayType;
    if (updates.startupBehavior !== undefined) sw.startupBehavior = updates.startupBehavior;
    if (updates.gpioPin !== undefined) sw.gpioPin = updates.gpioPin;

    this.emit('switches_changed');
    return sw;
  }

  async deleteSwitch(id: string): Promise<boolean> {
    const sw = this.switches.get(id);
    if (!sw) return false;

    await dbWorker.deleteSwitch(id);
    this.switches.delete(id);
    this.emit('switches_changed');
    return true;
  }

  // ==================== TOGGLE FLOW ====================

  /**
   * Request a toggle. Handles locking, GPIO execution, and state update.
   *
   * Flow:
   * 1. Check not locked
   * 2. Lock → broadcast
   * 3. Execute GPIO (local or remote)
   * 4. On success: flip state, persist, unlock → broadcast
   * 5. On failure/timeout: keep state, unlock → broadcast error
   */
  async requestToggle(switchId: string): Promise<void> {
    const sw = this.switches.get(switchId);
    if (!sw) {
      console.error(`[SwitchService] Switch not found: ${switchId}`);
      return;
    }

    if (sw.locked) {
      console.warn(`[SwitchService] Switch ${switchId} is locked, ignoring toggle`);
      return;
    }

    // Lock the switch
    sw.locked = true;
    this.emitStateUpdate(sw);

    const targetState = !sw.state;
    const command: GpioCommand = {
      switchId: sw.id,
      gpioPin: sw.gpioPin,
      deviceType: sw.deviceType,
      relayType: sw.relayType,
      targetState,
    };

    try {
      const result: GpioResult = await gpioService.execute(sw.targetClientId, command);

      if (result.success) {
        sw.state = targetState;
        await dbWorker.updateSwitchState(sw.id, targetState ? 1 : 0);
      } else {
        console.error(`[SwitchService] Toggle failed for ${switchId}: ${result.error}`);
        this.emitStateUpdate(sw, result.error);
      }
    } catch (error: any) {
      console.error(`[SwitchService] Toggle error for ${switchId}: ${error.message}`);
      this.emitStateUpdate(sw, error.message);
    } finally {
      sw.locked = false;
      this.emitStateUpdate(sw);
    }
  }

  // ==================== EVENTS ====================

  private emitStateUpdate(sw: SwitchDefinition, error?: string): void {
    this.emit('switch_state_update', {
      switchId: sw.id,
      state: sw.state,
      locked: sw.locked,
      error,
    });
  }
}

export const switchService = new SwitchService();
