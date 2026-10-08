/**
 * Voice Brain Dump: record → transcribe → hand the text back. Nothing else.
 *
 * Plain TypeScript with the browser handed in (getUserMedia, MediaRecorder,
 * timers), so every path is testable without a browser. The hook
 * (hooks/use-voice-capture.ts) wires in the real ones.
 *
 * Rules this module keeps:
 *   * The microphone is asked for only from start(), which a tap calls.
 *   * Recording stops by itself at maxMs (about a minute).
 *   * Every microphone track is stopped on completion, cancel, error and
 *     dispose (unmount), so the browser's "recording" indicator goes away.
 *   * Audio lives only in memory: chunks in an array, then one Blob handed to
 *     transcribe(), then dropped. Nothing is written to any storage.
 *   * The transcript is handed to onTranscript. Nothing is organized or saved.
 */

export type VoiceStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'transcribing' | 'error';

export type VoiceErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'no-microphone'
  | 'recording-failed'
  | 'empty'
  | 'transcription-failed';

export interface VoiceState {
  status: VoiceStatus;
  error: VoiceErrorCode | null;
  /** Plain sentence for the person, set with `error`. */
  message: string | null;
  /** Milliseconds recorded so far, while recording. */
  elapsedMs: number;
  /** The last recording reached the time limit and was stopped automatically. */
  autoStopped: boolean;
}

export const VOICE_MAX_MS = 60_000;

export const VOICE_MESSAGES: Record<Exclude<VoiceErrorCode, 'transcription-failed'>, string> = {
  unsupported: "Voice isn't available in this browser. You can still type.",
  'permission-denied': "iMA can't hear you yet. Allow microphone access in your browser settings, then try again.",
  'no-microphone': 'No microphone was found. You can still type.',
  'recording-failed': 'The recording stopped unexpectedly. Try again.',
  empty: 'Nothing was recorded. Try again.'
};

/** Preferred first: Chrome/Edge/Firefox webm, Safari mp4, then ogg. Detected, never assumed. */
export const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'] as const;

export interface TrackLike {
  stop(): void;
}
export interface StreamLike {
  getTracks(): TrackLike[];
}
export interface RecorderLike {
  readonly state: 'inactive' | 'recording' | 'paused';
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}
export interface RecorderCtor {
  new (stream: StreamLike, options?: { mimeType?: string }): RecorderLike;
  isTypeSupported?(type: string): boolean;
}

export interface VoiceEnv {
  getUserMedia?: (constraints: { audio: boolean }) => Promise<StreamLike>;
  MediaRecorder?: RecorderCtor;
  isSecureContext?: boolean;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; message: string };

/** The first container this browser can record, or null. */
export function pickMimeType(Recorder: RecorderCtor | undefined): string | null {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return null;
  for (const type of MIME_CANDIDATES) {
    try {
      if (Recorder.isTypeSupported(type)) return type;
    } catch {
      // A browser that throws here cannot be relied on for that type.
    }
  }
  return null;
}

export function isVoiceSupported(env: VoiceEnv): boolean {
  return !!(env.isSecureContext && env.getUserMedia && env.MediaRecorder && pickMimeType(env.MediaRecorder));
}

