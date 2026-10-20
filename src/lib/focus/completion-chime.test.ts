import { describe, expect, it, vi } from 'vitest';
import { CHIME_NOTES, createChimePlayer, cueLength, type ChimeAudioContext, type CompletionCue } from './completion-chime';

/** A Web Audio stand-in that records what was scheduled. */
function fakeContext(options: { resumable?: boolean } = {}) {
  const resumable = options.resumable ?? true;
  const notes: { frequency: number; start: number }[] = [];
  const ctx = {
    state: 'suspended' as string,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      if (resumable) ctx.state = 'running';
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
    createOscillator() {
      let frequency = 0;
      return {
        type: '',
        frequency: { setValueAtTime: (value: number) => (frequency = value) },
        connect: () => undefined,
        start: (time: number) => void notes.push({ frequency, start: time }),
        stop: () => undefined
      };
    },
    createGain() {
      const ramp = () => undefined;
      return { gain: { setValueAtTime: ramp, linearRampToValueAtTime: ramp, exponentialRampToValueAtTime: ramp }, connect: () => undefined };
    },
    createBuffer: () => ({}),
    createBufferSource: () => ({ buffer: null, connect: () => undefined, start: () => undefined })
  };
  return { ctx: ctx as typeof ctx & ChimeAudioContext, notes };
}

function player(options: { resumable?: boolean; audioSession?: { type: string } | null; noAudio?: boolean } = {}) {
  const { ctx, notes } = fakeContext(options);
  const clock = { now: 0 };
  const timers: { at: number; fn: () => void }[] = [];
  const nav = options.audioSession === null ? {} : { audioSession: options.audioSession ?? { type: 'auto' } };
  const chime = createChimePlayer({
    createContext: () => (options.noAudio ? null : ctx),
    navigator: nav,
    now: () => clock.now,
    // Timers fire straight away for the resume timeout, and are kept for the rest.
    setTimeout: (fn, ms) => {
      if (ms <= 1000) fn();
      else timers.push({ at: clock.now + ms, fn });
    }
  });
  const advance = (ms: number) => {
    clock.now += ms;
    for (const timer of timers.splice(0)) {
      if (timer.at <= clock.now) timer.fn();
      else timers.push(timer);
    }
  };
  return { chime, ctx, notes, nav, advance };
}

const frequencies = (cue: CompletionCue) => CHIME_NOTES[cue].map((note) => note.frequency);

describe('the three cues', () => {
  it('can be told apart: focus falls, break rises, session climbs further and lasts longer', () => {
    const [f1, f2] = frequencies('focus-complete');
    const [b1, b2] = frequencies('break-complete');
    expect(f2).toBeLessThan(f1);
    expect(b2).toBeGreaterThan(b1);
    const session = frequencies('session-complete');
    expect(session.length).toBeGreaterThan(2);
    expect([...session].sort((a, b) => a - b)).toEqual(session);
    expect(cueLength('session-complete')).toBeGreaterThan(cueLength('focus-complete'));
    expect(new Set([frequencies('focus-complete').join(), frequencies('break-complete').join(), session.join()]).size).toBe(3);
  });

  it('are short and quiet: under 2.5 seconds, no note louder than a quarter', () => {
    for (const cue of Object.keys(CHIME_NOTES) as CompletionCue[]) {
      expect(cueLength(cue)).toBeLessThan(2.5);
      for (const note of CHIME_NOTES[cue]) expect(note.peak).toBeLessThanOrEqual(0.25);
    }
  });
});

describe('the chime player', () => {
  it('plays each cue it is asked for, once unlocked by a tap', async () => {
    for (const cue of ['focus-complete', 'break-complete', 'session-complete'] as const) {
      const { chime, notes } = player();
      chime.unlock();
      expect(await chime.play(cue)).toBe(true);
      expect(notes.map((n) => n.frequency)).toEqual(frequencies(cue));
    }
  });

  it('stays silent until a tap has unlocked it', async () => {
    const { chime, notes } = player();
    expect(await chime.play('focus-complete')).toBe(false);
    expect(notes).toHaveLength(0);
  });

  it('unlocking asks for the playback audio session, like the Soundscape', () => {
    const { chime, nav } = player({ audioSession: { type: 'auto' } });
    chime.unlock();
    expect((nav as { audioSession: { type: string } }).audioSession.type).toBe('playback');
  });

  it('works where navigator.audioSession does not exist', async () => {
    const { chime, notes } = player({ audioSession: null });
    expect(() => chime.unlock()).not.toThrow();
    expect(await chime.play('break-complete')).toBe(true);
    expect(notes).toHaveLength(2);
  });

  it('reports false, without throwing, when there is no Web Audio or the OS will not resume it', async () => {
    const none = player({ noAudio: true });
    none.chime.unlock();
    expect(await none.chime.play('focus-complete')).toBe(false);

    const refused = player({ resumable: false });
    refused.chime.unlock();
    expect(await refused.chime.play('focus-complete')).toBe(false);
    expect(refused.notes).toHaveLength(0);
  });

  it('never overlaps two chimes', async () => {
    const { chime, notes, advance } = player();
    chime.unlock();
    expect(await chime.play('focus-complete')).toBe(true);
    expect(await chime.play('session-complete')).toBe(false);
    expect(notes).toHaveLength(2);
    advance(cueLength('focus-complete') * 1000 + 100);
    expect(await chime.play('break-complete')).toBe(true);
  });

  it('suspends its context between chimes and resumes it for the next', async () => {
    const { chime, ctx, advance } = player();
    chime.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.state).toBe('suspended');
    await chime.play('focus-complete');
    expect(ctx.state).toBe('running');
    advance(5000);
    expect(ctx.state).toBe('suspended');
  });

  it('alongside a playing Soundscape: keeps the playback session and uses only its own one context', async () => {
    const audioSession = { type: 'playback' }; // already set by the Soundscape's Play
    const { ctx } = fakeContext();
    const createContext = vi.fn(() => ctx);
    const chime = createChimePlayer({ createContext, navigator: { audioSession }, setTimeout: (fn) => void fn() });
    chime.unlock();
    chime.unlock();
    await chime.play('focus-complete');
    chime.unlock();
    expect(audioSession.type).toBe('playback');
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('dispose closes the context and silences later calls', async () => {
    const { chime, ctx } = player();
    chime.unlock();
    chime.dispose();
    expect(ctx.close).toHaveBeenCalled();
    expect(await chime.play('focus-complete')).toBe(false);
  });
});
