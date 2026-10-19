/**
 * What the Safe Contacts screen says when loading, adding or removing fails.
 *
 * Supabase returns errors as plain objects whose text can name the table, its
 * policies and its constraints — and safe_contacts holds other people's phone
 * numbers and emails. None of that text is ever shown: an error is sorted into
 * a kind, and each kind has fixed wording. Only the hook's own sentences (see
 * SAFE_CONTACT_MESSAGES in use-safe-contacts.ts) are passed through, because
 * they were written for the user.
 */

export type SafeContactsErrorContext = 'load' | 'add' | 'remove';

export type SafeContactsErrorKind = 'offline' | 'expired' | 'permission' | 'invalid' | 'unknown';

const field = (error: unknown, key: string): string => {
  if (!error || typeof error !== 'object') return '';
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function safeContactsErrorKind(error: unknown): SafeContactsErrorKind {
  const message = field(error, 'message');
  const code = field(error, 'code');
  const status = field(error, 'status');

  if (isOffline() || /failed to fetch|networkerror|network request failed|load failed|fetcherror|fetch failed/i.test(message)) {
    return 'offline';
  }
  if (code === 'PGRST301' || code === 'PGRST302' || status === '401' || /jwt/i.test(message)) return 'expired';
  if (code === '42501' || status === '403' || /permission denied|row-level security/i.test(message)) return 'permission';
  // check_violation / not_null_violation: a name or a way to reach them is missing.
  if (code === '23514' || code === '23502') return 'invalid';
  return 'unknown';
}

const MESSAGES: Record<SafeContactsErrorContext, Record<SafeContactsErrorKind, string>> = {
  load: {
    offline: 'You seem to be offline, so your safe contacts couldn’t load. The emergency numbers above still work.',
    expired: 'Your session has expired, so your safe contacts couldn’t load. Sign in again to see them.',
    permission: 'We couldn’t open your safe contacts with this account. Please sign in again.',
    invalid: 'We couldn’t load your safe contacts. Please try again.',
    unknown: 'We couldn’t load your safe contacts. Please try again.'
  },
  add: {
    offline: 'You seem to be offline, so this person wasn’t added. What you typed is still here — try again when you’re connected.',
    expired: 'Your session has expired, so this person wasn’t added. What you typed is still here — sign in again, then retry.',
    permission: 'We couldn’t add this person to your account. What you typed is still here — please sign in again.',
    invalid: 'Add a name and at least one way to reach them — a phone number, email or Instagram handle.',
    unknown: 'Something went wrong, so this person wasn’t added. What you typed is still here — please try again.'
  },
  remove: {
    offline: 'You seem to be offline, so nobody was removed. Your circle is unchanged — try again when you’re connected.',
    expired: 'Your session has expired, so nobody was removed. Your circle is unchanged — sign in again, then retry.',
    permission: 'We couldn’t change your circle with this account, so nobody was removed. Please sign in again.',
    invalid: 'Something went wrong, so nobody was removed. Your circle is unchanged — please try again.',
    unknown: 'Something went wrong, so nobody was removed. Your circle is unchanged — please try again.'
  }
};

/**
 * Safe wording for a Safe Contacts failure. `ownMessages` are sentences the
 * app itself throws (never database text); an Error carrying exactly one of
 * them is shown as it is.
 */
export function friendlySafeContactsError(
  error: unknown,
  context: SafeContactsErrorContext,
  ownMessages: readonly string[] = []
): string {
  if (error instanceof Error && ownMessages.includes(error.message)) return error.message;
  return MESSAGES[context][safeContactsErrorKind(error)];
}
