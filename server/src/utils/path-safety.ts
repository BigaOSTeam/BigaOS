/**
 * Path safety helpers — defense against path traversal.
 *
 * `path.join(base, userInput)` happily accepts `../` segments and yields
 * paths outside the base directory. `safeJoin` resolves the candidate and
 * verifies it stays inside (or equal to) base; otherwise it throws.
 */

import * as path from 'path';

export function safeJoin(base: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(base);
  const candidate = path.resolve(resolvedBase, ...segments);
  // Must equal base or live inside it. Adding the separator guards against
  // /foo/bar matching prefix /foo/bar2.
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (candidate !== resolvedBase && !candidate.startsWith(baseWithSep)) {
    throw new Error(`path escape: ${segments.join('/')} resolves outside base`);
  }
  return candidate;
}

/** Numeric tile/zoom segment (digits only). */
export function isNumericSegment(s: unknown): s is string {
  return typeof s === 'string' && /^\d+$/.test(s);
}

/** Filename-safe segment: no slashes, no nul, no leading dot, no traversal. */
export function isSafeFilenameSegment(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0) return false;
  if (s === '.' || s === '..') return false;
  if (/[\\/\0]/.test(s)) return false;
  return true;
}
