/**
 * Shared weather utility functions
 */

import { radToDeg } from './angle';

/**
 * Interpolate between two RGB colors
 */
function interpolateColor(color1: number[], color2: number[], factor: number): number[] {
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * factor),
    Math.round(color1[1] + (color2[1] - color1[1]) * factor),
    Math.round(color1[2] + (color2[2] - color1[2]) * factor),
  ];
}

/**
 * Get color based on wind speed in knots with distinct color bands
 */
export function getWindColor(speedKt: number): string {
  // Color stops: [speed, [r, g, b]]
  // More distinct, vibrant colors for each Beaufort-like category
  const colorStops: Array<[number, number[]]> = [
    [0, [135, 206, 250]],   // Sky blue (calm)
    [10, [50, 205, 50]],    // Lime green (moderate)
    [20, [255, 215, 0]],    // Gold (fresh)
    [30, [255, 140, 0]],    // Dark orange (strong)
    [40, [220, 20, 60]],    // Crimson (gale)
    [50, [200, 40, 40]],      // Dark red (storm)
  ];

  // Clamp speed to valid range
  const clampedSpeed = Math.max(0, Math.min(speedKt, colorStops[colorStops.length - 1][0]));

  // Find the two color stops to interpolate between
  for (let i = 0; i < colorStops.length - 1; i++) {
    const [speed1, color1] = colorStops[i];
    const [speed2, color2] = colorStops[i + 1];

    if (clampedSpeed >= speed1 && clampedSpeed <= speed2) {
      // Calculate interpolation factor (0 to 1)
      const factor = (clampedSpeed - speed1) / (speed2 - speed1);
      const rgb = interpolateColor(color1, color2, factor);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }

  // Fallback (shouldn't happen due to clamping)
  const lastColor = colorStops[colorStops.length - 1][1];
  return `rgb(${lastColor[0]}, ${lastColor[1]}, ${lastColor[2]})`;
}

/**
 * Get color based on wave height in meters
 */
export function getWaveColor(heightM: number): string {
  // Color stops: [height in meters, [r, g, b]]
  // Based on typical wave height categories
  const colorStops: Array<[number, number[]]> = [
    [0, [135, 206, 250]],   // Sky blue (calm, < 0.5m)
    [0.5, [50, 205, 50]],   // Lime green (slight, 0.5-1m)
    [1, [255, 215, 0]],     // Gold (moderate, 1-2m)
    [2, [255, 140, 0]],     // Dark orange (rough, 2-3m)
    [3, [220, 20, 60]],     // Crimson (very rough, 3-4m)
    [4, [200, 40, 40]],       // Dark red (high, 4m+)
  ];

  // Clamp height to valid range
  const clampedHeight = Math.max(0, Math.min(heightM, colorStops[colorStops.length - 1][0]));

  // Find the two color stops to interpolate between
  for (let i = 0; i < colorStops.length - 1; i++) {
    const [height1, color1] = colorStops[i];
    const [height2, color2] = colorStops[i + 1];

    if (clampedHeight >= height1 && clampedHeight <= height2) {
      const factor = (clampedHeight - height1) / (height2 - height1);
      const rgb = interpolateColor(color1, color2, factor);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }

  const lastColor = colorStops[colorStops.length - 1][1];
  return `rgb(${lastColor[0]}, ${lastColor[1]}, ${lastColor[2]})`;
}

/**
 * Get color based on water temperature in Celsius
 */
export function getWaterTempColor(tempC: number): string {
  // Color stops: [temperature in Celsius, [r, g, b]]
  // Blue for cold, cyan/green for cool, yellow for warm, orange/red for hot
  // Using brighter colors for better readability on map
  const colorStops: Array<[number, number[]]> = [
    [0, [100, 149, 237]],   // Cornflower blue (freezing) - brighter for readability
    [10, [65, 165, 255]],   // Bright blue (cold)
    [15, [0, 210, 255]],    // Cyan (cool)
    [20, [50, 205, 50]],    // Lime green (mild)
    [25, [255, 215, 0]],    // Gold (warm)
    [30, [255, 140, 0]],    // Dark orange (hot)
    [35, [220, 20, 60]],    // Crimson (very hot)
  ];

  // Clamp temperature to valid range
  const clampedTemp = Math.max(0, Math.min(tempC, colorStops[colorStops.length - 1][0]));

  // Find the two color stops to interpolate between
  for (let i = 0; i < colorStops.length - 1; i++) {
    const [temp1, color1] = colorStops[i];
    const [temp2, color2] = colorStops[i + 1];

    if (clampedTemp >= temp1 && clampedTemp <= temp2) {
      const factor = (clampedTemp - temp1) / (temp2 - temp1);
      const rgb = interpolateColor(color1, color2, factor);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }

  const lastColor = colorStops[colorStops.length - 1][1];
  return `rgb(${lastColor[0]}, ${lastColor[1]}, ${lastColor[2]})`;
}

/**
 * Get color based on ocean current velocity in m/s
 */
export function getCurrentColor(velocityMs: number): string {
  // Color stops: [velocity in m/s, [r, g, b]]
  // Ocean currents typically range from 0 to ~2+ m/s
  // Using purple/magenta tones to distinguish from wind/waves
  const colorStops: Array<[number, number[]]> = [
    [0, [173, 216, 230]],     // Light blue (negligible, < 0.1 m/s)
    [0.25, [138, 43, 226]],   // Blue violet (weak, 0.25 m/s ~ 0.5 kt)
    [0.5, [148, 0, 211]],     // Dark violet (moderate, 0.5 m/s ~ 1 kt)
    [1.0, [255, 20, 147]],    // Deep pink (strong, 1 m/s ~ 2 kt)
    [1.5, [255, 69, 0]],      // Red orange (very strong, 1.5 m/s ~ 3 kt)
    [2.0, [200, 40, 40]],       // Dark red (extreme, 2+ m/s ~ 4 kt)
  ];

  // Clamp velocity to valid range
  const clampedVelocity = Math.max(0, Math.min(velocityMs, colorStops[colorStops.length - 1][0]));

  // Find the two color stops to interpolate between
  for (let i = 0; i < colorStops.length - 1; i++) {
    const [vel1, color1] = colorStops[i];
    const [vel2, color2] = colorStops[i + 1];

    if (clampedVelocity >= vel1 && clampedVelocity <= vel2) {
      const factor = (clampedVelocity - vel1) / (vel2 - vel1);
      const rgb = interpolateColor(color1, color2, factor);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }

  const lastColor = colorStops[colorStops.length - 1][1];
  return `rgb(${lastColor[0]}, ${lastColor[1]}, ${lastColor[2]})`;
}

/**
 * Format wind direction as compass point.
 * Expects direction in radians (internal standard).
 */
export function formatWindDirection(radians: number): string {
  const degrees = ((radToDeg(radians) % 360) + 360) % 360;
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}
