import L from 'leaflet';
import { radToDeg } from '../../../utils/angle';

// Custom marker interface
export interface CustomMarker {
  id: string;
  lat: number;
  lon: number;
  name: string;
  color: string;
  icon: string;
}

// Google Material Icons SVG paths (all solid/filled versions)
export const markerIcons: { [key: string]: string } = {
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  anchor:
    'M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z',
  buoy: 'M12 22c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7zm-1-14V5h2v3h-2zm1-5c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  favorite:
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  sailboat:
    'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
};

// Marker color palette - muted, natural tones
export const markerColors = [
  '#c0392b', // dark red
  '#27ae60', // forest green
  '#2980b9', // ocean blue
  '#d35400', // burnt orange
  '#8e44ad', // plum purple
  '#16a085', // teal
  '#f39c12', // amber/gold
  '#7f8c8d', // slate gray
];

/**
 * Create a custom boat icon that rotates with heading.
 * Uses CSS transform for rotation to avoid recreating the DOM element on every heading change.
 */
export const createBoatIcon = (heading: number): L.DivIcon => {
  const svgIcon = `
    <div class="boat-icon-inner" style="transform: rotate(${radToDeg(heading)}deg); width: 50px; height: 50px;">
      <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(25, 25)">
          <!-- Boat arrow with V-shaped back -->
          <path d="M 0,-18 L 8,10 L 0,4 L -8,10 Z" fill="#000" stroke="#fff" stroke-width="2"/>
        </g>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'boat-icon',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
};

/**
 * Create a custom marker icon with styling and label
 */
export const createCustomMarkerIcon = (
  color: string,
  name: string,
  icon: string = 'pin'
): L.DivIcon => {
  const iconPath = markerIcons[icon] || markerIcons.pin;
  const markerHtml = `
    <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
      <div style="
        background: rgba(10, 25, 41, 0.95);
        border: 1px solid ${color};
        border-radius: 4px;
        padding: 4px 8px;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        margin-bottom: 4px;
      ">${name}</div>
      <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
        <path d="${iconPath}" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      </svg>
    </div>
  `;

  // Label height: 12px font + 8px padding + 2px border + 4px margin = ~26px
  // Icon anchor at lower third of 32px icon = ~21px into icon
  // Total: 26 + 21 = 47px from top
  return L.divIcon({
    html: markerHtml,
    className: '',
    iconSize: [32, 58],
    iconAnchor: [16, 53],
    popupAnchor: [0, -58],
  });
};

/**
 * Create a waypoint marker icon for route display
 */
export const createWaypointIcon = (): L.DivIcon => {
  return L.divIcon({
    html: `<div style="
      width: 8px;
      height: 8px;
      background: #4fc3f7;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    "></div>`,
    className: 'waypoint-marker',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

/**
 * Create an anchor icon for anchor alarm display
 */
export const createAnchorIcon = (isDragging: boolean = false): L.DivIcon => {
  const color = isDragging ? '#ffa726' : '#4fc3f7';
  const svgIcon = `
    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <path d="M17 15l1.55 1.55c-.96 1.69-3.33 3.04-5.55 3.37V11h3V9h-3V7.82C14.16 7.4 15 6.3 15 5c0-1.65-1.35-3-3-3S9 3.35 9 5c0 1.3.84 2.4 2 2.82V9H8v2h3v8.92c-2.22-.33-4.59-1.68-5.55-3.37L7 15l-4-3v3c0 3.88 4.92 7 9 7s9-3.12 9-7v-3l-4 3zM12 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z" fill="${color}" stroke="#fff" stroke-width="1"/>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'anchor-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

/**
 * Create a crosshair (X) icon for anchor placement mode
 */
export const createCrosshairIcon = (): L.DivIcon => {
  const svgIcon = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <!-- Diagonal line 1 - white outline -->
      <line x1="4" y1="4" x2="20" y2="20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <!-- Diagonal line 2 - white outline -->
      <line x1="20" y1="4" x2="4" y2="20" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <!-- Diagonal line 1 - black -->
      <line x1="4" y1="4" x2="20" y2="20" stroke="#000" stroke-width="2" stroke-linecap="round"/>
      <!-- Diagonal line 2 - black -->
      <line x1="20" y1="4" x2="4" y2="20" stroke="#000" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'crosshair-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

/**
 * Create a finish flag icon for navigation destination
 */
export const createFinishFlagIcon = (): L.DivIcon => {
  // Checkered flag pattern - black and white squares
  const svgIcon = `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
      <!-- Flag pole -->
      <rect x="4" y="4" width="3" height="34" fill="#333" stroke="#fff" stroke-width="1"/>
      <!-- Flag background -->
      <rect x="7" y="4" width="22" height="16" fill="#fff" stroke="#333" stroke-width="1"/>
      <!-- Checkered pattern -->
      <rect x="7" y="4" width="5.5" height="4" fill="#000"/>
      <rect x="18" y="4" width="5.5" height="4" fill="#000"/>
      <rect x="12.5" y="8" width="5.5" height="4" fill="#000"/>
      <rect x="23.5" y="8" width="5.5" height="4" fill="#000"/>
      <rect x="7" y="12" width="5.5" height="4" fill="#000"/>
      <rect x="18" y="12" width="5.5" height="4" fill="#000"/>
      <rect x="12.5" y="16" width="5.5" height="4" fill="#000"/>
      <rect x="23.5" y="16" width="5.5" height="4" fill="#000"/>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'finish-flag-icon',
    iconSize: [32, 40],
    iconAnchor: [5, 38], // Anchor at bottom of pole
  });
};
