/**
 * What the Soundscape should show when the AudioContext's state changes
 * behind the app's back.
 *
 * The player suspends its own context to pause. But the browser or the OS can
 * also suspend it — iOS does when the app goes to the background, the screen
 * locks, or a call comes in, and Safari reports 'interrupted' for that. The
 * sound then stops while the UI still says "Playing". This decides how the UI
 * catches up; it never resumes anything itself.
 */

/** 'interrupted' is Safari's extra state for an OS interruption. */
export type ObservedContextState = AudioContextState | 'interrupted';

export type SuspensionChange =
  /** Was playing; the system stopped it. Show paused and say why. */
  | 'paused-by-system'
  /** The system let it run again by itself (e.g. after a call): it really is playing. */
  | 'running-again'
  | null;

export interface SuspensionInput {
  /** The player's status right now. */
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  /** A looping source is wired in, so there is something that could be sounding. */
  hasSource: boolean;
  /** Set when the last change was 'paused-by-system', until the user acts. */
  pausedBySystem: boolean;
  state: ObservedContextState;
}

export function suspensionChange({ status, hasSource, pausedBySystem, state }: SuspensionInput): SuspensionChange {
  if (!hasSource) return null;
  if (status === 'playing' && state !== 'running') return 'paused-by-system';
  // Only undo a pause the system made: a pause the user chose never turns
  // itself back into "Playing".
  if (pausedBySystem && status === 'paused' && state === 'running') return 'running-again';
  return null;
}

export const SYSTEM_PAUSED_MESSAGE = 'Your device paused the sound. Tap play to resume.';
