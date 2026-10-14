import { describe, expect, it } from 'vitest';
import { createAudioFocus } from '@/lib/audio/audio-focus';
import { createSoundscapeController, type SoundscapePlayerControls } from './soundscape-controller';
import { DEFAULT_SOUND_ID, FALLBACK_VOLUME, guidanceTransition, isMiniPlayerVisible, miniPlayerPlacement, soundOptions } from './soundscape-session';

/**
 * A stand-in for useSoundscapePlayer that keeps the same observable rules:
 * one source at a time, play resumes the loaded sound or switches, pause
 * suspends, stop forgets. It records every call so tests can see exactly what
 * the controller asked of the audio engine.
 */
function fakePlayer() {
  const calls: string[] = [];
  let playing: string | null = null;
  let loaded: string | null = null;
  let volume = FALLBACK_VOLUME / 100;
  /** How many sources are sounding at once — must never exceed 1. */
  let sources = 0;
  let maxSources = 0;
  const player: SoundscapePlayerControls = {
    play(id) {
      calls.push(`play:${id}`);
      if (loaded !== id) {
        sources = 0; // the outgoing source is stopped first
        loaded = id;
        sources = 1;
      }
      playing = id;
      maxSources = Math.max(maxSources, sources);
    },
    pause() {
      calls.push('pause');
      playing = null;
    },
    stop() {
      calls.push('stop');
      playing = null;
      loaded = null;
      sources = 0;
    },
    setVolume(value) {
      volume = value;
    },
    isActive: () => playing !== null
  };
  return { player, calls, playing: () => playing, loaded: () => loaded, volume: () => volume, maxSources: () => maxSources };
}

function setup() {
  const focus = createAudioFocus();
  const fake = fakePlayer();
  const controller = createSoundscapeController({ player: fake.player, focus });
  const disconnect = controller.connect();
  return { focus, fake, controller, disconnect };
}

describe('Soundscape controller — playback', () => {
  it('starts silent: nothing plays until the user presses play', () => {
    const { fake, controller } = setup();
    expect(fake.calls).toEqual([]);
    expect(controller.snapshot()).toEqual({ selectedSoundId: DEFAULT_SOUND_ID, volume: FALLBACK_VOLUME, activated: false });
  });

  it('play starts the selected sound and activates the floating control; play again pauses', () => {
    const { fake, controller } = setup();
    controller.togglePlay();
    expect(fake.playing()).toBe('rain');
    expect(controller.snapshot().activated).toBe(true);
    controller.togglePlay();
    expect(fake.playing()).toBeNull();
    expect(controller.snapshot().activated).toBe(true); // stays visible so the user can resume
  });

  it('pause then play resumes the same sound (the engine keeps its loop position)', () => {
    const { fake, controller } = setup();
    controller.togglePlay();
    controller.togglePlay();
    controller.togglePlay();
    expect(fake.calls).toEqual(['play:rain', 'pause', 'play:rain']);
  });

  it('selecting while paused only selects; selecting while playing switches — never two sources', () => {
    const { fake, controller } = setup();
    controller.selectSound('waves');
    expect(fake.calls).toEqual([]);
    expect(controller.snapshot().selectedSoundId).toBe('waves');
    controller.togglePlay();
    controller.selectSound('wind');
    controller.selectSound('ambient');
    expect(fake.playing()).toBe('ambient');
    expect(fake.maxSources()).toBe(1);
  });

  it('an unknown sound id falls back to the first option', () => {
    const { controller } = setup();
    controller.selectSound('nope');
    expect(controller.snapshot().selectedSoundId).toBe(soundOptions[0].id);
  });

  it('volume: the slider value reaches the engine as 0–1 and is clamped', () => {
    const { fake, controller } = setup();
    controller.setVolume(40);
    expect(fake.volume()).toBe(0.4);
    controller.setVolume(140);
    expect(controller.snapshot().volume).toBe(100);
  });

  it('the saved volume is applied once, and never over the user\'s own change', () => {
    const { fake, controller } = setup();
    controller.seedVolume(30);
    expect(fake.volume()).toBe(0.3);
    controller.seedVolume(90); // a refetch
    expect(controller.snapshot().volume).toBe(30);

    const other = setup();
    other.controller.setVolume(55);
    other.controller.seedVolume(20);
    expect(other.controller.snapshot().volume).toBe(55);
  });

  it('state survives "navigation" — it lives in the controller, not a page', () => {
    const { fake, controller } = setup();
    controller.selectSound('waves');
    controller.setVolume(60);
    controller.togglePlay();
    // A page unmounting and another mounting does nothing to the controller.
    expect(controller.snapshot()).toEqual({ selectedSoundId: 'waves', volume: 60, activated: true });
    expect(fake.playing()).toBe('waves');
  });
});

