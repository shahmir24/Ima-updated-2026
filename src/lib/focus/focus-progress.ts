import { isRunning, type FocusTimerState } from './focus-timer-state';

/**
 * What the desktop progress ring shows. Read-only: everything here is derived
 * from the timer's own state and never feeds back into it.
 */

export type FocusDisplayPhase = 'ready' | 'focus' | 'paused' | 'break' | 'complete';

const MINUTE = 60_000;

/** The configured length of the state's current phase. Only trusted while the phase has not run. */
const configuredMs = (state: FocusTimerState) =>
  (state.phase === 'focus' ? state.config.blockMinutes : state.config.breakMinutes) * MINUTE;

/**
 * Stopped with its whole length still to go: the phase has not run at all.
 * The engine sets remainingMs to the phase's full length at every boundary,
 * and re-times a stopped phase when a setting changes, so here remainingMs IS
 * the phase's length.
 */
const notStarted = (state: FocusTimerState) => !isRunning(state) && state.remainingMs >= configuredMs(state);

/**
 * One phase of one session: changes at every boundary and at every new session.
 * Before the first Play there is no session id; that phase is the first focus
 * block, whose length never needs remembering (see exactPhaseLengthMs).
 */
export const focusPhaseKey = (state: FocusTimerState): string =>
  `${state.sessionId ?? 'none'}:${state.phase}:${state.flowsCompleted}:${state.breaksTaken}`;

export interface RememberedPhase {
  key: string;
  lengthMs: number;
}

/**
 * The phase length when the persisted state alone proves it, else null.
 *
 *   * Not started: remainingMs, which the engine sets to the full length at
 *     every boundary and whenever a setting re-times a stopped phase.
 *   * The session's first focus block: focusMs has banked every closed run of
 *     this session, and all of them were in this block, so its length is
 *     focusMs + what is left (stopped) or focusMs + the current run (running).
 *   * Running, with the current run exactly as long as the configured length:
 *     the run began at the phase's full length, so that is its length.
 *
 * Anything else — a later block or a break, paused, or resumed after a pause —
 * cannot be recovered: a pause overwrites lastActionAt, the only trace of a
 * setting changed mid-run, and breaks bank no time at all. The settings are
 * then not evidence of the length, because a change made while running does
 * not re-time the phase.
 */
function exactPhaseLengthMs(state: FocusTimerState): number | null {
  if (notStarted(state)) return state.remainingMs;
  const running = isRunning(state);
  const stretch = running ? state.phaseEndsAt! - state.runningSince! : 0;
  if (state.sessionId !== null && state.phase === 'focus' && state.flowsCompleted === 0) {
    return state.focusMs + (running ? stretch : state.remainingMs);
  }
  if (running && stretch === configuredMs(state)) return stretch;
  return null;
}

/**
 * The length of the current phase, in ms, or null when it is not known.
 *
 * Known when the persisted state proves it (exactPhaseLengthMs), or when this
 * page learned it earlier in the same phase of the same session — before the
 * phase started, normally. A setting changed while a phase runs does not
 * re-time that phase, so the configured length is never used once a phase has
 * started: after a refresh mid-phase the length can be unknown, and the ring
 * then shows no progress rather than a guess. The countdown is unaffected.
 */
export function phaseLengthMs(state: FocusTimerState, remembered: RememberedPhase | null): number | null {
  if (remembered && remembered.key === focusPhaseKey(state) && !notStarted(state)) {
    // Never shorter than what the persisted timing proves is still to come.
    const running = isRunning(state);
    const atLeast = running ? state.phaseEndsAt! - state.runningSince! : state.remainingMs;
    return Math.max(remembered.lengthMs, atLeast);
  }
  return exactPhaseLengthMs(state);
}

/**
 * What to remember about the current phase, or null when there is nothing
 * exact to learn. Only exact lengths are remembered, so a later pause in the
 * same phase keeps an accurate ring.
 */
export function phaseLengthToRemember(state: FocusTimerState, remembered: RememberedPhase | null): RememberedPhase | null {
  if (state.finished) return null;
  const key = focusPhaseKey(state);
  if (notStarted(state)) return { key, lengthMs: state.remainingMs };
  if (remembered?.key === key) return null;
  const exact = exactPhaseLengthMs(state);
  return exact === null ? null : { key, lengthMs: exact };
}

/**
 * Fraction of the current phase done, clamped to [0, 1], or null when the
 * phase's length is unknown. A finished session is complete.
 */
export function phaseProgress(state: FocusTimerState, timeLeftSeconds: number, lengthMs: number | null): number | null {
  if (state.finished) return 1;
  if (lengthMs === null) return null;
  if (lengthMs <= 0) return 0;
  const done = 1 - (timeLeftSeconds * 1000) / lengthMs;
  return Math.min(1, Math.max(0, done));
}

export function focusDisplayPhase(state: FocusTimerState): FocusDisplayPhase {
  if (state.finished) return 'complete';
  if (isRunning(state)) return state.phase === 'focus' ? 'focus' : 'break';
  if (state.phase === 'break') return notStarted(state) ? 'break' : 'paused';
  return state.sessionId === null || notStarted(state) ? 'ready' : 'paused';
}

/** The round the user is on (1-based), never more than the total. */
export function currentRound(state: FocusTimerState): number {
  const flows = Math.max(1, state.config.flows);
  if (state.finished) return Math.min(state.flowsCompleted, flows) || flows;
  // In a break the round just finished is the one being rested after.
  const round = state.phase === 'focus' ? state.flowsCompleted + 1 : state.flowsCompleted;
  return Math.min(Math.max(round, 1), flows);
}
