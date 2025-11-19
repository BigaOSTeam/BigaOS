export enum BoatState {
  ANCHORED = 'ANCHORED',
  IN_MARINA = 'IN_MARINA',
  MOTORING = 'MOTORING',
  SAILING = 'SAILING',
  DRIFTING = 'DRIFTING'
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface StateInputs {
  anchorChainOut: boolean;
  gpsSpeed: number;              // Knots
  motorRunning: boolean;
  gpsPosition: GeoPosition;
  depthBelowTransducer: number;  // Meters
  timeInState: number;           // Seconds
}

export interface StateChangeEvent {
  type: 'state_change';
  previousState: BoatState;
  newState: BoatState;
  timestamp: Date;
  inputs: StateInputs;
}

export interface StateOverride {
  state: BoatState;
  reason: string;
  expiresAt?: Date;
}

export interface BoatStateData {
  currentState: BoatState;
  previousState: BoatState | null;
  lastTransition: Date;
  manualOverride: StateOverride | null;
  inputs: StateInputs;
}
