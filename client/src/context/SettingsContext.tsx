import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { wsService } from '../services/websocket';
import type { WeatherSettings, AlertSettings } from '../types';
import { DEFAULT_ALERT_SETTINGS } from '../types/alerts';
import type { LanguageCode } from '../i18n/languages';
import { DEFAULT_LANGUAGE } from '../i18n/languages';

export type SpeedUnit = 'kt' | 'km/h' | 'mph' | 'm/s';
export type WindUnit = 'kt' | 'km/h' | 'mph' | 'm/s' | 'bft';
export type DepthUnit = 'm' | 'ft';
export type DistanceUnit = 'nm' | 'km' | 'mi';
export type WeightUnit = 'kg' | 'lbs';
export type TemperatureUnit = '°C' | '°F';
export type TimeFormat = '12h' | '24h';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface MapTileUrls {
  streetMap: string;
  satelliteMap: string;
  nauticalOverlay: string;
}

export interface ApiUrls {
  nominatimUrl: string;
}

// Anchor types based on SV Panope testing and industry categories
// Performance data referenced from SV Panope's extensive anchor testing (100+ videos)
// Testing included: sand, mud, rock/cobblestone, kelp, with 180° veer tests
// Sources: morganscloud.com, trawlerforum.com, 48north.com
export type AnchorType =
  | 'excel'      // Sarca Excel - top performer in Panope tests
  | 'spade'      // Spade - excellent all-round, top tier
  | 'vulcan'     // Rocna Vulcan - top performer 20kg class
  | 'mantus'     // Mantus M1 - excellent performance
  | 'viking'     // Viking - excellent but galvanizing issues noted
  | 'ultra'      // Ultra - great except cobblestone, expensive
  | 'rocna'      // Rocna Original - mixed results in testing
  | 'delta'      // Delta/Plow style - good all-round
  | 'cqr'        // CQR - classic plow, decent
  | 'bruce'      // Bruce/Claw - decent, good in rock
  | 'danforth'   // Danforth - excellent in mud/sand
  | 'fortress'   // Fortress - aluminum, best in mud
  | 'other';

// Chain material type - affects weight calculation in catenary formula
export type ChainType = 'galvanized' | 'stainless-steel';

// Weight class definitions for anchor performance scaling
export type AnchorWeightClass = 'light' | 'medium' | 'heavy';

// Get weight class from anchor weight in kg
export const getAnchorWeightClass = (weightKg: number): AnchorWeightClass => {
  if (weightKg < 10) return 'light';     // < 10kg (~22lbs)
  if (weightKg < 18) return 'medium';    // 10-18kg (~22-40lbs)
  return 'heavy';                         // 18kg+ (~40lbs+)
};

// Anchor performance data from SV Panope testing
// Rating: 1-5 scale (5=excellent, 1=poor)
// Based on setting, holding, and reset performance across bottom types
// Weight class modifiers based on SV Panope findings that anchors perform
// differently at different sizes (e.g., Mantus excellent at 8kg, issues at 20kg)
export interface AnchorPerformance {
  label: string;
  category: 'scoop' | 'plow' | 'claw' | 'fluke' | 'other';
  sand: number;
  mud: number;
  rock: number;
  reset: number;  // 180° veer reset ability
  notes: string;
  // Weight class modifiers: adjustment to base scores per weight class
  // Panope found significant variation in performance by anchor size
  weightClassNotes?: {
    light?: string;   // < 10kg notes
    medium?: string;  // 10-18kg notes
    heavy?: string;   // 18kg+ notes
  };
  weightClassModifiers?: {
    light?: { sand?: number; mud?: number; rock?: number; reset?: number };
    medium?: { sand?: number; mud?: number; rock?: number; reset?: number };
    heavy?: { sand?: number; mud?: number; rock?: number; reset?: number };
  };
}

