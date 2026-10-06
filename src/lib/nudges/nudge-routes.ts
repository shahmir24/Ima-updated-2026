/**
 * Where the in-app gentle nudge may appear.
 *
 * An ALLOWLIST, so the safe answer is the default: a route that is not named
 * here — including every route added later — never shows a nudge until
 * someone decides it should.
 *
 * Allowed: places a person browses or plans — Home, Tasks, the Productivity,
 * Wellness, Meditation, Mindfulness and Journal landing pages, journal
 * history, Soundscape, Stats, Profile & Settings.
 *
 * Never (by not being listed): Focus and Body Double; breathing (its menu and
 * every exercise); meditations, mindful walks and the body scan; every journal
 * WRITING page, including the post-panic journal; all of Safe Space; auth,
 * the email callback, welcome and onboarding.
 */
export const NUDGE_ROUTES: readonly string[] = Object.freeze([
  '/',
  '/tasks',
  '/productivity',
  '/soundscape',
  '/stats',
  '/wellness',
  '/wellness/mindfulness',
  '/meditation',
  '/mindfulness/walking',
  '/journaling',
  '/journaling/history',
  '/profile-settings'
]);

/** Exact match on the path (query and hash ignored; a trailing slash tolerated). */
export function isNudgeRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return NUDGE_ROUTES.includes(path || '/');
}
