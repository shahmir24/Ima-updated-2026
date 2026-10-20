/**
 * Ask the browser to treat the Soundscape as media playback.
 *
 * Without this, iOS gives Web Audio the "ambient" audio-session category,
 * which the iPhone's ring/silent switch mutes: the AudioContext runs, the UI
 * says Playing, and nothing is heard. Safari 17+ exposes
 * `navigator.audioSession`; setting its type to 'playback' puts the page in
 * the same category as music and video, which the silent switch does not mute.
 *
 * Called synchronously at the start of a user's Play, before the AudioContext
 * is created or resumed. Browsers without the API (Android, desktop, older
 * iOS) are left exactly as they were. Never throws.
 *
 * Returns true when the session is (now) 'playback'.
 */

interface AudioSessionLike {
  type: string;
}

export function preferPlaybackAudioSession(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  try {
    const session = (nav as { audioSession?: AudioSessionLike } | undefined)?.audioSession;
    if (!session || typeof session !== 'object' || !('type' in session)) return false;
    if (session.type !== 'playback') session.type = 'playback';
    return session.type === 'playback';
  } catch {
    // A read-only or misbehaving implementation must not stop the sound.
    return false;
  }
}
