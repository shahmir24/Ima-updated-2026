/**
 * Safe wording for failures on the sign-in screen, the onboarding save and
 * Journal History.
 *
 * Supabase errors — AuthError from supabase.auth, PostgrestError (a plain
 * object) from the database — carry text that can name tables, policies,
 * constraints and internal codes. None of it is ever shown: an error is sorted
 * into a kind by its code, status or a known message shape, and each screen
 * has fixed wording per kind.
 */

export type ErrorKind = 'offline' | 'rate-limit' | 'expired' | 'permission' | 'unknown';

const field = (error: unknown, key: string): string => {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function errorKind(error: unknown): ErrorKind {
  const message = field(error, 'message');
  const code = field(error, 'code');
  const status = field(error, 'status');
  const name = field(error, 'name');

  // A failed fetch: "Failed to fetch" (Chrome), "NetworkError…" (Firefox),
  // "Load failed" (Safari); supabase-js auth wraps it as AuthRetryableFetchError.
  if (
    isOffline() ||
    name === 'AuthRetryableFetchError' ||
    /failed to fetch|networkerror|network request failed|load failed|fetcherror|fetch failed/i.test(message)
  ) {
    return 'offline';
  }
  if (status === '429' || /rate_limit/.test(code) || /rate limit|too many requests/i.test(message)) return 'rate-limit';
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'session_expired' || status === '401' || /jwt/i.test(message)) {
    return 'expired';
  }
  if (code === '42501' || status === '403' || /permission denied|row-level security/i.test(message)) return 'permission';
  return 'unknown';
}

/** Auth error codes (and, for older servers, message shapes) with their own sentence. */
const AUTH_SPECIFIC: { codes: string[]; message: RegExp; text: string }[] = [
  {
    codes: ['invalid_credentials'],
    message: /invalid login credentials/i,
    text: 'Invalid email or password. Please check your credentials and try again.'
  },
  {
    codes: ['user_already_exists', 'email_exists'],
    message: /user already registered/i,
    text: 'An account with this email already exists. Please sign in instead.'
  },
  {
    codes: ['email_not_confirmed'],
    message: /email not confirmed/i,
    text: 'Please check your email and click the confirmation link before signing in.'
  },
  {
    codes: ['weak_password'],
    message: /password should be/i,
    text: 'That password is too weak. Use at least 6 characters, and avoid common passwords.'
  },
  {
    codes: ['email_address_invalid', 'validation_failed'],
    message: /unable to validate email address|invalid format/i,
    text: 'That email address doesn’t look right. Please check it and try again.'
  }
];

const AUTH_BY_KIND: Record<ErrorKind, string> = {
  offline: 'You seem to be offline. Check your connection and try again.',
  'rate-limit': 'Too many attempts in a short time. Please wait a minute, then try again.',
  expired: 'Your session has expired. Please try again.',
  permission: 'Something went wrong signing you in. Please try again.',
  unknown: 'Something went wrong signing you in. Please try again.'
};

/** Sign-in and sign-up failures. */
export function friendlyAuthError(error: unknown): string {
  const code = field(error, 'code');
  const message = field(error, 'message');
  const kind = errorKind(error);
  // The network and rate limits come first: their wording says what to do.
  if (kind === 'offline' || kind === 'rate-limit') return AUTH_BY_KIND[kind];
  for (const known of AUTH_SPECIFIC) {
    if (known.codes.includes(code) || known.message.test(message)) return known.text;
  }
  return AUTH_BY_KIND[kind];
}

const ONBOARDING_BY_KIND: Record<ErrorKind, string> = {
  offline: 'You seem to be offline, so your answers weren’t saved. They’re still here — try again when you’re connected.',
  'rate-limit': 'Too many attempts in a short time. Your answers are still here — wait a minute, then try again.',
  expired: 'Your session has expired, so your answers weren’t saved. Please sign in again.',
  permission: 'We couldn’t save your answers to this account. Please sign in again.',
  unknown: 'We couldn’t save your answers. They’re still here — please try again.'
};

/** The final onboarding step failing to save. */
export function friendlyOnboardingError(error: unknown): string {
  return ONBOARDING_BY_KIND[errorKind(error)];
}

const HISTORY_BY_KIND: Record<ErrorKind, string> = {
  offline: 'You seem to be offline. Your entries are safe — try again when you’re connected.',
  'rate-limit': 'Too many requests just now. Your entries are safe — try again in a minute.',
  expired: 'Your session has expired. Sign in again to see your entries.',
  permission: 'We couldn’t open your journal with this account. Please sign in again.',
  unknown: 'Something went wrong. Your entries are safe — please try again.'
};

/** Journal History failing to load. */
export function friendlyJournalHistoryError(error: unknown): string {
  return HISTORY_BY_KIND[errorKind(error)];
}
