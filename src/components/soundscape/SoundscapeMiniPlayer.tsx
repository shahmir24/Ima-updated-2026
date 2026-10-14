import { Pause, Play } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useOptionalSoundscape } from '@/contexts/soundscape-context';
import { isMiniPlayerVisible, miniPlayerPlacement } from '@/lib/soundscape/soundscape-session';

export const SOUNDSCAPE_MINI_PLAYER_ERROR_ID = 'soundscape-mini-player-error';

/**
 * The floating Soundscape control: one small round play/pause button.
 *
 *   * Shown only once the user has started a Soundscape since signing in,
 *     and not on /soundscape itself (which has the full controls).
 *   * Bottom-right, above the phone's bottom navigation; on /focus it sits
 *     just left of the floating settings button, on the same row.
 *   * Static: no pulsing, no scaling, no entrance animation.
 *   * A real <button>, so Tab, Enter and Space work, with a label that says
 *     what it will do and to which sound.
 *
 * Changing the sound or the volume still happens on the Soundscape page.
 */
const SoundscapeMiniPlayer = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const soundscape = useOptionalSoundscape();
  if (!soundscape || !isMiniPlayerVisible({ signedIn: !!user, activated: soundscape.activated, pathname })) {
    return null;
  }

  const { isActive, isLoading, errorMessage, selectedSound, togglePlay } = soundscape;
  // Says what a press will do; a load in progress is paused (cancelled) by it, as on the page.
  const label = isActive
    ? `Pause ${selectedSound.name} soundscape${isLoading ? ' (loading)' : ''}`
    : `Play ${selectedSound.name} soundscape`;
  const position =
    miniPlayerPlacement(pathname) === 'beside-focus-settings'
      ? // Phones only: from lg the Focus settings sit inline, with no gear to clear.
        'right-[4.75rem] lg:right-8'
      : 'right-4 lg:right-8';

  return (
    <div
      data-testid="soundscape-mini-player"
      className={`fixed z-40 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:bottom-10 ${position}`}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={label}
        title={errorMessage ?? label}
        aria-describedby={errorMessage ? SOUNDSCAPE_MINI_PLAYER_ERROR_ID : undefined}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg backdrop-blur-xl transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
      >
        {isActive ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
      </button>
      {errorMessage && (
        <span id={SOUNDSCAPE_MINI_PLAYER_ERROR_ID} className="sr-only" role="status">
          {errorMessage}
        </span>
      )}
    </div>
  );
};

export default SoundscapeMiniPlayer;
