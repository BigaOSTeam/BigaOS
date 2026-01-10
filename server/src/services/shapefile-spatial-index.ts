/**
 * Memory-Efficient Shapefile Spatial Index
 *
 * Uses R-tree indexing with on-demand feature loading for large shapefiles.
 * Instead of loading all polygons into memory, we:
 * 1. Parse the .shx index file to get byte offsets for each record
 * 2. Stream through the .shp file once to extract bounding boxes
 * 3. Build an R-tree spatial index with bounding boxes and file offsets
 * 4. On query: use R-tree to find candidates, then read only those features from disk
 */

import * as fs from 'fs';
import * as path from 'path';
import RBush from 'rbush';

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface IndexedFeature extends BBox {
  recordIndex: number;
  offset: number;      // Byte offset in .shp file
  contentLength: number; // Content length in 16-bit words
}

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

type PolygonGeometry = GeoJSONPolygon | GeoJSONMultiPolygon;

// Shapefile constants
const SHP_HEADER_SIZE = 100;
const SHX_RECORD_SIZE = 8;
const SHAPE_TYPE_POLYGON = 5;

export class ShapefileSpatialIndex {
  private tree: RBush<IndexedFeature>;
  private shpPath: string;
  private shpFd: number | null = null;
  private initialized = false;
  private featureCount = 0;

  constructor() {
    this.tree = new RBush<IndexedFeature>();
    this.shpPath = '';
  }

