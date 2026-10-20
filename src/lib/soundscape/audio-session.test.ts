import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preferPlaybackAudioSession } from './audio-session';

describe('preferPlaybackAudioSession', () => {
  it('supported (Safari 17+ on iOS): switches the session to playback', () => {
    const nav = { audioSession: { type: 'auto' } };
    expect(preferPlaybackAudioSession(nav)).toBe(true);
    expect(nav.audioSession.type).toBe('playback');
  });

  it('already playback: left as it is', () => {
    let writes = 0;
    const session = { _t: 'playback', get type() { return this._t; }, set type(v: string) { writes++; this._t = v; } };
    expect(preferPlaybackAudioSession({ audioSession: session })).toBe(true);
    expect(writes).toBe(0);
  });

  it('unsupported (Android, desktop, older iOS, no navigator): nothing happens, nothing throws', () => {
    expect(preferPlaybackAudioSession({})).toBe(false);
    expect(preferPlaybackAudioSession({ audioSession: null })).toBe(false);
    expect(preferPlaybackAudioSession({ audioSession: 'nope' })).toBe(false);
    expect(preferPlaybackAudioSession(undefined)).toBe(false);
    expect(preferPlaybackAudioSession(null)).toBe(false);
  });

  it('a read-only or throwing implementation never stops playback', () => {
    const readOnly = { audioSession: { get type() { return 'ambient'; } } };
    expect(preferPlaybackAudioSession(readOnly)).toBe(false);
    const throwing = { audioSession: { get type() { return 'auto'; }, set type(_v: string) { throw new Error('denied'); } } };
    expect(() => preferPlaybackAudioSession(throwing)).not.toThrow();
    expect(preferPlaybackAudioSession(throwing)).toBe(false);
  });
});

describe('the Soundscape player sets it inside the tap, before the AudioContext', () => {
  const hook = readFileSync(new URL('../../hooks/use-soundscape-player.ts', import.meta.url), 'utf8');
  const play = hook.slice(hook.indexOf('const play = useCallback('), hook.indexOf('const pause = useCallback('));

  it('first thing in play(): before the context is created and before resume()', () => {
    const session = play.indexOf('preferPlaybackAudioSession();');
    expect(session).toBeGreaterThan(-1);
    expect(session).toBeLessThan(play.indexOf('ensureGraph()'));
    expect(session).toBeLessThan(play.indexOf('context.resume()'));
    // Nothing asynchronous before it, so it stays within the user's gesture.
    expect(play.slice(0, session)).not.toMatch(/await|\.then\(|setTimeout/);
  });

  it('set once per play, and nowhere else — the AudioContext lifecycle is otherwise untouched', () => {
    expect(hook.match(/preferPlaybackAudioSession\(\)/g)).toHaveLength(1);
    expect(hook.match(/new Constructor\(\)/g)).toHaveLength(1);
  });
});
