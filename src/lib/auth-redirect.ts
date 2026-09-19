/**
 * Everything about "where does Supabase send the browser back to, and what do
 * we do with what it puts in the URL".
 *
 * Email confirmation works like this with the implicit flow (see client.ts):
 *
 *   1. signUp({ options: { emailRedirectTo } }) -> Supabase mails a link to
 *      <project>.supabase.co/auth/v1/verify?token=…&type=signup&redirect_to=<emailRedirectTo>
 *   2. Clicking it verifies the account server-side and 302s the browser to
 *      <emailRedirectTo>#access_token=…&refresh_token=…   (success), or
 *      <emailRedirectTo>#error=…&error_code=…&error_description=…  (failure)
 *   3. supabase-js reads that fragment on boot (detectSessionInUrl) and either
 *      stores the session or reports the error.
 *
 * Two things make step 3 fragile, and this module exists for both:
 *
 *   * `redirect_to` must be on the project's Redirect URLs allow list, or
 *     Supabase silently substitutes the Site URL. Both values are derived from
 *     one constant here so there is exactly one URL to allow-list.
 *   * On failure supabase-js leaves the error in the fragment and throws the
 *     session away. Nothing renders it, so an expired link looks like the app
 *     ignoring the user. We snapshot the fragment at module load — before
 *     supabase-js has had a chance to clear it — so the sign-in screen can say
 *     what actually happened.
 */

/** Path Supabase returns the browser to after an email link is verified. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Absolute URL for the `emailRedirectTo` option. Derived from the running
 * origin so localhost, preview deployments and production each come back to
 * themselves — every origin still has to be allow-listed in the dashboard.
 */
export function getEmailRedirectTo(): string {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

interface AuthCallbackError {
  message: string;
  code: string | null;
}

/**
 * Parses the auth error Supabase puts in the URL, if there is one. Query
 * string and fragment are both checked: the fragment is what the implicit flow
 * uses, the query string is what a `?error=` style redirect uses.
 */
function parseAuthError(href: string): AuthCallbackError | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const params = new URLSearchParams(url.search);
  if (url.hash.startsWith('#')) {
    // Query parameters win, matching how supabase-js merges the two.
    const hashParams = new URLSearchParams(url.hash.slice(1));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  const error = params.get('error');
  const errorCode = params.get('error_code');
  const description = params.get('error_description');

  if (!error && !errorCode && !description) return null;

  // The one case worth explaining in the user's own terms. A signup link is
  // single-use and time-limited, and mail scanners routinely burn it before a
  // human clicks; both land here.
  if (errorCode === 'otp_expired' || error === 'access_denied') {
    return {
      code: errorCode ?? error,
      message:
        'That confirmation link has expired or has already been used. ' +
        'Sign up again with the same email address to get a fresh one.'
    };
  }

  return {
    code: errorCode ?? error,
    message: description ?? 'That sign-in link could not be used. Please try again.'
  };
}

/**
 * The auth error present in the URL when the app booted.
 *
 * Captured during module evaluation, which runs to completion before any of
 * supabase-js's asynchronous URL handling can start — so this sees the
 * fragment whether or not the client later clears it.
 */
const bootAuthError: AuthCallbackError | null =
  typeof window === 'undefined' ? null : parseAuthError(window.location.href);

let bootAuthErrorConsumed = false;

/**
 * Returns the boot-time auth error once, then never again — so it is reported
 * on the screen that first asks for it and does not resurface on later
 * navigations.
 */
export function consumeAuthCallbackError(): string | null {
  if (bootAuthErrorConsumed || !bootAuthError) return null;
  bootAuthErrorConsumed = true;
  return bootAuthError.message;
}
