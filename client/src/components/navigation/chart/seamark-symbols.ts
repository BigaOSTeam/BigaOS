/**
 * Seamark symbol logic — pure, DOM-free.
 *
 * Turns a raw GeoJSON seamark feature (all `seamark:*` OSM tags preserved) into
 * a drawable point: shape + IALA colour bands + light flag + cardinal letter +
 * name + composed light character. Kept separate from SeamarkLayer's canvas code
 * so it carries no Leaflet/React import and can be unit-tested on its own.
 */

export type Shape = 'circle' | 'triangle' | 'diamond' | 'square' | 'star';

export interface SeamarkPoint {
  lon: number;
  lat: number;
  shape: Shape;
  colours: string[]; // hex, top→bottom bands
  isLight: boolean;
  cardinal?: 'N' | 'E' | 'S' | 'W';
  name?: string;
  lightChar?: string;
}

export const COLOURS: Record<string, string> = {
  red: '#e2352b',
  green: '#2ca02c',
  yellow: '#f2c200',
  amber: '#f2c200',
  orange: '#e8801a',
  black: '#1b1b1b',
  white: '#f5f5f5',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  blue: '#2a6fd6',
};
export const LIGHT_MAGENTA = '#d030c8';
export const GENERIC = '#9aa0a6';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Map an OSM colour token list ("red;white") to hex bands. */
export function coloursToHex(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const parts = raw
    .split(';')
    .map((c) => COLOURS[c.trim().toLowerCase()])
    .filter(Boolean) as string[];
  return parts.length ? parts : fallback;
}

/** Compose a light character like "Fl(2)R.10s" from seamark:light:* tags. */
export function lightCharacter(p: Record<string, unknown>): string | undefined {
  const character = str(p['seamark:light:character']); // Fl, Oc, Iso, Q, LFl, …
  const group = str(p['seamark:light:group']); // "2"
  const colour = str(p['seamark:light:colour']); // red/green/white/yellow
  const period = str(p['seamark:light:period']); // "10"
  if (!character && !colour && !period) return undefined;
  const colAbbr: Record<string, string> = {
    red: 'R',
    green: 'G',
    white: 'W',
    yellow: 'Y',
    blue: 'Bu',
    orange: 'Or',
  };
  let s = character ?? '';
  if (group) s += `(${group})`;
  if (colour) s += colAbbr[colour.toLowerCase()] ?? '';
  if (period) s += `.${period}s`;
  return s.trim() || undefined;
}

/** Turn a raw GeoJSON seamark feature into a drawable point, or null. */
export function toPoint(feature: any): SeamarkPoint | null {
  const geom = feature?.geometry;
  if (!geom) return null;
  // Representative point: a Point's coord, else the first coordinate found.
  let lon: number | undefined;
  let lat: number | undefined;
  const firstCoord = (c: any): void => {
    if (lon !== undefined) return;
    if (typeof c?.[0] === 'number' && typeof c?.[1] === 'number') {
      lon = c[0];
      lat = c[1];
    } else if (Array.isArray(c)) {
      for (const x of c) {
        firstCoord(x);
        if (lon !== undefined) return;
      }
    }
  };
  firstCoord(geom.coordinates);
  if (lon === undefined || lat === undefined) return null;

  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const type = str(props['seamark:type']) ?? '';
  const name = str(props['seamark:name']) ?? str(props.name);
  const isLight =
    type.startsWith('light') ||
    type === 'lighthouse' ||
    'seamark:light:character' in props ||
    'seamark:light:colour' in props;
  const lightChar = lightCharacter(props);

  let shape: Shape = 'diamond';
  let colours: string[] = [GENERIC];
  let cardinal: SeamarkPoint['cardinal'];

  const colourTag = (key: string, fallback: string[]) => coloursToHex(str(props[key]), fallback);

  if (type === 'buoy_lateral' || type === 'beacon_lateral') {
    shape = type.startsWith('beacon') ? 'triangle' : 'circle';
    const cat = str(props[`seamark:${type}:category`]);
    const fallback =
      cat === 'starboard' || cat === 'preferred_channel_starboard' ? [COLOURS.green] : [COLOURS.red];
    colours = colourTag(`seamark:${type}:colour`, fallback);
  } else if (type === 'buoy_cardinal' || type === 'beacon_cardinal') {
    shape = 'diamond';
    colours = colourTag(`seamark:${type}:colour`, [COLOURS.black, COLOURS.yellow]);
    const cat = str(props[`seamark:${type}:category`]);
    if (cat === 'north') cardinal = 'N';
    else if (cat === 'east') cardinal = 'E';
    else if (cat === 'south') cardinal = 'S';
    else if (cat === 'west') cardinal = 'W';
  } else if (type === 'buoy_isolated_danger' || type === 'beacon_isolated_danger') {
    shape = type.startsWith('beacon') ? 'triangle' : 'circle';
    colours = colourTag(`seamark:${type}:colour`, [COLOURS.black, COLOURS.red, COLOURS.black]);
  } else if (type === 'buoy_safe_water' || type === 'beacon_safe_water') {
    shape = 'circle';
    colours = colourTag(`seamark:${type}:colour`, [COLOURS.red, COLOURS.white]);
  } else if (type === 'buoy_special_purpose' || type === 'beacon_special_purpose') {
    shape = type.startsWith('beacon') ? 'triangle' : 'circle';
    colours = colourTag(`seamark:${type}:colour`, [COLOURS.yellow]);
  } else if (isLight) {
    shape = 'star';
    colours = [LIGHT_MAGENTA];
  } else if (type.startsWith('beacon')) {
    shape = 'triangle';
    colours = colourTag('seamark:beacon:colour', [GENERIC]);
  } else if (type.startsWith('buoy')) {
    shape = 'circle';
    colours = colourTag('seamark:buoy:colour', [GENERIC]);
  }

  return { lon, lat, shape, colours, isLight, cardinal, name, lightChar };
}
