/**
 * The Soundscape's app-level rules, as plain data and pure functions:
 * the catalogue, how spoken guidance pauses and resumes it, and where the
 * floating control may appear.
 */
import { Droplets, Waves, Zap, Sparkles, Wind } from 'lucide-react';

/** Matches the `user_settings.sound_volume` column default. */
export const FALLBACK_VOLUME = 75;

/**
 * Two ids do not match their filenames — `waves` plays ocean.mp3 and `ambient`
 * plays the binaural track — so each option carries its own path rather than
 * deriving one from the id. Ids stay as they were: they are only local state,
 * and renaming them would change nothing a user can see.
 */
export const soundOptions = [
  { id: 'rain', icon: Droplets, name: 'Rain', src: '/audio/soundscapes/rain.mp3' },
  { id: 'waves', icon: Waves, name: 'Ocean', src: '/audio/soundscapes/ocean.mp3' },
  { id: 'white-noise', icon: Zap, name: 'Brown Noise', src: '/audio/soundscapes/white-noise.mp3' },
  { id: 'ambient', icon: Sparkles, name: 'Binaural Focus', src: '/audio/soundscapes/binaural-focus-10hz.mp3' },
  { id: 'wind', icon: Wind, name: 'Wind', src: '/audio/soundscapes/wind.mp3' }
];

export type SoundOption = (typeof soundOptions)[number];

/** Rain is selected up front so the play button always has something to play. */
export const DEFAULT_SOUND_ID = soundOptions[0].id;

/** The binaural track is a stereo pair, so it only works over two channels. */
export const HEADPHONE_HINT_ID = 'ambient';

export const findSound = (id: string): SoundOption => soundOptions.find((sound) => sound.id === id) ?? soundOptions[0];

// ---------------------------------------------------------------------------
// Spoken guidance takes priority
// ---------------------------------------------------------------------------

export interface GuidanceInput {
  /** Audio focus is now claimed (guidance active) or free. */
  claimed: boolean;
  /** The Soundscape is playing or loading right now. */
  isActive: boolean;
  /** We paused it for guidance earlier and owe it a resume. */
  held: boolean;
}

export interface GuidanceTransition {
  action: 'pause' | 'resume' | null;
  held: boolean;
}

/**
 * Reacting to a change in audio focus:
 *   * guidance starts while the Soundscape plays → pause it and remember that;
 *   * guidance ends and we paused it → resume it;
 *   * anything else → nothing. A Soundscape that was not playing is never
 *     started, and one the user started DURING guidance is left alone.
 */
export function guidanceTransition({ claimed, isActive, held }: GuidanceInput): GuidanceTransition {
  if (claimed) return isActive ? { action: 'pause', held: true } : { action: null, held };
  return held ? { action: 'resume', held: false } : { action: null, held: false };
}

// ---------------------------------------------------------------------------
// The floating control
// ---------------------------------------------------------------------------

/**
 * Routes where the floating control is not shown:
 *   * /soundscape has the full controls already;
 *   * Safe Space chat keeps its message box at the bottom right, where the
 *     control would sit on the send button.
 */
export const MINI_PLAYER_HIDDEN_ROUTES: readonly string[] = Object.freeze(['/soundscape', '/safe-space/chat']);

const normalise = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname) || '/';

export function isMiniPlayerVisible(input: { signedIn: boolean; activated: boolean; pathname: string }): boolean {
  return input.signedIn && input.activated && !MINI_PLAYER_HIDDEN_ROUTES.includes(normalise(input.pathname));
}

/**
 * Focus has its own floating settings button in the same corner, so there the
 * control sits immediately to its left, on the same row, clear of the panel
 * that opens upwards from it.
 */
export function miniPlayerPlacement(pathname: string): 'default' | 'beside-focus-settings' {
  return normalise(pathname) === '/focus' ? 'beside-focus-settings' : 'default';
}
