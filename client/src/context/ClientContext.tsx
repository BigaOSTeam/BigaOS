import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { wsService } from '../services/websocket';

interface ClientContextType {
  clientId: string;
  clientName: string;
  clientType: string;
  setClientName: (name: string) => void;
}

const ClientContext = createContext<ClientContextType | null>(null);

interface ClientProviderProps {
  clientId: string;
  initialClientName?: string;
  initialClientType?: string;
  children: ReactNode;
}

export const ClientProvider: React.FC<ClientProviderProps> = ({
  clientId,
  initialClientName,
  initialClientType,
  children,
}) => {
  const [clientName, setClientNameState] = useState<string>(initialClientName || 'Unknown');
  const [clientType] = useState<string>(initialClientType || 'display');

  // Reflect remote name updates (e.g. another device renames this client).
  useEffect(() => {
    const handleClientUpdated = (data: { id: string; name?: string }) => {
      if (data.id === clientId && data.name) {
        setClientNameState(data.name);
      }
    };
    wsService.on('client_updated', handleClientUpdated);
    return () => { wsService.off('client_updated', handleClientUpdated); };
  }, [clientId]);

  const setClientName = useCallback((name: string) => {
    setClientNameState(name);
    wsService.emit('client_update_name', { id: clientId, name });
  }, [clientId]);

  return (
    <ClientContext.Provider value={{ clientId, clientName, clientType, setClientName }}>
      {children}
    </ClientContext.Provider>
  );
};

export const useClient = (): ClientContextType => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};
