import React, { useMemo } from 'react';
import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { radToDeg } from '../../../utils/angle';
import { createBoatIcon, createWaypointIcon, createFinishFlagIcon } from './map-icons';
import { interpolateTimeline } from './navigation-utils';
import type { WeatherRouteResult } from './weather-route.types';

interface RoutePreviewLayerProps {
  result: WeatherRouteResult;
  scrubMs: number;
}

/** Colour for a wind-speed value (knots): calm→strong. */
function windColor(kn: number): string {
  if (kn < 8) return '#4caf50';
  if (kn < 16) return '#cddc39';
  if (kn < 25) return '#ff9800';
  return '#f44336';
}

/** A small arrow div-icon pointing in the direction the wind blows TO. */
function windArrowIcon(twdRad: number, twsKn: number): L.DivIcon {
  // Wind FROM twd → blows toward twd + 180°.
  const deg = radToDeg(twdRad) + 180;
  const color = windColor(twsKn);
  const len = Math.min(22, 9 + twsKn * 0.5);
  return L.divIcon({
    className: 'wind-preview-arrow',
    html: `<div style="transform: rotate(${deg}deg); width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <g stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round">
          <line x1="12" y1="${12 - len / 2}" x2="12" y2="${12 + len / 2}"/>
          <path d="M ${12 - 4} ${12 + len / 2 - 5} L 12 ${12 + len / 2} L ${12 + 4} ${12 + len / 2 - 5}"/>
        </g>
      </svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/**
 * Renders the optimized weather route preview on the map: the (tacking)
 * polyline, intermediate waypoint dots, on-route wind arrows from the timeline,
 * and a boat marker at the interpolated scrub position.
 */
export const RoutePreviewLayer: React.FC<RoutePreviewLayerProps> = ({ result, scrubMs }) => {
  const { waypoints, timeline } = result;

  const positions = useMemo<[number, number][]>(() => waypoints.map((w) => [w.lat, w.lon]), [waypoints]);

  // Up to ~12 evenly-spaced wind arrows along the timeline.
  const arrows = useMemo(() => {
    if (timeline.length < 2) return [];
    const maxArrows = 12;
    const stride = Math.max(1, Math.floor(timeline.length / maxArrows));
    const out: { lat: number; lon: number; twd: number; tws: number }[] = [];
    for (let i = 1; i < timeline.length; i += stride) {
      const s = timeline[i];
      out.push({ lat: s.lat, lon: s.lon, twd: s.twdRad, tws: s.twsKn });
    }
    return out;
  }, [timeline]);

  const interp = useMemo(() => interpolateTimeline(timeline, scrubMs), [timeline, scrubMs]);
  const boatIcon = useMemo(
    () => (interp ? createBoatIcon(interp.headingRad) : null),
    [interp ? Math.round(radToDeg(interp.headingRad)) : 0]
  );

  if (positions.length < 2) return null;

  return (
    <>
      {/* Optimized route — solid, drawn over a white casing for contrast */}
      <Polyline positions={positions} pathOptions={{ color: '#ffffff', weight: 6, opacity: 0.7 }} />
      <Polyline positions={positions} pathOptions={{ color: '#26c6da', weight: 3, opacity: 0.95 }} />

      {/* Tack/turn waypoints */}
      {waypoints.slice(1, -1).map((wp, i) => (
        <Marker key={`pv-wp-${i}`} position={[wp.lat, wp.lon]} icon={createWaypointIcon()} interactive={false} />
      ))}

      {/* Destination flag */}
      <Marker position={[waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lon]} icon={createFinishFlagIcon()} interactive={false} />

      {/* On-route wind arrows */}
      {arrows.map((a, i) => (
        <Marker key={`pv-wind-${i}`} position={[a.lat, a.lon]} icon={windArrowIcon(a.twd, a.tws)} interactive={false} />
      ))}

      {/* Scrubbed boat position */}
      {interp && boatIcon && (
        <Marker position={[interp.lat, interp.lon]} icon={boatIcon} interactive={false} zIndexOffset={1000} />
      )}
    </>
  );
};