export const anchorPerformanceData: Record<AnchorType, AnchorPerformance> = {
  excel: {
    label: 'Sarca Excel',
    category: 'scoop',
    sand: 5, mud: 4, rock: 4, reset: 5,
    notes: 'Top performer overall, consistent across sizes',
    weightClassNotes: {
      light: 'Good for boats up to 10m',
      medium: 'Excellent choice for cruisers',
      heavy: 'Top tier performance maintained',
    },
  },
  spade: {
    label: 'Spade',
    category: 'scoop',
    sand: 5, mud: 4, rock: 4, reset: 5,
    notes: 'Excellent all-round, steel outperforms aluminum',
    weightClassNotes: {
      light: 'Aluminum version less effective',
      medium: 'Steel version recommended',
      heavy: 'Steel S140/S160 top performers',
    },
    weightClassModifiers: {
      light: { sand: -1, mud: -1 },  // Aluminum versions weaker
    },
  },
  vulcan: {
    label: 'Rocna Vulcan',
    category: 'scoop',
    sand: 5, mud: 4, rock: 4, reset: 4,
    notes: 'Top 20kg class, better at heavier weights',
    weightClassNotes: {
      light: 'Decent but not top choice',
      medium: 'Good performer',
      heavy: 'Tied with Viking for top honors',
    },
    weightClassModifiers: {
      light: { sand: -1, reset: -1 },
      heavy: { sand: 0, reset: 1 },
    },
  },
  mantus: {
    label: 'Mantus M1',
    category: 'scoop',
    sand: 5, mud: 4, rock: 4, reset: 4,
    notes: 'Great at lighter weights, construction concerns at heavier',
    weightClassNotes: {
      light: 'Excellent - Panope loved the 8kg',
      medium: 'Very good performer',
      heavy: 'Construction quality concerns noted',
    },
    weightClassModifiers: {
      light: { reset: 1 },
      heavy: { reset: -1 },  // Build quality issues at 20kg
    },
  },
  viking: {
    label: 'Viking',
    category: 'scoop',
    sand: 5, mud: 4, rock: 5, reset: 4,
    notes: 'Top performer but galvanizing quality issues',
    weightClassNotes: {
      light: 'Outperformed Mantus in 5-7kg tests',
      medium: 'Very strong performer',
      heavy: 'Top honors tied with Vulcan at 20kg',
    },
    weightClassModifiers: {
      light: { reset: 1 },
      heavy: { rock: 1 },
    },
  },
  ultra: {
    label: 'Ultra',
    category: 'scoop',
    sand: 5, mud: 4, rock: 2, reset: 4,
    notes: 'Poor in cobblestone, expensive',
    weightClassNotes: {
      heavy: 'Best performance at larger sizes',
    },
  },
  rocna: {
    label: 'Rocna Original',
    category: 'scoop',
    sand: 4, mud: 3, rock: 3, reset: 3,
    notes: 'Roll bar carries mud, reset issues',
    weightClassNotes: {
      light: 'Mixed results',
      medium: 'Struggles in Panope tests',
      heavy: '45lb ranked poorly in testing',
    },
    weightClassModifiers: {
      heavy: { mud: -1, reset: -1 },
    },
  },
  delta: {
    label: 'Delta',
    category: 'plow',
    sand: 4, mud: 3, rock: 3, reset: 3,
    notes: 'Good all-round plow design',
  },
  cqr: {
    label: 'CQR',
    category: 'plow',
    sand: 3, mud: 3, rock: 3, reset: 2,
    notes: 'Classic but dated design',
  },
  bruce: {
    label: 'Bruce/Claw',
    category: 'claw',
    sand: 3, mud: 2, rock: 4, reset: 3,
    notes: 'Good in rock/weed, poor in mud',
  },
  danforth: {
    label: 'Danforth',
    category: 'fluke',
    sand: 5, mud: 5, rock: 1, reset: 2,
    notes: 'Gold standard for mud, useless in rock',
    weightClassNotes: {
      light: 'Great for lunch hooks',
      medium: 'Excellent primary in sand/mud areas',
      heavy: 'Massive holding in soft bottoms',
    },
  },
  fortress: {
    label: 'Fortress',
    category: 'fluke',
    sand: 5, mud: 5, rock: 1, reset: 2,
    notes: 'Best mud anchor, lightweight aluminum',
    weightClassNotes: {
      light: 'FX-7 good for dinghies/kedge',
      medium: 'FX-23 popular cruising choice',
      heavy: 'FX-37/55 exceptional mud holding',
    },
  },
  other: {
    label: 'Other',
    category: 'other',
    sand: 3, mud: 3, rock: 3, reset: 3,
    notes: '',
  },
};

