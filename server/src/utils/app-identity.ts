/**
 * Outbound HTTP identity — single source of truth.
 *
 * The OSMF Tile Usage Policy (and most donated OSM-derived infrastructure) asks
 * operators to send a User-Agent that clearly identifies the application and
 * gives a way to reach them; traffic with a generic or stale UA is first in
 * line for blocking. We build one versioned, *contactable* UA at startup and
 * reuse it for every request to a third-party service (tile proxy, geocoding,
 * EMODnet WFS/WCS fallbacks, GEBCO COG, regional importers).
 *
 * The version is read from package.json at runtime rather than `import`ed: a
 * static `import ... from '../../package.json'` sits outside tsconfig's
 * `rootDir` (./src) and fails `tsc` with TS6059. Reading it at runtime keeps
 * the UA in sync with the real version without a rebuild and works identically
 * under ts-node-dev (src/utils) and the compiled build (dist/utils) — the path
 * from either to the server root is two levels up.
 */
import * as fs from 'fs';
import * as path from 'path';

function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : 'dev';
  } catch {
    return 'dev';
  }
}

export const APP_VERSION = readVersion();

/**
 * Versioned, contactable User-Agent for all outbound requests to third-party
 * services. Format follows the `Product/Version (+contact-url)` convention
 * upstream tile/geocoding operators expect.
 */
export const APP_USER_AGENT = `BigaOS/${APP_VERSION} (+https://github.com/BigaOSTeam/BigaOS)`;
