/**
 * What a journal screen says when loading, checking or saving fails.
 *
 * Supabase hands errors back as plain objects ({ message, code, details,
 * hint }), not Error instances, and their messages can name tables, policies
 * and constraints. Nothing here ever shows that text: an error is sorted into
 * one of a few kinds by its code or a known message shape, and each kind has
 * fixed wording that says what happened and that the user's writing is safe.
 */

/** What the journal was doing when it failed. */
export type JournalErrorContext = 'load' | 'check' | 'save';

export type JournalErrorKind = 'offline' | 'expired' | 'permission' | 'changed' | 'signed-out' | 'unknown';

/** Thrown by the journal hook itself when there is no signed-in user. */
export const SIGNED_OUT_MESSAGE = 'You must be signed in to save a journal entry.';

const field = (error: unknown, key: string): string => {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function journalErrorKind(error: unknown): JournalErrorKind {
  const message = field(error, 'message');
  const code = field(error, 'code');
  const status = field(error, 'status');

  if (error instanceof Error && message === SIGNED_OUT_MESSAGE) return 'signed-out';
  // supabase-js reports a failed fetch as "TypeError: Failed to fetch" (Chrome),
  // "NetworkError…" (Firefox) or "Load failed" (Safari).
  if (isOffline() || /failed to fetch|networkerror|network request failed|load failed|fetcherror|fetch failed/i.test(message)) {
    return 'offline';
  }
  if (code === 'PGRST301' || code === 'PGRST302' || status === '401' || /jwt/i.test(message)) return 'expired';
  if (code === '42501' || status === '403' || /permission denied|row-level security/i.test(message)) return 'permission';
  // .single() on an update that matched no row: the entry is gone, or is no
  // longer this user's to change.
  if (code === 'PGRST116') return 'changed';
  return 'unknown';
}

const STILL_HERE = 'Your writing is still here';

const MESSAGES: Record<JournalErrorContext, Record<JournalErrorKind, string>> = {
  load: {
    offline: 'You seem to be offline, so today’s entry couldn’t load. You can keep writing — we’ll check for it again before saving.',
    expired: 'Your session has expired, so today’s entry couldn’t load. Sign in again to see it.',
    permission: 'We couldn’t open your journal with this account. Please sign in again.',
    changed: 'We couldn’t load today’s entry. You can keep writing — we’ll check for it again before saving.',
    'signed-out': 'Sign in to see today’s entry.',
    unknown: 'We couldn’t load today’s entry. You can keep writing — we’ll check for it again before saving.'
  },
  check: {
    offline: `You seem to be offline, so nothing was saved. ${STILL_HERE} — try again when you’re connected.`,
    expired: `Your session has expired, so nothing was saved. ${STILL_HERE} — copy anything you want to keep, then sign in again.`,
    permission: `We couldn’t check your journal with this account, so nothing was saved. ${STILL_HERE} — please sign in again.`,
    changed: `We couldn’t check for an entry you saved earlier today, so nothing was saved. ${STILL_HERE} — please try again.`,
    'signed-out': `You need to be signed in to save. ${STILL_HERE} — copy anything you want to keep, then sign in.`,
    unknown: `We couldn’t check for an entry you saved earlier today, so nothing was saved. ${STILL_HERE} — please try again.`
  },
  save: {
    offline: `You seem to be offline. ${STILL_HERE} — try again when you’re connected.`,
    expired: `Your session has expired. ${STILL_HERE} — copy anything you want to keep, then sign in again.`,
    permission: `We couldn’t save this to your account. ${STILL_HERE} — please sign in again.`,
    changed: `Today’s entry changed somewhere else. ${STILL_HERE} — copy anything you want to keep, then reload to see the latest.`,
    'signed-out': `You need to be signed in to save. ${STILL_HERE} — copy anything you want to keep, then sign in.`,
    unknown: `Something went wrong saving this. ${STILL_HERE} — please try again.`
  }
};

/** Safe, fixed wording for a journal failure. Never includes the error's own text. */
export function friendlyJournalError(error: unknown, context: JournalErrorContext): string {
  return MESSAGES[context][journalErrorKind(error)];
}
