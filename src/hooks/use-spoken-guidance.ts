import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Spoken guidance for the guided wellness exercises.
 *
 * Browser-native SpeechSynthesis, platform default voice, no voice selection
 * and no network. The hard parts are all about *not* speaking:
 *
 * - Cues are keyed. A cue speaks only when its key changes, so a re-render, a
 *   settings refetch or a re-invoked state updater cannot say the same thing
 *   twice. `repeat` is the explicit opt-out, for resuming and unmuting.
 * - Every utterance cancels whatever is speaking first, so two cues can never
 *   overlap and nothing ever queues. There is no backlog to replay because
 *   nothing is ever held: the hook remembers one key, not a list.
 * - It never speaks on its own. A page calls `speak` only after the user has
 *   started the exercise, so loading a route is always silent.
 * - Speech failures are contained. If the API is missing, throws, or errors
 *   mid-utterance, the exercise carries on untouched.
 */

/** Slightly slower than default: guidance, not narration. */
const SPEECH_RATE = 0.9;
/** Used until user_settings arrives, and if it never does. */
const DEFAULT_VOLUME = 0.75;

/**
 * One preference for all spoken wellness guidance, on this device. Muting
 * during a breathing exercise mutes the body scan too: the user is saying
 * "not out loud, here", which is about the room they are in, not the account.
 */
const MUTE_STORAGE_KEY = 'ima.wellness.voiceMuted';

export interface SpokenGuidance {
  /** False when the browser has no SpeechSynthesis. Hide the control then. */
  supported: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  /** Speak `text` once for `key`. A repeated key is a no-op. */
  speak: (key: string, text: string) => void;
  /** Speak `text` for `key` even if that key has already been spoken. */
  repeat: (key: string, text: string) => void;
  /** Stop speaking now. Keeps the last key, so cues are not re-spoken. */
  cancel: () => void;
  /** Stop speaking and forget the last key, so the first cue can speak again. */
  reset: () => void;
}

export interface SpokenGuidanceOptions {
  /** 0–1. Falls back to DEFAULT_VOLUME when settings have not loaded. */
  volume?: number;
}

function detectSupport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  } catch {
    return false;
  }
}

function readStoredMute(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    // Private mode, blocked storage — a first-time user, as far as we know.
    return false;
  }
}

const clampVolume = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_VOLUME));

export function useSpokenGuidance(options: SpokenGuidanceOptions = {}): SpokenGuidance {
  // Computed once: whether the API exists cannot change mid-session.
  const [supported] = useState(detectSupport);

  // Voice is ON for a first-time user; a previous mute on this device sticks.
  const [muted, setMutedState] = useState(readStoredMute);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const volumeRef = useRef(DEFAULT_VOLUME);
  volumeRef.current = clampVolume(options.volume ?? DEFAULT_VOLUME);

  /** The last cue key spoken (or suppressed while muted). */
  const lastKeyRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // A browser that cannot cancel cannot have been speaking.
    }
  }, [supported]);

  const utter = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      try {
        const synthesis = window.speechSynthesis;
        // Cancel first, always: this is what makes overlapping speech and a
        // growing queue structurally impossible rather than merely unlikely.
        synthesis.cancel();

        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.rate = SPEECH_RATE;
        utterance.pitch = 1;
        utterance.volume = volumeRef.current;
        utterance.lang = 'en-US';
        // A cue that fails is a cue the user does not hear. It is not a reason
        // to interrupt the exercise, so this deliberately does nothing.
        utterance.onerror = () => undefined;

        synthesis.speak(utterance);
      } catch {
        // Same reasoning: speech is an enhancement, never a dependency.
      }
    },
    [supported]
  );

  const speak = useCallback(
    (key: string, text: string) => {
      if (lastKeyRef.current === key) return;
      // Recorded even while muted, so unmuting mid-phase does not then speak a
      // cue the user already missed.
      lastKeyRef.current = key;
      if (mutedRef.current) return;
      utter(text);
    },
    [utter]
  );

  const repeat = useCallback(
    (key: string, text: string) => {
      lastKeyRef.current = key;
      if (mutedRef.current) return;
      utter(text);
    },
    [utter]
  );

  const reset = useCallback(() => {
    lastKeyRef.current = null;
    cancel();
  }, [cancel]);

  const setMuted = useCallback(
    (next: boolean) => {
      mutedRef.current = next;
      setMutedState(next);
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? 'true' : 'false');
      } catch {
        // The preference is a convenience; losing it must not break muting.
      }
      // Muting has to be immediate: a half-spoken cue carrying on after the
      // user asks for silence is the whole reason they reached for the button.
      if (next) cancel();
    },
    [cancel]
  );

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  // A hidden tab keeps speaking while its timers are throttled, so the voice
  // drifts out of step with an exercise the user cannot even see.
  useEffect(() => {
    if (!supported || typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (document.hidden) cancel();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [supported, cancel]);

  // speechSynthesis lives on window, so an utterance outlives this component.
  // Without this, leaving mid-cue reads the next screen a line of guidance.
  useEffect(() => cancel, [cancel]);

  return { supported, muted, setMuted, toggleMuted, speak, repeat, cancel, reset };
}
