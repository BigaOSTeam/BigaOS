/**
 * ButtonContext - Manages physical GPIO input button definitions.
 *
 * Mirrors SwitchContext. Buttons are stateless triggers (no on/off state),
 * so this context only handles definitions and CRUD.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import type {
  ButtonDefinition,
  ButtonCreateInput,
  ButtonUpdateInput,
  ButtonAction,
  ButtonOverlayEdge,
} from '../types/buttons';

/**
 * Preview state for a button currently being edited or created in the dialog.
 * The overlay merges this on top of the synced buttons list so position changes
 * (and edge/name/action toggles) appear live without saving to the server.
 */
export interface ButtonPreview {
  id?: string;             // existing button id, or undefined when creating
  sourceClientId: string;
  name: string;
  action: ButtonAction;
  overlayEnabled: boolean;
  overlayEdge: ButtonOverlayEdge;
  overlayPercent: number;
}

interface ButtonContextType {
  buttons: ButtonDefinition[];
  loading: boolean;
  preview: ButtonPreview | null;
  createButton: (input: ButtonCreateInput) => void;
  updateButton: (id: string, updates: ButtonUpdateInput) => void;
  deleteButton: (id: string) => void;
  getButtonById: (id: string) => ButtonDefinition | undefined;
  setPreview: (preview: ButtonPreview | null) => void;
}

const ButtonContext = createContext<ButtonContextType | null>(null);

export const ButtonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [buttons, setButtons] = useState<ButtonDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<ButtonPreview | null>(null);

  useEffect(() => {
    wsService.emit('get_buttons');

    const handleSync = (data: { buttons: ButtonDefinition[] }) => {
      setButtons(data.buttons || []);
      setLoading(false);
    };

    wsService.on('buttons_sync', handleSync);
    return () => {
      wsService.off('buttons_sync', handleSync);
    };
  }, []);

  const createButton = useCallback((input: ButtonCreateInput) => {
    wsService.emit('button_create', input);
  }, []);

  const updateButton = useCallback((id: string, updates: ButtonUpdateInput) => {
    wsService.emit('button_update', { id, ...updates });
  }, []);

  const deleteButton = useCallback((id: string) => {
    wsService.emit('button_delete', { id });
  }, []);

  const getButtonById = useCallback((id: string) => buttons.find(b => b.id === id), [buttons]);

  return (
    <ButtonContext.Provider value={{
      buttons,
      loading,
      preview,
      createButton,
      updateButton,
      deleteButton,
      getButtonById,
      setPreview,
    }}>
      {children}
    </ButtonContext.Provider>
  );
};

export const useButtons = (): ButtonContextType => {
  const context = useContext(ButtonContext);
  if (!context) {
    throw new Error('useButtons must be used within a ButtonProvider');
  }
  return context;
};
