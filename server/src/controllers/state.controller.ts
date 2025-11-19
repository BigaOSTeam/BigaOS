import { Request, Response } from 'express';
import { dummyDataService } from '../services/dummy-data.service';
import { BoatState } from '../types/boat-state.types';

export class StateController {
  // GET /api/state - Get current boat state
  getCurrentState(req: Request, res: Response) {
    const currentState = dummyDataService.getCurrentState();
    const inputs = dummyDataService.generateStateInputs();

    res.json({
      currentState,
      previousState: null,
      lastTransition: new Date(),
      manualOverride: null,
      inputs
    });
  }

  // POST /api/state/override - Manually override state
  overrideState(req: Request, res: Response) {
    const { state, reason } = req.body;

    if (!Object.values(BoatState).includes(state)) {
      return res.status(400).json({ error: 'Invalid boat state' });
    }

    dummyDataService.changeState(state);

    res.json({
      success: true,
      currentState: state,
      reason
    });
  }

  // DELETE /api/state/override - Cancel manual override
  cancelOverride(req: Request, res: Response) {
    // In a real system, this would cancel the override
    res.json({ success: true, message: 'Override cancelled' });
  }

  // GET /api/state/history - Get state history
  getStateHistory(req: Request, res: Response) {
    // Return dummy history data
    const history = [
      {
        state: BoatState.DRIFTING,
        timestamp: new Date(Date.now() - 7200000),
        duration: 3600
      },
      {
        state: BoatState.MOTORING,
        timestamp: new Date(Date.now() - 3600000),
        duration: 1800
      },
      {
        state: dummyDataService.getCurrentState(),
        timestamp: new Date(Date.now() - 1800000),
        duration: 1800
      }
    ];

    res.json(history);
  }
}

export const stateController = new StateController();
