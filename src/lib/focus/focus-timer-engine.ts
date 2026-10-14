/**
 * The app-wide Focus Timer, without React: one store, the actions the Focus
 * screen offers, and — for a signed-in account — the outbox that records the
 * session. FocusTimerProvider wraps this and adds the browser wiring (a
 * display tick, visibility and online events).
 *
 * Deliberately absent: any "abandon on unmount / pagehide / beforeunload".
 * Leaving the page, switching apps, backgrounding, refreshing or closing the
 * browser must never end a session. dispose() only stops listening.
 */
import {
  changeFocusTimerSetting,
  createFocusTimerState,
  FALLBACK_FOCUS_CONFIG,
  needsReconcile,
  pauseFocusTimer,
  playFocusTimer,
  reconcileFocusTimer,
  resetFocusTimer,
  seedFocusTimer,
  type FocusSetting,
  type FocusTimerConfig,
  type FocusTimerEvent,
  type FocusTimerState,
  type FocusTimerTransition
} from './focus-timer-state';
import type { FocusTimerStore } from './focus-timer-store';
import type { FocusOutbox, FocusSessionOp } from './focus-session-outbox';

export interface FocusTimerEngine {
  readonly store: FocusTimerStore;
  /** The stored state, or a fresh default one (not yet stored) when there is none. */
  state(): FocusTimerState;
  play(taskId?: string | null): Promise<void>;
  pause(): Promise<void>;
  reset(): Promise<void>;
  changeSetting(setting: FocusSetting, value: number): Promise<void>;
  seed(config: FocusTimerConfig): Promise<void>;
  /** Applies whatever time has done since the state was stored: a boundary, an idle timeout. */
  reconcile(): Promise<void>;
  /** Sends any recording still waiting (signed in only). */
  flush(): Promise<void>;
}

export interface FocusTimerEngineOptions {
  store: FocusTimerStore;
  /** Null in Guest Mode: guest sessions are never recorded. */
  outbox: FocusOutbox | null;
  now?: () => number;
  newSessionId?: () => string;
  /** Called after a session's ending has been accepted by Supabase. */
  onRecorded?: (ops: FocusSessionOp[]) => void;
}

/** A v4 UUID — focus_sessions.id is a uuid. randomUUID needs a secure context, so fall back to getRandomValues. */
export function newUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const randomId = newUuid;

export function createFocusTimerEngine(options: FocusTimerEngineOptions): FocusTimerEngine {
  const { store, outbox, onRecorded } = options;
  const now = options.now ?? Date.now;
  const newSessionId = options.newSessionId ?? randomId;

  let fallback: FocusTimerState | null = null;
  const current = (): FocusTimerState => {
    const stored = store.get();
    if (stored) return stored;
    fallback ??= createFocusTimerState(FALLBACK_FOCUS_CONFIG, now());
    return fallback;
  };

  const flush = async () => {
    if (!outbox) return;
    const accepted = await outbox.flush();
    if (accepted.length > 0) onRecorded?.(accepted);
  };

  const record = (events: FocusTimerEvent[]) => {
    if (!outbox || events.length === 0) return;
    outbox.enqueue(events);
    void flush();
  };

  const apply = async (fn: (state: FocusTimerState, at: number) => FocusTimerTransition) => {
    const events = await store.mutate((stored, at) => fn(stored ?? createFocusTimerState(FALLBACK_FOCUS_CONFIG, at), at));
    record(events);
  };

  return {
    store,
    state: current,
    play: (taskId) => apply((state, at) => playFocusTimer(state, at, { newSessionId, taskId })),
    pause: () => apply((state, at) => pauseFocusTimer(state, at)),
    reset: () => apply((state, at) => resetFocusTimer(state, at)),
    changeSetting: (setting, value) => apply((state, at) => changeFocusTimerSetting(state, at, setting, value)),
    async seed(config) {
      const events = await store.mutate((stored, at) => seedFocusTimer(stored, config, at));
      record(events);
    },
    async reconcile() {
      const stored = store.get();
      if (!stored || !needsReconcile(stored, now())) return;
      const events = await store.mutate((fresh, at) => (fresh && needsReconcile(fresh, at) ? reconcileFocusTimer(fresh, at) : null));
      record(events);
    },
    flush
  };
}
