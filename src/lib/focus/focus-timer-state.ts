/**
 * The Focus Timer, as plain data and pure functions.
 *
 * Time is never counted here. A running phase stores the wall-clock moment it
 * reaches zero (`phaseEndsAt`), and "time left" is always that moment minus
 * now. Nothing depends on a setInterval continuing to fire: a tab in the
 * background, a locked phone, another app in front, or iMA closed altogether
 * all reconcile to the right answer the next time any of this runs.
 *
 * Behaviour carried over from the original page-local timer, unchanged:
 *
 *   * The timer STOPS at every phase boundary. A focus block reaching zero
 *     becomes a paused break (or, after the final flow, a finished session);
 *     a break reaching zero becomes a paused focus block. Play is needed to go
 *     on. Reconciling therefore applies at most ONE boundary, however long the
 *     user was away — it never runs through several breaks and blocks.
 *   * Reset returns to flow 0 with a fresh focus block.
 *   * A settings change while stopped re-times the current phase.
 *
 * Session lifecycle (product decisions):
 *
 *   * A session starts on the first Play and gets an id then.
 *   * It is COMPLETED when the final focus block reaches zero — including
 *     while the user is elsewhere; it is recorded when that is reconciled,
 *     with the moment the block actually ended.
 *   * It is ABANDONED only after IDLE_ABANDON_MS without user action while
 *     paused or waiting at a boundary. A running block is never timed out.
 *   * Reset DISCARDS it: the timer returns to its initial state and the
 *     session counts as nothing — not completed, not abandoned, not in the
 *     completion rate. A recorder removes any row it already wrote.
 *   * Navigation, app switching, backgrounding, refresh and closing the
 *     browser are none of these, so none of them can end a session.
 *
 * Every function takes `now` (epoch ms) and returns a new state plus the
 * session events it caused; recording those is someone else's job.
 */

export const FOCUS_TIMER_STATE_VERSION = 1;

/** Paused, or waiting at a phase boundary, this long without user action → abandoned. */
export const IDLE_ABANDON_MS = 12 * 60 * 60 * 1000;

/**
 * Used until saved settings arrive, and when there are none (Guest Mode). The
 * same values user_settings declares as its column defaults.
 */
export const FALLBACK_FOCUS_CONFIG: FocusTimerConfig = Object.freeze({ blockMinutes: 25, breakMinutes: 5, flows: 4 });

export type FocusPhase = 'focus' | 'break';
export type FocusSetting = 'timeBox' | 'interval' | 'flows';

export interface FocusTimerConfig {
  blockMinutes: number;
  breakMinutes: number;
  flows: number;
}

export interface FocusTimerState {
  version: typeof FOCUS_TIMER_STATE_VERSION;
  config: FocusTimerConfig;
  phase: FocusPhase;
  /** Time left in the phase while stopped. Ignored while running. */
  remainingMs: number;
  /** Running only: when the current phase reaches zero. Null = stopped. */
  phaseEndsAt: number | null;
  /** Running only: when this running stretch began, for crediting focus time. */
  runningSince: number | null;
  flowsCompleted: number;
  breaksTaken: number;
  /** Focus time banked from closed running stretches. Never derived from wall-clock spans. */
  focusMs: number;
  /** The recorded session. Null until the first Play. */
  sessionId: string | null;
  sessionStartedAt: number | null;
  /** The task the session was started for, if any (an id only, never a title). */
  taskId: string | null;
  /** The final block has reached zero; the session is completed. */
  finished: boolean;
  /** Last user action, or the boundary the timer stopped at. Starts the idle clock. */
  lastActionAt: number;
}

/** What a recorder needs to write a session row. */
export interface FocusSessionSnapshot {
  sessionId: string;
  startedAt: number;
  taskId: string | null;
  config: FocusTimerConfig;
  flowsCompleted: number;
  breaksTaken: number;
  focusSeconds: number;
}

export type FocusTimerEvent =
  | { type: 'started'; snapshot: FocusSessionSnapshot }
  | { type: 'progress'; snapshot: FocusSessionSnapshot }
  | { type: 'completed'; snapshot: FocusSessionSnapshot; endedAt: number }
  | { type: 'abandoned'; snapshot: FocusSessionSnapshot; endedAt: number }
  /** Reset: the session is thrown away and must not count anywhere. */
  | { type: 'discarded'; snapshot: FocusSessionSnapshot };

