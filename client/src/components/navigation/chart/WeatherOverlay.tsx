import React, { useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { weatherAPI, navigationAPI } from '../../../services/api';
import { WeatherGridPoint } from '../../../types';
import { getWindColor, getWaveColor, getWaterTempColor, getCurrentColor } from '../../../utils/weather.utils';
import { TWO_PI } from '../../../utils/angle';
import { useSettings } from '../../../context/SettingsContext';

// Debounce delay for fetch requests (ms)
const FETCH_DEBOUNCE_MS = 500;

interface WaterGridPoint {
  lat: number;
  lon: number;
  type: 'ocean' | 'lake' | 'land';
}

export type WeatherDisplayMode = 'wind' | 'waves' | 'swell' | 'current' | 'water-temp';

interface WeatherOverlayProps {
  enabled: boolean;
  forecastHour: number;
  displayMode: WeatherDisplayMode;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (error: string | null) => void;
}

interface WindData {
  speed: number;
  direction: number;
  gusts: number;
}

interface WaveData {
  height: number;
  direction: number;
  period: number;
}

interface CurrentData {
  velocity: number;
  direction: number;
}

interface DataPoint {
  lat: number;
  lon: number;
  wind?: WindData;
  waves?: WaveData;
  swell?: WaveData;
  current?: CurrentData;
  seaTemperature?: number;
}

/**
 * Get contrasting outline color based on fill color brightness.
 * Returns white for dark colors, dark grey for bright colors.
 */
function getContrastOutline(rgbColor: string): string {
  // Parse rgb(r, g, b) string
  const match = rgbColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return 'rgba(30, 30, 30, 0.85)'; // fallback to dark

  // Use black outline for all colors (matching arrow outlines)
  return '#000';
}

/**
 * Interpolate wind using Inverse Distance Weighting (IDW)
 * Creates smooth transitions between real data points
 */
function interpolateWind(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[]
): WindData | null {
  const pointsWithWind = dataPoints.filter(p => p.wind);
  if (pointsWithWind.length === 0) return null;
  if (pointsWithWind.length === 1) return pointsWithWind[0].wind!;

  // Find nearest neighbors and calculate weights
  const MAX_NEIGHBORS = 4;
  const neighbors: Array<{ point: DataPoint; dist: number }> = [];

  for (const point of pointsWithWind) {
    const dLat = targetLat - point.lat;
    const dLon = targetLon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    // If very close to a data point, just return it
    if (dist < 0.001) return point.wind!;

    neighbors.push({ point, dist });
  }

  // Sort by distance and take closest neighbors
  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  // IDW interpolation using vector components for proper direction blending
  let totalWeight = 0;
  let weightedU = 0;
  let weightedV = 0;
  let weightedSpeed = 0;
  let weightedGusts = 0;

  for (const { point, dist } of nearby) {
    const weight = 1 / (dist * dist); // IDW with power=2
    totalWeight += weight;

    // Convert wind to U/V components for proper direction averaging
    // Direction is already in radians
    weightedU += Math.sin(point.wind!.direction) * weight;
    weightedV += Math.cos(point.wind!.direction) * weight;
    weightedSpeed += point.wind!.speed * weight;
    weightedGusts += point.wind!.gusts * weight;
  }

  // Calculate interpolated direction from averaged U/V (result in radians)
  const avgU = weightedU / totalWeight;
  const avgV = weightedV / totalWeight;
  let direction = Math.atan2(avgU, avgV);
  if (direction < 0) direction += TWO_PI;

  return {
    speed: weightedSpeed / totalWeight,
    direction,
    gusts: weightedGusts / totalWeight,
  };
}

/**
 * Interpolate waves using Inverse Distance Weighting (IDW)
 */
function interpolateWaves(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[]
): WaveData | null {
  const pointsWithWaves = dataPoints.filter(p => p.waves);
  if (pointsWithWaves.length === 0) return null;
  if (pointsWithWaves.length === 1) return pointsWithWaves[0].waves!;

  const MAX_NEIGHBORS = 4;
  const neighbors: Array<{ point: DataPoint; dist: number }> = [];

  for (const point of pointsWithWaves) {
    const dLat = targetLat - point.lat;
    const dLon = targetLon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    if (dist < 0.001) return point.waves!;

    neighbors.push({ point, dist });
  }

  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  let totalWeight = 0;
  let weightedU = 0;
  let weightedV = 0;
  let weightedHeight = 0;
  let weightedPeriod = 0;

  for (const { point, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;

    // Direction is already in radians
    weightedU += Math.sin(point.waves!.direction) * weight;
    weightedV += Math.cos(point.waves!.direction) * weight;
    weightedHeight += point.waves!.height * weight;
    weightedPeriod += point.waves!.period * weight;
  }

  const avgU = weightedU / totalWeight;
  const avgV = weightedV / totalWeight;
  let direction = Math.atan2(avgU, avgV);
  if (direction < 0) direction += TWO_PI;

  return {
    height: weightedHeight / totalWeight,
    direction,
    period: weightedPeriod / totalWeight,
  };
}

/**
 * Interpolate sea temperature using Inverse Distance Weighting (IDW)
 */
function interpolateSeaTemp(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[]
): number | null {
  const pointsWithTemp = dataPoints.filter(p => p.seaTemperature !== undefined);
  if (pointsWithTemp.length === 0) return null;
  if (pointsWithTemp.length === 1) return pointsWithTemp[0].seaTemperature!;

  const MAX_NEIGHBORS = 4;
  const neighbors: Array<{ point: DataPoint; dist: number }> = [];

  for (const point of pointsWithTemp) {
    const dLat = targetLat - point.lat;
    const dLon = targetLon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    if (dist < 0.001) return point.seaTemperature!;

    neighbors.push({ point, dist });
  }

  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  let totalWeight = 0;
  let weightedTemp = 0;

  for (const { point, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;
    weightedTemp += point.seaTemperature! * weight;
  }

  return weightedTemp / totalWeight;
}

/**
 * Interpolate swell using Inverse Distance Weighting (IDW)
 */
function interpolateSwell(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[]
): WaveData | null {
  const pointsWithSwell = dataPoints.filter(p => p.swell);
  if (pointsWithSwell.length === 0) return null;
  if (pointsWithSwell.length === 1) return pointsWithSwell[0].swell!;

  const MAX_NEIGHBORS = 4;
  const neighbors: Array<{ point: DataPoint; dist: number }> = [];

  for (const point of pointsWithSwell) {
    const dLat = targetLat - point.lat;
    const dLon = targetLon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    if (dist < 0.001) return point.swell!;

    neighbors.push({ point, dist });
  }

  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  let totalWeight = 0;
  let weightedU = 0;
  let weightedV = 0;
  let weightedHeight = 0;
  let weightedPeriod = 0;

  for (const { point, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;

    // Direction is already in radians
    weightedU += Math.sin(point.swell!.direction) * weight;
    weightedV += Math.cos(point.swell!.direction) * weight;
    weightedHeight += point.swell!.height * weight;
    weightedPeriod += point.swell!.period * weight;
  }

  const avgU = weightedU / totalWeight;
  const avgV = weightedV / totalWeight;
  let direction = Math.atan2(avgU, avgV);
  if (direction < 0) direction += TWO_PI;

  return {
    height: weightedHeight / totalWeight,
    direction,
    period: weightedPeriod / totalWeight,
  };
}

/**
 * Interpolate ocean current using Inverse Distance Weighting (IDW)
 */
function interpolateCurrent(
  targetLat: number,
  targetLon: number,
  dataPoints: DataPoint[]
): CurrentData | null {
  const pointsWithCurrent = dataPoints.filter(p => p.current);
  if (pointsWithCurrent.length === 0) return null;
  if (pointsWithCurrent.length === 1) return pointsWithCurrent[0].current!;

  const MAX_NEIGHBORS = 4;
  const neighbors: Array<{ point: DataPoint; dist: number }> = [];

  for (const point of pointsWithCurrent) {
    const dLat = targetLat - point.lat;
    const dLon = targetLon - point.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);

    if (dist < 0.001) return point.current!;

    neighbors.push({ point, dist });
  }

  neighbors.sort((a, b) => a.dist - b.dist);
  const nearby = neighbors.slice(0, MAX_NEIGHBORS);

  let totalWeight = 0;
  let weightedU = 0;
  let weightedV = 0;
  let weightedVelocity = 0;

  for (const { point, dist } of nearby) {
    const weight = 1 / (dist * dist);
    totalWeight += weight;

    // Direction is already in radians
    weightedU += Math.sin(point.current!.direction) * weight;
    weightedV += Math.cos(point.current!.direction) * weight;
    weightedVelocity += point.current!.velocity * weight;
  }

  const avgU = weightedU / totalWeight;
  const avgV = weightedV / totalWeight;
  let direction = Math.atan2(avgU, avgV);
  if (direction < 0) direction += TWO_PI;

  return {
    velocity: weightedVelocity / totalWeight,
    direction,
  };
}

// ============================================
// Canvas Overlay Layer
// ============================================

class WeatherCanvasLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frame: number | null = null;
  private dataPoints: DataPoint[] = [];
  private waterGrid: WaterGridPoint[] = [];
  private windConverter: (knots: number) => number = (knots) => knots;
  private heightConverter: (meters: number) => number = (meters) => meters;
  private tempConverter: (celsius: number) => number = (celsius) => celsius;
  private loading: boolean = false;
  private loadingAnimationFrame: number | null = null;
  private loadingStartTime: number = 0;
  private displayMode: WeatherDisplayMode = 'wind';

  onAdd(map: L.Map): this {
    const pane = map.getPane('overlayPane');
    if (!pane) return this;

    this.canvas = L.DomUtil.create('canvas', 'weather-canvas-layer') as HTMLCanvasElement;
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    pane.appendChild(this.canvas);

    this.reset();
    return this;
  }

  onRemove(_map: L.Map): this {
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.frame) {
      cancelAnimationFrame(this.frame);
    }
    if (this.loadingAnimationFrame) {
      cancelAnimationFrame(this.loadingAnimationFrame);
    }
    return this;
  }

  setDataPoints(dataPoints: DataPoint[]): void {
    this.dataPoints = dataPoints;
    this.redraw();
  }

  setWindConverter(converter: (knots: number) => number): void {
    this.windConverter = converter;
    this.redraw();
  }

  setDisplayMode(mode: WeatherDisplayMode): void {
    this.displayMode = mode;
    this.redraw();
  }

  setHeightConverter(converter: (meters: number) => number): void {
    this.heightConverter = converter;
    this.redraw();
  }

  setTempConverter(converter: (celsius: number) => number): void {
    this.tempConverter = converter;
    this.redraw();
  }

  setWaterGrid(grid: WaterGridPoint[]): void {
    this.waterGrid = grid;
    this.redraw();
  }

  private isPointOnOcean(lat: number, lon: number): boolean {
    if (this.waterGrid.length === 0) return true; // Default to showing if no grid data

    // Find nearest water grid point
    let minDist = Infinity;
    let nearest: WaterGridPoint | null = null;

    for (const point of this.waterGrid) {
      const dLat = lat - point.lat;
      const dLon = lon - point.lon;
      const dist = dLat * dLat + dLon * dLon;
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    // Only return true for ocean (Marine API doesn't cover lakes)
    return nearest?.type === 'ocean';
  }

  setVisible(visible: boolean): void {
    if (this.canvas) {
      this.canvas.style.display = visible ? '' : 'none';
    }
  }

  setLoading(loading: boolean): void {
    const wasLoading = this.loading;
    this.loading = loading;

    if (loading && !wasLoading) {
      // Start loading animation
      this.loadingStartTime = performance.now();
      this.animateLoading();
    } else if (!loading && wasLoading) {
      // Stop loading animation
      if (this.loadingAnimationFrame) {
        cancelAnimationFrame(this.loadingAnimationFrame);
        this.loadingAnimationFrame = null;
      }
      // Reset opacity and redraw
      if (this.canvas) {
        this.canvas.style.opacity = '1';
      }
      this.redraw();
    }
  }

  private animateLoading(): void {
    if (!this.loading || !this.canvas) return;

    const elapsed = performance.now() - this.loadingStartTime;
    // Pulse between 0.3 and 0.7 opacity with a 1 second cycle
    const opacity = 0.5 + 0.2 * Math.sin((elapsed / 500) * Math.PI);
    this.canvas.style.opacity = opacity.toString();

    this.loadingAnimationFrame = requestAnimationFrame(() => this.animateLoading());
  }

  reset(): void {
    if (!this.canvas || !this._map) return;

    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvas, topLeft);

    this.canvas.width = size.x;
    this.canvas.height = size.y;
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.redraw();
  }

  redraw(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    if (!this.canvas || !this.ctx || !this._map || this.dataPoints.length === 0) return;

    const ctx = this.ctx;
    const map = this._map;
    const size = map.getSize();

    ctx.clearRect(0, 0, size.x, size.y);

    const bounds = map.getBounds();

    // Calculate diagonal distance of visible area in degrees
    const latRange = bounds.getNorth() - bounds.getSouth();
    const lonRange = bounds.getEast() - bounds.getWest();
    const diagonal = Math.sqrt(latRange * latRange + lonRange * lonRange);

    // Target: ~15 arrows along the diagonal gives good density
    const targetArrowsOnDiagonal = 15;
    const spacing = diagonal / targetArrowsOnDiagonal;

    // Use the calculated spacing directly (no snapping for consistency)
    const finalSpacing = spacing;

    // Snap to grid boundaries
    const startLat = Math.floor(bounds.getSouth() / finalSpacing) * finalSpacing;
    const endLat = Math.ceil(bounds.getNorth() / finalSpacing) * finalSpacing;
    const startLon = Math.floor(bounds.getWest() / finalSpacing) * finalSpacing;
    const endLon = Math.ceil(bounds.getEast() / finalSpacing) * finalSpacing;

    // Draw arrows at fixed geographic positions with interpolated data
    for (let lat = startLat; lat <= endLat; lat += finalSpacing) {
      for (let lon = startLon; lon <= endLon; lon += finalSpacing) {
        const screenPoint = map.latLngToContainerPoint([lat, lon]);

        // Skip if outside visible area
        if (screenPoint.x < -20 || screenPoint.x > size.x + 20) continue;
        if (screenPoint.y < -20 || screenPoint.y > size.y + 20) continue;

        if (this.displayMode === 'wind') {
          const wind = interpolateWind(lat, lon, this.dataPoints);
          if (!wind) continue;
          this.drawWindArrow(ctx, screenPoint.x, screenPoint.y, wind.direction, wind.speed);
        } else if (this.displayMode === 'waves') {
          // Only show waves on ocean (not lakes - Marine API doesn't cover lakes)
          if (!this.isPointOnOcean(lat, lon)) continue;

          const waves = interpolateWaves(lat, lon, this.dataPoints);
          if (!waves) continue;
          this.drawWaveArrow(ctx, screenPoint.x, screenPoint.y, waves.direction, waves.height, waves.period);
        } else if (this.displayMode === 'swell') {
          // Only show swell on ocean
          if (!this.isPointOnOcean(lat, lon)) continue;

          const swell = interpolateSwell(lat, lon, this.dataPoints);
          if (!swell) continue;
          this.drawSwellArrow(ctx, screenPoint.x, screenPoint.y, swell.direction, swell.height, swell.period);
        } else if (this.displayMode === 'current') {
          // Only show current on ocean
          if (!this.isPointOnOcean(lat, lon)) continue;

          const current = interpolateCurrent(lat, lon, this.dataPoints);
          if (!current) continue;
          this.drawCurrentArrow(ctx, screenPoint.x, screenPoint.y, current.direction, current.velocity);
        } else if (this.displayMode === 'water-temp') {
          // Only show sea temperature on ocean (not lakes - Marine API doesn't cover lakes)
          if (!this.isPointOnOcean(lat, lon)) continue;

          const temp = interpolateSeaTemp(lat, lon, this.dataPoints);
          if (temp === null) continue;
          this.drawWaterTemp(ctx, screenPoint.x, screenPoint.y, temp);
        }
      }
    }

  }

  private drawWindArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: number,
    speed: number
  ): void {
    const color = getWindColor(speed);
    const arrowLength = 16;
    const arrowWidth = 6;

    // Direction is where wind comes FROM, arrow points where it goes TO
    // Direction is already in radians
    const angle = direction + Math.PI;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw arrow shaft and head
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, -arrowLength / 2);
    ctx.lineTo(-arrowWidth / 2, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(arrowWidth / 2, arrowLength / 6);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Draw speed text (converted to user's preferred unit)
    ctx.restore();
    ctx.fillStyle = color;
    ctx.strokeStyle = getContrastOutline(color);
    ctx.lineWidth = 1;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const convertedSpeed = this.windConverter(speed);
    const text = Math.round(convertedSpeed).toString();
    ctx.strokeText(text, x, y + 10);
    ctx.fillText(text, x, y + 10);
  }

  private drawWaveArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: number,
    height: number,
    period: number
  ): void {
    const color = getWaveColor(height);
    const arrowLength = 16;
    const arrowWidth = 6;

    // Direction is where waves come FROM, arrow points where they go TO
    // Direction is already in radians
    const angle = direction + Math.PI;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw wave arrow (same shape as wind for consistency)
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, -arrowLength / 2);
    ctx.lineTo(-arrowWidth / 2, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(arrowWidth / 2, arrowLength / 6);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Draw height and period text (converted to user's preferred unit)
    ctx.restore();
    ctx.fillStyle = color;
    ctx.strokeStyle = getContrastOutline(color);
    ctx.lineWidth = 1;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const convertedHeight = this.heightConverter(height);
    const text = `${convertedHeight.toFixed(1)} (${Math.round(period)}s)`;
    ctx.strokeText(text, x, y + 10);
    ctx.fillText(text, x, y + 10);
  }

  private drawWaterTemp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tempCelsius: number
  ): void {
    const color = getWaterTempColor(tempCelsius);
    const convertedTemp = this.tempConverter(tempCelsius);
    const text = Math.round(convertedTemp).toString();

    ctx.fillStyle = color;
    ctx.strokeStyle = getContrastOutline(color);
    ctx.lineWidth = 1;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  private drawSwellArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: number,
    height: number,
    period: number
  ): void {
    const color = getWaveColor(height);
    const arrowLength = 16;
    const arrowWidth = 6;

    // Direction is where swell comes FROM, arrow points where it goes TO
    // Direction is already in radians
    const angle = direction + Math.PI;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw swell arrow (same shape as waves for consistency)
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, -arrowLength / 2);
    ctx.lineTo(-arrowWidth / 2, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(arrowWidth / 2, arrowLength / 6);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Draw height and period text
    ctx.restore();
    ctx.fillStyle = color;
    ctx.strokeStyle = getContrastOutline(color);
    ctx.lineWidth = 1;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const convertedHeight = this.heightConverter(height);
    const text = `${convertedHeight.toFixed(1)} (${Math.round(period)}s)`;
    ctx.strokeText(text, x, y + 10);
    ctx.fillText(text, x, y + 10);
  }

  private drawCurrentArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: number,
    velocity: number
  ): void {
    const color = getCurrentColor(velocity);
    const arrowLength = 16;
    const arrowWidth = 6;

    // Current direction is where it flows TO (unlike wind/waves which is FROM)
    // Direction is already in radians
    const angle = direction;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw current arrow
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, -arrowLength / 2);
    ctx.lineTo(-arrowWidth / 2, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(-arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 2);
    ctx.lineTo(arrowWidth / 4, arrowLength / 6);
    ctx.lineTo(arrowWidth / 2, arrowLength / 6);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Draw velocity text in knots (convert from m/s: 1 m/s ≈ 1.944 knots)
    ctx.restore();
    ctx.fillStyle = color;
    ctx.strokeStyle = getContrastOutline(color);
    ctx.lineWidth = 1;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const velocityKnots = velocity * 1.944;
    const text = velocityKnots.toFixed(1);
    ctx.strokeText(text, x, y + 10);
    ctx.fillText(text, x, y + 10);
  }
}

