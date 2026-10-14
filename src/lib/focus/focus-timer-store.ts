/**
 * Where the Focus Timer state lives between renders, pages, refreshes, tabs
 * and visits.
 *
 *   * Signed in: localStorage, one key per account. It survives closing the
 *     browser and is shared by every tab, which is what lets the timer stay
 *     logically active while iMA is not open at all.
 *   * Guest Mode: sessionStorage, like every other piece of guest data —
 *     it survives navigation and refresh, and is gone when the tab closes.
 *
 * Every change is a read-modify-write of the FRESH stored value, under a
 * cross-tab lock where available, so a tab holding an old copy can never
 * overwrite a newer state with it. Snapshots are cached by their raw string,
 * which keeps them stable for useSyncExternalStore and makes another tab's
 * write show up here as soon as its `storage` event arrives.
 */
import { parseFocusTimerState, type FocusTimerEvent, type FocusTimerState, type FocusTimerTransition } from './focus-timer-state';
import { withBrowserLock, type StorageLike } from './browser-storage';

export const FOCUS_TIMER_STORAGE_PREFIX = 'ima.focus.v1.timer';
export const GUEST_FOCUS_OWNER = 'guest';

export const focusTimerStorageKey = (owner: string) => `${FOCUS_TIMER_STORAGE_PREFIX}.${owner}`;

export interface FocusTimerStore {
  readonly key: string;
  /** The current stored state, or null. Stable between changes. */
  get(): FocusTimerState | null;
  subscribe(listener: () => void): () => void;
  /** Applies `fn` to the freshly read state and stores the result. Resolves with the events it produced. */
  mutate(fn: (state: FocusTimerState | null, now: number) => FocusTimerTransition | null): Promise<FocusTimerEvent[]>;
  /** Re-reads storage and notifies if another tab changed it. */
  refresh(): void;
}

export interface FocusTimerStoreOptions {
  storage: StorageLike;
  key: string;
  now?: () => number;
  lock?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
}

export function createFocusTimerStore(options: FocusTimerStoreOptions): FocusTimerStore {
  const { storage, key } = options;
  const now = options.now ?? Date.now;
  const lock = options.lock ?? withBrowserLock;
  const listeners = new Set<() => void>();

  let cachedRaw: string | null | undefined;
  let cached: FocusTimerState | null = null;

  const read = (): FocusTimerState | null => {
    const raw = storage.getItem(key);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    try {
      cached = raw ? parseFocusTimerState(JSON.parse(raw)) : null;
    } catch {
      cached = null;
    }
    return cached;
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    key,
    get: read,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh() {
      const before = cached;
      if (read() !== before) notify();
    },
    async mutate(fn) {
      return lock(`${key}:lock`, () => {
        const current = read();
        const result = fn(current, now());
        if (!result || result.state === current) return result?.events ?? [];
        storage.setItem(key, JSON.stringify(result.state));
        read();
        notify();
        return result.events;
      });
    }
  };
}