export interface FocusTimerTransition {
  state: FocusTimerState;
  events: FocusTimerEvent[];
}

const MINUTE = 60_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const isRunning = (state: FocusTimerState): boolean => state.phaseEndsAt !== null;

/** Started and not yet ended: running, paused, or waiting at a boundary. */
export const isSessionInProgress = (state: FocusTimerState | null | undefined): boolean =>
  !!state && state.sessionId !== null && !state.finished;

const phaseDurationMs = (config: FocusTimerConfig, phase: FocusPhase) =>
  (phase === 'focus' ? config.blockMinutes : config.breakMinutes) * MINUTE;

export function createFocusTimerState(config: FocusTimerConfig, now: number): FocusTimerState {
  return {
    version: FOCUS_TIMER_STATE_VERSION,
    config: { ...config },
    phase: 'focus',
    remainingMs: phaseDurationMs(config, 'focus'),
    phaseEndsAt: null,
    runningSince: null,
    flowsCompleted: 0,
    breaksTaken: 0,
    focusMs: 0,
    sessionId: null,
    sessionStartedAt: null,
    taskId: null,
    finished: false,
    lastActionAt: now
  };
}

/**
 * Time left in the current phase. Bounded to [0, what this stretch started
 * with], so a device clock moved backwards cannot add time and one moved
 * forwards cannot go below zero.
 */
export function timeLeftMs(state: FocusTimerState, now: number): number {
  if (state.phaseEndsAt === null || state.runningSince === null) return Math.max(0, state.remainingMs);
  return clamp(state.phaseEndsAt - now, 0, Math.max(0, state.phaseEndsAt - state.runningSince));
}

/** Whole seconds for the display: 25:00 until a full second has passed. */
export const timeLeftSeconds = (state: FocusTimerState, now: number): number => Math.ceil(timeLeftMs(state, now) / 1000);

export function snapshotOf(state: FocusTimerState): FocusSessionSnapshot | null {
  if (state.sessionId === null || state.sessionStartedAt === null) return null;
  return {
    sessionId: state.sessionId,
    startedAt: state.sessionStartedAt,
    taskId: state.taskId,
    config: { ...state.config },
    flowsCompleted: state.flowsCompleted,
    breaksTaken: state.breaksTaken,
    focusSeconds: Math.floor(state.focusMs / 1000)
  };
}

/** Closes the running stretch at `until`, banking focus time (focus phase only) and stopping. */
function stopRunning(state: FocusTimerState, until: number): FocusTimerState {
  if (state.phaseEndsAt === null || state.runningSince === null) return state;
  const stretch = Math.max(0, state.phaseEndsAt - state.runningSince);
  const elapsed = clamp(Math.min(until, state.phaseEndsAt) - state.runningSince, 0, stretch);
  return {
    ...state,
    focusMs: state.phase === 'focus' ? state.focusMs + elapsed : state.focusMs,
    remainingMs: stretch - elapsed,
    phaseEndsAt: null,
    runningSince: null
  };
}

/** True when reconcile() would change something at `now`. Cheap; safe to call every tick. */
export function needsReconcile(state: FocusTimerState, now: number): boolean {
  if (state.phaseEndsAt !== null) return now >= state.phaseEndsAt;
  const idle = now - state.lastActionAt >= IDLE_ABANDON_MS;
  return idle && state.sessionId !== null;
}

/**
 * Brings a stored state up to `now`:
 *
 *   1. A running phase that has reached zero crosses exactly one boundary, at
 *      the moment it reached zero, and stops there.
 *   2. A stopped session idle for IDLE_ABANDON_MS since its last action (or
 *      the boundary it stopped at) is abandoned with what it actually earned.
 *      A finished session idle that long is cleared locally — it was already
 *      recorded — so the screen does not show yesterday's 0:00.
 */