// Helper to get adjusted performance based on weight class
export const getAdjustedAnchorPerformance = (
  anchorType: AnchorType,
  weightKg: number
): { sand: number; mud: number; rock: number; reset: number; note?: string } => {
  const base = anchorPerformanceData[anchorType];
  const weightClass = getAnchorWeightClass(weightKg);
  const modifiers = base.weightClassModifiers?.[weightClass] || {};
  const note = base.weightClassNotes?.[weightClass];

  return {
    sand: Math.max(1, Math.min(5, base.sand + (modifiers.sand || 0))),
    mud: Math.max(1, Math.min(5, base.mud + (modifiers.mud || 0))),
    rock: Math.max(1, Math.min(5, base.rock + (modifiers.rock || 0))),
    reset: Math.max(1, Math.min(5, base.reset + (modifiers.reset || 0))),
    note,
  };
};

export interface VesselSettings {
  // Identification
  name: string;
  registrationNumber: string; // Official registration (e.g., IBS: "123456-A")
  callSign: string; // Radio call sign for VHF
  mmsi: string; // Maritime Mobile Service Identity (9 digits) for DSC/AIS
  homePort: string;
  flag: string; // Country of registration

  // Dimensions
  length: number; // meters (LOA - Length Overall)
  beam: number; // meters (width)
  draft: number; // meters
  displacement: number; // tons
  freeboardHeight: number; // meters - height from waterline to deck/rail
  waterlineLength: number; // meters - length at waterline (LWL)

  // Chain
  chainDiameter: number; // mm
  chainType: ChainType; // galvanized or stainless steel
  totalChainLength: number; // meters

  // Chain calculation preferences
  useCatenaryFormula: boolean; // Use physics-based catenary equation
  useWindLoaFormula: boolean; // Use Wind + LOA empirical rule
}

export const speedConversions: Record<SpeedUnit, { factor: number; label: string }> = {
  'kt': { factor: 1, label: 'kt' },
  'km/h': { factor: 1.852, label: 'km/h' },
  'mph': { factor: 1.15078, label: 'mph' },
  'm/s': { factor: 0.514444, label: 'm/s' }
};

export const depthConversions: Record<DepthUnit, { factor: number; label: string }> = {
  'm': { factor: 1, label: 'm' },
  'ft': { factor: 3.28084, label: 'ft' }
};

export const distanceConversions: Record<DistanceUnit, { factor: number; label: string }> = {
  'nm': { factor: 1, label: 'nm' },
  'km': { factor: 1.852, label: 'km' },
  'mi': { factor: 1.15078, label: 'mi' }
};

export const windConversions: Record<WindUnit, { factor: number; label: string }> = {
  'kt': { factor: 1, label: 'kt' },
  'km/h': { factor: 1.852, label: 'km/h' },
  'mph': { factor: 1.15078, label: 'mph' },
  'm/s': { factor: 0.514444, label: 'm/s' },
  'bft': { factor: 1, label: 'bft' } // Beaufort is special - handled separately
};

export const weightConversions: Record<WeightUnit, { factor: number; label: string }> = {
  'kg': { factor: 1, label: 'kg' },
  'lbs': { factor: 2.20462, label: 'lbs' }
};

