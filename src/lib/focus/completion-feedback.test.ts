import { describe, expect, it, vi } from 'vitest';
import { AUDIBLE_WINDOW_MS, COMPLETION_MESSAGES, completionAnnouncementFor, createCompletionFeedback } from './completion-feedback';
import type { CompletionCue } from './completion-chime';
import { createFocusOutbox, type FocusSessionApi } from './focus-session-outbox';
import { createFocusTimerEngine } from './focus-timer-engine';
import { IDLE_ABANDON_MS, isRunning } from './focus-timer-state';
import { createFocusTimerStore, focusTimerStorageKey } from './focus-timer-store';
import { memoryStorage, noLock } from './test-helpers';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);

/** The smallest focus_sessions stand-in: enough to see what got recorded. */
function fakeTable() {
  const rows = new Map<string, { status: string; focus_seconds: number; flows_completed: number }>();
  const api: FocusSessionApi = {
    async start(_u, op) {
      if (!rows.has(op.sessionId)) rows.set(op.sessionId, { status: 'active', focus_seconds: 0, flows_completed: 0 });
      return { ok: true };
    },
    async checkpoint(_u, op) {
      const row = rows.get(op.sessionId);
      if (row?.status === 'active') Object.assign(row, { focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted });
      return { ok: true };
    },
    async finish(_u, op) {
      const row = rows.get(op.sessionId);
      if (row?.status === 'active') Object.assign(row, { status: op.status, focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted });
      return { ok: true };
    },
    async discard(_u, op) {
      if (rows.get(op.sessionId)?.status === 'active') rows.delete(op.sessionId);
      return { ok: true };
    }
  };
  return { rows, api };
}

function setup() {
  return { storage: memoryStorage(), table: fakeTable(), clock: { now: T0 } };
}

/** One tab: an engine wired to its own completion feedback, as FocusTimerProvider does. */
function openTab(env: ReturnType<typeof setup>, options: { recorded?: boolean } = {}) {
  const now = () => env.clock.now;
  const store = createFocusTimerStore({ storage: env.storage, key: focusTimerStorageKey('user-1'), now, lock: noLock });
  const outbox = options.recorded === false ? null : createFocusOutbox({ userId: 'user-1', storage: env.storage, api: env.table.api, lock: noLock });
  const shown: string[] = [];
  const chimed: CompletionCue[] = [];
  const feedback = createCompletionFeedback({
    notify: (message) => shown.push(message),
    chime: (cue) => {
      chimed.push(cue);
      return true;
    },
    now
  });
  const engine = createFocusTimerEngine({ store, outbox, now, onEvents: (events) => void feedback.handle(events) });
  return { engine, shown, chimed };
}

describe('the three completion events', () => {
  it('a focus block ending: "Focus complete. Time for a break.", the focus chime, and the break waits for Play', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.chimed).toEqual(['focus-complete']);
    const state = tab.engine.state();
    expect(state.phase).toBe('break');
    expect(isRunning(state)).toBe(false);
  });

  it('a break ending: "Break complete. Ready to focus?", the break chime, and the next block waits for Play', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    await tab.engine.play();
    env.clock.now = T0 + 30 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown.at(-1)).toBe('Break complete. Ready to focus?');
    expect(tab.chimed).toEqual(['focus-complete', 'break-complete']);
    const state = tab.engine.state();
    expect(state.phase).toBe('focus');
    expect(isRunning(state)).toBe(false);
  });

  it('the final block ending: "Session complete.", the session chime, no break, and the session recorded completed', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.changeSetting('flows', 1);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    await tab.engine.flush();
    expect(tab.shown).toEqual(['Session complete.']);
    expect(tab.chimed).toEqual(['session-complete']);
    expect(tab.engine.state().finished).toBe(true);
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'completed', focus_seconds: 1500, flows_completed: 1 });
  });

  it('the messages are exactly the agreed wording', () => {
    expect(COMPLETION_MESSAGES).toEqual({
      'focus-complete': 'Focus complete. Time for a break.',
      'break-complete': 'Break complete. Ready to focus?',
      'session-complete': 'Session complete.'
    });
  });
});

describe('exactly once', () => {
  it('reconciling again and again after a boundary announces it once', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    for (let i = 0; i < 5; i++) {
      await tab.engine.reconcile();
      env.clock.now += 1000;
    }
    expect(tab.shown).toHaveLength(1);
    expect(tab.chimed).toHaveLength(1);
  });

  it('the same events handed over twice are announced once', () => {
    const notify = vi.fn();
    const feedback = createCompletionFeedback({ notify, now: () => T0 });
    const events = [
      { type: 'progress' as const, snapshot: snapshot(), boundary: { ended: 'focus' as const, at: T0 } }
    ];
    feedback.handle(events);
    feedback.handle(events);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('two tabs: only the tab that crossed the boundary announces it', async () => {
    const env = setup();
    const a = openTab(env);
    const b = openTab(env);
    await a.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await Promise.all([a.engine.reconcile(), b.engine.reconcile()]);
    await b.engine.reconcile();
    expect([...a.shown, ...b.shown]).toEqual(['Focus complete. Time for a break.']);
    expect([...a.chimed, ...b.chimed]).toEqual(['focus-complete']);
  });

  it('a refreshed or reopened tab never repeats a boundary that was already announced', async () => {
    const env = setup();
    const first = openTab(env);
    await first.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await first.engine.reconcile();
    const reopened = openTab(env);
    await reopened.engine.reconcile();
    expect(reopened.shown).toEqual([]);
    expect(reopened.chimed).toEqual([]);
  });

  it('Play pressed right at a boundary announces that boundary once and starts the break', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN + 200;
    await tab.engine.play();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.engine.state().phase).toBe('break');
    expect(isRunning(tab.engine.state())).toBe(true);
  });
});

