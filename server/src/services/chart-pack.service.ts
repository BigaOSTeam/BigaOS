/**
 * Chart-pack service — offline vector base-map packs (PMTiles).
 *
 * Downloadable base-map packs (one PMTiles file per cruising region, mirroring
 * the depth packs) are extracted under `data/chart-packs/<pack>/*.pmtiles` by
 * the Downloads tab. This service indexes them (bounds / zoom range / size from
 * each file's PMTiles header) and the controller serves the raw `.pmtiles` file
 * with HTTP Range support — the client renders it with protomaps-leaflet,
 * stacked above the online raster base so coverage gaps fall through.
 *
 * The Pi only serves byte ranges; all rendering happens on the client. Inert
 * until a pack is downloaded (empty tree → empty index).
 *
 * Data: © OpenStreetMap contributors · Protomaps (ODbL). NOT FOR NAVIGATION.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PMTiles, TileType, type Source, type RangeResponse } from 'pmtiles';

/** Public index entry (also the shape returned by GET /charts/packs). */
export interface ChartPackInfo {
  /** Directory name under chart-packs/ — the id used in the tiles URL. */
  packId: string;
  /** [minLon, minLat, maxLon, maxLat] from the PMTiles header. */
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  bytes: number;
  /** Tile payload type, e.g. 'mvt' | 'png' | 'jpg' | 'webp'. */
  tileType: string;
}

/** Full index entry (adds the on-disk file path, kept server-side). */
interface ChartPack extends ChartPackInfo {
  file: string;
}

const TILE_TYPE_NAME: Record<number, string> = {
  [TileType.Unknown]: 'unknown',
  [TileType.Mvt]: 'mvt',
  [TileType.Png]: 'png',
  [TileType.Jpeg]: 'jpg',
  [TileType.Webp]: 'webp',
  [TileType.Avif]: 'avif',
};

const PACK_ID_RE = /^[a-z0-9._-]+$/i;

/**
 * A `pmtiles` Source backed by a local file: it reads byte ranges with `fs`
 * instead of `fetch`. The npm package only ships a browser `File`/`fetch`
 * source, so the Node file source lives here.
 */
class FilePmtilesSource implements Source {
  constructor(private readonly filePath: string) {}

  getKey(): string {
    return this.filePath;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const fd = await fs.promises.open(this.filePath, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fd.read(buf, 0, length, offset);
      // Hand back a standalone ArrayBuffer sized to what was actually read.
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
      return { data: ab };
    } finally {
      await fd.close();
    }
  }
}

class ChartPackService {
  private readonly root = path.join(__dirname, '..', 'data', 'chart-packs');
  private packs: Map<string, ChartPack> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadPacks();
    this.initialized = true;
  }

  /** Re-scan the pack directory (after a chart pack is downloaded/deleted). */
  async reload(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  private async loadPacks(): Promise<void> {
    const found = new Map<string, ChartPack>();
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(this.root, { withFileTypes: true });
    } catch {
      // No chart-packs/ yet — nothing downloaded.
      this.packs = found;
      console.log('  Chart packs: directory not found (no pack downloaded)');
      return;
    }

    for (const d of dirents) {
      if (!d.isDirectory() || !PACK_ID_RE.test(d.name)) continue;
      const dir = path.join(this.root, d.name);
      const file = await this.findPmtiles(dir);
      if (!file) continue;
      try {
        const info = await this.readHeader(d.name, file);
        found.set(info.packId, info);
      } catch (err) {
        console.warn(`Chart pack ${d.name}: failed to read PMTiles header:`, err instanceof Error ? err.message : err);
      }
    }

    this.packs = found;
    if (found.size > 0) console.log(`  Chart packs: ${found.size} indexed (${[...found.keys()].join(', ')})`);
  }

  /** First `.pmtiles` file directly under a pack directory. */
  private async findPmtiles(dir: string): Promise<string | null> {
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return null;
    }
    const hit = entries.find((e) => e.toLowerCase().endsWith('.pmtiles'));
    return hit ? path.join(dir, hit) : null;
  }

  private async readHeader(packId: string, file: string): Promise<ChartPack> {
    const [stat, header] = await Promise.all([
      fs.promises.stat(file),
      new PMTiles(new FilePmtilesSource(file)).getHeader(),
    ]);
    return {
      packId,
      file,
      bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
      minzoom: header.minZoom,
      maxzoom: header.maxZoom,
      bytes: stat.size,
      tileType: TILE_TYPE_NAME[header.tileType] ?? 'unknown',
    };
  }

  /** Public index (no filesystem paths) for GET /charts/packs. */
  list(): ChartPackInfo[] {
    return [...this.packs.values()].map(({ file, ...info }) => info);
  }

  /** Resolve a pack id to its on-disk file, or null. Validates against the
   *  index (built from real dir names), so a hostile id can't traverse. */
  fileForPack(packId: string): string | null {
    if (!PACK_ID_RE.test(packId)) return null;
    return this.packs.get(packId)?.file ?? null;
  }
}

export const chartPackService = new ChartPackService();