export function reconcileFocusTimer(state: FocusTimerState, now: number): FocusTimerTransition {
  const events: FocusTimerEvent[] = [];
  let next = state;

  if (next.phaseEndsAt !== null && now >= next.phaseEndsAt) {
    const boundary = next.phaseEndsAt;
    next = stopRunning(next, boundary);

    if (next.phase === 'focus') {
      const flowsCompleted = next.flowsCompleted + 1;
      if (flowsCompleted >= next.config.flows) {
        next = { ...next, flowsCompleted, remainingMs: 0, finished: true, lastActionAt: boundary };
        const snapshot = snapshotOf(next);
        if (snapshot) events.push({ type: 'completed', snapshot, endedAt: boundary });
      } else {
        next = {
          ...next,
          flowsCompleted,
          phase: 'break',
          remainingMs: phaseDurationMs(next.config, 'break'),
          lastActionAt: boundary
        };
        const snapshot = snapshotOf(next);
        if (snapshot) events.push({ type: 'progress', snapshot });
      }
    } else {
      next = {
        ...next,
        breaksTaken: next.breaksTaken + 1,
        phase: 'focus',
        remainingMs: phaseDurationMs(next.config, 'focus'),
        lastActionAt: boundary
      };
      const snapshot = snapshotOf(next);
      if (snapshot) events.push({ type: 'progress', snapshot });
    }
  }

  if (next.phaseEndsAt === null && next.sessionId !== null && now - next.lastActionAt >= IDLE_ABANDON_MS) {
    if (!next.finished) {
      const snapshot = snapshotOf(next);
      // Ended when the user last did something, not now: the idle wait is not session time.
      if (snapshot) events.push({ type: 'abandoned', snapshot, endedAt: next.lastActionAt });
    }
    next = createFocusTimerState(next.config, now);
  }

  return { state: next, events };
}

/** Play: starts a session on the first press, resumes after a pause, or begins the next phase. */
export function playFocusTimer(
  state: FocusTimerState,
  now: number,
  options: { newSessionId: () => string; taskId?: string | null }
): FocusTimerTransition {
  const reconciled = reconcileFocusTimer(state, now);
  const events = [...reconciled.events];
  let next = reconciled.state;
  if (isRunning(next)) return { state: next, events };

  // A finished session is over; Play begins a new one from the top.
  if (next.finished) next = createFocusTimerState(next.config, now);

  if (next.sessionId === null) {
    next = { ...next, sessionId: options.newSessionId(), sessionStartedAt: now, taskId: options.taskId ?? null };
    const snapshot = snapshotOf(next);
    if (snapshot) events.push({ type: 'started', snapshot });
  }

  const remaining = Math.max(0, next.remainingMs);
  next = { ...next, phaseEndsAt: now + remaining, runningSince: now, lastActionAt: now };
  return { state: next, events };
}

export function pauseFocusTimer(state: FocusTimerState, now: number): FocusTimerTransition {
  const reconciled = reconcileFocusTimer(state, now);
  // Already stopped (perhaps at a boundary that passed a moment ago): nothing to pause.
  if (!isRunning(reconciled.state)) return reconciled;

  const next = { ...stopRunning(reconciled.state, now), lastActionAt: now };
  const events = [...reconciled.events];
  const snapshot = snapshotOf(next);
  if (snapshot) events.push({ type: 'progress', snapshot });
  return { state: next, events };
}

/**
 * Reset: back to the initial state (flow 0, a fresh focus block). A session
 * that had started and not finished is DISCARDED — never abandoned — however
 * long it ran. A finished session is already recorded and stays as it is.
 */
export function resetFocusTimer(state: FocusTimerState, now: number): FocusTimerTransition {
  const reconciled = reconcileFocusTimer(state, now);
  const events = [...reconciled.events];
  const stopped = stopRunning(reconciled.state, now);

  if (isSessionInProgress(stopped)) {
    const snapshot = snapshotOf(stopped);
    if (snapshot) events.push({ type: 'discarded', snapshot });
  }
  return { state: createFocusTimerState(stopped.config, now), events };
}

/** The settings panel. Same rules as before: a stopped phase is re-timed, a running one is not. */
/**
 * The values each setting may hold — the same ranges as the user_settings
 * CHECKs (focus_block_minutes 1–240, buffer_minutes 0–60, default_flows 1–12),
 * in whole numbers. Presets, saved settings and custom entries all pass through
 * this, so the timer can never hold a value the schema would reject.
 */
