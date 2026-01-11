import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private serverReachable: boolean = true;

  connect() {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(WS_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying forever
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000, // Initial connection timeout
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
  }

  private setServerReachable(reachable: boolean) {
    if (this.serverReachable !== reachable) {
      this.serverReachable = reachable;
      // Emit a custom event for UI components to listen to
      const listeners = this.listeners.get('server_reachability');
      if (listeners) {
        listeners.forEach(callback => callback({ reachable, timestamp: new Date() }));
      }
    }
  }

  isServerReachable(): boolean {
    return this.serverReachable;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
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
