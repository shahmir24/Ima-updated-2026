/**
 * Copy for the Voice Brain Dump controls. Kept out of VoiceControls.tsx so
 * that file exports only a component (fast refresh).
 *
 * The privacy line speaks only for iMA: the transcription provider's own
 * handling is disclosed in the privacy policy.
 */
export const VOICE_COPY = {
  record: 'Record your thoughts',
  stop: 'Stop recording',
  idleHint: 'Tap the mic to talk instead of typing.',
  requesting: 'Waiting for the microphone...',
  listening: (elapsed: string, max: string) => `Listening ${elapsed} of ${max}. Tap to stop.`,
  stopping: 'Finishing...',
  transcribing: 'Turning your words into text...',
  autoStopped: 'Stopped at one minute. Your words are in the box.',
  truncated: "Some of that didn't fit in the box.",
  privacy: "Your voice is transcribed securely. Audio isn't saved by iMA."
} as const;