export const temperatureConversions: Record<TemperatureUnit, { label: string }> = {
  '°C': { label: '°C' },
  '°F': { label: '°F' }
};

interface SettingsContextType {
  // Units
  speedUnit: SpeedUnit;
  windUnit: WindUnit;
  depthUnit: DepthUnit;
  distanceUnit: DistanceUnit;
  weightUnit: WeightUnit;
  temperatureUnit: TemperatureUnit;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setWindUnit: (unit: WindUnit) => void;
  setDepthUnit: (unit: DepthUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setDateFormat: (format: DateFormat) => void;

  // Map Tile URLs
  mapTileUrls: MapTileUrls;
  setMapTileUrls: (urls: MapTileUrls) => void;

  // API URLs
  apiUrls: ApiUrls;
  setApiUrls: (urls: ApiUrls) => void;

  // Vessel settings
  vesselSettings: VesselSettings;
  setVesselSettings: (settings: VesselSettings) => void;

  // Weather settings
  weatherSettings: WeatherSettings;
  setWeatherSettings: (settings: WeatherSettings) => void;

  // Alert settings
  alertSettings: AlertSettings;
  setAlertSettings: (settings: AlertSettings) => void;

  // Depth alarm
  depthAlarm: number | null; // Stored in current unit
  depthAlarmMeters: number | null; // Computed in meters
  setDepthAlarm: (depth: number | null) => void;
  soundAlarmEnabled: boolean;
  setSoundAlarmEnabled: (enabled: boolean) => void;
  isDepthAlarmTriggered: boolean;

  // Conversion helpers
  convertSpeed: (speedInKnots: number) => number;
  convertWind: (windInKnots: number) => number;
  convertDepth: (depthInMeters: number) => number;
  convertDistance: (distanceInNm: number) => number;
  convertWeight: (weightInKg: number) => number;
  convertTemperature: (tempInCelsius: number) => number;

  // Current depth for alarm checking
  currentDepth: number;
  setCurrentDepth: (depth: number) => void;

  // Chart only mode
  chartOnly: boolean;
  setChartOnly: (enabled: boolean) => void;

  // Demo mode
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;

  // Language
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;

  // Sync status
  isSynced: boolean;
}

// Get API base URL for tile proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const defaultVesselSettings: VesselSettings = {
  // Identification
  name: '',
  registrationNumber: '',
  callSign: '',
  mmsi: '',
  homePort: '',
  flag: '',

  // Dimensions
  length: 0,
  beam: 0,
  draft: 0,
  displacement: 0,
  freeboardHeight: 0,
  waterlineLength: 0,

  // Chain
  chainDiameter: 0,
  chainType: 'galvanized',
  totalChainLength: 0,

  // Chain calculation preferences
  useCatenaryFormula: true,
  useWindLoaFormula: true,
};

const defaultWeatherSettings: WeatherSettings = {
  enabled: true,
  provider: 'open-meteo',
  weatherApiUrl: 'https://api.open-meteo.com/v1/forecast',
  marineApiUrl: 'https://marine-api.open-meteo.com/v1/marine',
  refreshIntervalMinutes: 15,
};

