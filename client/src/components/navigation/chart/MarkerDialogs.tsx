import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CustomMarker, markerIcons, markerColors } from './map-icons';
import { VesselSettings, ChainType, useSettings } from '../../../context/SettingsContext';
import { useTheme } from '../../../context/ThemeContext';
import { weatherAPI, WeatherForecastResponse } from '../../../services/api';
import { useLanguage } from '../../../i18n/LanguageContext';

// Chain length recommendation calculator using catenary-based approach
// Based on research from:
// - Yachting Monthly: Chain(m) = windSpeed(kt) + boatLength(m) for depths up to 8m
//   Multiply wind factor by 1.5 for 10-15m depth, by 2 for 20m+ depth
// - Catenary equation: L = √(Y × (Y + 2a)) where a = F/(m×g)
// - Wind force: F = 0.5 × ρ × V² × A × Cd (ρ=1.23 kg/m³, Cd≈1.0)
// - Sources: trimaran-san.de, Yachting Monthly, BoatUS, Rocna KB
const calculateRecommendedChainLength = (
  depth: number,
  _windCondition: 'calm' | 'moderate' | 'strong' | 'storm',
  vesselDisplacement?: number,
  boatLength?: number,
  chainDiameter?: number,
  useCatenary: boolean = true,
  useWindLoa: boolean = true,
  freeboardHeight?: number,
  waterlineLength?: number,
  chainType?: ChainType
): { min: number; recommended: number; storm: number } => {
  const effectiveBoatLength = boatLength || 10; // Default 10m LOA
  const effectiveDisplacement = vesselDisplacement || 5; // Default 5 tons
  const effectiveFreeboardHeight = freeboardHeight || 1.0; // Default 1m freeboard
  const effectiveWaterlineLength = waterlineLength || (effectiveBoatLength * 0.9); // Default 90% of LOA

  // Estimate windage area from boat dimensions (m²)
  // For sailboats: freeboard × waterline length × coefficient
  // Coefficient ~0.8 accounts for hull shape not being a rectangle
  // Heavier displacement = fuller hull = slightly more windage
  const displacementFactor = 1 + (effectiveDisplacement - 5) * 0.05; // +5% per ton over 5t
  const windageArea = effectiveFreeboardHeight * effectiveWaterlineLength * 0.8 * Math.min(displacementFactor, 1.5);

  // Chain weight per meter in water (kg/m)
  // Formula: weight = coefficient × d² (d in mm)
  // Verified against Jimmy Green Marine data with 87% buoyancy factor:
  //   6mm: 0.70 kg/m, 8mm: 1.26 kg/m, 10mm: 2.0 kg/m, 12mm: 2.83 kg/m
  // Galvanized: ~0.020 × d² kg/m in water
  // Stainless steel: ~0.022 × d² kg/m in water (~10% denser)
  const chainDiameterMm = chainDiameter || 8;
  const chainWeightFactor = chainType === 'stainless-steel' ? 0.022 : 0.020;
  const chainWeightPerMeter = chainWeightFactor * chainDiameterMm * chainDiameterMm;

  // Wind force calculation: F = 0.5 × ρ × V² × A × Cd
  // ρ = 1.23 kg/m³, Cd ≈ 1.0 for yacht at anchor
  // V in m/s (1 knot = 0.514 m/s)
  const calcWindForce = (windKnots: number) => {
    const windMs = windKnots * 0.514;
    return 0.5 * 1.23 * windMs * windMs * windageArea * 1.0;
  };

  // Catenary parameter: a = F / (m × g)
  const g = 9.81;
  const calcCatenaryParam = (windKnots: number) => {
    return calcWindForce(windKnots) / (chainWeightPerMeter * g);
  };

  // Catenary length: L = √(Y × (Y + 2a))
  // Use actual freeboard height instead of hardcoded value
  const totalVertical = depth + effectiveFreeboardHeight;
  const catenaryLength = (a: number) => Math.sqrt(totalVertical * (totalVertical + 2 * a));

  // Wind speeds for each condition
  const windCalm = 15;     // ~15 knots - nice overnight
  const windModerate = 25; // ~25 knots - moderate conditions
  const windStorm = 45;    // ~45 knots - storm/gale

  // Calculate catenary-based chain lengths (if enabled)
  let catMinChain = 0;
  let catRecommendedChain = 0;
  let catStormChain = 0;

  if (useCatenary) {
    catMinChain = catenaryLength(calcCatenaryParam(windCalm)) + effectiveBoatLength * 0.5;
    catRecommendedChain = catenaryLength(calcCatenaryParam(windModerate)) + effectiveBoatLength;
    catStormChain = catenaryLength(calcCatenaryParam(windStorm)) + effectiveBoatLength;
  }

  // Cross-check with Wind + LOA formula (if enabled)
  // Based on Yachting Monthly: Chain(m) = windSpeed(kt) × depthFactor + boatLength(m)
  // Depth factors from source: ×1.0 for <8m, ×1.5 for 8-15m, ×2.0 for 15m+
  let ymMinimum = 0;
  let ymRecommended = 0;
  let ymStorm = 0;

  if (useWindLoa) {
    let depthFactor = 1.0;
    if (depth >= 15) depthFactor = 2.0;
    else if (depth >= 8) depthFactor = 1.5;

    ymMinimum = windCalm * depthFactor + effectiveBoatLength;
    ymRecommended = windModerate * depthFactor + effectiveBoatLength;
    ymStorm = windStorm * depthFactor + effectiveBoatLength;
  }

  // Use the higher of the enabled formulas
  let minChain: number;
  let recommendedChain: number;
  let stormChain: number;

  if (useCatenary && useWindLoa) {
    // Both enabled: take higher value
    minChain = Math.max(catMinChain, ymMinimum);
    recommendedChain = Math.max(catRecommendedChain, ymRecommended);
    stormChain = Math.max(catStormChain, ymStorm);
  } else if (useCatenary) {
    // Only catenary
    minChain = catMinChain;
    recommendedChain = catRecommendedChain;
    stormChain = catStormChain;
  } else if (useWindLoa) {
    // Only Wind + LOA
    minChain = ymMinimum;
    recommendedChain = ymRecommended;
    stormChain = ymStorm;
  } else {
    // Neither enabled - fallback to simple scope
    minChain = totalVertical * 5;
    recommendedChain = totalVertical * 6;
    stormChain = totalVertical * 7;
  }

  // Ensure minimum safe amounts (even in very shallow water)
  const absoluteMin = 15;

  return {
    min: Math.max(absoluteMin, Math.ceil(minChain)),
    recommended: Math.max(absoluteMin + 5, Math.ceil(recommendedChain)),
    storm: Math.max(absoluteMin + 15, Math.ceil(stormChain)),
  };
};

// Alternative calculation methods for reference
const getRuleOfThumbRecommendation = (depth: number, freeboardHeight: number = 1.0): { method: string; length: number }[] => {
  const totalVertical = depth + freeboardHeight;
  return [
    { method: 'Linear (15+2d)', length: Math.ceil(15 + 2 * depth) },
    { method: '5:1 scope', length: Math.ceil(totalVertical * 5) },
    { method: '7:1 scope', length: Math.ceil(totalVertical * 7) },
  ];
};

interface MarkerDialogProps {
  marker?: CustomMarker; // If provided, editing existing marker
  position?: { lat: number; lon: number }; // If provided (and no marker), creating new marker
  markerName: string;
  setMarkerName: (name: string) => void;
  markerColor: string;
  setMarkerColor: (color: string) => void;
  markerIcon: string;
  setMarkerIcon: (icon: string) => void;
  onClose: () => void;
  onSave: (lat: number, lon: number, name: string, color: string, icon: string, id?: string) => void;
}

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { theme } = useTheme();
  return (
  <button
    onClick={onClick}
    className="touch-btn"
    style={{
      position: 'absolute',
      top: '0.75rem',
      right: '0.75rem',
      width: '36px',
      height: '36px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '6px',
      color: theme.colors.textSecondary,
    }}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
  );
};

