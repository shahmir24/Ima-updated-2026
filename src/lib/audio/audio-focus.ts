/**
 * Audio focus: who gets to be heard right now.
 *
 * Spoken guidance (breathing exercises, the body scan) CLAIMS focus while it
 * is active and audible; the app-wide Soundscape listens and steps aside while
 * any claim is held. Claims are counted, so two claimants never release each
 * other's hold, and releasing is idempotent, so a React effect cleanup that
 * runs twice cannot drop the count below the truth.
 *
 * No React and no audio here: just the signal.
 */

export type AudioFocusListener = (claimed: boolean) => void;

export interface AudioFocus {
  /** Takes a claim. Returns its release; calling that more than once is harmless. */
  claim(): () => void;
  isClaimed(): boolean;
  /** Called with the new value whenever "claimed" flips. */
  subscribe(listener: AudioFocusListener): () => void;
}

export function createAudioFocus(): AudioFocus {
  let claims = 0;
  const listeners = new Set<AudioFocusListener>();
  const emit = () => listeners.forEach((listener) => listener(claims > 0));

  return {
    claim() {
      claims++;
      if (claims === 1) emit();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        claims--;
        if (claims === 0) emit();
      };
    },
    isClaimed: () => claims > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/** The app's one audio focus. */
export const audioFocus = createAudioFocus();
