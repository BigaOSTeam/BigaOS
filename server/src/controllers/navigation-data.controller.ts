/**
 * Navigation Data Controller
 *
 * Handles navigation-specific data file management (water detection data, etc.)
 * Extends the generic DataManagementController with navigation-specific logic.
 */

import * as path from 'path';
import { DataManagementController, DataFileConfig } from './data-management.controller';
import { waterDetectionService } from '../services/water-detection.service';
import { routeWorkerService } from '../services/route-worker.service';

// Navigation data file configurations
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

/**
 * Navigation Data Controller
 * Manages navigation-specific data files and integrates with navigation services.
 */
class NavigationDataController extends DataManagementController {
  constructor() {
    const dataDir = path.join(__dirname, '..', 'data');
    super(dataDir, NAVIGATION_DATA_FILES);
  }

  /**
   * Hook called after navigation data is downloaded
   * Reloads the water detection service and route worker
   */
  protected async onFileDownloaded(fileId: string): Promise<void> {
    if (fileId === 'navigation-data') {
      console.log('Navigation data downloaded, reloading water detection service...');
      await waterDetectionService.reload();
      // Also reinitialize route worker if needed
      await routeWorkerService.reinitialize();
    }
  }
}

export const navigationDataController = new NavigationDataController();
