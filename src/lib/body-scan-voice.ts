/**
 * Whether the Body Scan's closing line is spoken.
 *
 * Only for a scan that is playing when it completes: then the voice is
 * holding audio focus (useSpokenGuidance is `active` while playing), so a
 * Soundscape steps aside for the line and comes back after, as it does for
 * every step. Reaching the end by pressing Skip without ever starting — or
 * after pausing — stays silent: the user never asked the app to talk, and the
 * line would otherwise play over any Soundscape without pausing it.
 */
export function speaksCompletionLine(state: { showCompletion: boolean; isPlaying: boolean }): boolean {
  return state.showCompletion && state.isPlaying;
}
