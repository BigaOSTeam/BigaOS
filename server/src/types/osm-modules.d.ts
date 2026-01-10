declare module 'tiny-osmpbf' {
  interface OSMData {
    elements: Array<{
      type: string;
      id: number;
      tags?: Record<string, string>;
      nodes?: number[];
      members?: Array<{
        type: string;
        ref: number;
        role: string;
      }>;
      lat?: number;
      lon?: number;
    }>;
  }

  export function parse(buffer: Buffer | ArrayBuffer): OSMData;
}

declare module 'osmtogeojson' {
  interface GeoJSONFeatureCollection {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: {
        type: string;
        coordinates: unknown;
      };
    }>;
  }

  function osmtogeojson(data: unknown): GeoJSONFeatureCollection;
  export = osmtogeojson;
}

declare module 'shapefile' {
  interface Feature {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }

  interface Source {
    read(): Promise<{ done: boolean; value?: Feature }>;
  }

  export function open(shpPath: string, dbfPath?: string): Promise<Source>;
}
