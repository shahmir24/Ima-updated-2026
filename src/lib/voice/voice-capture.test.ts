import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VOICE_MAX_MS,
  VOICE_MESSAGES,
  appendTranscript,
  createVoiceCapture,
  isVoiceSupported,
  pickMimeType,
  type RecorderCtor,
  type TranscribeResult,
  type VoiceEnv
} from './voice-capture';

/** A browser with a microphone and a MediaRecorder that supports `types`. */
function fakeBrowser(options: { types?: string[]; permission?: 'grant' | Error; chunks?: Blob[] } = {}) {
  const types = new Set(options.types ?? ['audio/webm;codecs=opus', 'audio/webm']);
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks };
  const recorders: FakeRecorder[] = [];

  class FakeRecorder {
    static isTypeSupported = (type: string) => types.has(type);
    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    mimeType: string;
    timeslice: number | undefined;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    stop = vi.fn(() => {
      this.state = 'inactive';
      for (const data of options.chunks ?? [new Blob([new Uint8Array(2048)])]) this.ondataavailable?.({ data });
      this.onstop?.();
    });
    constructor(_stream: unknown, opts?: { mimeType?: string }) {
      this.mimeType = opts?.mimeType ?? '';
      recorders.push(this);
    }
    start(timeslice?: number) {
      this.state = 'recording';
      this.timeslice = timeslice;
    }
  }

  let resolvePermission: ((s: typeof stream) => void) | null = null;
  const getUserMedia = vi.fn(() =>
    options.permission instanceof Error
      ? Promise.reject(options.permission)
      : options.permission === undefined || options.permission === 'grant'
        ? Promise.resolve(stream)
        : new Promise<typeof stream>((resolve) => (resolvePermission = resolve))
  );

  const env: VoiceEnv = { getUserMedia, MediaRecorder: FakeRecorder as unknown as RecorderCtor, isSecureContext: true };
  return { env, getUserMedia, tracks, recorders, release: () => resolvePermission?.(stream) };
}

