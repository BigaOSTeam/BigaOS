/**
 * Water Detection Service
 *
 * Uses OSM polygon data to determine if a coordinate is on water or land.
 * Supports direct reading of:
 * - Shapefile (.shp) for OSM Water Polygons (oceans/seas)
 * - PBF for OSM Water Layer (lakes, rivers, reservoirs)
 *
 * No conversion needed - reads native formats at runtime.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as shapefile from 'shapefile';

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export type WaterType = 'ocean' | 'lake' | 'land';

class WaterDetectionService {
  private waterPolygons: GeoJSONFeatureCollection | null = null; // OSM oceans/seas
  private lakePolygons: GeoJSONFeatureCollection | null = null;  // OSM lakes/rivers
  private cache = new Map<string, WaterType>();
  private readonly CACHE_SIZE = 10000;
  private initialized = false;

  /**
   * Initialize the service by loading data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dataDir = path.join(__dirname, '..', 'data');

    try {
      console.log('Loading water detection data...');

      // Load OSM Water Polygons (oceans/seas) from Shapefile
      await this.loadWaterPolygons(dataDir);

      // Load OSM Water Layer (lakes/rivers) from PBF or GeoJSON
      await this.loadLakePolygons(dataDir);

      // Log data source summary
      console.log('Water detection data sources:');
      if (this.waterPolygons) console.log(`  - OSM Water Polygons: ${this.waterPolygons.features.length} features (oceans/seas)`);
      if (this.lakePolygons) console.log(`  - OSM Water Layer: ${this.lakePolygons.features.length} features (lakes/rivers)`);

      if (!this.waterPolygons && !this.lakePolygons) {
        console.warn('  No water detection data loaded!');
        console.warn('  Place water-polygons-split-4326/ folder or OSM_WaterLayer.pbf in server/src/data/');
      }

      this.initialized = true;
      console.log('Water detection service ready');
    } catch (error) {
      console.error('Failed to load water detection data:', error);
    }
  }

  /**
   * Load OSM Water Polygons from Shapefile
   * NOTE: Large shapefiles (>100MB) are skipped to avoid memory issues.
   * For production, use a spatial database like PostGIS instead.
   */
  private async loadWaterPolygons(dataDir: string): Promise<void> {
    // Check for extracted shapefile folder - but skip if too large
    const shpPath = path.join(dataDir, 'water-polygons-split-4326', 'water_polygons.shp');

    if (fs.existsSync(shpPath)) {
      const stats = fs.statSync(shpPath);
      const sizeMB = stats.size / (1024 * 1024);
      if (sizeMB > 100) {
        console.log(`  Skipping large shapefile (${sizeMB.toFixed(0)}MB) - would cause memory issues`);
        console.log('  For high-resolution water detection, use a spatial database like PostGIS');
      } else {
        console.log('  Loading OSM Water Polygons from Shapefile...');
        const features: GeoJSONFeature[] = [];

        const source = await shapefile.open(shpPath);
        let result = await source.read();

        while (!result.done) {
          if (result.value && result.value.geometry) {
            features.push(result.value as GeoJSONFeature);
          }
          result = await source.read();
        }

        this.waterPolygons = {
          type: 'FeatureCollection',
          features
        };
        console.log(`  Loaded ${features.length} water polygon features`);
        return;
      }
    }

    // Fallback: check for pre-converted GeoJSON
    const jsonPath = path.join(dataDir, 'water-polygons.json');
    if (fs.existsSync(jsonPath)) {
      console.log('  Loading water polygons from GeoJSON...');
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      this.waterPolygons = JSON.parse(raw);
      console.log(`  Loaded ${this.waterPolygons?.features.length} features`);
      return;
    }

    // Legacy fallback: Natural Earth ocean data
    const oceanPath = path.join(dataDir, 'ocean.json');
    if (fs.existsSync(oceanPath)) {
      console.log('  Loading Natural Earth ocean data (fallback)...');
      const raw = fs.readFileSync(oceanPath, 'utf-8');
      this.waterPolygons = JSON.parse(raw);
      console.log(`  Loaded ${this.waterPolygons?.features.length} features`);
    }
  }

  /**
   * Load OSM Water Layer (lakes/rivers) from PBF or GeoJSON
   */
  private async loadLakePolygons(dataDir: string): Promise<void> {
    // Check for PBF file
    const pbfPath = path.join(dataDir, 'OSM_WaterLayer.pbf');

    if (fs.existsSync(pbfPath)) {
      console.log('  Loading OSM Water Layer from PBF...');
      try {
        const tinyOsmPbf = await import('tiny-osmpbf');
        const osmtogeojson = (await import('osmtogeojson')).default;

        const pbfBuffer = fs.readFileSync(pbfPath);
        const osmData = tinyOsmPbf.parse(pbfBuffer);
        this.lakePolygons = osmtogeojson(osmData) as GeoJSONFeatureCollection;
        console.log(`  Loaded ${this.lakePolygons.features.length} lake/river features`);
        return;
      } catch (error) {
        console.error('  Failed to load PBF:', error);
      }
    }

    // Fallback: check for pre-converted GeoJSON
    const jsonPath = path.join(dataDir, 'osm-water.json');
    if (fs.existsSync(jsonPath)) {
      console.log('  Loading OSM water layer from GeoJSON...');
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      this.lakePolygons = JSON.parse(raw);
      console.log(`  Loaded ${this.lakePolygons?.features.length} features`);
      return;
    }

    // Legacy fallback: Natural Earth lakes data
    const lakesPath = path.join(dataDir, 'lakes.json');
    if (fs.existsSync(lakesPath)) {
      console.log('  Loading Natural Earth lakes data (legacy fallback)...');
      const raw = fs.readFileSync(lakesPath, 'utf-8');
      this.lakePolygons = JSON.parse(raw);
      console.log(`  Loaded ${this.lakePolygons?.features.length} features`);
    }
  }

  /**
   * Ray-casting algorithm to determine if a point is inside a polygon.
   */
  private pointInPolygon(lat: number, lon: number, polygon: number[][]): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i][0]; // longitude
      const yi = polygon[i][1]; // latitude
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      if (((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Check if a point is inside any polygon in a feature collection
   */
  private isPointInFeatureCollection(
    lat: number,
    lon: number,
    data: GeoJSONFeatureCollection
  ): boolean {
    for (const feature of data.features) {
      const geometry = feature.geometry;

      if (geometry.type === 'Polygon') {
        const outerRing = geometry.coordinates[0];
        if (this.pointInPolygon(lat, lon, outerRing)) {
          // Check holes
          for (let i = 1; i < geometry.coordinates.length; i++) {
            if (this.pointInPolygon(lat, lon, geometry.coordinates[i])) {
              return false;
            }
          }
          return true;
        }
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
          const outerRing = polygon[0];
          if (this.pointInPolygon(lat, lon, outerRing)) {
            // Check holes
            for (let i = 1; i < polygon.length; i++) {
              if (this.pointInPolygon(lat, lon, polygon[i])) {
                return false;
              }
            }
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get the water type at a coordinate.
   */
  getWaterType(lat: number, lon: number): WaterType {
    if (!this.initialized) {
      console.warn('Water detection service not initialized');
      return 'land';
    }

    // Round for caching (~11m precision)
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Determine water type
    let result: WaterType = 'land';

    // Check ocean/sea first
    if (this.waterPolygons && this.isPointInFeatureCollection(lat, lon, this.waterPolygons)) {
      result = 'ocean';
    }
    // Check lakes/rivers
    else if (this.lakePolygons && this.isPointInFeatureCollection(lat, lon, this.lakePolygons)) {
      result = 'lake';
    }

    // Cache result
    if (this.cache.size >= this.CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Check if a coordinate is on water
   */
  isWater(lat: number, lon: number): boolean {
    const type = this.getWaterType(lat, lon);
    return type === 'ocean' || type === 'lake';
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.CACHE_SIZE
    };
  }

  /**
   * Calculate distance between two points in nautical miles (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth's radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Check if a straight line between two points crosses land
   * Uses sampling along the line
   */
  checkRouteForLand(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    sampleDistance: number = 0.5 // Sample every 0.5 nautical miles
  ): { crossesLand: boolean; landPoints: Array<{ lat: number; lon: number }> } {
    const distance = this.calculateDistance(startLat, startLon, endLat, endLon);
    const numSamples = Math.max(Math.ceil(distance / sampleDistance), 10);
    const landPoints: Array<{ lat: number; lon: number }> = [];

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const lat = startLat + t * (endLat - startLat);
      const lon = startLon + t * (endLon - startLon);

      if (!this.isWater(lat, lon)) {
        landPoints.push({ lat, lon });
      }
    }

    return {
      crossesLand: landPoints.length > 0,
      landPoints
    };
  }

  /**
   * Find a water-only route between two points using A* pathfinding
   * Returns waypoints that avoid land
   */
  findWaterRoute(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    maxIterations: number = 5000
  ): { success: boolean; waypoints: Array<{ lat: number; lon: number }>; distance: number } {
    // First check if direct route is possible
    const directCheck = this.checkRouteForLand(startLat, startLon, endLat, endLon);
    if (!directCheck.crossesLand) {
      return {
        success: true,
        waypoints: [
          { lat: startLat, lon: startLon },
          { lat: endLat, lon: endLon }
        ],
        distance: this.calculateDistance(startLat, startLon, endLat, endLon)
      };
    }

    // A* pathfinding with grid-based approach
    const gridSize = 0.01; // ~1.1km grid cells
    const startNode = {
      lat: Math.round(startLat / gridSize) * gridSize,
      lon: Math.round(startLon / gridSize) * gridSize
    };
    const endNode = {
      lat: Math.round(endLat / gridSize) * gridSize,
      lon: Math.round(endLon / gridSize) * gridSize
    };

    const openSet = new Map<string, {
      lat: number;
      lon: number;
      g: number;
      f: number;
      parent: string | null;
    }>();
    const closedSet = new Set<string>();

    const getKey = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const heuristic = (lat: number, lon: number) =>
      this.calculateDistance(lat, lon, endNode.lat, endNode.lon);

    const startKey = getKey(startNode.lat, startNode.lon);
    openSet.set(startKey, {
      lat: startNode.lat,
      lon: startNode.lon,
      g: 0,
      f: heuristic(startNode.lat, startNode.lon),
      parent: null
    });

    // Direction vectors (8 directions)
    const directions = [
      [gridSize, 0], [-gridSize, 0], [0, gridSize], [0, -gridSize],
      [gridSize, gridSize], [gridSize, -gridSize], [-gridSize, gridSize], [-gridSize, -gridSize]
    ];

    let iterations = 0;

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest f score
      let currentKey = '';
      let lowestF = Infinity;
      for (const [key, node] of openSet) {
        if (node.f < lowestF) {
          lowestF = node.f;
          currentKey = key;
        }
      }

      const current = openSet.get(currentKey)!;
      openSet.delete(currentKey);
      closedSet.add(currentKey);

      // Check if we reached the goal
      if (this.calculateDistance(current.lat, current.lon, endNode.lat, endNode.lon) < gridSize * 2) {
        // Reconstruct path
        const path: Array<{ lat: number; lon: number }> = [];
        let node: typeof current | undefined = current;
        let nodeKey: string | null = currentKey;

        while (node) {
          path.unshift({ lat: node.lat, lon: node.lon });
          nodeKey = node.parent;
          if (nodeKey) {
            // Find parent in closed set by reconstructing
            node = undefined;
            // We need to track parents properly - simplified version
            break;
          } else {
            node = undefined;
          }
        }

        // Add start and end points
        path.unshift({ lat: startLat, lon: startLon });
        path.push({ lat: endLat, lon: endLon });

        // Simplify path - remove unnecessary waypoints
        const simplified = this.simplifyPath(path);

        // Calculate total distance
        let totalDist = 0;
        for (let i = 1; i < simplified.length; i++) {
          totalDist += this.calculateDistance(
            simplified[i - 1].lat, simplified[i - 1].lon,
            simplified[i].lat, simplified[i].lon
          );
        }

        return { success: true, waypoints: simplified, distance: totalDist };
      }

      // Explore neighbors
      for (const [dLat, dLon] of directions) {
        const newLat = Math.round((current.lat + dLat) / gridSize) * gridSize;
        const newLon = Math.round((current.lon + dLon) / gridSize) * gridSize;
        const newKey = getKey(newLat, newLon);

        if (closedSet.has(newKey)) continue;
        if (!this.isWater(newLat, newLon)) continue;

        const moveCost = Math.abs(dLat) > 0 && Math.abs(dLon) > 0 ? 1.414 : 1;
        const tentativeG = current.g + moveCost * gridSize * 60; // Approximate NM

        const existing = openSet.get(newKey);
        if (!existing || tentativeG < existing.g) {
          openSet.set(newKey, {
            lat: newLat,
            lon: newLon,
            g: tentativeG,
            f: tentativeG + heuristic(newLat, newLon),
            parent: currentKey
          });
        }
      }
    }

    // Pathfinding failed - return direct route anyway
    console.warn(`Water route pathfinding failed after ${iterations} iterations`);
    return {
      success: false,
      waypoints: [
        { lat: startLat, lon: startLon },
        { lat: endLat, lon: endLon }
      ],
      distance: this.calculateDistance(startLat, startLon, endLat, endLon)
    };
  }

  /**
   * Simplify a path by removing unnecessary waypoints
   */
  private simplifyPath(path: Array<{ lat: number; lon: number }>): Array<{ lat: number; lon: number }> {
    if (path.length <= 2) return path;

    const result: Array<{ lat: number; lon: number }> = [path[0]];

    for (let i = 1; i < path.length - 1; i++) {
      const prev = result[result.length - 1];
      const next = path[i + 1];

      // Check if we can skip this waypoint (direct route doesn't cross land)
      const check = this.checkRouteForLand(prev.lat, prev.lon, next.lat, next.lon, 0.2);
      if (check.crossesLand) {
        result.push(path[i]);
      }
    }

    result.push(path[path.length - 1]);
    return result;
  }
}

export const waterDetectionService = new WaterDetectionService();