// ============================================
// Main WeatherOverlay Component
// ============================================

export const WeatherOverlay: React.FC<WeatherOverlayProps> = ({
  enabled,
  forecastHour,
  displayMode,
  onLoadingChange,
  onError,
}) => {
  const map = useMap();
  const layerRef = useRef<WeatherCanvasLayer | null>(null);
  const dataPointsRef = useRef<DataPoint[]>([]);
  const waterGridRef = useRef<WaterGridPoint[]>([]);
  const lastFetchKey = useRef<string>('');
  const lastWaterGridKey = useRef<string>('');
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waterGridDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { convertWind, convertDepth, convertTemperature } = useSettings();

  // Fetch weather data for current bounds
  const fetchWeatherData = useCallback(async () => {
    if (!enabled) return;

    let bounds;
    try {
      bounds = map.getBounds();
    } catch {
      // Map not ready yet
      return;
    }

    // Calculate visible area size
    const latRange = bounds.getNorth() - bounds.getSouth();
    const lonRange = bounds.getEast() - bounds.getWest();
    const diagonal = Math.sqrt(latRange * latRange + lonRange * lonRange);

    // Calculate how many arrows will be shown (~15 along diagonal)
    const arrowSpacing = diagonal / 15;
    const arrowCols = Math.ceil(lonRange / arrowSpacing) + 1;
    const arrowRows = Math.ceil(latRange / arrowSpacing) + 1;
    const totalArrows = arrowCols * arrowRows;

    // Open-Meteo maximum resolution is 0.1° (~11km) - always aim for this
    const OPEN_METEO_MAX_RESOLUTION = 0.1;

    // Maximum data points = number of arrows on screen (never fetch more than we display)
    const maxDataPoints = totalArrows;

    // Calculate minimum resolution needed to not exceed maxDataPoints
    // Grid with ring adds ~2 extra rows/cols, use 0.6 factor as buffer
    const minResolutionForLimit = Math.sqrt((latRange * lonRange) / (maxDataPoints * 0.6));

    // Use best resolution possible: start at 0.1° but back off only if needed
    const targetResolution = Math.max(OPEN_METEO_MAX_RESOLUTION, minResolutionForLimit);

    // Standard resolutions (0.1° is finest for Open-Meteo)
    const standardResolutions = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0];
    let resolution = standardResolutions[standardResolutions.length - 1];
    for (const res of standardResolutions) {
      if (res >= targetResolution) {
        resolution = res;
        break;
      }
    }

    // Snap viewport to resolution grid (these are the points that cover the viewport)
    const gridSouth = Math.floor(bounds.getSouth() / resolution) * resolution;
    const gridNorth = Math.ceil(bounds.getNorth() / resolution) * resolution;
    const gridWest = Math.floor(bounds.getWest() / resolution) * resolution;
    const gridEast = Math.ceil(bounds.getEast() / resolution) * resolution;

    // Add one ring around (1 resolution step in each direction)
    const gridBounds = {
      south: gridSouth - resolution,
      north: gridNorth + resolution,
      west: gridWest - resolution,
      east: gridEast + resolution,
    };

    const fetchKey = `${gridBounds.south},${gridBounds.west},${gridBounds.north},${gridBounds.east},${resolution},${forecastHour}`;
    if (fetchKey === lastFetchKey.current && dataPointsRef.current.length > 0) return;
    lastFetchKey.current = fetchKey;

    setIsLoading(true);
    onLoadingChange?.(true);
    onError?.(null);

    try {
      const response = await weatherAPI.getGrid(
        gridBounds,
        resolution,
        forecastHour
      );

      const points = (response.data?.points || [])
        .filter((p: WeatherGridPoint) => p.wind || p.waves || p.swell || p.current || p.seaTemperature !== undefined)
        .map((p: WeatherGridPoint) => ({
          lat: p.location.lat,
          lon: p.location.lon,
          wind: p.wind ? {
            speed: p.wind.speed,
            direction: p.wind.direction,
            gusts: p.wind.gusts,
          } : undefined,
          waves: p.waves ? {
            height: p.waves.height,
            direction: p.waves.direction,
            period: p.waves.period,
          } : undefined,
          swell: p.swell ? {
            height: p.swell.height,
            direction: p.swell.direction,
            period: p.swell.period,
          } : undefined,
          current: p.current ? {
            velocity: p.current.velocity,
            direction: p.current.direction,
          } : undefined,
          seaTemperature: p.seaTemperature,
        }));

      dataPointsRef.current = points;
      layerRef.current?.setDataPoints(points);

      // Check if we have data for the current mode
      let hasDataForMode = false;
      if (displayMode === 'wind') {
        hasDataForMode = points.some(p => p.wind);
      } else if (displayMode === 'waves') {
        hasDataForMode = points.some(p => p.waves);
      } else if (displayMode === 'swell') {
        hasDataForMode = points.some(p => p.swell);
      } else if (displayMode === 'current') {
        hasDataForMode = points.some(p => p.current);
      } else if (displayMode === 'water-temp') {
        hasDataForMode = points.some(p => p.seaTemperature !== undefined);
      }

      if (points.length === 0) {
        onError?.('No weather data available for this area');
      } else if (!hasDataForMode) {
        if (displayMode === 'waves') {
          onError?.('No wave data available for this area (only available in marine areas)');
        } else if (displayMode === 'swell') {
          onError?.('No swell data available for this area (only available in marine areas)');
        } else if (displayMode === 'current') {
          onError?.('No current data available for this area (only available in marine areas)');
        } else if (displayMode === 'water-temp') {
          onError?.('No water temperature data available for this area (only available in marine areas)');
        } else {
          onError?.('No wind data available for this area');
        }
      }
    } catch (error: any) {
      console.error('[WeatherOverlay] Fetch failed:', error);
      // Provide more specific error messages
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        onError?.('Request timed out - server may be busy, try again');
      } else if (error.response?.status === 429) {
        onError?.('Rate limited - please wait a moment and try again');
      } else if (error.response?.status === 503) {
        onError?.('Weather service temporarily unavailable');
      } else if (!navigator.onLine) {
        onError?.('You appear to be offline');
      } else {
        onError?.('Failed to load weather data, try again');
      }
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  }, [map, enabled, forecastHour, displayMode, onLoadingChange, onError]);

  // Fetch water grid for marine data filtering (needed for waves, swell, current, and water-temp modes)
  // Uses the exact same grid positions as arrow rendering
  const fetchWaterGrid = useCallback(async () => {
    const marineDisplayModes = ['waves', 'swell', 'current', 'water-temp'];
    if (!enabled || !marineDisplayModes.includes(displayMode)) {
      waterGridRef.current = [];
      layerRef.current?.setWaterGrid([]);
      return;
    }

    let bounds;
    try {
      bounds = map.getBounds();
    } catch {
      return;
    }

    // Calculate spacing exactly like the render function does
    const latRange = bounds.getNorth() - bounds.getSouth();
    const lonRange = bounds.getEast() - bounds.getWest();
    const diagonal = Math.sqrt(latRange * latRange + lonRange * lonRange);
    const spacing = diagonal / 15;

    // Snap to grid boundaries - exactly like render function
    const startLat = Math.floor(bounds.getSouth() / spacing) * spacing;
    const endLat = Math.ceil(bounds.getNorth() / spacing) * spacing;
    const startLon = Math.floor(bounds.getWest() / spacing) * spacing;
    const endLon = Math.ceil(bounds.getEast() / spacing) * spacing;

    // Create key based on the actual grid
    const waterGridKey = `${startLat.toFixed(4)},${startLon.toFixed(4)},${endLat.toFixed(4)},${endLon.toFixed(4)},${spacing.toFixed(4)}`;

    if (waterGridKey === lastWaterGridKey.current && waterGridRef.current.length > 0) return;
    lastWaterGridKey.current = waterGridKey;

    try {
      const response = await navigationAPI.getWaterGrid(
        startLat,
        endLat,
        startLon,
        endLon,
        spacing
      );

      const waterPoints: WaterGridPoint[] = (response.data?.grid || []).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        type: p.type,
      }));

      waterGridRef.current = waterPoints;
      layerRef.current?.setWaterGrid(waterPoints);
    } catch (error) {
      console.error('[WeatherOverlay] Water grid fetch failed:', error);
      // Continue without water filtering if fetch fails
    }
  }, [map, enabled, displayMode]);

  // Layer lifecycle
  useEffect(() => {
    if (!enabled) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    const layer = new WeatherCanvasLayer();
    layer.addTo(map);
    layer.setWindConverter(convertWind);
    layer.setHeightConverter(convertDepth);
    layer.setTempConverter(convertTemperature);
    layer.setDisplayMode(displayMode);
    layerRef.current = layer;

    if (dataPointsRef.current.length > 0) {
      layer.setDataPoints(dataPointsRef.current);
    }
    if (waterGridRef.current.length > 0) {
      layer.setWaterGrid(waterGridRef.current);
    }
    fetchWeatherData();
    const marineDisplayModes = ['waves', 'swell', 'current', 'water-temp'];
    if (marineDisplayModes.includes(displayMode)) {
      fetchWaterGrid();
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [enabled, map, fetchWeatherData, convertWind]);

  // Update wind converter when unit changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setWindConverter(convertWind);
    }
  }, [convertWind]);

  // Update height converter when depth unit changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setHeightConverter(convertDepth);
    }
  }, [convertDepth]);

  // Update temperature converter when temperature unit changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setTempConverter(convertTemperature);
    }
  }, [convertTemperature]);

  // Update display mode when it changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setDisplayMode(displayMode);
    }
    // Fetch water grid when switching to marine data modes
    const marineDisplayModes = ['waves', 'swell', 'current', 'water-temp'];
    if (marineDisplayModes.includes(displayMode)) {
      fetchWaterGrid();
    } else {
      // Clear water grid when not in marine data mode
      waterGridRef.current = [];
      layerRef.current?.setWaterGrid([]);
    }
  }, [displayMode, fetchWaterGrid]);

  // Sync loading state with canvas layer
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setLoading(isLoading);
    }
  }, [isLoading]);

  // Debounced fetch functions to prevent rapid API calls when panning
  const debouncedFetchWeather = useCallback(() => {
    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current);
    }
    fetchDebounceRef.current = setTimeout(() => {
      fetchWeatherData();
    }, FETCH_DEBOUNCE_MS);
  }, [fetchWeatherData]);

  const debouncedFetchWaterGrid = useCallback(() => {
    if (waterGridDebounceRef.current) {
      clearTimeout(waterGridDebounceRef.current);
    }
    waterGridDebounceRef.current = setTimeout(() => {
      fetchWaterGrid();
    }, FETCH_DEBOUNCE_MS);
  }, [fetchWaterGrid]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      if (waterGridDebounceRef.current) clearTimeout(waterGridDebounceRef.current);
    };
  }, []);

  // Map events
  useMapEvents({
    move: () => {
      if (enabled && layerRef.current) {
        layerRef.current.reset();
      }
    },
    moveend: () => {
      if (enabled) {
        // Use debounced fetch to avoid hammering the API when panning quickly
        debouncedFetchWeather();
        const marineDisplayModes = ['waves', 'swell', 'current', 'water-temp'];
        if (marineDisplayModes.includes(displayMode)) {
          debouncedFetchWaterGrid();
        }
      }
    },
    zoomstart: () => {
      // Hide arrows while zooming and cancel pending fetches
      if (enabled && layerRef.current) {
        layerRef.current.setVisible(false);
      }
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      if (waterGridDebounceRef.current) clearTimeout(waterGridDebounceRef.current);
    },
    zoomend: () => {
      // Show and redraw after zoom completes
      if (enabled && layerRef.current) {
        layerRef.current.setVisible(true);
        layerRef.current.reset();
      }
    },
  });

  // Refetch when forecast hour changes
  useEffect(() => {
    if (enabled) {
      lastFetchKey.current = '';
      fetchWeatherData();
    }
  }, [forecastHour, enabled, fetchWeatherData]);

  return null;
};

// ============================================
// Hook for managing weather overlay state
// ============================================

export function useWeatherOverlay() {
  const [enabled, setEnabled] = React.useState(false);
  const [forecastHour, setForecastHour] = React.useState(0);
  const [displayMode, setDisplayModeState] = React.useState<WeatherDisplayMode>(() => {
    const saved = localStorage.getItem('weatherDisplayMode');
    const validModes: WeatherDisplayMode[] = ['wind', 'waves', 'swell', 'current', 'water-temp'];
    return validModes.includes(saved as WeatherDisplayMode) ? saved as WeatherDisplayMode : 'wind';
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = React.useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  const setDisplayMode = React.useCallback((mode: WeatherDisplayMode) => {
    setDisplayModeState(mode);
    localStorage.setItem('weatherDisplayMode', mode);
  }, []);

  return {
    enabled,
    setEnabled,
    forecastHour,
    setForecastHour,
    displayMode,
    setDisplayMode,
    loading,
    setLoading,
    error,
    setError,
    toggle,
  };
}