const named = (name: string) => Object.assign(new Error(name), { name });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function capture(env: VoiceEnv, transcribe: (audio: Blob) => Promise<TranscribeResult> = async () => ({ ok: true, text: 'call Ali tomorrow' })) {
  const onTranscript = vi.fn();
  const transcribeSpy = vi.fn(transcribe);
  const controller = createVoiceCapture({ env, transcribe: transcribeSpy, onTranscript });
  return { controller, onTranscript, transcribe: transcribeSpy };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('format detection (detected, never assumed)', () => {
  it('Chrome/Edge: webm with opus', () => {
    expect(pickMimeType(fakeBrowser().env.MediaRecorder)).toBe('audio/webm;codecs=opus');
  });
  it('Safari: mp4 when webm is not available', () => {
    expect(pickMimeType(fakeBrowser({ types: ['audio/mp4'] }).env.MediaRecorder)).toBe('audio/mp4');
  });
  it('Firefox-style ogg as a last resort', () => {
    expect(pickMimeType(fakeBrowser({ types: ['audio/ogg;codecs=opus'] }).env.MediaRecorder)).toBe('audio/ogg;codecs=opus');
  });
  it('nothing supported, or no isTypeSupported → none', () => {
    expect(pickMimeType(fakeBrowser({ types: ['audio/wav'] }).env.MediaRecorder)).toBeNull();
    expect(pickMimeType(class {} as unknown as RecorderCtor)).toBeNull();
    expect(pickMimeType(undefined)).toBeNull();
  });
  it.each([
    ['not a secure context', { isSecureContext: false }],
    ['no getUserMedia', { getUserMedia: undefined }],
    ['no MediaRecorder', { MediaRecorder: undefined }]
  ])('unsupported browser: %s', (_label, patch) => {
    expect(isVoiceSupported({ ...fakeBrowser().env, ...patch })).toBe(false);
  });
  it('a capable browser is supported', () => {
    expect(isVoiceSupported(fakeBrowser().env)).toBe(true);
  });
});

describe('recording and stopping', () => {
  it('asks for the microphone only on start, records with the detected type, and transcribes on stop', async () => {
    const b = fakeBrowser();
    const { controller, onTranscript, transcribe } = capture(b.env);
    expect(b.getUserMedia).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('idle');

    await controller.start();
    expect(b.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(controller.getState().status).toBe('recording');
    expect(b.recorders[0]).toMatchObject({ mimeType: 'audio/webm;codecs=opus', state: 'recording', timeslice: 1000 });

    controller.stop();
    await flush();
    expect(transcribe).toHaveBeenCalledTimes(1);
    const audio = transcribe.mock.calls[0][0] as Blob;
    expect(audio.type).toBe('audio/webm;codecs=opus');
    expect(audio.size).toBe(2048);
    expect(onTranscript).toHaveBeenCalledWith('call Ali tomorrow');
    expect(controller.getState()).toMatchObject({ status: 'idle', error: null, autoStopped: false });
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
  });

  it('shows stopping, then transcribing, while it works', async () => {
    const b = fakeBrowser();
    let finishTranscription: (r: TranscribeResult) => void = () => {};
    const { controller } = capture(b.env, () => new Promise((resolve) => (finishTranscription = resolve)));
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getState().status));
    await controller.start();
    controller.stop();
    expect(seen).toContain('stopping');
    expect(controller.getState().status).toBe('transcribing');
    finishTranscription({ ok: true, text: 'x' });
    await flush();
    expect(controller.getState().status).toBe('idle');
  });

  it('Safari: records and sends mp4', async () => {
    const b = fakeBrowser({ types: ['audio/mp4'] });
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    controller.stop();
    await flush();
    expect((transcribe.mock.calls[0][0] as Blob).type).toBe('audio/mp4');
  });

  it('stops itself at about 60 seconds and still transcribes', async () => {
    vi.useFakeTimers();
    const b = fakeBrowser();
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    vi.advanceTimersByTime(30_000);
    expect(controller.getState().elapsedMs).toBeGreaterThan(29_000);
    expect(b.recorders[0].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(VOICE_MAX_MS - 30_000);
    expect(b.recorders[0].stop).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ status: 'idle', autoStopped: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a second start while busy is ignored', async () => {
    const b = fakeBrowser();
    const { controller } = capture(b.env);
    await controller.start();
    await controller.start();
    expect(b.getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  it.each([
    ['permission denied', named('NotAllowedError'), 'permission-denied'],
    ['blocked by policy', named('SecurityError'), 'permission-denied'],
    ['no microphone', named('NotFoundError'), 'no-microphone'],
    ['anything else', named('AbortError'), 'recording-failed']
  ])('%s → %s, nothing recorded or sent', async (_label, permission, code) => {
    const b = fakeBrowser({ permission });
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'error', error: code, message: VOICE_MESSAGES[code as keyof typeof VOICE_MESSAGES] });
    expect(b.recorders).toHaveLength(0);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('an unsupported browser fails without asking for the microphone', async () => {
    const b = fakeBrowser({ types: [] });
    const { controller } = capture(b.env);
    await controller.start();
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'unsupported' });
    expect(b.getUserMedia).not.toHaveBeenCalled();
  });

  it('a recorder error stops everything and releases the microphone', async () => {
    const b = fakeBrowser();
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    b.recorders[0].onerror?.(new Event('error'));
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'recording-failed' });
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('an empty recording is not sent', async () => {
    const b = fakeBrowser({ chunks: [] });
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    controller.stop();
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'empty' });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('a failed transcription shows its message and inserts nothing', async () => {
    const b = fakeBrowser();
    const { controller, onTranscript } = capture(b.env, async () => ({ ok: false, message: 'Voice is not available right now. You can still type.' }));
    await controller.start();
    controller.stop();
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'error', error: 'transcription-failed', message: 'Voice is not available right now. You can still type.' });
    expect(onTranscript).not.toHaveBeenCalled();
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
  });

  it('a throwing transcriber is handled', async () => {
    const b = fakeBrowser();
    const { controller } = capture(b.env, async () => { throw new Error('network'); });
    await controller.start();
    controller.stop();
    await flush();
    expect(controller.getState().status).toBe('error');
  });

  it('you can try again after an error', async () => {
    const b = fakeBrowser();
    const { controller } = capture(b.env, async () => ({ ok: false, message: 'x' }));
    await controller.start();
    controller.stop();
    await flush();
    await controller.start();
    expect(controller.getState().status).toBe('recording');
  });
});