const IconSelector: React.FC<{
  selectedIcon: string;
  selectedColor: string;
  onSelect: (icon: string) => void;
}> = ({ selectedIcon, selectedColor, onSelect }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
  <>
    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.5rem' }}>
      {t('markers.icon')}
    </div>
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        marginBottom: '1rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {Object.keys(markerIcons).map((iconKey) => (
        <button
          key={iconKey}
          onClick={() => onSelect(iconKey)}
          className="touch-btn"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '8px',
            background:
              selectedIcon === iconKey
                ? 'rgba(79, 195, 247, 0.3)'
                : theme.colors.bgCardActive,
            border:
              selectedIcon === iconKey
                ? '2px solid #4fc3f7'
                : `1px solid ${theme.colors.borderHover}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={selectedColor}
            stroke="#fff"
            strokeWidth="1"
          >
            <path d={markerIcons[iconKey]} />
          </svg>
        </button>
      ))}
    </div>
  </>
  );
};

const ColorSelector: React.FC<{
  selectedColor: string;
  onSelect: (color: string) => void;
}> = ({ selectedColor, onSelect }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
  <>
    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.5rem' }}>
      {t('markers.color')}
    </div>
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        marginBottom: '1.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {markerColors.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className="touch-btn"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '8px',
            background: color,
            border:
              selectedColor === color
                ? '2px solid #fff'
                : `1px solid ${theme.colors.borderHover}`,
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  </>
  );
};

const DialogOverlay: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
}> = ({ onClick, children }) => {
  const { theme } = useTheme();
  return (
  <>
    <div
      onClick={(e) => {
        // Only close on single click, not double-click (used for map zoom)
        if (e.detail === 1) onClick();
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1100,
      }}
    />
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: theme.colors.bgSecondary,
        border: `1px solid ${theme.colors.borderDashed}`,
        borderRadius: '8px',
        padding: '1.25rem',
        zIndex: 1101,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        minWidth: '300px',
      }}
    >
      {children}
    </div>
  </>
  );
};

const NameInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={t('markers.name_placeholder')}
    autoFocus
    style={{
      width: '100%',
      padding: '0.75rem',
      marginBottom: '1rem',
      background: theme.colors.bgCardActive,
      border: `1px solid ${theme.colors.borderHover}`,
      borderRadius: '6px',
      color: theme.colors.textPrimary,
      fontSize: '1rem',
      outline: 'none',
    }}
  />
  );
};

export const MarkerDialog: React.FC<MarkerDialogProps> = ({
  marker,
  position,
  markerName,
  setMarkerName,
  markerColor,
  setMarkerColor,
  markerIcon,
  setMarkerIcon,
  onClose,
  onSave,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isEditing = !!marker;
  const lat = marker?.lat ?? position?.lat ?? 0;
  const lon = marker?.lon ?? position?.lon ?? 0;

  return (
    <DialogOverlay onClick={onClose}>
      <CloseButton onClick={onClose} />
      <div
        style={{
          fontSize: '1.1rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          textAlign: 'center',
        }}
      >
        {isEditing ? t('markers.edit_marker') : t('markers.add_marker')}
      </div>
      <NameInput value={markerName} onChange={setMarkerName} />
      <IconSelector
        selectedIcon={markerIcon}
        selectedColor={markerColor}
        onSelect={setMarkerIcon}
      />
      <ColorSelector selectedColor={markerColor} onSelect={setMarkerColor} />
      <button
        onClick={() => {
          if (markerName.trim()) {
            onSave(lat, lon, markerName, markerColor, markerIcon, marker?.id);
          }
        }}
        disabled={!markerName.trim()}
        style={{
          width: '100%',
          padding: '0.9rem',
          background: markerName.trim()
            ? 'rgba(79, 195, 247, 0.5)'
            : theme.colors.bgCard,
          border: 'none',
          borderRadius: '6px',
          color: '#fff',
          cursor: markerName.trim() ? 'pointer' : 'not-allowed',
          fontSize: '1rem',
          fontWeight: 'bold',
          opacity: markerName.trim() ? 1 : 0.5,
        }}
      >
        {isEditing ? t('common.save') : t('markers.add_marker')}
      </button>
    </DialogOverlay>
  );
};

// Chain Calculation Info Dialog
const ChainCalculationInfoDialog: React.FC<{
  depth: number;
  vesselSettings?: VesselSettings;
  onClose: () => void;
  onToggleFormula?: (formula: 'catenary' | 'windLoa', enabled: boolean) => void;
  forecastMaxWind?: number;
  forecastMaxGust?: number;
  windUnit?: string;
}> = ({ depth, vesselSettings, onClose, onToggleFormula, forecastMaxWind, forecastMaxGust, windUnit = 'kt' }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const effectiveBoatLength = vesselSettings?.length || 10;
  const effectiveDisplacement = vesselSettings?.displacement || 5;
  const chainDiameterMm = vesselSettings?.chainDiameter || 8;
  const effectiveFreeboardHeight = vesselSettings?.freeboardHeight || 1.0;
  const effectiveWaterlineLength = vesselSettings?.waterlineLength || (effectiveBoatLength * 0.9);
  const chainType = vesselSettings?.chainType || 'galvanized';
  const useCatenary = vesselSettings?.useCatenaryFormula ?? true;
  const useWindLoa = vesselSettings?.useWindLoaFormula ?? true;

  // Calculate values to show
  const displacementFactor = 1 + (effectiveDisplacement - 5) * 0.05;
  // Windage for sailboats: freeboard × waterline length × coefficient
  const windageArea = effectiveFreeboardHeight * effectiveWaterlineLength * 0.8 * Math.min(displacementFactor, 1.5);
  // Chain weight based on type (verified against Jimmy Green Marine data with 87% buoyancy)
  const chainWeightFactor = chainType === 'stainless-steel' ? 0.022 : 0.020;
  const chainWeightPerMeter = chainWeightFactor * chainDiameterMm * chainDiameterMm;
  const totalVertical = depth + effectiveFreeboardHeight;

  // Scope ratios
  const scope5to1 = Math.ceil(totalVertical * 5);
  const scope7to1 = Math.ceil(totalVertical * 7);

  return (
    <>
      {/* Backdrop - only close on single click, not double-click zoom */}
      <div
        onClick={(e) => {
          if (e.detail === 1) onClose();
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 2000,
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: theme.colors.bgSecondary,
          border: `1px solid ${theme.colors.borderDashed}`,
          borderRadius: '6px',
          padding: '1rem',
          zIndex: 2001,
          width: '850px',
          maxWidth: '95vw',
          height: '540px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
          overflow: 'auto',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="touch-btn"
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            width: '36px',
            height: '36px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            color: theme.colors.textSecondary,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {t('chart.chain_calculation')}
        </div>

        {/* How we calculate - explanation */}
        <div style={{
          background: theme.colors.bgCardHover,
          borderRadius: '4px',
          padding: '0.5rem',
          marginBottom: '0.75rem',
          fontSize: '0.85rem',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>{t('chart.how_calculated')}</div>
          <div style={{ opacity: 0.85, lineHeight: 1.4 }}>
            {useCatenary && useWindLoa ? (
              <span dangerouslySetInnerHTML={{ __html: t('chart.calc_both_methods') }} />
            ) : useCatenary ? (
              <span dangerouslySetInnerHTML={{ __html: t('chart.calc_catenary_only') }} />
            ) : useWindLoa ? (
              <span dangerouslySetInnerHTML={{ __html: t('chart.calc_wind_loa_only') }} />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: t('chart.calc_fallback') }} />
            )}
          </div>
        </div>

        {/* Widescreen layout - 3 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>

          {/* Left column - Vessel & Input Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Your Vessel Parameters */}
            <div style={{
              background: 'rgba(79, 195, 247, 0.1)',
              border: '1px solid rgba(79, 195, 247, 0.3)',
              borderRadius: '4px',
              padding: '0.5rem',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.3rem', color: '#4fc3f7' }}>{t('chart.your_vessel')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 0.5rem' }}>
                <span style={{ opacity: 0.7 }}>{t('chart.length_loa')}:</span>
                <span>{effectiveBoatLength}m</span>
                <span style={{ opacity: 0.7 }}>{t('chart.wl_length')}:</span>
                <span>{effectiveWaterlineLength}m</span>
                <span style={{ opacity: 0.7 }}>{t('chart.freeboard')}:</span>
                <span>{effectiveFreeboardHeight}m</span>
                <span style={{ opacity: 0.7 }}>{t('chart.displacement')}:</span>
                <span>{effectiveDisplacement}t</span>
                <span style={{ opacity: 0.7 }}>{t('chart.chain_diameter')}:</span>
                <span>{chainDiameterMm}mm {chainType === 'stainless-steel' ? t('chart.chain_type_ss') : t('chart.chain_type_galv')}</span>
                <span style={{ opacity: 0.7 }}>{t('chart.windage_area')}:</span>
                <span>~{windageArea.toFixed(1)}m²</span>
                <span style={{ opacity: 0.7 }}>{t('chart.chain_weight')}:</span>
                <span>{chainWeightPerMeter.toFixed(2)} kg/m</span>
              </div>
            </div>

            {/* Wind Conditions */}
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '4px',
              padding: '0.5rem',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>{t('chart.wind_forecast')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.5rem' }}>
                <span style={{ color: '#66bb6a' }}>{t('chart.minimum')}:</span>
                <span>{forecastMaxWind !== undefined ? `${Math.round(forecastMaxWind)} ${windUnit} (${t('chart.max_wind_label')})` : t('chart.no_forecast')}</span>
                <span style={{ color: '#ffa726' }}>{t('chart.recommended')}:</span>
                <span>{forecastMaxGust !== undefined ? `${Math.round(forecastMaxGust)} ${windUnit} (${t('chart.max_gust_label')})` : t('chart.no_forecast')}</span>
              </div>
            </div>

            {/* Scope Reference */}
            <div style={{
              background: theme.colors.bgCard,
              borderRadius: '4px',
              padding: '0.5rem',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>{t('chart.traditional_scope', { depth: depth.toFixed(1) })}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 0.5rem' }}>
                <span style={{ opacity: 0.7 }}>{t('chart.scope_5_1')}</span>
                <span>{scope5to1}m</span>
                <span style={{ opacity: 0.7 }}>{t('chart.scope_7_1')}</span>
                <span>{scope7to1}m</span>
              </div>
              <div style={{ opacity: 0.5, fontSize: '0.7rem', marginTop: '0.2rem' }}>
                {t('chart.includes_freeboard', { freeboard: effectiveFreeboardHeight.toString() })}
              </div>
            </div>
          </div>

          {/* Middle column - Catenary Method */}
          <div style={{
            background: useCatenary ? 'rgba(255, 167, 38, 0.1)' : theme.colors.bgCard,
            border: useCatenary ? '1px solid rgba(255, 167, 38, 0.3)' : `1px solid ${theme.colors.border}`,
            borderRadius: '4px',
            padding: '0.5rem',
            opacity: useCatenary ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <div style={{ fontWeight: 'bold', color: useCatenary ? '#ffa726' : theme.colors.textMuted }}>
                {t('chart.method_catenary')}
              </div>
              {onToggleFormula && (
                <button
                  onClick={() => onToggleFormula('catenary', !useCatenary)}
                  className="touch-btn"
                  style={{
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.75rem',
                    background: useCatenary ? 'rgba(255, 167, 38, 0.3)' : theme.colors.bgCardActive,
                    border: useCatenary ? '1px solid rgba(255, 167, 38, 0.5)' : `1px solid ${theme.colors.borderHover}`,
                    borderRadius: '4px',
                    color: useCatenary ? '#ffa726' : theme.colors.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {useCatenary ? t('chart.on_upper') : t('chart.off_upper')}
                </button>
              )}
            </div>
            <div style={{
              background: 'rgba(255, 167, 38, 0.15)',
              borderRadius: '4px',
              padding: '0.3rem',
              fontSize: '0.75rem',
              marginBottom: '0.3rem',
            }}>
              {t('chart.catenary_uses')}
            </div>
            <div style={{ opacity: 0.8, marginBottom: '0.3rem', fontSize: '0.8rem' }}>
              {t('chart.catenary_description')}
            </div>
            <div style={{
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.4rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              marginBottom: '0.3rem',
            }}>
              L = √(Y × (Y + 2a))<br />
              a = F / (m × g)<br />
              F = ½ × ρ × V² × A × Cd
            </div>
            <div style={{ opacity: 0.6, fontSize: '0.7rem' }}>
              <div><b>L</b> = {t('chart.catenary_var_L')}, <b>Y</b> = {t('chart.catenary_var_Y')} ({totalVertical.toFixed(1)}m)</div>
              <div><b>a</b> = {t('chart.catenary_var_a')}, <b>F</b> = {t('chart.catenary_var_F')}</div>
              <div><b>m</b> = {t('chart.catenary_var_m')}, <b>ρ</b> = {t('chart.catenary_var_rho')}</div>
              <div><b>V</b> = {t('chart.catenary_var_V')}, <b>A</b> = {t('chart.catenary_var_A')}, <b>Cd</b> = {t('chart.catenary_var_Cd')}</div>
            </div>
          </div>

          {/* Right column - Wind + LOA Method */}
          <div style={{
            background: useWindLoa ? 'rgba(102, 187, 106, 0.1)' : theme.colors.bgCard,
            border: useWindLoa ? '1px solid rgba(102, 187, 106, 0.3)' : `1px solid ${theme.colors.border}`,
            borderRadius: '4px',
            padding: '0.5rem',
            opacity: useWindLoa ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <div style={{ fontWeight: 'bold', color: useWindLoa ? '#66bb6a' : theme.colors.textMuted }}>
                {t('chart.method_wind_loa')}
              </div>
              {onToggleFormula && (
                <button
                  onClick={() => onToggleFormula('windLoa', !useWindLoa)}
                  className="touch-btn"
                  style={{
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.75rem',
                    background: useWindLoa ? 'rgba(102, 187, 106, 0.3)' : theme.colors.bgCardActive,
                    border: useWindLoa ? '1px solid rgba(102, 187, 106, 0.5)' : `1px solid ${theme.colors.borderHover}`,
                    borderRadius: '4px',
                    color: useWindLoa ? '#66bb6a' : theme.colors.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {useWindLoa ? t('chart.on_upper') : t('chart.off_upper')}
                </button>
              )}
            </div>
            <div style={{
              background: 'rgba(102, 187, 106, 0.15)',
              borderRadius: '4px',
              padding: '0.3rem',
              fontSize: '0.75rem',
              marginBottom: '0.3rem',
            }}>
              {t('chart.wind_loa_uses')}
            </div>
            <div style={{ opacity: 0.8, marginBottom: '0.3rem', fontSize: '0.8rem' }}>
              {t('chart.wind_loa_description')}
            </div>
            <div style={{
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.4rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              marginBottom: '0.3rem',
            }}>
              {t('chart.wind_loa_formula')}
            </div>
            <div style={{ opacity: 0.6, fontSize: '0.7rem', marginBottom: '0.3rem' }}>
              <div><b>Wind</b> = {t('chart.wind_loa_var_wind')}</div>
              <div><b>LOA</b> = {t('chart.wind_loa_var_loa')} ({effectiveBoatLength}m)</div>
            </div>
            <div style={{ opacity: 0.8, marginBottom: '0.15rem', fontWeight: 'bold', fontSize: '0.75rem' }}>
              {t('chart.depth_factors')}:
            </div>
            <div style={{
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.3rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
            }}>
              {t('chart.depth_factor_shallow')}<br />
              {t('chart.depth_factor_medium')}<br />
              {t('chart.depth_factor_deep')}
            </div>
          </div>
        </div>

        {/* Sources */}
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.65rem',
          opacity: 0.5,
          borderTop: `1px solid ${theme.colors.border}`,
          paddingTop: '0.4rem',
        }}>
          {t('chart.sources')}
        </div>
      </div>
    </>
  );
};

// Scope visualization SVG component
const ScopeVisualization: React.FC<{
  chainLength: number;
  depth: number;
  vesselSettings?: VesselSettings;
  showRecommendations?: boolean;
  onUpdateVesselSettings?: (settings: VesselSettings) => void;
}> = ({ chainLength, depth, vesselSettings, showRecommendations = false, onUpdateVesselSettings }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [showCalcInfo, setShowCalcInfo] = React.useState(false);

  const handleToggleFormula = (formula: 'catenary' | 'windLoa', enabled: boolean) => {
    if (onUpdateVesselSettings && vesselSettings) {
      const updatedSettings = { ...vesselSettings };
      if (formula === 'catenary') {
        updatedSettings.useCatenaryFormula = enabled;
      } else {
        updatedSettings.useWindLoaFormula = enabled;
      }
      onUpdateVesselSettings(updatedSettings);
    }
  };

  // Get vessel parameters for catenary calculation
  const effectiveFreeboardHeight = vesselSettings?.freeboardHeight || 1.0;
  const effectiveWaterlineLength = vesselSettings?.waterlineLength || ((vesselSettings?.length || 10) * 0.9);
  const effectiveDisplacement = vesselSettings?.displacement || 5;
  const chainDiameterMm = vesselSettings?.chainDiameter || 8;
  const chainType = vesselSettings?.chainType || 'galvanized';

  // Total vertical distance (depth + freeboard)
  const totalVertical = depth + effectiveFreeboardHeight;
  const scopeRatio = depth > 0 ? chainLength / depth : 0;

  // Calculate catenary parameters for visualization
  // Using moderate wind (15-20 knots) as typical visualization scenario
  const visualizationWindKnots = 18;

  // Windage area calculation (same as main formula)
  const displacementFactor = 1 + (effectiveDisplacement - 5) * 0.05;
  const windageArea = effectiveFreeboardHeight * effectiveWaterlineLength * 0.8 * Math.min(displacementFactor, 1.5);

  // Chain weight per meter underwater
  const chainWeightFactor = chainType === 'stainless-steel' ? 0.022 : 0.020;
  const chainWeightPerMeter = chainWeightFactor * chainDiameterMm * chainDiameterMm;

  // Wind force and catenary parameter
  const windMs = visualizationWindKnots * 0.514;
  const windForce = 0.5 * 1.23 * windMs * windMs * windageArea * 1.0;
  const g = 9.81;
  const catenaryParam = chainWeightPerMeter > 0 ? windForce / (chainWeightPerMeter * g) : 1;

  // Minimum chain length for catenary (chain just taut, no slack on bottom)
  const minCatenaryLength = Math.sqrt(totalVertical * (totalVertical + 2 * catenaryParam));

  // Chain on seabed = total chain - suspended catenary length
  const chainOnSeabed = Math.max(0, chainLength - minCatenaryLength);

  // Horizontal distance calculation:
  // For the suspended portion: X_suspended ≈ √(L_suspended² - Y²) for catenary approximation
  // Plus the chain lying flat on seabed
  const suspendedLength = Math.min(chainLength, minCatenaryLength);
  const horizontalSuspended = suspendedLength > totalVertical
    ? Math.sqrt(suspendedLength ** 2 - totalVertical ** 2)
    : 0;
  const horizontalDistance = horizontalSuspended + chainOnSeabed;

  // SVG dimensions - compact to fit dialog
  const svgWidth = 280;
  const svgHeight = 85;
  const waterLevel = 22;
  const maxSeabedLevel = 80;
  const boatX = 50;
  const padding = 18; // Padding for anchor icon

  // Dynamic scaling: fit both depth and horizontal distance in the available space
  // Available vertical space for depth
  const availableVertical = maxSeabedLevel - waterLevel - padding;
  // Available horizontal space for chain spread (from boat to right edge)
  const availableHorizontal = svgWidth - boatX - padding;

  // Calculate scale factor to fit everything
  // Scale based on whichever dimension needs more scaling
  const verticalScale = depth > 0 ? availableVertical / depth : 1;
  const horizontalScale = horizontalDistance > 0 ? availableHorizontal / horizontalDistance : Infinity;
  const scale = Math.min(verticalScale, horizontalScale, availableVertical / 5); // Cap scale for very small values

  // Calculate icon scale factor - icons shrink when zoomed out
  // Base scale is 1.0 when scale matches the "normal" view (around 4 pixels per meter)
  const baseScale = 4; // Reference: 4 pixels per meter is "normal" zoom
  const iconScale = Math.min(1, Math.max(0.4, scale / baseScale)); // Clamp between 0.4 and 1.0

  // Apply scale
  const visualDepth = depth * scale;
  const visualHorizontalDistance = horizontalDistance * scale;

  // Calculate seabed position based on scaled depth
  const seabedLevel = waterLevel + visualDepth + 10;

  // Calculate anchor position
  const anchorX = boatX + visualHorizontalDistance;
  const anchorY = waterLevel + visualDepth;

  // Scope quality color - matches the 5-segment bar
  // Bar segments: 0-20% (red), 20-40% (orange), 40-60% (yellow), 60-80% (bright green), 80-100% (green)
  // Position formula: (scopeRatio - 1) / 7 * 100
  // So thresholds: 20% = 2.4:1, 40% = 3.8:1, 60% = 5.2:1, 80% = 6.6:1
  const getScopeColor = () => {
    if (scopeRatio < 2.4) return '#ef5350'; // Red
    if (scopeRatio < 3.8) return '#ffa726'; // Orange
    if (scopeRatio < 5.2) return '#ffee58'; // Yellow
    if (scopeRatio < 6.6) return '#9ccc65'; // Bright green
    return '#66bb6a'; // Green
  };

  // Calculate indicator position on scale (0-100%)
  const getIndicatorPosition = () => {
    // Scale: 0 at ratio 1, 100% at ratio 8+
    const normalized = Math.min(Math.max((scopeRatio - 1) / 7, 0), 1);
    return normalized * 100;
  };

  // Clamp seabed to max height
  const clampedSeabedLevel = Math.min(seabedLevel, maxSeabedLevel);
  void Math.min(anchorY, clampedSeabedLevel - 8); // Kept for potential future use

  return (
    <div style={{ marginBottom: '1rem' }}>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'hidden' }}>
        {/* Clip path to constrain all elements within SVG bounds */}
        <defs>
          <clipPath id="svgClip">
            <rect x={0} y={0} width={svgWidth} height={svgHeight} />
          </clipPath>
        </defs>

        <g clipPath="url(#svgClip)">
          {/* Water fill - subtle blue below water line, extends to cover wave troughs and up to seabed */}
          {(() => {
            const waveAmplitude = 3 * iconScale;
            const sandAmplitude = 2 * iconScale;
            return (
              <rect
                x={0}
                y={waterLevel - waveAmplitude} // Start above water to cover wave troughs
                width={svgWidth}
                height={clampedSeabedLevel + sandAmplitude - (waterLevel - waveAmplitude)} // Extend to cover sand peaks
                fill="rgba(79, 195, 247, 0.08)"
              />
            );
          })()}

          {/* Water surface with waves - camera-style scaling (sine wave) */}
          {/* When zoomed out (small iconScale): more waves, smaller amplitude */}
          {/* When zoomed in (large iconScale): fewer waves, larger amplitude */}
          {(() => {
            const waveHalfPeriod = 20 * iconScale; // Half-period (crest to trough)
            const waveAmplitude = 3 * iconScale; // Amplitude gets smaller when zoomed out
            const numHalfWaves = Math.ceil(svgWidth / waveHalfPeriod);
            let pathD = `M 0 ${waterLevel}`;
            for (let i = 0; i < numHalfWaves; i++) {
              const x1 = i * waveHalfPeriod + waveHalfPeriod / 2;
              const x2 = (i + 1) * waveHalfPeriod;
              // Alternate between up and down: even = up (crest), odd = down (trough)
              const yPeak = i % 2 === 0
                ? waterLevel - waveAmplitude  // Crest (above water level)
                : waterLevel + waveAmplitude; // Trough (below water level)
              pathD += ` Q ${x1} ${yPeak} ${x2} ${waterLevel}`;
            }
            return (
              <path
                d={pathD}
                fill="none"
                stroke="#4fc3f7"
                strokeWidth={Math.max(1, 2 * iconScale)}
                opacity="0.6"
              />
            );
          })()}

          {/* Seabed - sandy with gentle sine curve */}
          {(() => {
            const sandHalfPeriod = 30 * iconScale;
            const sandAmplitude = 2 * iconScale;
            const numSandWaves = Math.ceil(svgWidth / sandHalfPeriod);
            let sandPathD = `M 0 ${clampedSeabedLevel}`;
            for (let i = 0; i < numSandWaves; i++) {
              const x1 = i * sandHalfPeriod + sandHalfPeriod / 2;
              const x2 = (i + 1) * sandHalfPeriod;
              const yPeak = i % 2 === 0
                ? clampedSeabedLevel - sandAmplitude
                : clampedSeabedLevel + sandAmplitude;
              sandPathD += ` Q ${x1} ${yPeak} ${x2} ${clampedSeabedLevel}`;
            }
            sandPathD += ` L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;
            return (
              <>
                <path
                  d={sandPathD}
                  fill="#c4a574"
                  opacity="0.4"
                />
                <path
                  d={sandPathD.split(' L ')[0]}
                  fill="none"
                  stroke="#d4b896"
                  strokeWidth="2"
                />
              </>
            );
          })()}

        {/* Depth indicator line */}
        <line
          x1={boatX - 20}
          y1={waterLevel}
          x2={boatX - 20}
          y2={waterLevel + visualDepth}
          stroke={theme.colors.textDisabled}
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        <text x={boatX - 25} y={waterLevel + visualDepth / 2 + 3} fill={theme.colors.textMuted} fontSize="8" textAnchor="end">
          {depth.toFixed(1)}m
        </text>

        {/* Chain with catenary physics - lies flat on seabed, curves up to boat */}
        {(() => {
          // Chain endpoints
          const boatBowX = boatX + 12 * iconScale;
          const boatBowY = waterLevel;
          const seabedY = clampedSeabedLevel - 2; // Slightly above seabed line
          // Anchor is at (anchorX, seabedY), rotated -90deg
          // Ring at (0,-6) in local coords becomes (6, 0) after -90deg rotation (x' = -y, y' = x)
          // So ring position = anchor position + (6 * scale, 0) but we need to go LEFT toward boat
          // After rotation, the ring is to the LEFT of anchor center (negative X direction)
          const anchorRingX = anchorX - 6 * iconScale * 0.7;
          const anchorRingY = seabedY; // Ring is at seabed level

          // Use physics-based chain on seabed calculation (computed above)
          // chainOnSeabed is in meters, convert to visual units
          const visualChainOnSeabed = chainOnSeabed * scale;

          // Lift-off point: where chain leaves seabed and curves up to boat
          const liftOffX = anchorRingX - visualChainOnSeabed;
          void seabedY; // liftOffY kept for documentation - lift-off is at seabed level

          let chainPath: string;

          if (visualChainOnSeabed > 2 * iconScale && chainOnSeabed > 0.5) {
            // Chain has slack lying on seabed - draw flat portion then catenary curve
            // Anchor ring is already at seabed level, so chain starts flat

            // For the catenary curve, use a quadratic bezier that approximates the shape
            // Control point should create a smooth curve that's steeper near the boat
            const curveControlX = liftOffX + (boatBowX - liftOffX) * 0.35;
            const curveControlY = seabedY + 5 * iconScale; // Slight dip for smooth transition

            chainPath = `M ${anchorRingX} ${anchorRingY}` + // Start at anchor ring (at seabed)
              ` L ${liftOffX} ${seabedY}` + // Flat along seabed toward boat
              ` Q ${curveControlX} ${curveControlY} ${boatBowX} ${boatBowY}`; // Catenary curve up to boat
          } else {
            // No chain on seabed - chain is taut or nearly taut
            // Draw a catenary-like curve from anchor to boat
            // The curve should sag based on the catenary parameter
            const sagFactor = Math.min(1, catenaryParam / 10); // Normalize sag
            const sagAmount = visualDepth * 0.3 * sagFactor;
            const midX = (boatBowX + anchorRingX) / 2;
            const controlY = seabedY - sagAmount * 0.5; // Control point above seabed

            chainPath = `M ${anchorRingX} ${anchorRingY}` +
              ` Q ${midX} ${Math.min(controlY, boatBowY + visualDepth * 0.7)} ${boatBowX} ${boatBowY}`;
          }

          return (
            <path
              d={chainPath}
              fill="none"
              stroke="#aaa"
              strokeWidth={Math.max(1, 2 * iconScale)}
              strokeDasharray={`${4 * iconScale},${2 * iconScale}`}
            />
          );
        })()}

        {/* Boat silhouette - simple sailboat (facing right), sitting on water */}
        <g transform={`translate(${boatX}, ${waterLevel - 6 * iconScale}) scale(${iconScale})`}>
          {/* Hull - flat stern (left), pointy bow (right) */}
          <path
            d="M -10 4 L -10 8 L 10 8 L 12 4 Z"
            fill="#2c3e50"
            stroke="#fff"
            strokeWidth="1"
          />
          {/* Mast */}
          <line x1="0" y1="4" x2="0" y2="-16" stroke="#fff" strokeWidth="1.5" />
          {/* Mainsail */}
          <path
            d="M -1 -14 L -8 2 L -1 2 Z"
            fill="rgba(255,255,255,0.8)"
            stroke="#fff"
            strokeWidth="0.5"
          />
          {/* Foresail (jib) */}
          <path
            d="M 1 -14 L 10 2 L 1 2 Z"
            fill="rgba(255,255,255,0.7)"
            stroke="#fff"
            strokeWidth="0.5"
          />
        </g>

        {/* Anchor - rotated -90deg and partially buried in sand */}
        {/* Position anchor so its ring connects to where chain meets seabed */}
        {(() => {
          // Anchor ring offset after rotation: ring at (0,-6) rotated -90deg becomes (-6, 0) in local coords
          // But we need to position anchor so ring is at seabed level
          const anchorSeabedY = clampedSeabedLevel - 2; // Same as chain's seabedY
          // The ring center in anchor local coords (after rotation) is at x offset of +6 (ring was at y=-6)
          // So anchor center needs to be at anchorX, and ring will be 6*0.7*iconScale to the left
          const anchorCenterX = anchorX;
          const anchorCenterY = anchorSeabedY; // Place anchor at seabed level

          return (
            <g transform={`translate(${anchorCenterX}, ${anchorCenterY}) scale(${iconScale * 0.7}) rotate(-90)`}>
              <circle cx="0" cy="-6" r="3" fill="none" stroke="#fff" strokeWidth="1.5" />
              <line x1="0" y1="-3" x2="0" y2="8" stroke="#fff" strokeWidth="2" />
              <path d="M -6 6 L 0 8 L 6 6" fill="none" stroke="#fff" strokeWidth="2" />
              <line x1="-6" y1="6" x2="-6" y2="2" stroke="#fff" strokeWidth="1.5" />
              <line x1="6" y1="6" x2="6" y2="2" stroke="#fff" strokeWidth="1.5" />
            </g>
          );
        })()}

        {/* Chain length label */}
        <text x={svgWidth - 10} y={waterLevel + 15} fill={theme.colors.textSecondary} fontSize="9" textAnchor="end">
          {t('chart.chain_label', { length: chainLength.toFixed(0) })}
        </text>
        </g>
      </svg>

      {/* Scope bar - simplified, full width, hard color stops */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: '0.15rem',
      }}>
        <div style={{
          fontSize: '0.75rem',
          fontWeight: 'bold',
          color: getScopeColor(),
          whiteSpace: 'nowrap',
        }}>
          {scopeRatio.toFixed(1)}:1
        </div>
        <div style={{
          flex: 1,
          height: '5px',
          borderRadius: '2px',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Hard color segments: red | orange | yellow | bright green | green */}
          <div style={{ flex: 1, background: '#ef5350' }} /> {/* 0-20%: < 2.4:1 */}
          <div style={{ flex: 1, background: '#ffa726' }} /> {/* 20-40%: 2.4-3.8:1 */}
          <div style={{ flex: 1, background: '#ffee58' }} /> {/* 40-60%: 3.8-5.2:1 */}
          <div style={{ flex: 1, background: '#9ccc65' }} /> {/* 60-80%: 5.2-6.6:1 */}
          <div style={{ flex: 1, background: '#66bb6a' }} /> {/* 80-100%: > 6.6:1 */}
          {/* Indicator line */}
          <div style={{
            position: 'absolute',
            left: `${getIndicatorPosition()}%`,
            top: '-2px',
            bottom: '-2px',
            width: '2px',
            background: '#fff',
            borderRadius: '1px',
            transform: 'translateX(-50%)',
          }} />
        </div>
      </div>

      {/* Recommendations section */}
      {showRecommendations && depth > 0 && (() => {
        const recommendations = calculateRecommendedChainLength(
          depth,
          'moderate',
          vesselSettings?.displacement,
          vesselSettings?.length,
          vesselSettings?.chainDiameter,
          vesselSettings?.useCatenaryFormula ?? true,
          vesselSettings?.useWindLoaFormula ?? true,
          vesselSettings?.freeboardHeight,
          vesselSettings?.waterlineLength,
          vesselSettings?.chainType
        );
        void getRuleOfThumbRecommendation(depth, vesselSettings?.freeboardHeight); // Available for future display
        const totalChain = vesselSettings?.totalChainLength || 0;

        return (
          <div style={{
            marginTop: '0.5rem',
            padding: '0.4rem',
            background: theme.colors.bgCard,
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}>
            {/* Quick recommendations - clickable */}
            <div
              onClick={() => setShowCalcInfo(true)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.2rem',
                cursor: 'pointer',
              }}
            >
              <div style={{
                padding: '0.2rem',
                background: chainLength >= recommendations.min ? 'rgba(102, 187, 106, 0.2)' : 'rgba(239, 83, 80, 0.2)',
                borderRadius: '4px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{t('chart.minimum')}</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{recommendations.min}m</div>
              </div>
              <div style={{
                padding: '0.2rem',
                background: chainLength >= recommendations.recommended ? 'rgba(102, 187, 106, 0.2)' : 'rgba(255, 167, 38, 0.2)',
                borderRadius: '4px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{t('chart.recommended')}</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{recommendations.recommended}m</div>
              </div>
              <div style={{
                padding: '0.2rem',
                background: chainLength >= recommendations.storm ? 'rgba(102, 187, 106, 0.2)' : 'rgba(255, 238, 88, 0.2)',
                borderRadius: '4px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.65rem', opacity: 0.7 }}>{t('chart.storm')}</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{recommendations.storm}m</div>
              </div>
            </div>

            {/* Tap for info hint */}
            <div style={{
              fontSize: '0.65rem',
              opacity: 0.5,
              textAlign: 'center',
              marginTop: '0.2rem',
              cursor: 'pointer',
            }} onClick={() => setShowCalcInfo(true)}>
              {t('chart.tap_for_details')}
            </div>

            {/* Total chain warning */}
            {totalChain > 0 && chainLength > totalChain * 0.9 && (
              <div style={{
                marginTop: '0.3rem',
                padding: '0.3rem 0.4rem',
                background: 'rgba(239, 83, 80, 0.2)',
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: '#ef5350',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {t('chart.total_chain_warning', { percent: Math.round(chainLength / totalChain * 100).toString(), total: totalChain.toString() })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Chain Calculation Info Dialog */}
      {showCalcInfo && (
        <ChainCalculationInfoDialog
          depth={depth}
          vesselSettings={vesselSettings}
          onClose={() => setShowCalcInfo(false)}
          onToggleFormula={onUpdateVesselSettings ? handleToggleFormula : undefined}
        />
      )}
    </div>
  );
};

// Weather forecast data for anchor alarm
interface WeatherForecastInfo {
  maxWind: number; // Max wind speed in next 12-24h (knots)
  maxGusts: number; // Max gusts (knots)
  timestamp: string; // When max occurs
  waveHeight?: number; // Max wave height (meters)
}

// Hook to fetch weather forecast for anchor alarm
const useAnchorWeatherForecast = (lat: number, lon: number, enabled: boolean, hours: number = 24): {
  forecast: WeatherForecastInfo | null;
  loading: boolean;
  error: string | null;
} => {
  const [forecast, setForecast] = useState<WeatherForecastInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Round coordinates to 2 decimal places (~1km) to prevent refetching on every GPS update
  const stableLat = Math.round(lat * 100) / 100;
  const stableLon = Math.round(lon * 100) / 100;

  // Track previous hours to detect user-initiated changes vs GPS-triggered refetches
  const prevHoursRef = useRef(hours);
  const hasFetched = useRef(false);

  const fetchForecast = useCallback(async () => {
    if (!enabled || !stableLat || !stableLon) return;

    // Show loading skeleton on first fetch or when user changes forecast period
    // Skip loading for GPS coordinate updates (prevents flickering)
    const hoursChanged = prevHoursRef.current !== hours;
    if (!hasFetched.current || hoursChanged) setLoading(true);

    prevHoursRef.current = hours;
    setError(null);

    try {
      const response = await weatherAPI.getForecast(stableLat, stableLon, hours);
      const data: WeatherForecastResponse = response.data;

      if (data.hourly && data.hourly.length > 0) {
        // Find max wind and gusts over the specified period
        let maxWind = 0;
        let maxGusts = 0;
        let maxWaveHeight = 0;
        let maxTimestamp = '';

        const hoursToCheck = Math.min(hours, data.hourly.length);
        for (let i = 0; i < hoursToCheck; i++) {
          const hour = data.hourly[i];
          if (hour.wind.speed > maxWind) {
            maxWind = hour.wind.speed;
            maxTimestamp = hour.timestamp;
          }
          if (hour.wind.gusts > maxGusts) {
            maxGusts = hour.wind.gusts;
          }
          if (hour.waves && hour.waves.height > maxWaveHeight) {
            maxWaveHeight = hour.waves.height;
          }
        }

        setForecast({
          maxWind,
          maxGusts,
          timestamp: maxTimestamp,
          waveHeight: maxWaveHeight > 0 ? maxWaveHeight : undefined,
        });
      }
      hasFetched.current = true;
    } catch (err) {
      console.error('Failed to fetch weather forecast for anchor:', err);
      setError('Unable to load forecast');
    } finally {
      setLoading(false);
    }
  }, [stableLat, stableLon, enabled, hours]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  return { forecast, loading, error };
};

// Anchor Alarm Dialog
interface AnchorAlarmDialogProps {
  anchorPosition: { lat: number; lon: number } | null;
  onSetAnchorPosition: () => void;
  onActivate: (chainLength: number, depth: number, swingRadius: number) => void;
  onClose: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  chainLength: number;
  onChainLengthChange: (value: number) => void;
  anchorDepth: number;
  onAnchorDepthChange: (value: number) => void;
  vesselSettings?: VesselSettings;
  onUpdateVesselSettings?: (settings: VesselSettings) => void;
  // Auto-calculation props
  boatPosition: { lat: number; lon: number };
  boatHeading: number;
  onAnchorPositionChange: (position: { lat: number; lon: number }) => void;
  // Weather integration
  weatherEnabled?: boolean;
}

// Calculate the horizontal distance from anchor to boat based on chain length and depth
// Uses Pythagorean theorem: horizontalDist = sqrt(chainLength² - depth²)
const calculateHorizontalDistance = (chainLength: number, depth: number): number => {
  if (chainLength <= depth || chainLength <= 0 || depth <= 0) return 0;
  return Math.sqrt(chainLength ** 2 - depth ** 2);
};

// Calculate anchor position given boat position, heading, and distance
// Boat heading is where the bow points - anchor is deployed from the bow, so it's in front of the boat
// Note: boatHeading is in radians; lat/lon are in decimal degrees
const calculateAnchorPosition = (
  boatLat: number,
  boatLon: number,
  boatHeading: number,
  distanceMeters: number
): { lat: number; lon: number } => {
  // Anchor is in the direction of heading (in front of the boat at the bow)
  // boatHeading is already in radians
  const bearingRad = boatHeading;

  // Earth radius in meters
  const earthRadius = 6371000;

  // Convert boat position to radians (lat/lon are still in degrees)
  const lat1 = (boatLat * Math.PI) / 180;
  const lon1 = (boatLon * Math.PI) / 180;

  // Calculate new position using great circle formula
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / earthRadius) +
    Math.cos(lat1) * Math.sin(distanceMeters / earthRadius) * Math.cos(bearingRad)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceMeters / earthRadius) * Math.cos(lat1),
    Math.cos(distanceMeters / earthRadius) - Math.sin(lat1) * Math.sin(lat2)
  );

  // Convert back to degrees (geographic coordinates)
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
};

// Calculate swing radius with safety margin
// Swing radius = horizontal distance + boat length + 15% safety margin
const calculateSwingRadius = (
  chainLength: number,
  depth: number,
  boatLength: number = 10
): number => {
  const horizontalDistance = calculateHorizontalDistance(chainLength, depth);
  if (horizontalDistance === 0) return 0;

  // Add boat length (anchor is at bow, boat swings around)
  // Plus 15% safety margin so alarm doesn't trigger accidentally
  return (horizontalDistance + boatLength) * 1.15;
};

export const AnchorAlarmDialog: React.FC<AnchorAlarmDialogProps> = ({
  anchorPosition,
  onSetAnchorPosition,
  onActivate,
  onClose,
  onDelete,
  isEditing = false,
  chainLength,
  onChainLengthChange,
  anchorDepth,
  onAnchorDepthChange,
  vesselSettings,
  onUpdateVesselSettings,
  boatPosition,
  boatHeading,
  onAnchorPositionChange,
  weatherEnabled = true,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const setChainLength = onChainLengthChange;
  const depth = anchorDepth;
  const setDepth = onAnchorDepthChange;

  // Get wind unit settings
  const { windUnit, convertWind } = useSettings();

  // Forecast period state (in hours) - default 24h
  const [forecastHours, setForecastHours] = React.useState(24);
  // State for showing chain calculation details dialog
  const [showCalcInfo, setShowCalcInfo] = React.useState(false);

  // Fetch weather forecast for the anchor location
  const { forecast: weatherForecast, loading: weatherLoading } = useAnchorWeatherForecast(
    boatPosition?.lat || 0,
    boatPosition?.lon || 0,
    weatherEnabled,
    forecastHours
  );

  // Calculate swing radius for activation
  const swingRadius = calculateSwingRadius(chainLength, depth, vesselSettings?.length);

  // Auto-calculate anchor position when chain length or depth changes (only when creating new alarm, not editing)
  React.useEffect(() => {
    if (isEditing) return; // Don't auto-update position when editing - anchor position is fixed once set
    if (!boatPosition) return; // Guard against undefined boatPosition
    if (chainLength <= 0 || depth <= 0 || chainLength <= depth) return;

    const distance = calculateHorizontalDistance(chainLength, depth);
    if (distance > 0) {
      const newAnchorPos = calculateAnchorPosition(
        boatPosition.lat,
        boatPosition.lon,
        boatHeading,
        distance
      );
      onAnchorPositionChange(newAnchorPos);
    }
  }, [chainLength, depth, boatPosition?.lat, boatPosition?.lon, boatHeading, isEditing, onAnchorPositionChange]);

  // Local state for text inputs to allow empty values while typing
  const [chainInputValue, setChainInputValue] = React.useState(chainLength.toString());
  const [depthInputValue, setDepthInputValue] = React.useState(depth.toString());

  // Sync local state with props when they change externally
  React.useEffect(() => {
    setChainInputValue(chainLength.toString());
  }, [chainLength]);

  React.useEffect(() => {
    // Format depth to 1 decimal place
    setDepthInputValue(depth.toFixed(1));
  }, [depth]);

  // Validation helper
  const isValidNumber = (val: string) => {
    if (val === '' || val === '-') return true;
    const num = parseFloat(val);
    return !isNaN(num) && isFinite(num);
  };

  const chainHasError = chainInputValue !== '' && !isValidNumber(chainInputValue);
  const depthHasError = depthInputValue !== '' && !isValidNumber(depthInputValue);

  const handleChainInputChange = (value: string) => {
    setChainInputValue(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      setChainLength(parsed);
    }
  };

  const handleDepthInputChange = (value: string) => {
    setDepthInputValue(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      // Round to 1 decimal place
      const rounded = Math.round(parsed * 10) / 10;
      setDepth(rounded);
    }
  };

  const canActivate = chainLength > 0 && depth > 0 && chainLength >= depth && !chainHasError && !depthHasError;

  return (
    <DialogOverlay onClick={onClose}>
      <CloseButton onClick={onClose} />
      <div
        style={{
          fontSize: '1.1rem',
          fontWeight: 'bold',
          marginBottom: '0.75rem',
          textAlign: 'center',
        }}
      >
        {t('anchor.anchor_alarm')}
      </div>

      {/* Chain Length Input */}
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.3rem' }}>
          {t('anchor.chain_out')}
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem' }}>
          <button
            onClick={() => setChainLength(Math.max(0, Math.ceil(chainLength) - 1))}
            className="touch-btn"
            style={{
              width: '52px',
              padding: '0.6rem 0',
              borderRadius: '6px',
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.borderHover}`,
              color: theme.colors.textPrimary,
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            -
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={chainInputValue}
            onChange={(e) => handleChainInputChange(e.target.value)}
            onBlur={() => {
              // On blur, sync the display with actual value if empty or invalid
              if (chainInputValue === '' || !isValidNumber(chainInputValue)) {
                setChainInputValue(chainLength.toString());
              }
            }}
            style={{
              flex: 1,
              padding: '0.6rem',
              background: theme.colors.bgCardActive,
              border: chainHasError ? '1px solid #ef5350' : `1px solid ${theme.colors.borderHover}`,
              borderRadius: '6px',
              color: chainHasError ? '#ef5350' : theme.colors.textPrimary,
              fontSize: '1rem',
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <button
            onClick={() => setChainLength(Math.floor(chainLength) + 1)}
            className="touch-btn"
            style={{
              width: '52px',
              padding: '0.6rem 0',
              borderRadius: '6px',
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.borderHover}`,
              color: theme.colors.textPrimary,
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
        {chainHasError && (
          <div style={{ fontSize: '0.75rem', color: '#ef5350', marginTop: '0.2rem' }}>
            {t('validation.invalid_number')}
          </div>
        )}
      </div>

      {/* Depth Input */}
      <div style={{ marginBottom: '0.6rem' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.3rem' }}>
          {t('anchor.depth_meters')}
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem' }}>
          <button
            onClick={() => setDepth(Math.max(0, Math.round((depth - 0.5) * 10) / 10))}
            className="touch-btn"
            style={{
              width: '52px',
              padding: '0.6rem 0',
              borderRadius: '6px',
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.borderHover}`,
              color: theme.colors.textPrimary,
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            -
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={depthInputValue}
            onChange={(e) => handleDepthInputChange(e.target.value)}
            onBlur={() => {
              // On blur, sync the display with actual value formatted to 1 decimal
              if (depthInputValue === '' || !isValidNumber(depthInputValue)) {
                setDepthInputValue(depth.toFixed(1));
              } else {
                // Format to 1 decimal place
                const parsed = parseFloat(depthInputValue);
                if (!isNaN(parsed)) {
                  setDepthInputValue(parsed.toFixed(1));
                }
              }
            }}
            style={{
              flex: 1,
              padding: '0.6rem',
              background: theme.colors.bgCardActive,
              border: depthHasError ? '1px solid #ef5350' : `1px solid ${theme.colors.borderHover}`,
              borderRadius: '6px',
              color: depthHasError ? '#ef5350' : theme.colors.textPrimary,
              fontSize: '1rem',
              textAlign: 'center',
              outline: 'none',
            }}
          />
          <button
            onClick={() => setDepth(Math.round((depth + 0.5) * 10) / 10)}
            className="touch-btn"
            style={{
              width: '52px',
              padding: '0.6rem 0',
              borderRadius: '6px',
              background: theme.colors.bgCardActive,
              border: `1px solid ${theme.colors.borderHover}`,
              color: theme.colors.textPrimary,
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
        {depthHasError && (
          <div style={{ fontSize: '0.75rem', color: '#ef5350', marginTop: '0.2rem' }}>
            {t('validation.invalid_number')}
          </div>
        )}
      </div>

      {/* Adjust Anchor Position Button */}
      <button
        onClick={onSetAnchorPosition}
        className="touch-btn"
        style={{
          width: '100%',
          marginBottom: '0.5rem',
          padding: '0.75rem',
          background: theme.colors.bgCard,
          border: `1px solid ${theme.colors.borderDashed}`,
          borderRadius: '6px',
          color: anchorPosition ? '#4fc3f7' : theme.colors.textSecondary,
          fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        {t('anchor.adjust_position')}
      </button>

      {/* Scope Visualization */}
      <ScopeVisualization
        chainLength={chainLength}
        depth={depth}
        vesselSettings={vesselSettings}
        showRecommendations={false}
        onUpdateVesselSettings={onUpdateVesselSettings}
      />

      {/* Combined Weather Forecast + Chain Recommendations */}
      {weatherEnabled && (
        <div style={{ marginBottom: '0.5rem' }}>
          {/* Planned Stay Duration Selector */}
          <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '0.3rem' }}>
            {t('anchor.planned_stay')}
          </div>
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            marginBottom: '0.4rem',
          }}>
            {[
              { hours: 12, label: '12h' },
              { hours: 24, label: '24h' },
              { hours: 48, label: '2d' },
              { hours: 72, label: '3d' },
            ].map(({ hours, label }) => (
              <button
                key={hours}
                onClick={() => setForecastHours(hours)}
                className="touch-btn"
                style={{
                  flex: 1,
                  padding: '0.7rem 0.4rem',
                  background: forecastHours === hours ? 'rgba(79, 195, 247, 0.3)' : theme.colors.bgCard,
                  border: forecastHours === hours ? '1px solid #4fc3f7' : `1px solid ${theme.colors.border}`,
                  borderRadius: '6px',
                  color: forecastHours === hours ? '#4fc3f7' : theme.colors.textSecondary,
                  fontSize: '0.9rem',
                  fontWeight: forecastHours === hours ? 'bold' : 'normal',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Weather Data */}
          {weatherLoading ? (
            <>
              {/* Skeleton for boxes */}
              <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.25rem' }}>
                <div style={{
                  flex: 1,
                  padding: '0.3rem',
                  background: theme.colors.bgCard,
                  borderRadius: '4px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>{t('anchor.min_chain')}</div>
                  <div style={{
                    width: '2.5rem',
                    height: '1.1rem',
                    background: theme.colors.bgCardHover,
                    borderRadius: '2px',
                    margin: '0.15rem auto',
                  }} />
                </div>
                <div style={{
                  flex: 1,
                  padding: '0.3rem',
                  background: theme.colors.bgCard,
                  borderRadius: '4px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>{t('anchor.recommended_chain')}</div>
                  <div style={{
                    width: '2.5rem',
                    height: '1.1rem',
                    background: theme.colors.bgCardHover,
                    borderRadius: '2px',
                    margin: '0.15rem auto',
                  }} />
                </div>
              </div>
              {/* Skeleton for wind/gust row */}
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.15rem' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>{t('anchor.max_wind')}</div>
                  <div style={{
                    width: '2rem',
                    height: '0.7rem',
                    background: theme.colors.bgCardHover,
                    borderRadius: '2px',
                  }} />
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.15rem' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.4 }}>{t('anchor.max_gust')}</div>
                  <div style={{
                    width: '2rem',
                    height: '0.7rem',
                    background: theme.colors.bgCardHover,
                    borderRadius: '2px',
                  }} />
                </div>
              </div>
            </>
          ) : weatherForecast ? (
            (() => {
              // Calculate chain for forecast wind
              const calcChainForWind = (windKnots: number) => {
                if (depth <= 0) return 0;
                const effectiveBoatLength = vesselSettings?.length || 10;
                const effectiveDisplacement = vesselSettings?.displacement || 5;
                const effectiveFreeboardHeight = vesselSettings?.freeboardHeight || 1.0;
                const effectiveWaterlineLength = vesselSettings?.waterlineLength || (effectiveBoatLength * 0.9);
                const chainDiameterMm = vesselSettings?.chainDiameter || 8;
                const chainType = vesselSettings?.chainType || 'galvanized';
                const useCatenary = vesselSettings?.useCatenaryFormula ?? true;
                const useWindLoa = vesselSettings?.useWindLoaFormula ?? true;

                const displacementFactor = 1 + (effectiveDisplacement - 5) * 0.05;
                const windageArea = effectiveFreeboardHeight * effectiveWaterlineLength * 0.8 * Math.min(displacementFactor, 1.5);
                const chainWeightFactor = chainType === 'stainless-steel' ? 0.022 : 0.020;
                const chainWeightPerMeter = chainWeightFactor * chainDiameterMm * chainDiameterMm;

                const totalVertical = depth + effectiveFreeboardHeight;
                const g = 9.81;

                let catChain = 0;
                if (useCatenary && chainWeightPerMeter > 0) {
                  const windMs = windKnots * 0.514;
                  const windForce = 0.5 * 1.23 * windMs * windMs * windageArea * 1.0;
                  const catenaryParam = windForce / (chainWeightPerMeter * g);
                  catChain = Math.sqrt(totalVertical * (totalVertical + 2 * catenaryParam)) + effectiveBoatLength * 0.5;
                }

                let ymChain = 0;
                if (useWindLoa) {
                  let depthFactor = 1.0;
                  if (depth >= 15) depthFactor = 2.0;
                  else if (depth >= 8) depthFactor = 1.5;
                  ymChain = windKnots * depthFactor + effectiveBoatLength;
                }

                const result = useCatenary && useWindLoa ? Math.max(catChain, ymChain) :
                               useCatenary ? catChain : useWindLoa ? ymChain : totalVertical * 5;
                return Math.max(15, Math.ceil(result));
              };

              const minChain = calcChainForWind(weatherForecast.maxWind);
              const recommendedChain = calcChainForWind(weatherForecast.maxGusts);

              return (
                <>
                  {/* Chain recommendation boxes */}
                  <div
                    onClick={() => setShowCalcInfo(true)}
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: '0.3rem',
                      cursor: 'pointer',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {/* Minimum Chain */}
                    <div style={{
                      flex: 1,
                      padding: '0.3rem',
                      background: chainLength >= minChain ? 'rgba(102, 187, 106, 0.15)' : 'rgba(239, 83, 80, 0.15)',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{t('anchor.min_chain')}</div>
                      {depth > 0 ? (
                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{minChain}m</div>
                      ) : (
                        <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{t('anchor.set_depth')}</div>
                      )}
                    </div>

                    {/* Recommended Chain */}
                    <div style={{
                      flex: 1,
                      padding: '0.3rem',
                      background: chainLength >= recommendedChain ? 'rgba(102, 187, 106, 0.15)' : 'rgba(255, 167, 38, 0.15)',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{t('anchor.recommended_chain')}</div>
                      {depth > 0 ? (
                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{recommendedChain}m</div>
                      ) : (
                        <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{t('anchor.set_depth')}</div>
                      )}
                    </div>
                  </div>

                  {/* Wind/Gust values below boxes */}
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.15rem' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{t('anchor.max_wind')}</div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                        {Math.round(convertWind(weatherForecast.maxWind))}{windUnit}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.15rem' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{t('anchor.max_gust')}</div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                        {Math.round(convertWind(weatherForecast.maxGusts))}{windUnit}
                      </div>
                    </div>
                  </div>

                </>
              );
            })()
          ) : (
            <div style={{ fontSize: '0.8rem', opacity: 0.5, textAlign: 'center' }}>{t('chart.forecast_unavailable')}</div>
          )}
        </div>
      )}

      {/* Chain Calculation Info Dialog */}
      {showCalcInfo && (
        <ChainCalculationInfoDialog
          depth={depth}
          vesselSettings={vesselSettings}
          onClose={() => setShowCalcInfo(false)}
          onToggleFormula={onUpdateVesselSettings ? (formula, enabled) => {
            if (vesselSettings) {
              const updatedSettings = { ...vesselSettings };
              if (formula === 'catenary') {
                updatedSettings.useCatenaryFormula = enabled;
              } else {
                updatedSettings.useWindLoaFormula = enabled;
              }
              onUpdateVesselSettings(updatedSettings);
            }
          } : undefined}
          forecastMaxWind={weatherForecast ? convertWind(weatherForecast.maxWind) : undefined}
          forecastMaxGust={weatherForecast ? convertWind(weatherForecast.maxGusts) : undefined}
          windUnit={windUnit}
        />
      )}

      {/* Warning if chain < depth */}
      {chainLength < depth && chainLength > 0 && (
        <div style={{
          marginBottom: '0.5rem',
          padding: '0.35rem',
          background: 'rgba(239, 83, 80, 0.2)',
          border: '1px solid rgba(239, 83, 80, 0.4)',
          borderRadius: '6px',
          fontSize: '0.8rem',
          color: '#ef5350',
        }}>
          {t('anchor.chain_gt_depth')}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button
          onClick={isEditing && onDelete ? onDelete : onClose}
          className="touch-btn"
          style={{
            flex: 1,
            padding: '0.9rem',
            background: isEditing ? 'rgba(239, 83, 80, 0.3)' : theme.colors.bgCardActive,
            border: isEditing ? '1px solid rgba(239, 83, 80, 0.5)' : `1px solid ${theme.colors.borderHover}`,
            borderRadius: '6px',
            color: isEditing ? '#ef5350' : theme.colors.textPrimary,
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          {isEditing ? t('common.delete') : t('common.cancel')}
        </button>
        <button
          onClick={() => canActivate && onActivate(chainLength, depth, swingRadius)}
          disabled={!canActivate}
          className="touch-btn"
          style={{
            flex: 1,
            padding: '0.9rem',
            background: canActivate
              ? 'rgba(79, 195, 247, 0.5)'
              : theme.colors.bgCard,
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: canActivate ? 'pointer' : 'not-allowed',
            fontSize: '1rem',
            fontWeight: 'bold',
            opacity: canActivate ? 1 : 0.5,
          }}
        >
          {isEditing ? t('common.save') : t('anchor.activate')}
        </button>
      </div>
    </DialogOverlay>
  );
};
