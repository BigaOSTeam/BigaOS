/**
 * ButtonActionExecutor - Dispatches a ButtonAction to its handler.
 *
 * - toggle_switch is server-native (delegates to SwitchService.requestToggle)
 * - All other actions are UI actions: an event is emitted for the
 *   WebSocketServer to forward to the target client's browser as 'ui_action'.
 */

import { EventEmitter } from 'events';
import { switchService } from './switch.service';
import { ButtonAction, UiActionMessage } from '../types/button.types';

export class ButtonActionExecutor extends EventEmitter {
  async execute(action: ButtonAction): Promise<void> {
    switch (action.type) {
      case 'toggle_switch':
        if (!action.switchId) {
          console.warn('[ButtonActionExecutor] toggle_switch missing switchId');
          return;
        }
        await switchService.requestToggle(action.switchId);
        return;

      case 'chart_recenter':
        this.emitUiAction({
          targetClientId: action.targetClientId,
          action: { type: 'chart_recenter' },
        });
        return;

      case 'chart_zoom_in':
        this.emitUiAction({
          targetClientId: action.targetClientId,
          action: { type: 'chart_zoom_in' },
        });
        return;

      case 'chart_zoom_out':
        this.emitUiAction({
          targetClientId: action.targetClientId,
          action: { type: 'chart_zoom_out' },
        });
        return;

      case 'navigate':
        this.emitUiAction({
          targetClientId: action.targetClientId,
          action: { type: 'navigate', view: action.view },
        });
        return;

      case 'settings_tab':
        this.emitUiAction({
          targetClientId: action.targetClientId,
          action: { type: 'settings_tab', tab: action.tab },
        });
        return;
    }
  }

  private emitUiAction(message: UiActionMessage): void {
    this.emit('ui_action_send', message);
  }
}

export const buttonActionExecutor = new ButtonActionExecutor();