export const FOCUS_SETTING_RANGES: Readonly<Record<FocusSetting, { min: number; max: number }>> = Object.freeze({
  timeBox: { min: 1, max: 240 },
  interval: { min: 0, max: 60 },
  flows: { min: 1, max: 12 }
});

export function isValidFocusSetting(setting: FocusSetting, value: unknown): value is number {
  const range = FOCUS_SETTING_RANGES[setting];
  return typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;
}

export function changeFocusTimerSetting(
  state: FocusTimerState,
  now: number,
  setting: FocusSetting,
  value: number
): FocusTimerTransition {
  // Out of range, fractional or not a number: nothing changes at all.
  if (!isValidFocusSetting(setting, value)) return { state, events: [] };
  const reconciled = reconcileFocusTimer(state, now);
  let next = { ...reconciled.state, lastActionAt: now };
  const running = isRunning(next);

  switch (setting) {
    case 'timeBox':
      next = { ...next, config: { ...next.config, blockMinutes: value } };
      if (!running && next.phase === 'focus') next = { ...next, remainingMs: value * MINUTE };
      break;
    case 'interval':
      next = { ...next, config: { ...next.config, breakMinutes: value } };
      if (!running && next.phase === 'break') next = { ...next, remainingMs: value * MINUTE };
      break;
    case 'flows':
      next = { ...next, config: { ...next.config, flows: value } };
      break;
  }
  return { state: next, events: reconciled.events };
}

/**
 * Applies the saved settings, but only to a timer with no session: the same
 * "seed once, before anything has started" rule the page always had. A session
 * in progress — or one just finished — is never re-timed by a settings load.
 */
export function seedFocusTimer(state: FocusTimerState | null, config: FocusTimerConfig, now: number): FocusTimerTransition {
  if (state && (state.sessionId !== null || isRunning(state))) return { state, events: [] };
  return { state: createFocusTimerState(config, now), events: [] };
}

// ---------------------------------------------------------------------------
// Parsing a stored state
// ---------------------------------------------------------------------------

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNumOrNull = (value: unknown): value is number | null => value === null || isNum(value);
const isStrOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

/** A stored state, or null when it is missing, from another version, or malformed in any way. */
export function parseFocusTimerState(value: unknown): FocusTimerState | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  const c = s.config as Record<string, unknown> | null | undefined;
  if (s.version !== FOCUS_TIMER_STATE_VERSION) return null;
  if (!c || typeof c !== 'object' || !isNum(c.blockMinutes) || !isNum(c.breakMinutes) || !isNum(c.flows)) return null;
  if (!isValidFocusSetting('timeBox', c.blockMinutes) || !isValidFocusSetting('interval', c.breakMinutes) || !isValidFocusSetting('flows', c.flows)) {
    return null;
  }
  if (s.phase !== 'focus' && s.phase !== 'break') return null;
  if (!isNum(s.remainingMs) || !isNumOrNull(s.phaseEndsAt) || !isNumOrNull(s.runningSince)) return null;
  if ((s.phaseEndsAt === null) !== (s.runningSince === null)) return null;
  if (!isNum(s.flowsCompleted) || !isNum(s.breaksTaken) || !isNum(s.focusMs) || !isNum(s.lastActionAt)) return null;
  if (s.flowsCompleted < 0 || s.breaksTaken < 0 || s.focusMs < 0) return null;
  if (!isStrOrNull(s.sessionId) || !isNumOrNull(s.sessionStartedAt) || !isStrOrNull(s.taskId)) return null;
  if ((s.sessionId === null) !== (s.sessionStartedAt === null)) return null;
  if (typeof s.finished !== 'boolean') return null;
  return {
    version: FOCUS_TIMER_STATE_VERSION,
    config: { blockMinutes: c.blockMinutes, breakMinutes: c.breakMinutes, flows: c.flows },
    phase: s.phase,
    remainingMs: s.remainingMs,
    phaseEndsAt: s.phaseEndsAt,
    runningSince: s.runningSince,
    flowsCompleted: s.flowsCompleted,
    breaksTaken: s.breaksTaken,
    focusMs: s.focusMs,
    sessionId: s.sessionId,
    sessionStartedAt: s.sessionStartedAt,
    taskId: s.taskId,
    finished: s.finished,
    lastActionAt: s.lastActionAt
  };
}
