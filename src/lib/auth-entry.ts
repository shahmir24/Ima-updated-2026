/**
 * Links into the sign-in screen, and which form it opens on.
 *
 * /auth opens on "Sign in", as it always has. /auth?mode=signup opens the same
 * screen on its existing "Create account" form. The parameter only chooses
 * the starting form: the screen, its toggle, and what signing up or in does
 * are unchanged.
 */

export const LOG_IN_PATH = '/auth';
export const SIGN_UP_PATH = '/auth?mode=signup';

/** True when the sign-in screen was opened asking for the sign-up form. */
export function opensOnSignUp(search: string): boolean {
  return new URLSearchParams(search).get('mode') === 'signup';
}