  /**
   * Initialize the spatial index from shapefile
   */
  async initialize(shpPath: string): Promise<void> {
    if (this.initialized) return;

    this.shpPath = shpPath;
    const shxPath = shpPath.replace(/\.shp$/i, '.shx');

    if (!fs.existsSync(shpPath) || !fs.existsSync(shxPath)) {
      throw new Error(`Shapefile or index not found: ${shpPath}`);
    }

    console.log('  Building spatial index from shapefile...');
    const startTime = Date.now();

    // Parse .shx to get record offsets
    const records = this.parseShxFile(shxPath);
    console.log(`  Found ${records.length} records in index`);

    // Build R-tree from bounding boxes (streaming)
    const features = await this.buildIndexFromShp(shpPath, records);
    this.tree.load(features);
    this.featureCount = features.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Spatial index built: ${this.featureCount} features indexed in ${elapsed}s`);

    this.initialized = true;
  }

  /**
   * Parse .shx index file to get record offsets
   */
  private parseShxFile(shxPath: string): Array<{ offset: number; contentLength: number }> {
    const buffer = fs.readFileSync(shxPath);
    const records: Array<{ offset: number; contentLength: number }> = [];

    // Skip 100-byte header
    let pos = SHP_HEADER_SIZE;

    while (pos + SHX_RECORD_SIZE <= buffer.length) {
      // Offset and content length are in 16-bit words, big-endian
      const offset = buffer.readUInt32BE(pos) * 2; // Convert to bytes
      const contentLength = buffer.readUInt32BE(pos + 4) * 2; // Convert to bytes
      records.push({ offset, contentLength });
      pos += SHX_RECORD_SIZE;
    }

    return records;
  }

  /**
   * Stream through .shp file and extract bounding boxes for R-tree
   */
  private async buildIndexFromShp(
    shpPath: string,
    records: Array<{ offset: number; contentLength: number }>
  ): Promise<IndexedFeature[]> {
    const fd = fs.openSync(shpPath, 'r');
    const features: IndexedFeature[] = [];
    const headerBuffer = Buffer.alloc(44); // Enough for record header + bbox

    try {
      for (let i = 0; i < records.length; i++) {
        const { offset, contentLength } = records[i];

        // Read record header (8 bytes) + shape type (4 bytes) + bbox (32 bytes)
        fs.readSync(fd, headerBuffer, 0, 44, offset);

        // Shape type is at byte 8 (after record number and content length), little-endian
        const shapeType = headerBuffer.readInt32LE(8);

        if (shapeType === SHAPE_TYPE_POLYGON) {
          // Bounding box starts at byte 12 (after shape type)
          // Order: minX, minY, maxX, maxY (all doubles, little-endian)
          const minX = headerBuffer.readDoubleLE(12);
          const minY = headerBuffer.readDoubleLE(20);
          const maxX = headerBuffer.readDoubleLE(28);
          const maxY = headerBuffer.readDoubleLE(36);

          features.push({
            recordIndex: i,
            offset,
            contentLength,
            minX,
            minY,
            maxX,
            maxY
          });
        }

        // Progress logging for large files
        if ((i + 1) % 10000 === 0) {
          console.log(`  Indexed ${i + 1}/${records.length} records...`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }

    return features;
  }

  /**
   * Query for polygons that might contain a point
   */
  getCandidates(lon: number, lat: number): IndexedFeature[] {
    if (!this.initialized) return [];

    // Query R-tree for features whose bbox contains the point
    return this.tree.search({
      minX: lon,
      minY: lat,
      maxX: lon,
      maxY: lat
    });
  }

  /**
   * Read a specific polygon geometry from the shapefile
   */
  readPolygon(feature: IndexedFeature): PolygonGeometry | null {
    if (!this.initialized) return null;

    const fd = fs.openSync(this.shpPath, 'r');
    try {
      // Read the entire record content
      const buffer = Buffer.alloc(feature.contentLength + 8); // +8 for record header
      fs.readSync(fd, buffer, 0, buffer.length, feature.offset);

      return this.parsePolygonRecord(buffer);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Parse a polygon record from buffer
   */
  private parsePolygonRecord(buffer: Buffer): PolygonGeometry | null {
    // Skip record header (8 bytes)
    let pos = 8;

    const shapeType = buffer.readInt32LE(pos);
    if (shapeType !== SHAPE_TYPE_POLYGON) return null;
    pos += 4;

    // Skip bounding box (32 bytes)
    pos += 32;

    // Number of parts and points
    const numParts = buffer.readInt32LE(pos);
    pos += 4;
    const numPoints = buffer.readInt32LE(pos);
    pos += 4;

    // Read part indices
    const partIndices: number[] = [];
    for (let i = 0; i < numParts; i++) {
      partIndices.push(buffer.readInt32LE(pos));
      pos += 4;
    }
    partIndices.push(numPoints); // Add end marker

    // Read points
    const points: Array<[number, number]> = [];
    for (let i = 0; i < numPoints; i++) {
      const x = buffer.readDoubleLE(pos);
      pos += 8;
      const y = buffer.readDoubleLE(pos);
      pos += 8;
      points.push([x, y]);
    }

    // Build rings from parts
    const rings: number[][][] = [];
    for (let i = 0; i < numParts; i++) {
      const start = partIndices[i];
      const end = partIndices[i + 1];
      const ring = points.slice(start, end);
      rings.push(ring);
    }

    // If single part, return Polygon; if multiple, determine if MultiPolygon
    // For simplicity, treat all as Polygon with holes (first ring = exterior, rest = holes)
    if (rings.length === 1) {
      return {
        type: 'Polygon',
        coordinates: rings
      };
    }

    // Multiple rings - first is exterior, rest are holes
    return {
      type: 'Polygon',
      coordinates: rings
    };
  }

  /**
   * Check if a point is inside a polygon (ray casting algorithm)
   */
  pointInPolygon(lon: number, lat: number, geometry: PolygonGeometry): boolean {
    if (geometry.type === 'Polygon') {
      return this.pointInPolygonRings(lon, lat, geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (this.pointInPolygonRings(lon, lat, polygon)) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  private pointInPolygonRings(lon: number, lat: number, rings: number[][][]): boolean {
    // Check if inside outer ring
    if (!this.pointInRing(lon, lat, rings[0])) {
      return false;
    }

    // Check if inside any hole (inner rings)
    for (let i = 1; i < rings.length; i++) {
      if (this.pointInRing(lon, lat, rings[i])) {
        return false; // Inside a hole, so not in polygon
      }
    }

    return true;
  }

  private pointInRing(lon: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    const n = ring.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];

      if (((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Check if a point is in any polygon in the index
   */
  containsPoint(lon: number, lat: number): boolean {
    const candidates = this.getCandidates(lon, lat);

    for (const candidate of candidates) {
      const geometry = this.readPolygon(candidate);
      if (geometry && this.pointInPolygon(lon, lat, geometry)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get statistics about the index
   */
  getStats(): { featureCount: number; initialized: boolean } {
    return {
      featureCount: this.featureCount,
      initialized: this.initialized
    };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export const shapefileSpatialIndex = new ShapefileSpatialIndex();
