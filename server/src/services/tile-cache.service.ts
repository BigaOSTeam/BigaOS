/**
 * Server-side disk tile cache.
 *
 * The big lever for tile-request hygiene: N clients on the boat share ONE
 * upstream fetch per tile, revisited areas cost zero upstream requests, and
 * once an area has been viewed online even once it never goes white offline
 * (stale tiles are served instead of blank squares). This is what stops a
 * single Pi behind N tablets from looking like a scraper to osm.org.
 *
 * Layout (consistent with the existing data-dir convention — see
 * navigation-data.controller):
 *
 *   server/src/data/tile-cache/<source>/<z>/<x>/<y>.<ext>
 *
 * Two independent time signals per file, deliberately kept separate:
 *   - mtime = when the tile was fetched from upstream → drives *freshness*
 *     (age since fetch, compared against the TTL). Never touched on read.
 *   - atime = when the tile was last served → drives *LRU* eviction. Touched
 *     (explicitly, since filesystems often mount noatime/relatime) on every
 *     read hit. Using atime for LRU keeps mtime-based freshness intact — the
 *     two would fight if both rode on mtime.
 *
 * No sidecar metadata, no DB table: the filesystem is the index.
 */

import * as fs from 'fs';
import * as path from 'path';
import db from '../database/database';

// 7-day default freshness window — the OSMF policy's "cache per headers, or at
// least 7 days" floor. A tile older than this is refetched when online, but
// still served (stale) when offline or when the refetch fails.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Size cap, overridable via the `tileCacheMaxBytes` setting. Read live on each
// sweep so an operator can change it without a restart.
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

// After an over-cap sweep, evict down to this fraction of the cap so we don't
// re-sweep on every subsequent put.
const EVICT_TARGET_FRACTION = 0.9;

// Defensive per-tile ceiling. Real tiles are ≤ ~100 KB; anything above this is
// almost certainly not a tile and shouldn't be cached.
const MAX_TILE_BYTES = 1024 * 1024; // 1 MiB

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 min

// Only png/jpg/webp are ever cached. Content-Type → on-disk extension, and back.
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
// Order in which get() probes for an existing tile (we only ever write these).
const CANDIDATE_EXTS = ['png', 'jpg', 'webp'] as const;

const SOURCE_RE = /^[a-z0-9-]+$/i;

export interface CachedTile {
  body: Buffer;
  contentType: string;
  /** Milliseconds since the tile was fetched from upstream (freshness). */
  ageMs: number;
}

export interface TileCacheStats {
  bytes: number;
  files: number;
}

function extForContentType(contentType: string | undefined): string {
  if (!contentType) return 'png';
  const base = contentType.split(';')[0].trim().toLowerCase();
  return EXT_BY_CONTENT_TYPE[base] ?? 'png';
}

/** Coordinate/source validation — defence-in-depth against path traversal even
 *  though the controller already validates against the registry. */
function isSafeSource(source: string): boolean {
  return SOURCE_RE.test(source);
}
function isInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

class TileCacheService {
  private readonly root = path.join(__dirname, '..', 'data', 'tile-cache');

  // In-memory running totals so stats() (hit from the settings UI) is O(1)
  // instead of walking the tree. Seeded by an async walk at startup and reset
  // to ground truth on every sweep, so incremental drift self-heals.
  private totalBytes = 0;
  private fileCount = 0;

  // Guards against overlapping sweeps (a walk of a full cache can take a moment).
  private sweeping = false;

  constructor() {
    // Seed the byte counter without blocking boot. Errors (e.g. dir missing)
    // are benign — it'll be created on first put().
    this.refreshIndex().catch(() => {});
    setInterval(() => this.sweepIfNeeded(), SWEEP_INTERVAL_MS);
  }

  private dirFor(source: string, z: number, x: number): string {
    return path.join(this.root, source, String(z), String(x));
  }
  private pathFor(source: string, z: number, x: number, y: number, ext: string): string {
    return path.join(this.dirFor(source, z, x), `${y}.${ext}`);
  }

  /**
   * Look up a cached tile. Returns the bytes + content type + age, or null if
   * absent. The caller decides fresh-vs-stale from `ageMs` (see the serveTile
   * ladder). Tiles are tiny (≤ ~100 KB) so reading into a Buffer — rather than
   * handing back a ReadStream — keeps the caller simple, avoids fd-lifecycle
   * bugs on the stale-fallback path, and mirrors the buffer used by put().
   */
  async get(source: string, z: number, x: number, y: number): Promise<CachedTile | null> {
    if (!isSafeSource(source) || !isInt(z) || !isInt(x) || !isInt(y)) return null;
    for (const ext of CANDIDATE_EXTS) {
      const file = this.pathFor(source, z, x, y, ext);
      try {
        const stat = await fs.promises.stat(file);
        if (!stat.isFile()) continue;
        const body = await fs.promises.readFile(file);
        // Touch atime for LRU, preserving mtime (freshness). Fire-and-forget:
        // don't block serving on a metadata write, and don't care if it fails.
        fs.promises.utimes(file, new Date(), stat.mtime).catch(() => {});
        return {
          body,
          contentType: CONTENT_TYPE_BY_EXT[ext] ?? 'image/png',
          ageMs: Date.now() - stat.mtimeMs,
        };
      } catch {
        // ENOENT for this ext — try the next candidate.
      }
    }
    return null;
  }

