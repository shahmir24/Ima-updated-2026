import { createContext, useContext } from 'react';
import type { FocusPhase, FocusSetting, FocusTimerConfig, FocusTimerState } from '@/lib/focus/focus-timer-state';

export interface FocusTimerValue {
  /** The full stored state (a fresh default before anything is stored). */
  state: FocusTimerState;
  /** Whole seconds left in the current phase. */
  timeLeft: number;
  isPlaying: boolean;
  phase: FocusPhase;
  flowsCompleted: number;
  config: FocusTimerConfig;
  /** A session has started and not yet ended (running, paused or between phases). */
  inProgress: boolean;
  /** The task the running session was started for. */
  sessionTaskId: string | null;
  play(taskId?: string | null): void;
  pause(): void;
  reset(): void;
  changeSetting(setting: FocusSetting, value: number): void;
  /** Applies saved settings to a timer with no session. */
  seed(config: FocusTimerConfig): void;
}

export const FocusTimerContext = createContext<FocusTimerValue | null>(null);

export function useFocusTimer(): FocusTimerValue {
  const value = useContext(FocusTimerContext);
  if (!value) throw new Error('useFocusTimer must be used within a <FocusTimerProvider>');
  return value;
}

/**
 * Whether a Focus session is in progress anywhere in the app. Its own context
 * so readers (the gentle nudge) re-render when that changes, not every second.
 * False outside a provider.
 */
export const FocusSessionActiveContext = createContext(false);

export const useFocusSessionActive = (): boolean => useContext(FocusSessionActiveContext);
