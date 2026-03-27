/**
 * SwitchContext - Manages physical relay switch state
 *
 * Provides switch definitions synced from the server, and
 * actions to create/update/delete/toggle switches.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import type { SwitchDefinition, SwitchCreateInput, SwitchUpdateInput } from '../types/switches';

interface SwitchContextType {
  switches: SwitchDefinition[];
  loading: boolean;
  agentOnlineIds: Set<string>;
  createSwitch: (input: SwitchCreateInput) => void;
  updateSwitch: (id: string, updates: SwitchUpdateInput) => void;
  deleteSwitch: (id: string) => void;
  toggleSwitch: (switchId: string) => void;
  getSwitchById: (id: string) => SwitchDefinition | undefined;
  isClientOnline: (clientId: string) => boolean;
}

const SwitchContext = createContext<SwitchContextType | null>(null);

export const SwitchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [switches, setSwitches] = useState<SwitchDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentOnlineIds, setAgentOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Request initial data
    wsService.emit('get_switches');
    wsService.emit('get_clients');

    const handleSync = (data: { switches: SwitchDefinition[] }) => {
      setSwitches(data.switches || []);
      setLoading(false);
    };

    const handleStateUpdate = (data: { switchId: string; state: boolean; locked: boolean; error?: string }) => {
      setSwitches(prev => prev.map(sw =>
        sw.id === data.switchId
          ? { ...sw, state: data.state, locked: data.locked }
          : sw
      ));
    };

    const handleClientsSync = (data: { agentOnlineIds?: string[] }) => {
      setAgentOnlineIds(new Set(data.agentOnlineIds || []));
    };

    const handleClientsChanged = () => {
      wsService.emit('get_clients');
    };

    wsService.on('switches_sync', handleSync);
    wsService.on('switch_state_update', handleStateUpdate);
    wsService.on('clients_sync', handleClientsSync);
    wsService.on('clients_changed', handleClientsChanged);

    return () => {
      wsService.off('switches_sync', handleSync);
      wsService.off('switch_state_update', handleStateUpdate);
      wsService.off('clients_sync', handleClientsSync);
      wsService.off('clients_changed', handleClientsChanged);
    };
  }, []);

  const createSwitch = useCallback((input: SwitchCreateInput) => {
    wsService.emit('switch_create', input);
  }, []);

  const updateSwitch = useCallback((id: string, updates: SwitchUpdateInput) => {
    wsService.emit('switch_update', { id, ...updates });
  }, []);

  const deleteSwitch = useCallback((id: string) => {
    wsService.emit('switch_delete', { id });
  }, []);

  const toggleSwitch = useCallback((switchId: string) => {
    wsService.emit('switch_toggle', { switchId });
  }, []);

  const getSwitchById = useCallback((id: string) => {
    return switches.find(sw => sw.id === id);
  }, [switches]);

  const isClientOnline = useCallback((clientId: string) => {
    return agentOnlineIds.has(clientId);
  }, [agentOnlineIds]);

  return (
    <SwitchContext.Provider value={{
      switches,
      loading,
      agentOnlineIds,
      createSwitch,
      updateSwitch,
      deleteSwitch,
      toggleSwitch,
      getSwitchById,
      isClientOnline,
    }}>
      {children}
    </SwitchContext.Provider>
  );
};

export const useSwitches = (): SwitchContextType => {
  const context = useContext(SwitchContext);
  if (!context) {
    throw new Error('useSwitches must be used within a SwitchProvider');
  }
  return context;
};
