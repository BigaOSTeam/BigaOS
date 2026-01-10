/**
 * Connectivity Service
 *
 * Monitors internet connectivity and broadcasts status changes via WebSocket.
 * Used by other services (like tile serving) to check if we're online.
 */

import * as dns from 'dns';
import { wsServerInstance } from '../websocket/websocket-server';

class ConnectivityService {
  private isOnline: boolean = true;
  private lastCheck: number = 0;
  private readonly CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  private readonly TIMEOUT_MS = 2000;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start background connectivity monitoring
   */
  private startMonitoring(): void {
    // Initial check
    this.checkConnectivity();

    // Then check every 5 seconds
    setInterval(() => {
      this.checkConnectivity();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Check internet connectivity using DNS lookup
   * Broadcasts changes to all WebSocket clients
   */
  private checkConnectivity(): void {
    const previousOnline = this.isOnline;

    const timeout = setTimeout(() => {
      if (this.isOnline !== false) {
        this.isOnline = false;
        this.lastCheck = Date.now();
        this.broadcastChange(false);
      }
    }, this.TIMEOUT_MS);

    dns.lookup('tile.openstreetmap.org', (err) => {
      clearTimeout(timeout);
      const nowOnline = !err;
      this.lastCheck = Date.now();

      // Only broadcast if state changed
      if (previousOnline !== nowOnline) {
        this.isOnline = nowOnline;
        this.broadcastChange(nowOnline);
      }
    });
  }

  /**
   * Broadcast connectivity change to all WebSocket clients
   */
  private broadcastChange(online: boolean): void {
    if (wsServerInstance) {
      console.log(`📡 Connectivity changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
      wsServerInstance.broadcastConnectivityChange(online);
    }
  }

  /**
   * Get current online status (synchronous)
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Get full status info
   */
  getStatus(): { online: boolean; lastCheck: number } {
    return {
      online: this.isOnline,
      lastCheck: this.lastCheck,
    };
  }
}

// Export singleton instance
export const connectivityService = new ConnectivityService();
