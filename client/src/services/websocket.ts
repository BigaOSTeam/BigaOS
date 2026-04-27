import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../utils/urls';

// Hide the "server unreachable" banner during transient disconnects (tab
// throttled in background, brief network blip, Socket.IO transport upgrade).
// A real outage will exceed this window and surface normally.
const UNREACHABLE_DEBOUNCE_MS = 4000;

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private serverReachable: boolean = true;
  private unreachableTimer: ReturnType<typeof setTimeout> | null = null;
  private visibilityHandler: (() => void) | null = null;

  connect(clientId?: string) {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(WS_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying forever
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000, // Initial connection timeout
      auth: clientId ? { clientId } : undefined,
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      this.setServerReachable(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.setServerReachable(false);
    });

    this.socket.on('connect_error', (error) => {
      console.log('🔌 WebSocket connection error:', error.message);
      this.setServerReachable(false);
    });

    // Socket.IO's reconnect events
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔌 Reconnection attempt:', attemptNumber);
    });

    this.socket.on('reconnect', () => {
      console.log('🔌 Reconnected to server');
      this.setServerReachable(true);
    });

    this.socket.on('reconnect_failed', () => {
      console.log('🔌 Reconnection failed');
      this.setServerReachable(false);
    });

    // Forward all events to listeners
    this.socket.onAny((eventName, ...args) => {
      const listeners = this.listeners.get(eventName);
      if (listeners) {
        listeners.forEach(callback => callback(...args));
      }
    });

    // When the tab becomes visible again, kick the socket so it reconnects
    // immediately instead of waiting on the next backoff tick.
    if (typeof document !== 'undefined' && !this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && this.socket && !this.socket.connected) {
          this.socket.connect();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private setServerReachable(reachable: boolean) {
    if (reachable) {
      // Clear any pending "unreachable" notification — we recovered before the
      // debounce window elapsed, so the user never needed to see a banner.
      if (this.unreachableTimer) {
        clearTimeout(this.unreachableTimer);
        this.unreachableTimer = null;
      }
      if (this.serverReachable !== true) {
        this.serverReachable = true;
        this.notifyReachability(true);
      }
      return;
    }

    // Already known unreachable, or already pending — nothing to do.
    if (!this.serverReachable || this.unreachableTimer) return;

    this.unreachableTimer = setTimeout(() => {
      this.unreachableTimer = null;
      if (!this.socket?.connected) {
        this.serverReachable = false;
        this.notifyReachability(false);
      }
    }, UNREACHABLE_DEBOUNCE_MS);
  }

  private notifyReachability(reachable: boolean) {
    const listeners = this.listeners.get('server_reachability');
    if (listeners) {
      listeners.forEach(callback => callback({ reachable, timestamp: new Date() }));
    }
  }

  isServerReachable(): boolean {
    return this.serverReachable;
  }

  disconnect() {
    if (this.unreachableTimer) {
      clearTimeout(this.unreachableTimer);
      this.unreachableTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    // Drop accumulated subscribers — caller is responsible for re-registering
    // on the next connect(). This prevents handler accumulation across HMR
    // and any future reconnect-with-different-clientId flows.
    this.listeners.clear();
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  emit(event: string, data?: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  subscribe(paths: string[]) {
    this.emit('subscribe', { paths });
  }
}

export const wsService = new WebSocketService();