describe('Soundscape controller — spoken guidance takes priority', () => {
  it('guidance pauses a playing Soundscape and resumes it afterwards', () => {
    const { focus, fake, controller } = setup();
    controller.togglePlay();
    const release = focus.claim();
    expect(fake.playing()).toBeNull();
    release();
    expect(fake.playing()).toBe('rain');
    expect(fake.calls).toEqual(['play:rain', 'pause', 'play:rain']);
  });

  it('never starts a Soundscape that was not playing', () => {
    const { focus, fake, controller } = setup();
    focus.claim()();
    expect(fake.calls).toEqual([]);
    controller.togglePlay();
    controller.togglePlay(); // user paused it
    focus.claim()();
    expect(fake.playing()).toBeNull();
    expect(fake.calls).toEqual(['play:rain', 'pause']);
  });

  it('a user who presses play during guidance keeps playing; release changes nothing', () => {
    const { focus, fake, controller } = setup();
    const release = focus.claim();
    controller.togglePlay();
    release();
    expect(fake.calls).toEqual(['play:rain']);
  });

  it('a user who pauses after guidance paused it is not overridden on release', () => {
    const { focus, fake, controller } = setup();
    controller.togglePlay();
    const release = focus.claim();
    controller.togglePlay(); // explicit play during guidance…
    controller.togglePlay(); // …then explicit pause
    release();
    expect(fake.playing()).toBeNull();
  });

  it('two guidance claims: resumes only when the last one ends', () => {
    const { focus, fake, controller } = setup();
    controller.togglePlay();
    const a = focus.claim();
    const b = focus.claim();
    a();
    expect(fake.playing()).toBeNull();
    b();
    expect(fake.playing()).toBe('rain');
  });

  it('resumes the sound that was selected', () => {
    const { focus, fake, controller } = setup();
    controller.selectSound('wind');
    controller.togglePlay();
    const release = focus.claim();
    release();
    expect(fake.playing()).toBe('wind');
  });

  it('guidance already active when connecting pauses a playing sound', () => {
    const focus = createAudioFocus();
    const fake = fakePlayer();
    const controller = createSoundscapeController({ player: fake.player, focus });
    controller.togglePlay();
    const release = focus.claim();
    controller.connect();
    expect(fake.playing()).toBeNull();
    release();
    expect(fake.playing()).toBe('rain');
  });

  it('disconnect stops listening (StrictMode can connect, disconnect and connect again)', () => {
    const { focus, fake, controller, disconnect } = setup();
    disconnect();
    controller.connect();
    controller.togglePlay();
    focus.claim();
    expect(fake.playing()).toBeNull();
  });
});

describe('Soundscape controller — sign-out and account change', () => {
  it('stops playback and clears selection, volume and activation', () => {
    const { fake, controller } = setup();
    controller.selectSound('waves');
    controller.setVolume(20);
    controller.togglePlay();
    controller.resetForAccount();
    expect(fake.playing()).toBeNull();
    expect(fake.loaded()).toBeNull(); // nothing left to resume
    expect(fake.volume()).toBe(FALLBACK_VOLUME / 100);
    expect(controller.snapshot()).toEqual({ selectedSoundId: DEFAULT_SOUND_ID, volume: FALLBACK_VOLUME, activated: false });
  });

  it('a pending guidance resume is forgotten: the next account never hears the last one\'s sound', () => {
    const { focus, fake, controller } = setup();
    controller.togglePlay();
    const release = focus.claim();
    controller.resetForAccount();
    release();
    expect(fake.playing()).toBeNull();
  });

  it('the next account gets its own saved volume', () => {
    const { controller } = setup();
    controller.seedVolume(30);
    controller.resetForAccount();
    controller.seedVolume(80);
    expect(controller.snapshot().volume).toBe(80);
  });
});

describe('guidanceTransition', () => {
  it.each([
    [{ claimed: true, isActive: true, held: false }, { action: 'pause', held: true }],
    [{ claimed: true, isActive: false, held: false }, { action: null, held: false }],
    [{ claimed: false, isActive: false, held: true }, { action: 'resume', held: false }],
    [{ claimed: false, isActive: false, held: false }, { action: null, held: false }],
    [{ claimed: false, isActive: true, held: false }, { action: null, held: false }]
  ] as const)('%j → %j', (input, output) => {
    expect(guidanceTransition(input)).toEqual(output);
  });
});

describe('floating control rules', () => {
  it('shows only for a signed-in user who has started a Soundscape', () => {
    expect(isMiniPlayerVisible({ signedIn: true, activated: true, pathname: '/' })).toBe(true);
    expect(isMiniPlayerVisible({ signedIn: true, activated: false, pathname: '/' })).toBe(false);
    expect(isMiniPlayerVisible({ signedIn: false, activated: true, pathname: '/' })).toBe(false);
  });

  it.each(['/soundscape', '/soundscape/', '/safe-space/chat'])('hidden on %s', (pathname) => {
    expect(isMiniPlayerVisible({ signedIn: true, activated: true, pathname })).toBe(false);
  });

  it.each(['/tasks', '/focus', '/body-double', '/breathing/steady-square', '/mindfulness/body-scan/session', '/stats'])('shown on %s', (pathname) => {
    expect(isMiniPlayerVisible({ signedIn: true, activated: true, pathname })).toBe(true);
  });

  it('sits beside the Focus settings button on /focus, in the corner elsewhere', () => {
    expect(miniPlayerPlacement('/focus')).toBe('beside-focus-settings');
    expect(miniPlayerPlacement('/tasks')).toBe('default');
  });

  it('the sound catalogue is unchanged', () => {
    expect(soundOptions.map((s) => [s.id, s.name, s.src])).toEqual([
      ['rain', 'Rain', '/audio/soundscapes/rain.mp3'],
      ['waves', 'Ocean', '/audio/soundscapes/ocean.mp3'],
      ['white-noise', 'Brown Noise', '/audio/soundscapes/white-noise.mp3'],
      ['ambient', 'Binaural Focus', '/audio/soundscapes/binaural-focus-10hz.mp3'],
      ['wind', 'Wind', '/audio/soundscapes/wind.mp3']
    ]);
  });
});