const defaultSettings = {
  speedUnit: 'kt' as SpeedUnit,
  windUnit: 'kt' as WindUnit,
  depthUnit: 'm' as DepthUnit,
  distanceUnit: 'nm' as DistanceUnit,
  weightUnit: 'kg' as WeightUnit,
  temperatureUnit: '°C' as TemperatureUnit,
  timeFormat: '24h' as TimeFormat,
  dateFormat: 'DD/MM/YYYY' as DateFormat,
  depthAlarm: null as number | null,
  soundAlarmEnabled: false,
  chartOnly: false,
  demoMode: true,
  language: DEFAULT_LANGUAGE as LanguageCode,
  vesselSettings: defaultVesselSettings,
  weatherSettings: defaultWeatherSettings,
  alertSettings: DEFAULT_ALERT_SETTINGS,
  mapTileUrls: {
    // All tiles go through server proxy for offline support
    streetMap: `${API_BASE_URL}/tiles/street/{z}/{x}/{y}`,
    satelliteMap: `${API_BASE_URL}/tiles/satellite/{z}/{x}/{y}`,
    nauticalOverlay: `${API_BASE_URL}/tiles/nautical/{z}/{x}/{y}`,
  } as MapTileUrls,
  apiUrls: {
    nominatimUrl: 'https://photon.komoot.io',
  } as ApiUrls,
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>(defaultSettings.speedUnit);
  const [windUnit, setWindUnitState] = useState<WindUnit>(defaultSettings.windUnit);
  const [depthUnit, setDepthUnitState] = useState<DepthUnit>(defaultSettings.depthUnit);
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>(defaultSettings.distanceUnit);
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(defaultSettings.weightUnit);
  const [temperatureUnit, setTemperatureUnitState] = useState<TemperatureUnit>(defaultSettings.temperatureUnit);
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(defaultSettings.timeFormat);
  const [dateFormat, setDateFormatState] = useState<DateFormat>(defaultSettings.dateFormat);
  const [depthAlarm, setDepthAlarmState] = useState<number | null>(defaultSettings.depthAlarm);
  const [soundAlarmEnabled, setSoundAlarmEnabledState] = useState<boolean>(defaultSettings.soundAlarmEnabled);
  const [chartOnly, setChartOnlyState] = useState<boolean>(defaultSettings.chartOnly);
  const [demoMode, setDemoModeState] = useState<boolean>(defaultSettings.demoMode);
  const [language, setLanguageState] = useState<LanguageCode>(defaultSettings.language);
  const [mapTileUrls, setMapTileUrlsState] = useState<MapTileUrls>(defaultSettings.mapTileUrls);
  const [apiUrls, setApiUrlsState] = useState<ApiUrls>(defaultSettings.apiUrls);
  const [vesselSettings, setVesselSettingsState] = useState<VesselSettings>(defaultSettings.vesselSettings);
  const [weatherSettings, setWeatherSettingsState] = useState<WeatherSettings>(defaultSettings.weatherSettings);
  const [alertSettings, setAlertSettingsState] = useState<AlertSettings>(defaultSettings.alertSettings);
  const [currentDepth, setCurrentDepth] = useState<number>(10);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const isApplyingServerSettings = React.useRef<boolean>(false);

  // Listen for settings from server
  useEffect(() => {
    // Initial settings sync from server
    const handleSettingsSync = (data: { settings: Record<string, any> }) => {
      console.log('Received settings sync:', data.settings);
      isApplyingServerSettings.current = true;

      if (data.settings.speedUnit) {
        setSpeedUnitState(data.settings.speedUnit);
      }
      if (data.settings.windUnit) {
        setWindUnitState(data.settings.windUnit);
      }
      if (data.settings.depthUnit) {
        setDepthUnitState(data.settings.depthUnit);
      }
      if (data.settings.distanceUnit) {
        setDistanceUnitState(data.settings.distanceUnit);
      }
      if (data.settings.weightUnit) {
        setWeightUnitState(data.settings.weightUnit);
      }
      if (data.settings.temperatureUnit) {
        setTemperatureUnitState(data.settings.temperatureUnit);
      }
      if (data.settings.timeFormat) {
        setTimeFormatState(data.settings.timeFormat);
      }
      if (data.settings.dateFormat) {
        setDateFormatState(data.settings.dateFormat);
      }
      // depthAlarm and soundAlarmEnabled are NOT loaded from settings_sync.
      // They come from the dedicated depth_alarm_sync event (AlertService is authoritative).
      if (data.settings.chartOnly !== undefined) {
        setChartOnlyState(data.settings.chartOnly);
      }
      if (data.settings.demoMode !== undefined) {
        setDemoModeState(data.settings.demoMode);
      }
      if (data.settings.language) {
        setLanguageState(data.settings.language);
      }
      if (data.settings.mapTileUrls) {
        setMapTileUrlsState(data.settings.mapTileUrls);
      }
      if (data.settings.apiUrls) {
        setApiUrlsState(data.settings.apiUrls);
      }
      if (data.settings.vesselSettings) {
        setVesselSettingsState(data.settings.vesselSettings);
      }
      if (data.settings.weatherSettings) {
        setWeatherSettingsState(data.settings.weatherSettings);
      }
      // alertSettings is NOT loaded from settings_sync.
      // It comes from the dedicated alert_settings_sync event with proper unit conversion.

      isApplyingServerSettings.current = false;
      setIsSynced(true);
    };

    // Individual setting changed (from another device)
    const handleSettingsChanged = (data: { key: string; value: any }) => {
      console.log('Received settings change:', data.key, data.value);
      isApplyingServerSettings.current = true;

      switch (data.key) {
        case 'speedUnit':
          setSpeedUnitState(data.value);
          break;
        case 'windUnit':
          setWindUnitState(data.value);
          break;
        case 'depthUnit':
          setDepthUnitState(data.value);
          break;
        case 'distanceUnit':
          setDistanceUnitState(data.value);
          break;
        case 'weightUnit':
          setWeightUnitState(data.value);
          break;
        case 'temperatureUnit':
          setTemperatureUnitState(data.value);
          break;
        case 'timeFormat':
          setTimeFormatState(data.value);
          break;
        case 'dateFormat':
          setDateFormatState(data.value);
          break;
        case 'depthAlarm':
          setDepthAlarmState(data.value);
          break;
        case 'soundAlarmEnabled':
          setSoundAlarmEnabledState(data.value);
          break;
        case 'chartOnly':
          setChartOnlyState(data.value);
          break;
        case 'demoMode':
          setDemoModeState(data.value);
          break;
        case 'language':
          setLanguageState(data.value);
          break;
        case 'mapTileUrls':
          setMapTileUrlsState(data.value);
          break;
        case 'apiUrls':
          setApiUrlsState(data.value);
          break;
        case 'vesselSettings':
          setVesselSettingsState(data.value);
          break;
        case 'weatherSettings':
          setWeatherSettingsState(data.value);
          break;
        case 'alertSettings':
          setAlertSettingsState(data.value);
          break;
      }

      isApplyingServerSettings.current = false;
    };

    wsService.on('settings_sync', handleSettingsSync);
    wsService.on('settings_changed', handleSettingsChanged);

    // Request settings on mount
    wsService.emit('get_settings', {});

    return () => {
      wsService.off('settings_sync', handleSettingsSync);
      wsService.off('settings_changed', handleSettingsChanged);
    };
  }, []);

  // Track last sent values to avoid sending duplicates
  const lastSentDepthAlarm = useRef<{ threshold: number | null; soundEnabled: boolean } | null>(null);

  // Send depth alarm updates to server (for server-side alert evaluation)
  useEffect(() => {
    if (!isSynced) return;

    // Convert threshold to meters for server
    const thresholdMeters = depthAlarm !== null
      ? (depthUnit === 'ft' ? depthAlarm / depthConversions.ft.factor : depthAlarm)
      : null;

    // Only send if values actually changed from what we last sent
    const newValues = { threshold: thresholdMeters, soundEnabled: soundAlarmEnabled };
    if (
      lastSentDepthAlarm.current &&
      lastSentDepthAlarm.current.threshold === newValues.threshold &&
      lastSentDepthAlarm.current.soundEnabled === newValues.soundEnabled
    ) {
      return; // No change, don't send
    }

    lastSentDepthAlarm.current = newValues;
    wsService.emit('depth_alarm_update', newValues);
  }, [depthAlarm, soundAlarmEnabled, depthUnit, isSynced]);

  // Listen for depth alarm sync from server (authoritative source on connect)
  useEffect(() => {
    const handleDepthAlarmSync = (data: { threshold: number | null; soundEnabled: boolean }) => {
      isApplyingServerSettings.current = true;
      // threshold from server is in meters, convert to user's display unit
      if (data.threshold !== null) {
        const displayValue = depthUnit === 'ft'
          ? data.threshold * depthConversions.ft.factor
          : data.threshold;
        setDepthAlarmState(displayValue);
      } else {
        setDepthAlarmState(null);
      }
      setSoundAlarmEnabledState(data.soundEnabled);
      isApplyingServerSettings.current = false;
    };

    const handleDepthAlarmCleared = () => {
      isApplyingServerSettings.current = true;
      setDepthAlarmState(null);
      isApplyingServerSettings.current = false;
    };

    wsService.on('depth_alarm_sync', handleDepthAlarmSync);
    wsService.on('depth_alarm_cleared', handleDepthAlarmCleared);

    return () => {
      wsService.off('depth_alarm_sync', handleDepthAlarmSync);
      wsService.off('depth_alarm_cleared', handleDepthAlarmCleared);
    };
  }, [depthUnit]);

  // Helper to send setting update to server
  const updateServerSetting = useCallback((key: string, value: any) => {
    if (!isApplyingServerSettings.current) {
      wsService.emit('settings_update', { key, value });
    }
  }, []);

  // Setters that sync to server
  const setSpeedUnit = useCallback((unit: SpeedUnit) => {
    setSpeedUnitState(unit);
    updateServerSetting('speedUnit', unit);
  }, [updateServerSetting]);

  const setWindUnit = useCallback((unit: WindUnit) => {
    setWindUnitState(unit);
    updateServerSetting('windUnit', unit);
  }, [updateServerSetting]);

  const setDepthUnit = useCallback((unit: DepthUnit) => {
    setDepthUnitState(unit);
    updateServerSetting('depthUnit', unit);
    // Reset depth alarm when unit changes to avoid confusion
    setDepthAlarmState(null);
    updateServerSetting('depthAlarm', null);
  }, [updateServerSetting]);

  const setDistanceUnit = useCallback((unit: DistanceUnit) => {
    setDistanceUnitState(unit);
    updateServerSetting('distanceUnit', unit);
  }, [updateServerSetting]);

  const setWeightUnit = useCallback((unit: WeightUnit) => {
    setWeightUnitState(unit);
    updateServerSetting('weightUnit', unit);
  }, [updateServerSetting]);

  const setTemperatureUnit = useCallback((unit: TemperatureUnit) => {
    setTemperatureUnitState(unit);
    updateServerSetting('temperatureUnit', unit);
  }, [updateServerSetting]);

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setTimeFormatState(format);
    updateServerSetting('timeFormat', format);
  }, [updateServerSetting]);

  const setDateFormat = useCallback((format: DateFormat) => {
    setDateFormatState(format);
    updateServerSetting('dateFormat', format);
  }, [updateServerSetting]);

  const setDepthAlarm = useCallback((depth: number | null) => {
    setDepthAlarmState(depth);
    updateServerSetting('depthAlarm', depth);
  }, [updateServerSetting]);

  const setSoundAlarmEnabled = useCallback((enabled: boolean) => {
    setSoundAlarmEnabledState(enabled);
    updateServerSetting('soundAlarmEnabled', enabled);
  }, [updateServerSetting]);

  const setChartOnly = useCallback((enabled: boolean) => {
    setChartOnlyState(enabled);
    updateServerSetting('chartOnly', enabled);
  }, [updateServerSetting]);

  const setDemoMode = useCallback((enabled: boolean) => {
    setDemoModeState(enabled);
    updateServerSetting('demoMode', enabled);
  }, [updateServerSetting]);

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    updateServerSetting('language', lang);
  }, [updateServerSetting]);

  const setMapTileUrls = useCallback((urls: MapTileUrls) => {
    setMapTileUrlsState(urls);
    updateServerSetting('mapTileUrls', urls);
  }, [updateServerSetting]);

  const setApiUrls = useCallback((urls: ApiUrls) => {
    setApiUrlsState(urls);
    updateServerSetting('apiUrls', urls);
  }, [updateServerSetting]);

  const setVesselSettings = useCallback((settings: VesselSettings) => {
    setVesselSettingsState(settings);
    updateServerSetting('vesselSettings', settings);
  }, [updateServerSetting]);

  const setWeatherSettings = useCallback((settings: WeatherSettings) => {
    setWeatherSettingsState(settings);
    updateServerSetting('weatherSettings', settings);
  }, [updateServerSetting]);

  // Note: setAlertSettings only updates local state, NOT syncing to server.
  // Alert settings are synced via AlertContext using dedicated alert_update events
  // which handle unit conversion properly. Syncing here would cause double-conversion.
  const setAlertSettings = useCallback((settings: AlertSettings) => {
    setAlertSettingsState(settings);
  }, []);

  // Convert alarm threshold to meters
  const depthAlarmMeters = depthAlarm !== null
    ? (depthUnit === 'ft' ? depthAlarm / depthConversions.ft.factor : depthAlarm)
    : null;

  // Check if alarm is triggered
  const isDepthAlarmTriggered = depthAlarmMeters !== null && currentDepth < depthAlarmMeters;

  // Conversion helpers
  const convertSpeed = useCallback((speedInKnots: number) => {
    return speedInKnots * speedConversions[speedUnit].factor;
  }, [speedUnit]);

  const convertWind = useCallback((windInKnots: number) => {
    if (windUnit === 'bft') {
      // Convert knots to Beaufort scale
      if (windInKnots < 1) return 0;
      if (windInKnots < 4) return 1;
      if (windInKnots < 7) return 2;
      if (windInKnots < 11) return 3;
      if (windInKnots < 17) return 4;
      if (windInKnots < 22) return 5;
      if (windInKnots < 28) return 6;
      if (windInKnots < 34) return 7;
      if (windInKnots < 41) return 8;
      if (windInKnots < 48) return 9;
      if (windInKnots < 56) return 10;
      if (windInKnots < 64) return 11;
      return 12;
    }
    return windInKnots * windConversions[windUnit].factor;
  }, [windUnit]);

  const convertDepth = useCallback((depthInMeters: number) => {
    return depthInMeters * depthConversions[depthUnit].factor;
  }, [depthUnit]);

  const convertDistance = useCallback((distanceInNm: number) => {
    return distanceInNm * distanceConversions[distanceUnit].factor;
  }, [distanceUnit]);

  const convertWeight = useCallback((weightInKg: number) => {
    return weightInKg * weightConversions[weightUnit].factor;
  }, [weightUnit]);

  const convertTemperature = useCallback((tempInCelsius: number) => {
    if (temperatureUnit === '°F') {
      return (tempInCelsius * 9/5) + 32;
    }
    return tempInCelsius;
  }, [temperatureUnit]);

  const value: SettingsContextType = {
    speedUnit,
    windUnit,
    depthUnit,
    distanceUnit,
    weightUnit,
    temperatureUnit,
    timeFormat,
    dateFormat,
    setSpeedUnit,
    setWindUnit,
    setDepthUnit,
    setDistanceUnit,
    setWeightUnit,
    setTemperatureUnit,
    setTimeFormat,
    setDateFormat,
    mapTileUrls,
    setMapTileUrls,
    apiUrls,
    setApiUrls,
    vesselSettings,
    setVesselSettings,
    weatherSettings,
    setWeatherSettings,
    alertSettings,
    setAlertSettings,
    depthAlarm,
    depthAlarmMeters,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    chartOnly,
    setChartOnly,
    demoMode,
    setDemoMode,
    language,
    setLanguage,
    convertSpeed,
    convertWind,
    convertDepth,
    convertDistance,
    convertWeight,
    convertTemperature,
    currentDepth,
    setCurrentDepth,
    isSynced,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
