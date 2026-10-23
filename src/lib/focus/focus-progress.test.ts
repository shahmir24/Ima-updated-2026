import { describe, expect, it } from 'vitest';
import {
  changeFocusTimerSetting,
  createFocusTimerState,
  pauseFocusTimer,
  playFocusTimer,
  reconcileFocusTimer,
  timeLeftSeconds,
  type FocusTimerState
} from './focus-timer-state';
import {
  currentRound,
  focusDisplayPhase,
  phaseLengthMs,
  phaseLengthToRemember,
  phaseProgress,
  type RememberedPhase
} from './focus-progress';

const MIN = 60_000;
const T0 = 1_760_000_000_000;
const CONFIG = { blockMinutes: 2, breakMinutes: 2, flows: 3 };
const ids = () => 'session-1';

/** What the page does on every render: learn what can be learned, keep it otherwise. */
const observe = (state: FocusTimerState, memo: RememberedPhase | null) => phaseLengthToRemember(state, memo) ?? memo;
const progressAt = (state: FocusTimerState, now: number, memo: RememberedPhase | null) =>
  phaseProgress(state, timeLeftSeconds(state, now), phaseLengthMs(state, memo));
const play = (s: FocusTimerState, now: number) => playFocusTimer(s, now, { newSessionId: ids }).state;
const pause = (s: FocusTimerState, now: number) => pauseFocusTimer(s, now).state;
const setBlock = (s: FocusTimerState, now: number, minutes: number) => changeFocusTimerSetting(s, now, 'timeBox', minutes).state;
const setBreak = (s: FocusTimerState, now: number, minutes: number) => changeFocusTimerSetting(s, now, 'interval', minutes).state;

/**
 * Round 2 waiting at its start: block 1 (2 min) and a 2-min break done.
 * Returns the state and the time at that moment.
 */
function atRoundTwo(): { s: FocusTimerState; now: number } {
  let s = play(createFocusTimerState(CONFIG, T0), T0);
  s = reconcileFocusTimer(s, T0 + 2 * MIN).state;
  s = play(s, T0 + 2 * MIN);
  s = reconcileFocusTimer(s, T0 + 4 * MIN).state;
  expect(s.phase).toBe('focus');
  expect(s.flowsCompleted).toBe(1);
  return { s, now: T0 + 4 * MIN };
}

