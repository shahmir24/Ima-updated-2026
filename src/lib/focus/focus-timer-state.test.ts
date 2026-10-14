import { describe, expect, it } from 'vitest';
import {
  changeFocusTimerSetting,
  createFocusTimerState,
  IDLE_ABANDON_MS,
  isRunning,
  isSessionInProgress,
  needsReconcile,
  parseFocusTimerState,
  pauseFocusTimer,
  playFocusTimer,
  reconcileFocusTimer,
  resetFocusTimer,
  seedFocusTimer,
  timeLeftMs,
  timeLeftSeconds,
  type FocusTimerConfig,
  type FocusTimerState
} from './focus-timer-state';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 14, 9, 0, 0);
const CONFIG: FocusTimerConfig = { blockMinutes: 25, breakMinutes: 5, flows: 4 };

let ids = 0;
const opts = (taskId: string | null = null) => ({ newSessionId: () => `session-${++ids}`, taskId });

const fresh = (config = CONFIG) => createFocusTimerState(config, T0);
const started = (config = CONFIG, at = T0, taskId: string | null = null) => playFocusTimer(fresh(config), at, opts(taskId));

describe('time left comes from timestamps, not ticks', () => {
  it('a fresh timer shows the full block', () => {
    expect(timeLeftSeconds(fresh(), T0)).toBe(25 * 60);
  });

  it('after 10 minutes away the remaining time is exact', () => {
    const { state } = started();
    expect(timeLeftMs(state, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(timeLeftSeconds(state, T0 + 10 * MIN + 400)).toBe(900); // 14:59.6 left still shows 15:00
  });

  it('shows 25:00 until a full second has passed', () => {
    const { state } = started();
    expect(timeLeftSeconds(state, T0 + 999)).toBe(1500);
    expect(timeLeftSeconds(state, T0 + 1000)).toBe(1499);
  });

  it('a clock moved backwards cannot add time, and one moved forwards cannot go below zero', () => {
    const { state } = started();
    expect(timeLeftMs(state, T0 - 2 * HOUR)).toBe(25 * MIN);
    expect(timeLeftMs(state, T0 + 3 * 24 * HOUR)).toBe(0);
  });

  it('a paused timer does not move', () => {
    const paused = pauseFocusTimer(started().state, T0 + 5 * MIN).state;
    expect(timeLeftMs(paused, T0 + 5 * MIN)).toBe(20 * MIN);
    expect(timeLeftMs(paused, T0 + 5 * HOUR)).toBe(20 * MIN);
  });
});

describe('play / pause / resume', () => {
  it('the first Play starts a session and reports it', () => {
    const { state, events } = started(CONFIG, T0, 'task-1');
    expect(isRunning(state)).toBe(true);
    expect(state.sessionId).toMatch(/^session-/);
    expect(state.sessionStartedAt).toBe(T0);
    expect(state.taskId).toBe('task-1');
    expect(events).toEqual([{ type: 'started', snapshot: expect.objectContaining({ sessionId: state.sessionId, startedAt: T0, focusSeconds: 0 }) }]);
    expect(isSessionInProgress(state)).toBe(true);
  });

  it('pause banks only the focus time that actually ran, and reports progress', () => {
    const { state, events } = pauseFocusTimer(started().state, T0 + 7 * MIN);
    expect(isRunning(state)).toBe(false);
    expect(state.focusMs).toBe(7 * MIN);
    expect(state.remainingMs).toBe(18 * MIN);
    expect(events).toEqual([{ type: 'progress', snapshot: expect.objectContaining({ focusSeconds: 420 }) }]);
  });

  it('resume keeps the same session and continues from the paused time', () => {
    const paused = pauseFocusTimer(started().state, T0 + 7 * MIN).state;
    const { state, events } = playFocusTimer(paused, T0 + 2 * HOUR, opts());
    expect(events).toEqual([]);
    expect(state.sessionId).toBe(paused.sessionId);
    expect(timeLeftMs(state, T0 + 2 * HOUR + MIN)).toBe(17 * MIN);
  });

  it('pausing twice changes nothing the second time', () => {
    const once = pauseFocusTimer(started().state, T0 + MIN).state;
    const twice = pauseFocusTimer(once, T0 + 2 * MIN);
    expect(twice.state).toBe(once);
    expect(twice.events).toEqual([]);
  });

  it('paused time never counts as focus', () => {
    let s = started().state;
    s = pauseFocusTimer(s, T0 + 5 * MIN).state;
    s = playFocusTimer(s, T0 + 65 * MIN, opts()).state;
    s = pauseFocusTimer(s, T0 + 70 * MIN).state;
    expect(s.focusMs).toBe(10 * MIN);
  });
});

describe('phase boundaries — exactly the old behaviour', () => {
  it('a focus block reaching zero becomes a STOPPED break', () => {
    const { state, events } = reconcileFocusTimer(started().state, T0 + 25 * MIN);
    expect(state.phase).toBe('break');
    expect(isRunning(state)).toBe(false);
    expect(state.remainingMs).toBe(5 * MIN);
    expect(state.flowsCompleted).toBe(1);
    expect(state.focusMs).toBe(25 * MIN);
    expect(events).toEqual([{ type: 'progress', snapshot: expect.objectContaining({ flowsCompleted: 1, focusSeconds: 1500 }) }]);
  });

  it('a break reaching zero becomes a STOPPED focus block, and counts the break', () => {
    let s = reconcileFocusTimer(started().state, T0 + 25 * MIN).state;
    s = playFocusTimer(s, T0 + 30 * MIN, opts()).state;
    const { state } = reconcileFocusTimer(s, T0 + 35 * MIN);
    expect(state.phase).toBe('focus');
    expect(isRunning(state)).toBe(false);
    expect(state.remainingMs).toBe(25 * MIN);
    expect(state.breaksTaken).toBe(1);
    expect(state.focusMs).toBe(25 * MIN); // break time is not focus time
  });

  it('after hours away it crosses ONE boundary only — never runs through breaks and blocks', () => {
    const { state } = reconcileFocusTimer(started().state, T0 + 3 * HOUR);
    expect(state.phase).toBe('break');
    expect(state.flowsCompleted).toBe(1);
    expect(state.breaksTaken).toBe(0);
    expect(isRunning(state)).toBe(false);
    // Focus credit ends where the block ended, not at "now".
    expect(state.focusMs).toBe(25 * MIN);
    expect(state.lastActionAt).toBe(T0 + 25 * MIN);
  });

  it('reconciling again later changes nothing (idempotent) until the idle timeout', () => {
    const once = reconcileFocusTimer(started().state, T0 + 3 * HOUR).state;
    expect(needsReconcile(once, T0 + 4 * HOUR)).toBe(false);
    const again = reconcileFocusTimer(once, T0 + 4 * HOUR);
    expect(again.state).toBe(once);
    expect(again.events).toEqual([]);
  });

  it('nothing happens before the boundary', () => {
    const s = started().state;
    expect(needsReconcile(s, T0 + 25 * MIN - 1)).toBe(false);
    expect(reconcileFocusTimer(s, T0 + 25 * MIN - 1).state).toBe(s);
  });

  it('a zero-minute break ends as soon as it is played', () => {
    let s = reconcileFocusTimer(started({ ...CONFIG, breakMinutes: 0 }).state, T0 + 25 * MIN).state;
    expect(s.phase).toBe('break');
    s = playFocusTimer(s, T0 + 26 * MIN, opts()).state;
    expect(reconcileFocusTimer(s, T0 + 26 * MIN).state.phase).toBe('focus');
  });
});

describe('completion', () => {
  const oneFlow = { ...CONFIG, flows: 1 };

  it('the final block reaching zero completes the session at the moment it ended', () => {
    const { state, events } = reconcileFocusTimer(started(oneFlow).state, T0 + 25 * MIN);
    expect(state.finished).toBe(true);
    expect(state.remainingMs).toBe(0);
    expect(state.phase).toBe('focus');
    expect(isSessionInProgress(state)).toBe(false);
    expect(events).toEqual([
      { type: 'completed', snapshot: expect.objectContaining({ flowsCompleted: 1, focusSeconds: 1500 }), endedAt: T0 + 25 * MIN }
    ]);
  });

  it('completes while the user is in another app or the browser is closed (reconciled later)', () => {
    const { events } = reconcileFocusTimer(started(oneFlow).state, T0 + 2 * HOUR);
    expect(events.map((e) => e.type)).toEqual(['completed']);
    expect(events[0]).toMatchObject({ endedAt: T0 + 25 * MIN });
  });

  it('walks a full 2-flow session: focus, break, focus → completed', () => {
    const cfg = { ...CONFIG, flows: 2 };
    let s = started(cfg).state;
    s = reconcileFocusTimer(s, T0 + 25 * MIN).state;
    s = playFocusTimer(s, T0 + 26 * MIN, opts()).state;
    s = reconcileFocusTimer(s, T0 + 31 * MIN).state;
    s = playFocusTimer(s, T0 + 32 * MIN, opts()).state;
    const done = reconcileFocusTimer(s, T0 + 57 * MIN);
    expect(done.state.finished).toBe(true);
    expect(done.state.flowsCompleted).toBe(2);
    expect(done.state.breaksTaken).toBe(1);
    expect(done.state.focusMs).toBe(50 * MIN);
    expect(done.events.map((e) => e.type)).toEqual(['completed']);
  });

  it('Play after a finished session starts a NEW session from the top', () => {
    const done = reconcileFocusTimer(started(oneFlow).state, T0 + 25 * MIN).state;
    const { state, events } = playFocusTimer(done, T0 + 30 * MIN, opts());
    expect(state.sessionId).not.toBe(done.sessionId);
    expect(state.flowsCompleted).toBe(0);
    expect(state.finished).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['started']);
  });

  it('Reset after a finished session leaves it completed (no discard, no abandon)', () => {
    const done = reconcileFocusTimer(started(oneFlow).state, T0 + 25 * MIN).state;
    const { state, events } = resetFocusTimer(done, T0 + 26 * MIN);
    expect(events).toEqual([]);
    expect(state.sessionId).toBeNull();
  });
});

describe('Reset', () => {
  it('before Play: fresh timer, no session, no events', () => {
    const { state, events } = resetFocusTimer(fresh(), T0 + MIN);
    expect(events).toEqual([]);
    expect(state.sessionId).toBeNull();
  });

  const initial = { sessionId: null, flowsCompleted: 0, breaksTaken: 0, focusMs: 0, phase: 'focus', remainingMs: 25 * MIN, phaseEndsAt: null, finished: false };

  it('after a few seconds: discarded — never abandoned — and back to the initial state', () => {
    const { state, events } = resetFocusTimer(started().state, T0 + 4_000);
    expect(events).toEqual([{ type: 'discarded', snapshot: expect.objectContaining({ focusSeconds: 4 }) }]);
    expect(state).toMatchObject(initial);
  });

  it('after substantial focus time (2 blocks, mid-third): discarded, never abandoned', () => {
    let s = started().state;
    s = reconcileFocusTimer(s, T0 + 25 * MIN).state;
    s = playFocusTimer(s, T0 + 25 * MIN, opts()).state;
    s = reconcileFocusTimer(s, T0 + 30 * MIN).state;
    s = playFocusTimer(s, T0 + 30 * MIN, opts()).state;
    s = reconcileFocusTimer(s, T0 + 55 * MIN).state;
    s = playFocusTimer(s, T0 + 55 * MIN, opts()).state;
    s = reconcileFocusTimer(s, T0 + 60 * MIN).state;
    s = playFocusTimer(s, T0 + 60 * MIN, opts()).state;
    const { state, events } = resetFocusTimer(s, T0 + 70 * MIN);
    expect(events.map((e) => e.type)).toEqual(['discarded']);
    expect(events[0].snapshot).toMatchObject({ flowsCompleted: 2, focusSeconds: 60 * 60 });
    expect(state).toMatchObject(initial);
  });

  it('while paused, or waiting at a boundary: discarded', () => {
    const paused = pauseFocusTimer(started().state, T0 + 3 * MIN).state;
    expect(resetFocusTimer(paused, T0 + 4 * MIN).events.map((e) => e.type)).toEqual(['discarded']);
    const atBreak = reconcileFocusTimer(started().state, T0 + 25 * MIN).state;
    expect(resetFocusTimer(atBreak, T0 + 26 * MIN).events.map((e) => e.type)).toEqual(['discarded']);
  });

  it('never produces an abandoned or completed event', () => {
    const paused = pauseFocusTimer(started().state, T0 + 3 * MIN).state;
    for (const s of [fresh(), started().state, paused]) {
      expect(resetFocusTimer(s, T0 + 5 * MIN).events.filter((e) => e.type === 'abandoned' || e.type === 'completed')).toEqual([]);
    }
  });

  it('a final block that ran out just before the Reset tap stays completed — Reset does not undo it', () => {
    // The final block ran out a moment before the tap: that is a completion, and Reset leaves it alone.
    const { events } = resetFocusTimer(started({ ...CONFIG, flows: 1 }).state, T0 + 25 * MIN + 500);
    expect(events.map((e) => e.type)).toEqual(['completed']);
  });

  it('keeps the session settings', () => {
    const custom = { blockMinutes: 45, breakMinutes: 10, flows: 2 };
    expect(resetFocusTimer(started(custom).state, T0 + MIN).state.config).toEqual(custom);
  });
});

describe('12-hour idle recovery', () => {
  it('a paused session idle for 12 hours is abandoned at its last action, with what it earned', () => {
    const paused = pauseFocusTimer(started().state, T0 + 10 * MIN).state;
    expect(needsReconcile(paused, T0 + 10 * MIN + IDLE_ABANDON_MS - 1)).toBe(false);
    const { state, events } = reconcileFocusTimer(paused, T0 + 10 * MIN + IDLE_ABANDON_MS);
    expect(events).toEqual([
      { type: 'abandoned', snapshot: expect.objectContaining({ focusSeconds: 600 }), endedAt: T0 + 10 * MIN }
    ]);
    expect(state.sessionId).toBeNull();
  });

  it('a session waiting at a boundary is abandoned 12 hours after the boundary', () => {
    const atBreak = reconcileFocusTimer(started().state, T0 + 25 * MIN).state;
    expect(reconcileFocusTimer(atBreak, T0 + 25 * MIN + IDLE_ABANDON_MS - 1).events).toEqual([]);
    const { events } = reconcileFocusTimer(atBreak, T0 + 25 * MIN + IDLE_ABANDON_MS);
    expect(events).toEqual([{ type: 'abandoned', snapshot: expect.objectContaining({ flowsCompleted: 1, focusSeconds: 1500 }), endedAt: T0 + 25 * MIN }]);
  });

  it('away for days mid-block: one boundary (progress), then abandoned from that boundary', () => {
    const { events } = reconcileFocusTimer(started().state, T0 + 3 * 24 * HOUR);
    expect(events.map((e) => e.type)).toEqual(['progress', 'abandoned']);
    expect(events[1]).toMatchObject({ endedAt: T0 + 25 * MIN });
  });

  it('a RUNNING block is never timed out, however long it is', () => {
    const long = started({ blockMinutes: 240, breakMinutes: 5, flows: 1 }).state;
    // A 240-minute block that started long before: still running until its own end.
    const resumed = { ...long, lastActionAt: T0 - 2 * IDLE_ABANDON_MS };
    const { events, state } = reconcileFocusTimer(resumed, T0 + 239 * MIN);
    expect(events).toEqual([]);
    expect(isRunning(state)).toBe(true);
  });

  it('any user action restarts the idle clock', () => {
    let s = pauseFocusTimer(started().state, T0 + MIN).state;
    s = changeFocusTimerSetting(s, T0 + 11 * HOUR, 'flows', 3).state;
    expect(reconcileFocusTimer(s, T0 + 13 * HOUR).events).toEqual([]);
  });

  it('a completed session is never abandoned; it is only cleared locally after 12 hours', () => {
    const done = reconcileFocusTimer(started({ ...CONFIG, flows: 1 }).state, T0 + 25 * MIN).state;
    const { state, events } = reconcileFocusTimer(done, T0 + 25 * MIN + IDLE_ABANDON_MS);
    expect(events).toEqual([]);
    expect(state.finished).toBe(false);
    expect(state.sessionId).toBeNull();
  });

  it('a clock moved backwards never triggers the timeout', () => {
    const paused = pauseFocusTimer(started().state, T0 + MIN).state;
    expect(reconcileFocusTimer(paused, T0 - 48 * HOUR).events).toEqual([]);
  });

  it('a timer with no session is never "abandoned"', () => {
    expect(needsReconcile(fresh(), T0 + 10 * IDLE_ABANDON_MS)).toBe(false);
  });
});

describe('settings panel and seeding — unchanged rules', () => {
  it('a block change while stopped in focus re-times the block', () => {
    expect(changeFocusTimerSetting(fresh(), T0, 'timeBox', 45).state.remainingMs).toBe(45 * MIN);
  });

  it('a block change while running does not re-time the running block', () => {
    const { state } = changeFocusTimerSetting(started().state, T0 + MIN, 'timeBox', 90);
    expect(state.config.blockMinutes).toBe(90);
    expect(timeLeftMs(state, T0 + MIN)).toBe(24 * MIN);
  });

  it('a break change re-times only a stopped break', () => {
    const atBreak = reconcileFocusTimer(started().state, T0 + 25 * MIN).state;
    expect(changeFocusTimerSetting(atBreak, T0 + 26 * MIN, 'interval', 10).state.remainingMs).toBe(10 * MIN);
    expect(changeFocusTimerSetting(fresh(), T0, 'interval', 10).state.remainingMs).toBe(25 * MIN);
  });

  it('saved settings seed a timer with no session', () => {
    const seeded = seedFocusTimer(null, { blockMinutes: 45, breakMinutes: 10, flows: 2 }, T0).state;
    expect(seeded.remainingMs).toBe(45 * MIN);
    expect(seedFocusTimer(fresh(), { blockMinutes: 90, breakMinutes: 5, flows: 1 }, T0).state.config.blockMinutes).toBe(90);
  });

  it('saved settings never re-time a session in progress or just finished', () => {
    const running = started().state;
    expect(seedFocusTimer(running, { blockMinutes: 90, breakMinutes: 5, flows: 1 }, T0 + MIN).state).toBe(running);
    const paused = pauseFocusTimer(running, T0 + MIN).state;
    expect(seedFocusTimer(paused, { blockMinutes: 90, breakMinutes: 5, flows: 1 }, T0 + 2 * MIN).state).toBe(paused);
    const done = reconcileFocusTimer(started({ ...CONFIG, flows: 1 }).state, T0 + 25 * MIN).state;
    expect(seedFocusTimer(done, { blockMinutes: 90, breakMinutes: 5, flows: 1 }, T0 + 26 * MIN).state).toBe(done);
  });
});

describe('parsing stored state', () => {
  it('round-trips through JSON', () => {
    const s = pauseFocusTimer(started(CONFIG, T0, 'task-1').state, T0 + MIN).state;
    expect(parseFocusTimerState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'x'],
    ['another version', { ...fresh(), version: 2 }],
    ['no config', { ...fresh(), config: null }],
    ['a zero-length block', { ...fresh(), config: { ...CONFIG, blockMinutes: 0 } }],
    ['a bad phase', { ...fresh(), phase: 'nap' }],
    ['half-running', { ...fresh(), phaseEndsAt: T0, runningSince: null }],
    ['a session id without a start', { ...fresh(), sessionId: 'x', sessionStartedAt: null }],
    ['negative focus', { ...fresh(), focusMs: -1 }],
    ['NaN', { ...fresh(), remainingMs: Number.NaN }]
  ])('rejects %s', (_label, value) => {
    expect(parseFocusTimerState(value as FocusTimerState)).toBeNull();
  });
});
