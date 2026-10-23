import { describe, expect, it, vi } from 'vitest';
import { AUDIBLE_WINDOW_MS, COMPLETION_MESSAGES, completionAnnouncementFor, createCompletionFeedback } from './completion-feedback';
import type { CompletionCue } from './completion-chime';
import { createFocusOutbox, type FocusSessionApi } from './focus-session-outbox';
import { createFocusTimerEngine } from './focus-timer-engine';
import { IDLE_ABANDON_MS, isRunning, timeLeftSeconds } from './focus-timer-state';
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
  it('a focus block ending: "Focus complete. Time for a break.", the focus chime, and the break starts by itself', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.chimed).toEqual(['focus-complete']);
    const state = tab.engine.state();
    expect(state.phase).toBe('break');
    expect(isRunning(state)).toBe(true);
    expect(state.phaseEndsAt).toBe(T0 + 30 * MIN);
  });

  it('a break ending: "Break complete. Ready to focus?", the break chime, and the next block waits for Play', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile(); // no tap: the break is already running
    env.clock.now = T0 + 30 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.', 'Break complete. Ready to focus?']);
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
    const state = tab.engine.state();
    expect(state.finished).toBe(true);
    expect(isRunning(state)).toBe(false);
    expect(state.phase).toBe('focus');
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'completed', focus_seconds: 1500, flows_completed: 1 });
    // Nothing more happens: no break, no new session.
    env.clock.now = T0 + 60 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Session complete.']);
    expect(isRunning(tab.engine.state())).toBe(false);
  });

  it('a whole two-flow session: focus → automatic break → Play → final focus, with one message per boundary and one completed row', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.changeSetting('flows', 2);
    await tab.engine.play();
    for (const at of [25, 26, 29, 30, 31]) {
      env.clock.now = T0 + at * MIN;
      await tab.engine.reconcile();
    }
    env.clock.now = T0 + 32 * MIN;
    await tab.engine.play();
    env.clock.now = T0 + 57 * MIN;
    await tab.engine.reconcile();
    await tab.engine.reconcile();
    await tab.engine.flush();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.', 'Break complete. Ready to focus?', 'Session complete.']);
    expect(tab.chimed).toEqual(['focus-complete', 'break-complete', 'session-complete']);
    expect(env.table.rows.size).toBe(1);
    expect([...env.table.rows.values()][0]).toMatchObject({ status: 'completed', focus_seconds: 3000, flows_completed: 2 });
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

  it('two tabs through a whole automatic break: each boundary announced once, in one tab, recorded once', async () => {
    const env = setup();
    const a = openTab(env);
    const b = openTab(env);
    await a.engine.play();
    for (const at of [25, 25.5, 30, 30.5]) {
      env.clock.now = T0 + at * MIN;
      await Promise.all([a.engine.reconcile(), b.engine.reconcile()]);
    }
    await Promise.all([a.engine.flush(), b.engine.flush()]);
    expect([...a.shown, ...b.shown].sort()).toEqual(['Break complete. Ready to focus?', 'Focus complete. Time for a break.']);
    expect([...a.chimed, ...b.chimed]).toHaveLength(2);
    expect([...env.table.rows.values()]).toEqual([expect.objectContaining({ status: 'active', flows_completed: 1, focus_seconds: 1500 })]);
  });

  it('a refresh during the automatic break keeps the same break and never repeats its message', async () => {
    const env = setup();
    const first = openTab(env);
    await first.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await first.engine.reconcile();
    env.clock.now = T0 + 27 * MIN;
    const refreshed = openTab(env); // a refresh, or a route change that remounts nothing but reconciles again
    await refreshed.engine.reconcile();
    expect(refreshed.shown).toEqual([]);
    expect(refreshed.engine.state().phaseEndsAt).toBe(T0 + 30 * MIN);
    env.clock.now = T0 + 30 * MIN;
    await refreshed.engine.reconcile();
    expect(refreshed.shown).toEqual(['Break complete. Ready to focus?']);
    expect(first.shown).toEqual(['Focus complete. Time for a break.']);
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
  it('back midway through the break: the break is running with the right time left; the old focus boundary is shown silently', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 28 * MIN; // phone locked from 10:20 to 10:28; the block ended at 10:25
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(tab.chimed).toEqual([]);
    const state = tab.engine.state();
    expect(isRunning(state)).toBe(true);
    expect(timeLeftSeconds(state, env.clock.now)).toBe(2 * 60);
  });

  it('back after the break ended: the next block is waiting paused, with ONE message (the latest) and no backlog', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 40 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Break complete. Ready to focus?']);
    expect(tab.chimed).toEqual([]);
    const state = tab.engine.state();
    expect(state.phase).toBe('focus');
    expect(isRunning(state)).toBe(false);
  });

  it('back within a minute of the break ending: the break chime only, never the focus one as well', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 30 * MIN + 20_000;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Break complete. Ready to focus?']);
    expect(tab.chimed).toEqual(['break-complete']);
  });

  it('the focus chime for the automatic break needs no new tap', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play(); // the only tap
    env.clock.now = T0 + 25 * MIN + 500;
    await tab.engine.reconcile();
    expect(tab.chimed).toEqual(['focus-complete']);
  });

  it('a boundary noticed within the audible window still chimes', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN + AUDIBLE_WINDOW_MS - 1;
    await tab.engine.reconcile();
    expect(tab.chimed).toEqual(['focus-complete']);
  });

  it('hours away never run on into the next block, so there is one message and never a backlog of chimes', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 3 * 60 * MIN;
    await tab.engine.reconcile();
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Break complete. Ready to focus?']);
    expect(tab.chimed).toEqual([]);
    expect(tab.engine.state().flowsCompleted).toBe(1);
  });
});

describe('sessions that end without completing', () => {
  it('Reset during the automatic break discards the session and announces nothing more', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    env.clock.now = T0 + 27 * MIN;
    await tab.engine.reset();
    env.clock.now = T0 + 40 * MIN;
    await tab.engine.reconcile();
    await tab.engine.flush();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    expect(env.table.rows.size).toBe(0);
    expect(isRunning(tab.engine.state())).toBe(false);
  });

  it('pausing the break holds it; resuming finishes it on the new schedule, with one break message', async () => {
    const env = setup();
    const tab = openTab(env);
    await tab.engine.play();
    env.clock.now = T0 + 25 * MIN;
    await tab.engine.reconcile();
    env.clock.now = T0 + 27 * MIN;
    await tab.engine.pause();
    env.clock.now = T0 + 35 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.']);
    await tab.engine.play();
    env.clock.now = T0 + 38 * MIN;
    await tab.engine.reconcile();
    expect(tab.shown).toEqual(['Focus complete. Time for a break.', 'Break complete. Ready to focus?']);
    expect(isRunning(tab.engine.state())).toBe(false);
  });

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