describe('focus progress ring (display only)', () => {
  it('ready: nothing done', () => {
    const s = createFocusTimerState(CONFIG, T0);
    expect(focusDisplayPhase(s)).toBe('ready');
    expect(progressAt(s, T0, null)).toBe(0);
  });

  it('normal session: half way is 50%', () => {
    let memo = observe(createFocusTimerState(CONFIG, T0), null);
    const s = play(createFocusTimerState(CONFIG, T0), T0);
    memo = observe(s, memo);
    expect(focusDisplayPhase(s)).toBe('focus');
    expect(progressAt(s, T0 + MIN, memo)).toBe(0.5);
  });

  it('pause and resume keep the ring where it was', () => {
    let s = play(createFocusTimerState(CONFIG, T0), T0);
    let memo = observe(s, null);
    s = pause(s, T0 + 30_000);
    memo = observe(s, memo);
    expect(focusDisplayPhase(s)).toBe('paused');
    expect(progressAt(s, T0 + 5 * MIN, memo)).toBe(0.25);
    s = play(s, T0 + 5 * MIN);
    memo = observe(s, memo);
    expect(progressAt(s, T0 + 5 * MIN + 30_000, memo)).toBe(0.5);
  });

  it('a duration change during an active block does not move the ring', () => {
    const { s: start, now } = atRoundTwo();
    let memo = observe(start, null);
    let s = play(start, now);
    memo = observe(s, memo);
    s = setBlock(s, now + 30_000, 25);
    memo = observe(s, memo);
    expect(s.config.blockMinutes).toBe(25);
    expect(progressAt(s, now + MIN, memo)).toBe(0.5);
    s = pause(s, now + MIN);
    memo = observe(s, memo);
    expect(progressAt(s, now + MIN, memo)).toBe(0.5);
  });

  describe('after a refresh (nothing remembered)', () => {
    it('REGRESSION: changed during a later block, paused, refreshed → no progress shown, not the new setting', () => {
      const { s: start, now } = atRoundTwo();
      let s = play(start, now);
      s = setBlock(s, now + 30_000, 25);
      s = pause(s, now + MIN);
      // The old fallback used the configured 25 min: 1 − 60 s / 25 min ≈ 96%.
      expect(phaseLengthMs(s, null)).toBeNull();
      expect(progressAt(s, now + MIN, null)).toBeNull();
      expect(phaseLengthToRemember(s, null)).toBeNull();
      // The countdown is the timer's own and is unaffected.
      expect(timeLeftSeconds(s, now + MIN)).toBe(60);
    });

    it('changed during a later block, refreshed while still running → no progress shown', () => {
      const { s: start, now } = atRoundTwo();
      let s = play(start, now);
      s = pause(s, now + 20_000);
      s = play(s, now + 30_000);
      s = setBlock(s, now + 40_000, 25);
      expect(progressAt(s, now + MIN, null)).toBeNull();
    });

    it('the first block is rebuilt exactly from banked focus time: changed, paused, refreshed', () => {
      let s = play(createFocusTimerState(CONFIG, T0), T0);
      s = setBlock(s, T0 + 10_000, 25);
      s = pause(s, T0 + MIN);
      expect(phaseLengthMs(s, null)).toBe(2 * MIN);
      expect(progressAt(s, T0 + MIN, null)).toBe(0.5);
      // Learned, so resuming keeps it.
      const memo = observe(s, null);
      s = play(s, T0 + 3 * MIN);
      expect(progressAt(s, T0 + 3 * MIN + 30_000, observe(s, memo))).toBe(0.75);
    });

    it('the first block, changed and refreshed while running → exact', () => {
      let s = play(createFocusTimerState(CONFIG, T0), T0);
      s = pause(s, T0 + 30_000);
      s = play(s, T0 + MIN);
      s = setBlock(s, T0 + MIN + 10_000, 25);
      expect(progressAt(s, T0 + MIN + 30_000, null)).toBe(0.5);
    });

    it('a later block, unchanged and refreshed while running (no pause) → exact', () => {
      const { s: start, now } = atRoundTwo();
      const s = play(start, now);
      expect(progressAt(s, now + MIN, null)).toBe(0.5);
    });

    it('a later block paused and refreshed → unknown, even with no change (the settings prove nothing)', () => {
      const { s: start, now } = atRoundTwo();
      const s = pause(play(start, now), now + MIN);
      expect(progressAt(s, now + MIN, null)).toBeNull();
    });

    it('a shorter setting never shortens a phase it cannot know', () => {
      const { s: start, now } = atRoundTwo();
      let s = play(start, now);
      s = setBlock(s, now + 10_000, 1);
      expect(phaseLengthMs(s, null)).toBeNull();
    });
  });

  it('a stopped phase re-timed by a setting starts again from 0%, as the timer does', () => {
    let s = play(createFocusTimerState(CONFIG, T0), T0);
    s = pause(s, T0 + MIN);
    s = setBlock(s, T0 + MIN, 5);
    expect(focusDisplayPhase(s)).toBe('ready');
    expect(phaseLengthMs(s, null)).toBe(5 * MIN);
    expect(progressAt(s, T0 + MIN, null)).toBe(0);
  });

  it('a length remembered in one session is never used for another', () => {
    const { s: start, now } = atRoundTwo();
    const memo = observe(start, null);
    const other = { ...pause(play(start, now), now + MIN), sessionId: 'session-2' };
    expect(phaseLengthMs(other, memo)).toBeNull();
  });

  describe('breaks', () => {
    it('the automatic break shows as Break from 0%; half way is 50%; a change during it does not move the ring', () => {
      let s = play(createFocusTimerState(CONFIG, T0), T0);
      s = reconcileFocusTimer(s, T0 + 2 * MIN).state;
      let memo = observe(s, null);
      expect(focusDisplayPhase(s)).toBe('break');
      expect(currentRound(s)).toBe(1);
      expect(progressAt(s, T0 + 2 * MIN, memo)).toBe(0);
      memo = observe(s, memo);
      s = setBreak(s, T0 + 2 * MIN + 10_000, 10);
      expect(progressAt(s, T0 + 3 * MIN, observe(s, memo))).toBe(0.5);
    });

    it('refreshed while a break runs unpaused and unchanged → exact; paused and refreshed → unknown', () => {
      let s = play(createFocusTimerState(CONFIG, T0), T0);
      s = reconcileFocusTimer(s, T0 + 3 * MIN).state; // noticed a minute late: still half way
      expect(progressAt(s, T0 + 3 * MIN, null)).toBe(0.5);
      s = pause(s, T0 + 3 * MIN);
      expect(focusDisplayPhase(s)).toBe('paused');
      expect(progressAt(s, T0 + 3 * MIN, null)).toBeNull();
    });

    it('the transition back to focus starts the next round at 0%', () => {
      let s = play(createFocusTimerState(CONFIG, T0), T0);
      s = reconcileFocusTimer(s, T0 + 2 * MIN).state;
      s = reconcileFocusTimer(s, T0 + 4 * MIN).state;
      expect(focusDisplayPhase(s)).toBe('ready');
      expect(currentRound(s)).toBe(2);
      expect(progressAt(s, T0 + 4 * MIN, null)).toBe(0);
    });
  });

  it('a completed session is 100%, and the round never exceeds the total', () => {
    let s = play(createFocusTimerState({ ...CONFIG, flows: 1 }, T0), T0);
    s = reconcileFocusTimer(s, T0 + 2 * MIN).state;
    expect(s.finished).toBe(true);
    expect(focusDisplayPhase(s)).toBe('complete');
    expect(progressAt(s, T0 + 2 * MIN, null)).toBe(1);
    expect(currentRound(s)).toBe(1);
    expect(phaseLengthToRemember(s, null)).toBeNull();
  });

  it('progress is clamped to [0, 1], and an unknown length stays unknown', () => {
    const s = createFocusTimerState(CONFIG, T0);
    expect(phaseProgress(s, 999, 60_000)).toBe(0);
    expect(phaseProgress(s, -5, 60_000)).toBe(1);
    expect(phaseProgress(s, 10, 0)).toBe(0);
    expect(phaseProgress(s, 10, null)).toBeNull();
  });
});
