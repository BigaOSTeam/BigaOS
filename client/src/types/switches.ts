/**
 * Switch Types (client-side)
 */

export type DeviceType = 'rpi4b' | 'rpi5';
export type RelayType = 'active-low' | 'active-high';
export type StartupBehavior = 'off' | 'on' | 'keep-state';

export type SwitchIcon =
  | 'lightbulb'
  | 'anchor-light'
  | 'nav-light'
  | 'pump'
  | 'fan'
  | 'horn'
  | 'heater'
  | 'fridge'
  | 'inverter'
  | 'outlet'
  | 'water-pump'
  | 'bilge-pump'
  | 'spotlight'
  | 'radio'
  | 'generic';

export interface SwitchDefinition {
  id: string;
  name: string;
  icon: SwitchIcon;
  targetClientId: string;
  deviceType: DeviceType;
  relayType: RelayType;
  startupBehavior: StartupBehavior;
  gpioPin: number;
  state: boolean;
  locked: boolean;
}

export interface SwitchCreateInput {
  name: string;
  icon: SwitchIcon;
  targetClientId: string;
  deviceType: DeviceType;
  relayType: RelayType;
  startupBehavior: StartupBehavior;
  gpioPin: number;
}

export interface SwitchUpdateInput {
  name?: string;
  icon?: SwitchIcon;
  targetClientId?: string;
  deviceType?: DeviceType;
  relayType?: RelayType;
  startupBehavior?: StartupBehavior;
  gpioPin?: number;
}

export interface SwitchDashboardConfig {
  switchId: string;
  activeColor?: string;
}
