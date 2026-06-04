/**
 * Data Files Controller
 *
 * Registers every downloadable data pack and reloads the right service after a
 * pack is downloaded or deleted. Packs fall into two categories, surfaced as
 * separate groups in the Settings → Downloads tab:
 *   - 'navigation' — OSM Water Layer (feeds water detection + routing).
 *   - 'depth'      — EMODnet / GEBCO bathymetry packs (feed depth contours).
 *
 * Bound to the `/data/*` routes; extends the generic DataManagementController
 * with download → extract → reload wiring. (Export name kept as
 * `navigationDataController` for route compatibility.)
 */

import { Request, Response } from 'express';
import * as path from 'path';
import { DataManagementController, DataFileConfig } from './data-management.controller';
import { waterDetectionService } from '../services/water-detection.service';
import { routeWorkerService } from '../services/route-worker.service';
import { depthTileService } from '../services/depth-tile.service';
import { depthContourService } from '../services/depth-contour.service';

// OSM Water Layer — oceans, lakes, rivers (90 m). Drives water detection + routing.
const NAVIGATION_DATA_FILES: DataFileConfig[] = [
  {
    id: 'navigation-data',
    name: 'Navigation Data',
    description: 'OSM Water Layer - oceans, lakes, rivers (90m resolution)',
    category: 'navigation',
    defaultUrl: 'https://github.com/BigaOSTeam/BigaOS-data/releases/download/navigation-data-v2.0/OSM_WaterLayer_tif.tar.gz',
    localPath: 'navigation-data'
  }
];

// Bathymetry depth packs. Each extracts into its own subdir under depth-data/;
// the depth-tile service scans that tree recursively, so packs coexist and
// download/delete is independent. EMODnet (~115 m) for European seas, GEBCO
// (~450 m) global fallback. More regions are added here as they are published.
const DEPTH_REL = 'https://github.com/BigaOSTeam/BigaOS-data/releases/download/depth-data-v1';
const DEPTH_DATA_FILES: DataFileConfig[] = [
  // High-resolution EMODnet packs (European seas, ~115 m).
  {
    id: 'depth-emodnet-baltic',
    name: 'Baltic Sea',
    description: 'EMODnet bathymetry — Baltic Sea (~115 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-emodnet-baltic.tar.gz`,
    localPath: 'depth-data/emodnet-baltic'
  },
  {
    id: 'depth-emodnet-north-sea',
    name: 'North Sea & British Isles',
    description: 'EMODnet bathymetry — North Sea, Channel, British Isles, southern Norway (~115 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-emodnet-north-sea.tar.gz`,
    localPath: 'depth-data/emodnet-north-sea'
  },
  {
    id: 'depth-emodnet-iberia',
    name: 'Iberia & Biscay',
    description: 'EMODnet bathymetry — Bay of Biscay, Iberian coast, Gulf of Cádiz (~115 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-emodnet-iberia.tar.gz`,
    localPath: 'depth-data/emodnet-iberia'
  },
  {
    id: 'depth-emodnet-mediterranean',
    name: 'Mediterranean Sea',
    description: 'EMODnet bathymetry — entire Mediterranean (~115 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-emodnet-mediterranean.tar.gz`,
    localPath: 'depth-data/emodnet-mediterranean'
  },
  {
    id: 'depth-emodnet-black-sea',
    name: 'Black Sea',
    description: 'EMODnet bathymetry — Black Sea & Sea of Azov (~115 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-emodnet-black-sea.tar.gz`,
    localPath: 'depth-data/emodnet-black-sea'
  },
  // GEBCO global fallback packs (~450 m), split into longitude-band regions so
  // each stays well under GitHub's 2 GiB asset limit. Download only the regions
  // you cruise; finer EMODnet packs take priority where both are installed.
  {
    id: 'depth-gebco-europe-africa',
    name: 'GEBCO — Europe & Africa',
    description: 'GEBCO global bathymetry, 30°W–60°E (~450 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-gebco-europe-africa.tar.gz`,
    localPath: 'depth-data/gebco-europe-africa'
  },
  {
    id: 'depth-gebco-americas-atlantic',
    name: 'GEBCO — Americas (Atlantic)',
    description: 'GEBCO global bathymetry, 100°W–30°W (~450 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-gebco-americas-atlantic.tar.gz`,
    localPath: 'depth-data/gebco-americas-atlantic'
  },
  {
    id: 'depth-gebco-americas-pacific',
    name: 'GEBCO — Americas (Pacific)',
    description: 'GEBCO global bathymetry, 180°W–100°W (~450 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-gebco-americas-pacific.tar.gz`,
    localPath: 'depth-data/gebco-americas-pacific'
  },
  {
    id: 'depth-gebco-asia-oceania',
    name: 'GEBCO — Asia & Oceania',
    description: 'GEBCO global bathymetry, 60°E–180°E (~450 m)',
    category: 'depth',
    defaultUrl: `${DEPTH_REL}/depth-gebco-asia-oceania.tar.gz`,
    localPath: 'depth-data/gebco-asia-oceania'
  }
];

const ALL_DATA_FILES: DataFileConfig[] = [...NAVIGATION_DATA_FILES, ...DEPTH_DATA_FILES];

class NavigationDataController extends DataManagementController {
  constructor() {
    const dataDir = path.join(__dirname, '..', 'data');
    super(dataDir, ALL_DATA_FILES);
  }

  /** Reload whichever services a category's data feeds. */
  private async reloadForCategory(category: string | undefined): Promise<void> {
    if (category === 'navigation') {
      console.log('Navigation data changed, reloading water detection + route worker...');
      await waterDetectionService.reload();
      await routeWorkerService.reinitialize();
    } else if (category === 'depth') {
      console.log('Depth data changed, reloading depth tiles + clearing contour cache...');
      await depthTileService.reload();
      depthContourService.clearCache();
    }
  }

  /** Hook after a successful download: reindex the relevant service. */
  protected async onFileDownloaded(fileId: string): Promise<void> {
    const cfg = ALL_DATA_FILES.find((f) => f.id === fileId);
    await this.reloadForCategory(cfg?.category);
  }

  /** Also reindex after a delete, so a removed pack stops being served at once. */
  async deleteFile(req: Request, res: Response): Promise<void> {
    const fileId = req.params.fileId;
    await super.deleteFile(req, res);
    const cfg = ALL_DATA_FILES.find((f) => f.id === fileId);
    await this.reloadForCategory(cfg?.category).catch((err) =>
      console.error('Post-delete reload failed:', err)
    );
  }
}

export const navigationDataController = new NavigationDataController();
