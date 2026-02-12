import { Request, Response } from 'express';

const TWO_PI = 2 * Math.PI;

// TODO: Implement actual autopilot control logic
// This controller currently stores the autopilot state but does not control any physical hardware

interface AutopilotState {
  active: boolean;
  targetHeading: number;
  lastUpdated: Date;
}

class AutopilotController {
  private state: AutopilotState = {
    active: false,
    targetHeading: 0,
    lastUpdated: new Date(),
  };

  /**
   * Get current autopilot status
   * GET /api/autopilot/status
   */
  async getStatus(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        ...this.state,
      });
    } catch (error) {
      console.error('Autopilot status error:', error);
      res.status(500).json({ error: 'Failed to get autopilot status' });
    }
  }

  /**
   * Set autopilot heading
   * POST /api/autopilot/heading
   * Body: { heading: number }
   */
  async setHeading(req: Request, res: Response) {
    try {
      const { heading } = req.body;

      if (typeof heading !== 'number' || heading < 0 || heading >= TWO_PI) {
        return res.status(400).json({
          error: 'Invalid heading. Must be a number in radians between 0 and 2π',
        });
      }

      this.state.targetHeading = heading;
      this.state.lastUpdated = new Date();

      // TODO: Send heading to actual autopilot hardware/controller
      console.log(`[Autopilot] Heading set to ${(heading * 180 / Math.PI).toFixed(1)}°`);

      res.json({
        success: true,
        targetHeading: this.state.targetHeading,
      });
    } catch (error) {
      console.error('Autopilot set heading error:', error);
      res.status(500).json({ error: 'Failed to set autopilot heading' });
    }
  }

  /**
   * Activate autopilot
   * POST /api/autopilot/activate
   * Body: { heading?: number }
   */
  async activate(req: Request, res: Response) {
    try {
      const { heading } = req.body;

      if (heading !== undefined) {
        if (typeof heading !== 'number' || heading < 0 || heading >= TWO_PI) {
          return res.status(400).json({
            error: 'Invalid heading. Must be a number in radians between 0 and 2π',
          });
        }
        this.state.targetHeading = heading;
      }

      this.state.active = true;
      this.state.lastUpdated = new Date();

      // TODO: Send activation command to actual autopilot hardware/controller
      console.log(`[Autopilot] Activated with heading ${(this.state.targetHeading * 180 / Math.PI).toFixed(1)}°`);

      res.json({
        success: true,
        active: this.state.active,
        targetHeading: this.state.targetHeading,
      });
    } catch (error) {
      console.error('Autopilot activate error:', error);
      res.status(500).json({ error: 'Failed to activate autopilot' });
    }
  }

  /**
   * Deactivate autopilot
   * POST /api/autopilot/deactivate
   */
  async deactivate(req: Request, res: Response) {
    try {
      this.state.active = false;
      this.state.lastUpdated = new Date();

      // TODO: Send deactivation command to actual autopilot hardware/controller
      console.log('[Autopilot] Deactivated');

      res.json({
        success: true,
        active: this.state.active,
      });
    } catch (error) {
      console.error('Autopilot deactivate error:', error);
      res.status(500).json({ error: 'Failed to deactivate autopilot' });
    }
  }
}

export const autopilotController = new AutopilotController();
