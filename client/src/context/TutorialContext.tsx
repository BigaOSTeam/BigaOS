import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useClientSettings, useClientSetting } from './ClientSettingsContext';

interface TutorialContextValue {
  isOpen: boolean;
  /** Force-open the tutorial — used by the "Replay" link in Help. */
  open: () => void;
  /**
   * Close the tutorial. Pass `completed: true` when the user finished or
   * skipped (both are equivalent — the user has seen the tour and shouldn't
   * be auto-shown it again).
   */
  close: (completed: boolean) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

interface TutorialProviderProps {
  children: ReactNode;
}

/**
 * Owns the open/closed state of the first-run tutorial overlay. Auto-opens
 * once when the client is brand new (no `tutorialCompleted` flag in client
 * settings) and the settings have loaded from the server. Persistence lives
 * in `tutorialCompleted` per-client setting so it stays attached to the
 * client identity, not to a particular device.
 */
export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const { loaded } = useClientSettings();
  const [completed, setCompleted] = useClientSetting<boolean>('tutorialCompleted', false);
  const [isOpen, setIsOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Auto-open once after settings finish loading. We guard with a ref so a
  // later `setCompleted(false)` can't accidentally re-trigger the auto-open
  // mid-session (the user can still hit Replay manually).
  useEffect(() => {
    if (!loaded || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (!completed) setIsOpen(true);
  }, [loaded, completed]);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(
    (markCompleted: boolean) => {
      setIsOpen(false);
      if (markCompleted && !completed) {
        setCompleted(true);
      }
    },
    [completed, setCompleted],
  );

  const value = useMemo<TutorialContextValue>(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
};

export const useTutorial = (): TutorialContextValue => {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return ctx;
};