  /** Freshness helper so the TTL lives in one place. */
  isFresh(ageMs: number): boolean {
    return ageMs < CACHE_TTL_MS;
  }

  /**
   * Store a tile. Atomic: write to a per-process temp name then rename, so a
   * power cut mid-write (boat electrics) never leaves a truncated PNG that
   * later gets served as a valid tile.
   */
  async put(source: string, z: number, x: number, y: number, contentType: string, body: Buffer): Promise<void> {
    if (!isSafeSource(source) || !isInt(z) || !isInt(x) || !isInt(y)) return;
    if (!body || body.length === 0 || body.length > MAX_TILE_BYTES) return;

    const ext = extForContentType(contentType);
    const dir = this.dirFor(source, z, x);
    const finalPath = this.pathFor(source, z, x, y, ext);
    const tmpPath = `${finalPath}.tmp-${process.pid}-${this.tmpSeq++}`;

    // Measure the file we're about to replace (if any) so the running total
    // stays honest across overwrites.
    let oldSize = 0;
    let existed = false;
    try {
      const s = await fs.promises.stat(finalPath);
      oldSize = s.size;
      existed = true;
    } catch {
      /* new tile */
    }

    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(tmpPath, body);
      await fs.promises.rename(tmpPath, finalPath);
    } catch (err) {
      // Clean up a stranded temp file; never throw out of put() — a cache
      // write failing must not break serving the tile.
      fs.promises.unlink(tmpPath).catch(() => {});
      console.warn('Tile cache put failed:', err instanceof Error ? err.message : err);
      return;
    }

    this.totalBytes += body.length - oldSize;
    if (!existed) this.fileCount += 1;
  }
  private tmpSeq = 0;

  async stats(): Promise<TileCacheStats> {
    return { bytes: Math.max(0, this.totalBytes), files: Math.max(0, this.fileCount) };
  }

  /** Delete the whole cache, or one source's subtree. */
  async clear(source?: string): Promise<void> {
    if (source !== undefined) {
      if (!isSafeSource(source)) return;
      await fs.promises.rm(path.join(this.root, source), { recursive: true, force: true });
    } else {
      await fs.promises.rm(this.root, { recursive: true, force: true });
    }
    await this.refreshIndex();
  }

  /** Walk the tree, deleting oldest-accessed tiles until under `targetBytes`. */
  async evictLru(targetBytes: number): Promise<void> {
    const entries = await this.walk();
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    // Oldest access first.
    entries.sort((a, b) => a.atimeMs - b.atimeMs);
    let files = entries.length;
    for (const e of entries) {
      if (total <= targetBytes) break;
      try {
        await fs.promises.unlink(e.path);
        total -= e.size;
        files -= 1;
      } catch {
        /* already gone */
      }
    }
    // Reset counters to ground truth (self-heals incremental drift).
    this.totalBytes = total;
    this.fileCount = files;
  }

  private maxBytes(): number {
    try {
      const raw = db.getSetting('tileCacheMaxBytes');
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch {
      /* fall through to default */
    }
    return DEFAULT_MAX_BYTES;
  }

  private async sweepIfNeeded(): Promise<void> {
    if (this.sweeping) return;
    const cap = this.maxBytes();
    if (this.totalBytes <= cap) return;
    this.sweeping = true;
    try {
      await this.evictLru(Math.floor(cap * EVICT_TARGET_FRACTION));
    } catch (err) {
      console.warn('Tile cache sweep failed:', err instanceof Error ? err.message : err);
    } finally {
      this.sweeping = false;
    }
  }

  /** Recompute the in-memory counters from disk (startup + after clear). */
  private async refreshIndex(): Promise<void> {
    const entries = await this.walk();
    this.totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
    this.fileCount = entries.length;
  }

  /** Recursive walk of the cache tree. Returns every tile file with size+atime.
   *  Hand-rolled rather than readdir({recursive}) for portability across the
   *  Node versions the Pi may run. Missing root → empty (not an error). */
  private async walk(): Promise<Array<{ path: string; size: number; atimeMs: number }>> {
    const out: Array<{ path: string; size: number; atimeMs: number }> = [];
    const recurse = async (dir: string): Promise<void> => {
      let dirents: fs.Dirent[];
      try {
        dirents = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return; // dir gone or unreadable
      }
      for (const d of dirents) {
        const full = path.join(dir, d.name);
        if (d.isDirectory()) {
          await recurse(full);
        } else if (d.isFile() && !d.name.includes('.tmp-')) {
          try {
            const s = await fs.promises.stat(full);
            out.push({ path: full, size: s.size, atimeMs: s.atimeMs });
          } catch {
            /* raced with a delete */
          }
        }
      }
    };
    await recurse(this.root);
    return out;
  }
}

export const tileCacheService = new TileCacheService();