describe('coming back from the background', () => {
  it('a boundary that passed while suspended is shown on return, silently once it is old', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 40 * MIN; // phone locked through the end of the block
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.chimed).toEqual([]);
  });

  it('a boundary noticed within the audible window still chimes', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN + AUDIBLE_WINDOW_MS - 1;
    await tab.engine.reconcile();
    expect(tab.chimed).toEqual(['focus-complete']);
  });

  it('hours away cross ONE boundary, so there is one message and never a backlog of chimes', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 3 * 60 * MIN;
    await tab.engine.reconcile();
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.chimed).toEqual([]);
  });
});

describe('sessions that end without completing', () => {
  it('Reset announces nothing, even when a boundary had just passed', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reset();
    expect(tab.shown).toEqual([]);
    expect(tab.chimed).toEqual([]);
    expect(env.table.rows.size).toBe(0);
  });

  it('an idle-abandoned session announces nothing', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 5 * MIN;
    await tab.engine.pause();
    env.clock.now = T0 + 5 * MIN + IDLE_ABANDON_MS;
    await tab.engine.reconcile();
    await tab.engine.flush();
    expect(tab.shown).toEqual([]);
    const [row] = env.table.rows.values();
    expect(row.status).toBe('abandoned');
  });

  it('a pause is not a completion', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 5 * MIN;
    await tab.engine.pause();
    expect(tab.shown).toEqual([]);
  });
});

describe('without sound', () => {
  it('the message is shown even when the chime cannot play', async () => {
    const env = setup();
    const now = () => env.clock.now;
    const shown: string[] = [];
    const feedback = createCompletionFeedback({ notify: (m) => shown.push(m), chime: async () => false, now });
    const store = createFocusTimerStore({ storage: env.storage, key: focusTimerStorageKey('guest'), now, lock: noLock });
    const engine = createFocusTimerEngine({ store, outbox: null, now, onEvents: (events) => void feedback.handle(events) });
    await engine.play();
    env.clock.now = T0 + 25 * MIN;
    await engine.reconcile();
    expect(shown).toEqual(['Focus complete. Time for a break.']);
  });

  it('a chime that throws breaks neither the message nor the timer', async () => {
    const env = setup();
    const now = () => env.clock.now;
    const shown: string[] = [];
    const feedback = createCompletionFeedback({
      notify: (m) => shown.push(m),
      chime: () => {
        throw new Error('audio exploded');
      },
      now
    });
    const store = createFocusTimerStore({ storage: env.storage, key: focusTimerStorageKey('guest'), now, lock: noLock });
    const engine = createFocusTimerEngine({ store, outbox: null, now, onEvents: (events) => void feedback.handle(events) });
    await engine.play();
    env.clock.now = T0 + 25 * MIN;
    await engine.reconcile();
    expect(shown).toHaveLength(1);
    expect(engine.state().phase).toBe('break');
  });

  it('a feedback handler that throws never stops the transition being stored or recorded', async () => {
    const env = setup();
    const now = () => env.clock.now;
    const store = createFocusTimerStore({ storage: env.storage, key: focusTimerStorageKey('user-1'), now, lock: noLock });
    const outbox = createFocusOutbox({ userId: 'user-1', storage: env.storage, api: env.table.api, lock: noLock });
    const engine = createFocusTimerEngine({
      store,
      outbox,
      now,
      onEvents: () => {
        throw new Error('boom');
      }
    });
    await engine.changeSetting('flows', 1);
    await engine.play();
    env.clock.now = T0 + 25 * MIN;
    await engine.reconcile();
    await engine.flush();
    expect(engine.state().finished).toBe(true);
    expect([...env.table.rows.values()][0].status).toBe('completed');
  });
});

describe('completionAnnouncementFor', () => {
  it('ignores events with nothing to announce', () => {
    expect(completionAnnouncementFor([])).toBeNull();
    expect(completionAnnouncementFor([{ type: 'started', snapshot: snapshot() }])).toBeNull();
    expect(completionAnnouncementFor([{ type: 'progress', snapshot: snapshot() }])).toBeNull();
  });
});

function snapshot() {
  return {
    sessionId: 's-1',
    startedAt: T0,
    taskId: null,
    config: { blockMinutes: 25, breakMinutes: 5, flows: 4 },
    flowsCompleted: 1,
    breaksTaken: 0,
    focusSeconds: 1500
  };
}
