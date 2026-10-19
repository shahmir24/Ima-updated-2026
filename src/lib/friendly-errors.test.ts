import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorKind,
  friendlyAuthError,
  friendlyJournalHistoryError,
  friendlyOnboardingError
} from './friendly-errors';

afterEach(() => vi.unstubAllGlobals());

/** Errors shaped as supabase-js returns them, with internals in their text. */
const AUTH = {
  offline: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
  rateLimit: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' },
  emailRateLimit: { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
  invalid: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
  exists: { name: 'AuthApiError', status: 422, code: 'user_already_exists', message: 'User already registered' },
  unconfirmed: { name: 'AuthApiError', status: 400, code: 'email_not_confirmed', message: 'Email not confirmed' },
  weak: { name: 'AuthWeakPasswordError', status: 422, code: 'weak_password', message: 'Password should be at least 6 characters. [pwned]' },
  badEmail: { name: 'AuthApiError', status: 400, code: 'email_address_invalid', message: 'Email address "x@y" is invalid' },
  server: { name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: 'Database error saving new user: relation "profiles" violates check constraint' }
};
const DB = {
  offline: { message: 'TypeError: Failed to fetch', details: 'at fetch (supabase.js:1:1)', hint: '', code: '' },
  expired: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null },
  permission: { code: '42501', message: 'new row violates row-level security policy for table "onboarding_responses"', details: null, hint: null },
  rateLimit: { code: '', status: 429, message: 'Too Many Requests' },
  unknown: { code: '23514', message: 'new row for relation "journal_entries" violates check constraint "x"', details: 'Failing row contains (...)', hint: null }
};
const INTERNALS = /relation|row-level|policy|constraint|JWT|PGRST|42501|23514|TypeError|supabase|Failing row|profiles|journal_entries|onboarding_responses|pwned|unexpected_failure|over_\w+|x@y/i;

describe('error kinds', () => {
  it('network failures, from fetch or from supabase auth, are offline', () => {
    expect(errorKind(AUTH.offline)).toBe('offline');
    expect(errorKind(DB.offline)).toBe('offline');
    expect(errorKind({ message: 'NetworkError when attempting to fetch resource.' })).toBe('offline');
    vi.stubGlobal('navigator', { onLine: false });
    expect(errorKind(DB.unknown)).toBe('offline');
  });

  it('429s and rate-limit codes are rate limits', () => {
    for (const error of [AUTH.rateLimit, AUTH.emailRateLimit, DB.rateLimit]) expect(errorKind(error)).toBe('rate-limit');
  });

  it('expired sessions, permissions and the rest', () => {
    expect(errorKind(DB.expired)).toBe('expired');
    expect(errorKind(DB.permission)).toBe('permission');
    expect(errorKind(DB.unknown)).toBe('unknown');
    expect(errorKind(new Error('boom'))).toBe('unknown');
    expect(errorKind(undefined)).toBe('unknown');
  });
});

describe('sign-in and sign-up', () => {
  it('keeps the three messages it already had, word for word', () => {
    expect(friendlyAuthError(AUTH.invalid)).toBe('Invalid email or password. Please check your credentials and try again.');
    expect(friendlyAuthError(AUTH.exists)).toBe('An account with this email already exists. Please sign in instead.');
    expect(friendlyAuthError(AUTH.unconfirmed)).toBe('Please check your email and click the confirmation link before signing in.');
    // Older servers send no code: the message shape still matches.
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe(friendlyAuthError(AUTH.invalid));
  });

  it('says what to do when offline or rate-limited', () => {
    expect(friendlyAuthError(AUTH.offline)).toMatch(/offline/);
    expect(friendlyAuthError(AUTH.rateLimit)).toMatch(/wait a minute/);
    expect(friendlyAuthError(AUTH.emailRateLimit)).toMatch(/wait a minute/);
  });

  it('never shows the server’s own text', () => {
    for (const error of [...Object.values(AUTH), ...Object.values(DB), new Error('secret internal text'), 'raw', null]) {
      const text = friendlyAuthError(error);
      expect(text).not.toMatch(INTERNALS);
      expect(text).not.toContain('secret internal text');
      expect(text.length).toBeGreaterThan(20);
    }
  });
});

describe('onboarding save and Journal History load', () => {
  it.each([
    ['onboarding', friendlyOnboardingError],
    ['journal history', friendlyJournalHistoryError]
  ] as const)('%s: fixed wording for every kind, with no database text', (_name, friendly) => {
    const texts = new Set<string>();
    for (const error of [...Object.values(DB), AUTH.offline, AUTH.server, new Error('secret internal text'), undefined]) {
      const text = friendly(error);
      expect(text).not.toMatch(INTERNALS);
      expect(text).not.toContain('secret internal text');
      texts.add(text);
    }
    // offline, rate-limit, expired, permission, unknown: five different sentences.
    expect(texts.size).toBe(5);
  });

  it('onboarding says the answers are still there when a retry can work', () => {
    for (const error of [DB.offline, DB.rateLimit, DB.unknown]) expect(friendlyOnboardingError(error)).toMatch(/still here/);
  });

  it('journal history says the entries are safe', () => {
    for (const error of [DB.offline, DB.rateLimit, DB.unknown]) expect(friendlyJournalHistoryError(error)).toMatch(/entries are safe/);
  });
});
