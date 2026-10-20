import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './auth-context';
import { FocusSessionActiveContext, FocusTimerContext, type FocusTimerValue } from './focus-timer-context';
import { focusStatsKey } from '@/hooks/use-focus-stats';
import { toast } from '@/hooks/use-toast';
import { createChimePlayer } from '@/lib/focus/completion-chime';
import { createCompletionFeedback } from '@/lib/focus/completion-feedback';
import { browserStorage, resilientStorage } from '@/lib/focus/browser-storage';
import { createSupabaseFocusSessionApi } from '@/lib/focus/focus-session-api';
import { createFocusOutbox } from '@/lib/focus/focus-session-outbox';
import { createFocusTimerEngine, type FocusTimerEngine } from '@/lib/focus/focus-timer-engine';
import {
  createFocusTimerState,
  FALLBACK_FOCUS_CONFIG,
  isRunning,
  isSessionInProgress,
  needsReconcile,
  timeLeftSeconds
} from '@/lib/focus/focus-timer-state';
import { createFocusTimerStore, focusTimerStorageKey, GUEST_FOCUS_OWNER } from '@/lib/focus/focus-timer-store';

/** Display refresh while running. Only redraws; time itself comes from timestamps. */
const TICK_MS = 250;
/** While stopped mid-session, how often to check the idle timeout and retry recording. */
const IDLE_CHECK_MS = 60_000;
/**
 * A hidden tab waits this long past a boundary before reconciling it, so a
 * visible tab — where the message can be seen and the chime was unlocked by a
 * tap — is the one that announces it. Only when no tab is visible does a
 * hidden one take it. The boundary's own timestamp is recorded either way.
 */
const HIDDEN_RECONCILE_LAG_MS = 1500;
/** How long a completion message stays up. */
const COMPLETION_TOAST_MS = 6000;

const PLACEHOLDER_STATE = createFocusTimerState(FALLBACK_FOCUS_CONFIG, 0);
const noSubscription = () => () => {};
const noState = () => null;

/**
 * The one Focus Timer for the whole app.
 *
 * Mounted once in App.tsx, outside the routes, so the timer keeps its session
 * while the user moves around iMA; the Focus page is only a view of it. State
 * is stored per owner (the signed-in account, or the guest tab) — see
 * lib/focus/focus-timer-store.ts — and reconciled from timestamps whenever the
 * page becomes visible again, so backgrounding, other apps, a locked device or
 * a closed browser are all handled by arithmetic, not by a timer that kept
 * running.
 *
 * Unmounting does nothing to the session. There is no pagehide/beforeunload
 * handler on purpose: none of those events means the user gave up.
 */
export const FocusTimerProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const owner = loading ? null : (user?.id ?? GUEST_FOCUS_OWNER);

  // One chime player for the app's lifetime: its AudioContext is unlocked by a
  // Play tap and reused for every boundary after that.
  const chime = useMemo(() => createChimePlayer(), []);
  useEffect(() => () => chime.dispose(), [chime]);
  const feedback = useMemo(
    () =>
      createCompletionFeedback({
        notify: (message) => void toast({ title: message, duration: COMPLETION_TOAST_MS }),
        chime: (cue) => chime.play(cue)
      }),
    [chime]
  );

  const engine = useMemo<FocusTimerEngine | null>(() => {
    if (!owner) return null;
    const guest = owner === GUEST_FOCUS_OWNER;
    // Guest data stays in the tab, like every other piece of guest data.
    const storage = resilientStorage(browserStorage(guest ? 'sessionStorage' : 'localStorage'));
    const store = createFocusTimerStore({ storage, key: focusTimerStorageKey(owner) });
    const outbox = guest
      ? null
      : createFocusOutbox({ userId: owner, storage, api: createSupabaseFocusSessionApi(supabase) });
    return createFocusTimerEngine({
      store,
      outbox,
      onRecorded: (ops) => {
        if (ops.some((op) => op.kind === 'finish')) void queryClient.invalidateQueries({ queryKey: focusStatsKey(owner) });
      },
      onEvents: (events) => void feedback.handle(events)
    });
  }, [owner, queryClient, feedback]);

  const subscribe = useMemo(() => (engine ? engine.store.subscribe : noSubscription), [engine]);
  const getSnapshot = useMemo(() => (engine ? engine.store.get : noState), [engine]);
  const stored = useSyncExternalStore(subscribe, getSnapshot, noState);
  const state = stored ?? engine?.state() ?? PLACEHOLDER_STATE;

  const [now, setNow] = useState(() => Date.now());
  const running = isRunning(state);
  const inProgress = isSessionInProgress(stored);

  // Any change to the stored state is "now" for the display.
  useEffect(() => setNow(Date.now()), [stored]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running || !inProgress) return;
    const id = setInterval(() => setNow(Date.now()), IDLE_CHECK_MS);
    return () => clearInterval(id);
  }, [running, inProgress]);

  // A boundary or idle timeout that time has reached.
  useEffect(() => {
    if (!engine || !stored) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (needsReconcile(stored, hidden ? now - HIDDEN_RECONCILE_LAG_MS : now)) void engine.reconcile();
  }, [engine, stored, now]);

  // Coming back: from another app, another tab, a locked screen, the
  // back/forward cache, or offline. Reconcile at once and send anything queued.
  useEffect(() => {
    if (!engine) return;
    const wake = () => {
      engine.store.refresh();
      setNow(Date.now());
      void engine.reconcile();
      void engine.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') wake();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === engine.store.key) engine.store.refresh();
    };
    wake();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('storage', onStorage);
    };
  }, [engine]);

  const play = useCallback(
    (taskId?: string | null) => {
      // Synchronously, while still inside the user's tap: browsers only let
      // audio start from a gesture, and the chime has to be ready for later.
      chime.unlock();
      void engine?.play(taskId);
    },
    [engine, chime]
  );
  const pause = useCallback(() => void engine?.pause(), [engine]);
  const reset = useCallback(() => void engine?.reset(), [engine]);
  const changeSetting = useCallback<FocusTimerValue['changeSetting']>(
    (setting, value) => void engine?.changeSetting(setting, value),
    [engine]
  );
  const seed = useCallback<FocusTimerValue['seed']>((config) => void engine?.seed(config), [engine]);

  const timeLeft = timeLeftSeconds(state, now);
  const value = useMemo<FocusTimerValue>(
    () => ({
      state,
      timeLeft,
      isPlaying: isRunning(state),
      phase: state.phase,
      flowsCompleted: state.flowsCompleted,
      config: state.config,
      inProgress: isSessionInProgress(state),
      sessionTaskId: isSessionInProgress(state) ? state.taskId : null,
      play,
      pause,
      reset,
      changeSetting,
      seed
    }),
    [state, timeLeft, play, pause, reset, changeSetting, seed]
  );

  return (
    <FocusTimerContext.Provider value={value}>
      <FocusSessionActiveContext.Provider value={inProgress}>{children}</FocusSessionActiveContext.Provider>
    </FocusTimerContext.Provider>
  );
};

export default FocusTimerProvider;