describe('cleanup', () => {
  it('cancel while recording: nothing sent, microphone released, back to idle', async () => {
    const b = fakeBrowser();
    const { controller, transcribe, onTranscript } = capture(b.env);
    await controller.start();
    controller.cancel();
    await flush();
    expect(transcribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('idle');
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
  });

  it('unmount (dispose) while recording: recorder stopped, tracks released, nothing sent', async () => {
    const b = fakeBrowser();
    const { controller, transcribe } = capture(b.env);
    await controller.start();
    controller.dispose();
    await flush();
    expect(b.recorders[0].stop).toHaveBeenCalled();
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('unmount while the permission prompt is open: the stream that arrives later is released at once', async () => {
    const b = fakeBrowser({ permission: 'grant' });
    let resolve: (s: unknown) => void = () => {};
    (b.getUserMedia as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const { controller } = capture(b.env);
    const starting = controller.start();
    controller.dispose();
    resolve({ getTracks: () => b.tracks });
    await starting;
    expect(b.recorders).toHaveLength(0);
    for (const track of b.tracks) expect(track.stop).toHaveBeenCalled();
  });

  it('unmount while transcribing: the transcript is never inserted', async () => {
    const b = fakeBrowser();
    let finish: (r: TranscribeResult) => void = () => {};
    const { controller, onTranscript } = capture(b.env, () => new Promise((r) => (finish = r)));
    await controller.start();
    controller.stop();
    controller.dispose();
    finish({ ok: true, text: 'late' });
    await flush();
    expect(onTranscript).not.toHaveBeenCalled();
  });
});

describe('audio stays in memory', () => {
  beforeEach(() => {
    const spy = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    vi.stubGlobal('localStorage', spy);
    vi.stubGlobal('sessionStorage', spy);
  });

  it('a full record → transcribe cycle touches no storage', async () => {
    const b = fakeBrowser();
    const { controller } = capture(b.env);
    await controller.start();
    controller.stop();
    await flush();
    for (const store of [globalThis.localStorage, globalThis.sessionStorage] as unknown as Record<string, ReturnType<typeof vi.fn>>[]) {
      for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it('no voice module references browser storage', () => {
    for (const file of ['./voice-capture.ts', './transcribe.ts', '../../hooks/use-voice-capture.ts', '../../components/capture/VoiceControls.tsx']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8'), file).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\./);
    }
  });
});

describe('appendTranscript (text insertion)', () => {
  it('fills an empty box', () => {
    expect(appendTranscript('', ' call Ali ', 2000)).toEqual({ text: 'call Ali', truncated: false });
  });
  it('adds after existing text on a new line, never replacing it', () => {
    expect(appendTranscript('Buy shoes  ', 'call Ali', 2000)).toEqual({ text: 'Buy shoes\ncall Ali', truncated: false });
  });
  it('an empty transcript changes nothing', () => {
    expect(appendTranscript('Buy shoes', '   ', 2000)).toEqual({ text: 'Buy shoes', truncated: false });
  });
  it('only what fits is added; existing text is kept whole', () => {
    expect(appendTranscript('abc', 'defghij', 8)).toEqual({ text: 'abc\ndefg', truncated: true });
    expect(appendTranscript('x'.repeat(10), 'more', 10)).toEqual({ text: 'x'.repeat(10), truncated: true });
  });
});
