/**
 * Short synthesised chimes for the Focus Timer's boundaries.
 *
 * Nothing is downloaded: each cue is a few sine notes with a soft attack and
 * an exponential decay, built with Web Audio oscillators. The cues are data
 * (CHIME_NOTES) so they can be told apart by ear and tested by shape:
 *
 *   focus-complete    two notes falling  — wind down, time for a break
 *   break-complete    two notes rising   — back to it
 *   session-complete  a rising arpeggio that lands an octave up — done
 *
 * The chime has its own small AudioContext, apart from the Soundscape's, so
 * it never touches the Soundscape's graph, volume or pause state; the two
 * simply mix. Browsers only let a context start inside a user gesture, so
 * unlock() is called synchronously in the tap that presses Play. After that
 * the context is kept suspended between chimes and resumed for each one.
 * When it cannot run (no Web Audio, never unlocked, the OS refusing), play()
 * resolves false and the caller relies on the visual notice alone.
 */
import { preferPlaybackAudioSession } from '@/lib/soundscape/audio-session';

export type CompletionCue = 'focus-complete' | 'break-complete' | 'session-complete';

export interface ChimeNote {
  /** Hz. */
  frequency: number;
  /** Seconds from the start of the cue. */
  start: number;
  /** Seconds until the note has decayed away. */
  duration: number;
  /** Peak gain, 0–1. */
  peak: number;
}

// C major, around C5: bright enough to notice, never shrill.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

export const CHIME_NOTES: Record<CompletionCue, readonly ChimeNote[]> = {
  'focus-complete': [
    { frequency: G5, start: 0, duration: 0.9, peak: 0.22 },
    { frequency: C5, start: 0.22, duration: 1.2, peak: 0.2 }
  ],
  'break-complete': [
    { frequency: C5, start: 0, duration: 0.9, peak: 0.2 },
    { frequency: G5, start: 0.22, duration: 1.2, peak: 0.22 }
  ],
  'session-complete': [
    { frequency: C5, start: 0, duration: 0.8, peak: 0.18 },
    { frequency: E5, start: 0.16, duration: 0.8, peak: 0.18 },
    { frequency: G5, start: 0.32, duration: 0.9, peak: 0.2 },
    { frequency: C6, start: 0.5, duration: 1.6, peak: 0.22 }
  ]
};

/** How long a cue sounds, in seconds. */
export const cueLength = (cue: CompletionCue): number =>
  Math.max(...CHIME_NOTES[cue].map((note) => note.start + note.duration));

/** The parts of AudioContext the chime uses; a fake in tests. */
export interface ChimeAudioContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { setValueAtTime(value: number, time: number): unknown };
    connect(node: unknown): unknown;
    start(time: number): void;
    stop(time: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, time: number): unknown;
      linearRampToValueAtTime(value: number, time: number): unknown;
      exponentialRampToValueAtTime(value: number, time: number): unknown;
    };
    connect(node: unknown): unknown;
  };
  createBuffer?(channels: number, length: number, sampleRate: number): unknown;
  createBufferSource?(): { buffer: unknown; connect(node: unknown): unknown; start(time?: number): void };
}

export interface ChimePlayer {
  /** Call synchronously inside a user's tap. Safe to call on every tap. */
  unlock(): void;
  /** Plays the cue; false when it could not (no audio, locked, already chiming). */
  play(cue: CompletionCue): Promise<boolean>;
  dispose(): void;
}

export interface ChimePlayerOptions {
  /** Builds the context; null where Web Audio is missing. */
  createContext?: () => ChimeAudioContext | null;
  /** For navigator.audioSession (see audio-session.ts). */
  navigator?: unknown;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

/** How long resume() may take before the chime gives up and stays silent. */
const RESUME_TIMEOUT_MS = 800;
/** Lead time so the first note's attack is not clipped. */
const LEAD_S = 0.03;
const ATTACK_S = 0.015;

function browserContext(): ChimeAudioContext | null {
  if (typeof window === 'undefined') return null;
  const scope = window as Window & { webkitAudioContext?: new () => AudioContext };
  const Constructor = window.AudioContext ?? scope.webkitAudioContext;
  if (!Constructor) return null;
  try {
    return new Constructor() as unknown as ChimeAudioContext;
  } catch {
    return null;
  }
}

export function createChimePlayer(options: ChimePlayerOptions = {}): ChimePlayer {
  const createContext = options.createContext ?? browserContext;
  const nav = options.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator);
  const now = options.now ?? Date.now;
  const later = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));

  let context: ChimeAudioContext | null = null;
  let unlocked = false;
  let disposed = false;
  /** Wall-clock end of the chime in progress: a second cue never overlaps it. */
  let busyUntil = 0;

  const rest = () => {
    // Suspended between chimes: no idle audio work, and on iOS no held audio session.
    if (context && !disposed && now() >= busyUntil && context.state === 'running') {
      void context.suspend().catch(() => undefined);
    }
  };

  return {
    unlock() {
      if (disposed) return;
      // Same as the Soundscape: the ring/silent switch must not mute it on iOS.
      preferPlaybackAudioSession(nav);
      context ??= createContext();
      if (!context) return;
      unlocked = true;
      if (context.state === 'running') return;
      try {
        // Older iOS only unlocks a context that starts a sound inside the gesture.
        if (context.createBuffer && context.createBufferSource) {
          const silent = context.createBufferSource();
          silent.buffer = context.createBuffer(1, 1, 22050);
          silent.connect(context.destination);
          silent.start(0);
        }
      } catch {
        // The resume below is what matters.
      }
      context
        .resume()
        .then(rest)
        .catch(() => undefined);
    },

    async play(cue) {
      const ctx = context;
      if (disposed || !ctx || !unlocked) return false;
      const lengthMs = cueLength(cue) * 1000;
      if (now() < busyUntil) return false;
      busyUntil = now() + lengthMs + LEAD_S * 1000;

      if (ctx.state !== 'running') {
        await Promise.race([
          ctx.resume().catch(() => undefined),
          new Promise<void>((resolve) => later(resolve, RESUME_TIMEOUT_MS))
        ]);
      }
      if (disposed || ctx.state !== 'running') {
        busyUntil = 0;
        return false;
      }

      try {
        const t0 = ctx.currentTime + LEAD_S;
        for (const note of CHIME_NOTES[cue]) {
          const start = t0 + note.start;
          const end = start + note.duration;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(note.frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(note.peak, start + ATTACK_S);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(end + 0.05);
        }
      } catch {
        busyUntil = 0;
        return false;
      }

      later(rest, lengthMs + 250);
      return true;
    },

    dispose() {
      disposed = true;
      const ctx = context;
      context = null;
      if (ctx) void ctx.close().catch(() => undefined);
    }
  };
}