function errorCodeOf(cause: unknown): VoiceErrorCode {
  const name = (cause as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no-microphone';
  if (name === 'NotSupportedError' || name === 'TypeError') return 'unsupported';
  return 'recording-failed';
}

export interface VoiceCaptureController {
  getState(): VoiceState;
  subscribe(listener: () => void): () => void;
  /** Ask for the microphone and start recording. Call from a tap. */
  start(): Promise<void>;
  /** Stop recording and transcribe what was said. */
  stop(): void;
  /** Stop recording and throw it away. */
  cancel(): void;
  /** Unmount: release everything; no callback fires afterwards. */
  dispose(): void;
}

export interface VoiceCaptureOptions {
  env: VoiceEnv;
  transcribe: (audio: Blob) => Promise<TranscribeResult>;
  onTranscript: (text: string) => void;
  maxMs?: number;
}

export function createVoiceCapture(options: VoiceCaptureOptions): VoiceCaptureController {
  const { env } = options;
  const maxMs = options.maxMs ?? VOICE_MAX_MS;
  const now = env.now ?? (() => Date.now());
  const setT = env.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = env.clearTimeout ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const setI = env.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearI = env.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));

  const listeners = new Set<() => void>();
  let state: VoiceState = { status: 'idle', error: null, message: null, elapsedMs: 0, autoStopped: false };
  const set = (patch: Partial<VoiceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  let stream: StreamLike | null = null;
  let recorder: RecorderLike | null = null;
  let chunks: Blob[] = [];
  let limitTimer: unknown = null;
  let ticker: unknown = null;
  let startedAt = 0;
  let discard = false;
  let disposed = false;

  const stopTimers = () => {
    if (limitTimer !== null) clearT(limitTimer);
    if (ticker !== null) clearI(ticker);
    limitTimer = null;
    ticker = null;
  };

  /** Every track stopped, every reference dropped. Safe to call repeatedly. */
  const release = () => {
    stopTimers();
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Already stopped.
        }
      }
    }
    stream = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    recorder = null;
  };

  const fail = (code: VoiceErrorCode, message?: string) => {
    release();
    chunks = [];
    if (!disposed) set({ status: 'error', error: code, message: message ?? VOICE_MESSAGES[code as keyof typeof VOICE_MESSAGES] ?? null, elapsedMs: 0 });
  };

  const finish = async (mimeType: string) => {
    const wasDiscarded = discard;
    const audio = new Blob(chunks, { type: mimeType });
    chunks = [];
    release();
    if (disposed) return;
    if (wasDiscarded) {
      set({ status: 'idle', error: null, message: null, elapsedMs: 0 });
      return;
    }
    if (audio.size === 0) return fail('empty');

    set({ status: 'transcribing', elapsedMs: 0 });
    let result: TranscribeResult;
    try {
      result = await options.transcribe(audio);
    } catch {
      result = { ok: false, message: 'Could not turn that recording into text just now.' };
    }
    if (disposed) return;
    if ('text' in result) {
      options.onTranscript(result.text);
      set({ status: 'idle', error: null, message: null });
    } else {
      fail('transcription-failed', result.message);
    }
  };

  const stopRecording = (auto: boolean) => {
    if (state.status !== 'recording' || !recorder) return;
    stopTimers();
    set({ status: 'stopping', autoStopped: auto });
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      else void finish(recorder.mimeType);
    } catch {
      fail('recording-failed');
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async start() {
      if (disposed || (state.status !== 'idle' && state.status !== 'error')) return;
      discard = false;
      const Recorder = env.MediaRecorder;
      const mimeType = pickMimeType(Recorder);
      if (!env.isSecureContext || !env.getUserMedia || !Recorder || !mimeType) return fail('unsupported');

      set({ status: 'requesting', error: null, message: null, elapsedMs: 0, autoStopped: false });
      let granted: StreamLike;
      try {
        granted = await env.getUserMedia({ audio: true });
      } catch (cause) {
        return fail(errorCodeOf(cause));
      }
      stream = granted;
      // Closed or cancelled while the permission prompt was up.
      if (disposed || discard) {
        release();
        if (!disposed) set({ status: 'idle' });
        return;
      }

      try {
        recorder = new Recorder(granted, { mimeType });
        const active = recorder;
        active.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        active.onerror = () => fail('recording-failed');
        active.onstop = () => void finish(active.mimeType || mimeType);
        chunks = [];
        active.start(1000);
      } catch (cause) {
        return fail(errorCodeOf(cause));
      }

      startedAt = now();
      set({ status: 'recording', elapsedMs: 0 });
      ticker = setI(() => set({ elapsedMs: Math.min(now() - startedAt, maxMs) }), 250);
      limitTimer = setT(() => stopRecording(true), maxMs);
    },

    stop: () => stopRecording(false),

    cancel() {
      discard = true;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop(); // onstop → finish() sees `discard` and drops the audio
          return;
        } catch {
          // fall through to a plain release
        }
      }
      release();
      chunks = [];
      if (!disposed && state.status !== 'transcribing') set({ status: 'idle', error: null, message: null, elapsedMs: 0 });
    },

    dispose() {
      disposed = true;
      discard = true;
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        // releasing below regardless
      }
      release();
      chunks = [];
      listeners.clear();
    }
  };
}

/**
 * Puts a transcript after what is already in the box, never replacing it. A
 * new line separates it from earlier text. If the box would overflow, only the
 * part of the transcript that fits is added and `truncated` is true.
 */
export function appendTranscript(existing: string, transcript: string, maxLength: number): { text: string; truncated: boolean } {
  const addition = transcript.trim();
  if (!addition) return { text: existing, truncated: false };
  const base = existing.replace(/\s+$/, '');
  const prefix = base ? `${base}\n` : '';
  const room = maxLength - Array.from(prefix).length;
  if (room <= 0) return { text: existing, truncated: true };
  const chars = Array.from(addition);
  if (chars.length <= room) return { text: prefix + addition, truncated: false };
  return { text: prefix + chars.slice(0, room).join('').trimEnd(), truncated: true };
}
