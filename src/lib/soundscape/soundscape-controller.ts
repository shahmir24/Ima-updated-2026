/**
 * The app-level Soundscape, without React: the selected sound, the volume,
 * whether it has been activated, and how it reacts to spoken guidance and to
 * the account changing. SoundscapeProvider wraps this around the existing
 * player hook; the player itself (one AudioContext, one looping source, its
 * load-race and autoplay safeguards) is untouched.
 */
import type { AudioFocus } from '@/lib/audio/audio-focus';
import { DEFAULT_SOUND_ID, FALLBACK_VOLUME, findSound, guidanceTransition } from './soundscape-session';

/** The parts of useSoundscapePlayer the controller drives. */
export interface SoundscapePlayerControls {
  play(soundId: string, url: string): void;
  pause(): void;
  stop(): void;
  /** 0–1. */
  setVolume(value: number): void;
  /** Playing or loading, as the player reports it right now. */
  isActive(): boolean;
}

export interface SoundscapeSnapshot {
  selectedSoundId: string;
  /** 0–100. */
  volume: number;
  /** Started at least once since sign-in. */
  activated: boolean;
}

export interface SoundscapeController {
  snapshot(): SoundscapeSnapshot;
  subscribe(listener: () => void): () => void;
  /** Play or pause the selected sound. Only ever called from a user gesture. */
  togglePlay(): void;
  /** Select a sound; switches straight away only if something is playing. */
  selectSound(id: string): void;
  /** The user moved the slider. */
  setVolume(volume: number): void;
  /** The saved volume arrived. Applied once per account, never over the user's own change. */
  seedVolume(volume: number): void;
  /** Sign-out or a different account: stop, and forget everything. */
  resetForAccount(): void;
  /**
   * Starts following audio focus (spoken guidance). Returns the disconnect.
   * Separate from creation so a React effect can connect and disconnect it
   * any number of times (StrictMode does exactly that).
   */
  connect(): () => void;
}

const clampVolume = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : FALLBACK_VOLUME));

export function createSoundscapeController(options: { player: SoundscapePlayerControls; focus: AudioFocus }): SoundscapeController {
  const { player, focus } = options;
  const listeners = new Set<() => void>();

  let snapshot: SoundscapeSnapshot = { selectedSoundId: DEFAULT_SOUND_ID, volume: FALLBACK_VOLUME, activated: false };
  /** We paused it for guidance and owe it a resume. */
  let held = false;
  let seeded = false;
  let volumeTouched = false;

  const update = (patch: Partial<SoundscapeSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const playSelected = () => {
    const sound = findSound(snapshot.selectedSoundId);
    player.play(sound.id, sound.src);
  };

  const onFocus = (claimed: boolean) => {
    const next = guidanceTransition({ claimed, isActive: player.isActive(), held });
    held = next.held;
    if (next.action === 'pause') player.pause();
    // Resumes the paused source where it was. A browser that will not resume
    // without a fresh tap leaves it paused with the player's existing
    // "tap play again" message; it is never forced.
    if (next.action === 'resume') playSelected();
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    togglePlay() {
      // An explicit choice replaces any pending guidance resume.
      held = false;
      if (player.isActive()) {
        player.pause();
        return;
      }
      playSelected();
      if (!snapshot.activated) update({ activated: true });
    },
    selectSound(id) {
      const sound = findSound(id);
      if (sound.id !== snapshot.selectedSoundId) update({ selectedSoundId: sound.id });
      // Selecting while paused picks the sound without starting it.
      if (player.isActive()) player.play(sound.id, sound.src);
    },
    setVolume(volume) {
      volumeTouched = true;
      const value = clampVolume(volume);
      player.setVolume(value / 100);
      update({ volume: value });
    },
    seedVolume(volume) {
      if (seeded) return;
      seeded = true;
      if (volumeTouched) return;
      const value = clampVolume(volume);
      player.setVolume(value / 100);
      update({ volume: value });
    },
    resetForAccount() {
      player.stop();
      held = false;
      seeded = false;
      volumeTouched = false;
      player.setVolume(FALLBACK_VOLUME / 100);
      update({ selectedSoundId: DEFAULT_SOUND_ID, volume: FALLBACK_VOLUME, activated: false });
    },
    connect() {
      const unsubscribe = focus.subscribe(onFocus);
      // Guidance that was already speaking when we connected.
      if (focus.isClaimed()) onFocus(true);
      return () => {
        unsubscribe();
      };
    }
  };
}
