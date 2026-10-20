/**
 * What the user is told when a focus block, a break or a whole session runs
 * out: one short message and, when it can play, one chime.
 *
 * It listens to the Focus Timer's own events (FocusTimerEngine's onEvents)
 * rather than watching the clock, so it adds no second timer. The engine
 * crosses at most one boundary per transition and only the tab that made the
 * transition receives its events, so each boundary is announced once, in one
 * tab. Coming back long after a boundary (an app suspended in the background,
 * a reopened browser) still shows the message, but silently: a chime minutes
 * late would only confuse, and several boundaries never queue up as a burst.
 *
 * Kept apart from how a phase starts, so automatic breaks can later change
 * the wording without changing how a boundary is detected or announced.
 */
import type { FocusTimerEvent } from './focus-timer-state';
import type { CompletionCue } from './completion-chime';

export const COMPLETION_MESSAGES: Record<CompletionCue, string> = {
  'focus-complete': 'Focus complete. Time for a break.',
  'break-complete': 'Break complete. Ready to focus?',
  'session-complete': 'Session complete.'
};

/** A boundary older than this when it is noticed is announced without sound. */
export const AUDIBLE_WINDOW_MS = 60_000;

export interface CompletionAnnouncement {
  cue: CompletionCue;
  sessionId: string;
  /** When the phase ran out. */
  at: number;
}

/**
 * The one thing worth announcing in a transition's events, or null.
 *
 * Nothing is announced when the same transition also abandoned or discarded
 * the session (an idle timeout reached on return, a Reset): the session is
 * over, and "Time for a break" would be wrong.
 */
export function completionAnnouncementFor(events: readonly FocusTimerEvent[]): CompletionAnnouncement | null {
  if (events.some((event) => event.type === 'abandoned' || event.type === 'discarded')) return null;
  let found: CompletionAnnouncement | null = null;
  for (const event of events) {
    if (event.type === 'completed') {
      found = { cue: 'session-complete', sessionId: event.snapshot.sessionId, at: event.endedAt };
    } else if (event.type === 'progress' && event.boundary) {
      found = {
        cue: event.boundary.ended === 'focus' ? 'focus-complete' : 'break-complete',
        sessionId: event.snapshot.sessionId,
        at: event.boundary.at
      };
    }
  }
  return found;
}

export interface CompletionFeedbackOptions {
  /** Shows the message; always called, so the notice never depends on sound. */
  notify: (message: string, cue: CompletionCue) => void;
  /** Plays the cue's chime; resolves false when it could not. */
  chime?: (cue: CompletionCue) => Promise<boolean> | boolean;
  now?: () => number;
}

export interface CompletionFeedback {
  /** Hand it each transition's events. Returns what was announced, if anything. */
  handle(events: readonly FocusTimerEvent[]): { announcement: CompletionAnnouncement; audible: boolean } | null;
}

/** How many announced boundaries are remembered to turn away a repeat. */
const REMEMBERED = 32;

export function createCompletionFeedback(options: CompletionFeedbackOptions): CompletionFeedback {
  const now = options.now ?? Date.now;
  const announced: string[] = [];

  return {
    handle(events) {
      const announcement = completionAnnouncementFor(events);
      if (!announcement) return null;

      // The engine already delivers a boundary once; this guards against any
      // path that hands the same events over twice.
      const key = `${announcement.sessionId}:${announcement.cue}:${announcement.at}`;
      if (announced.includes(key)) return null;
      announced.push(key);
      if (announced.length > REMEMBERED) announced.shift();

      const audible = now() - announcement.at <= AUDIBLE_WINDOW_MS;
      options.notify(COMPLETION_MESSAGES[announcement.cue], announcement.cue);
      if (audible && options.chime) {
        try {
          void Promise.resolve(options.chime(announcement.cue)).catch(() => undefined);
        } catch {
          // The message is already up.
        }
      }
      return { announcement, audible };
    }
  };
}
