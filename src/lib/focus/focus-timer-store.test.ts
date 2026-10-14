import { describe, expect, it, vi } from 'vitest';
import { resilientStorage } from './browser-storage';
import { createFocusTimerState, playFocusTimer, reconcileFocusTimer, type FocusTimerConfig } from './focus-timer-state';
import { createFocusTimerStore, focusTimerStorageKey } from './focus-timer-store';
import { failingStorage, memoryStorage, noLock } from './test-helpers';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 9, 0, 0);
const CONFIG: FocusTimerConfig = { blockMinutes: 25, breakMinutes: 5, flows: 4 };
const KEY = focusTimerStorageKey('user-1');

const makeStore = (storage = memoryStorage(), now = () => T0) => createFocusTimerStore({ storage, key: KEY, now, lock: noLock });
const startSession = (s: ReturnType<typeof makeStore>) =>
  s.mutate((state, at) => playFocusTimer(state ?? createFocusTimerState(CONFIG, at), at, { newSessionId: () => 'session-1' }));

describe('focus timer store', () => {
  it('is empty until something is stored', () => {
    expect(makeStore().get()).toBeNull();
  });

  it('keeps one key per owner', () => {
    expect(focusTimerStorageKey('user-1')).not.toBe(focusTimerStorageKey('user-2'));
    expect(focusTimerStorageKey('guest')).toBe('ima.focus.v1.timer.guest');
  });

  it('a refresh (a new store on the same storage) restores the running session exactly', async () => {
    const storage = memoryStorage();
    await startSession(makeStore(storage));
    const afterRefresh = makeStore(storage, () => T0 + 10 * MIN).get();
    expect(afterRefresh?.sessionId).toBe('session-1');
    expect(afterRefresh?.phaseEndsAt).toBe(T0 + 25 * MIN);
  });

  it('returns the same object until the stored value changes (stable for useSyncExternalStore)', async () => {
    const store = makeStore();
    await startSession(store);
    expect(store.get()).toBe(store.get());
  });

  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const store = makeStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await startSession(store);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await store.mutate((state, at) => reconcileFocusTimer(state!, at + 30 * MIN));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a mutation that changes nothing writes nothing and notifies no one', async () => {
    const storage = memoryStorage();
    const store = makeStore(storage);
    await startSession(store);
    const listener = vi.fn();
    store.subscribe(listener);
    const events = await store.mutate((state) => ({ state: state!, events: [] }));
    expect(events).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('corrupt or old stored data falls back to a fresh timer instead of crashing', () => {
    expect(makeStore(memoryStorage({ [KEY]: '{not json' })).get()).toBeNull();
    expect(makeStore(memoryStorage({ [KEY]: JSON.stringify({ version: 0 }) })).get()).toBeNull();
  });

  it('keeps working in memory when storage refuses writes', async () => {
    const store = makeStore(resilientStorage(failingStorage()) as ReturnType<typeof memoryStorage>);
    await startSession(store);
    expect(store.get()?.sessionId).toBe('session-1');
  });

  describe('two tabs sharing storage', () => {
    it('a change in one tab is seen by the other on refresh (the storage event)', async () => {
      const storage = memoryStorage();
      const tabA = makeStore(storage);
      const tabB = makeStore(storage);
      expect(tabB.get()).toBeNull();
      const listener = vi.fn();
      tabB.subscribe(listener);
      await startSession(tabA);
      tabB.refresh();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(tabB.get()?.sessionId).toBe('session-1');
    });

    it('both tabs reaching the same boundary produce its events ONCE — each mutation reads fresh state', async () => {
      const storage = memoryStorage();
      const at = T0 + 25 * MIN;
      const tabA = makeStore(storage, () => at);
      const tabB = makeStore(storage, () => at);
      await startSession(makeStore(storage)); // started at T0, in a third tab
      tabA.get();
      tabB.get(); // both tabs hold the old running copy in memory

      const reconcileIfDue = (state: ReturnType<typeof tabA.get>, now: number) =>
        state && state.phaseEndsAt !== null && now >= state.phaseEndsAt ? reconcileFocusTimer(state, now) : null;
      const a = await tabA.mutate(reconcileIfDue);
      const b = await tabB.mutate(reconcileIfDue);
      expect(a.map((e) => e.type)).toEqual(['progress']);
      expect(b).toEqual([]);
      expect(tabB.get()?.phase).toBe('break');
    });

    it('a stale tab can never write its old copy over a newer state', async () => {
      const storage = memoryStorage();
      const tabA = makeStore(storage);
      const tabB = makeStore(storage);
      await startSession(tabA);
      const stale = tabB.get();
      await tabA.mutate((state, at) => reconcileFocusTimer(state!, at + 25 * MIN));
      // Tab B's mutation receives the FRESH state, not the copy it read earlier.
      await tabB.mutate((state) => {
        expect(state).not.toBe(stale);
        expect(state?.phase).toBe('break');
        return null;
      });
    });
  });
});
