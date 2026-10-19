import { afterEach, describe, expect, it, vi } from 'vitest';
import { friendlySafeContactsError, safeContactsErrorKind, type SafeContactsErrorContext } from './safe-contacts-errors';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const { SAFE_CONTACT_MESSAGE_LIST, SAFE_CONTACT_MESSAGES } = await import('@/hooks/use-safe-contacts');

afterEach(() => vi.unstubAllGlobals());

/** Errors as Supabase returns them: plain objects with internals in the text. */
const CASES = {
  offline: { message: 'TypeError: Failed to fetch', details: 'at fetch (supabase.js:1:1)', hint: '', code: '' },
  expired: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null },
  permission: { code: '42501', message: 'new row violates row-level security policy for table "safe_contacts"', details: null, hint: null },
  invalid: { code: '23514', message: 'new row for relation "safe_contacts" violates check constraint "safe_contacts_reachable"', details: 'Failing row contains (Jo, +44 7700 900123, jo@example.com)', hint: null },
  unknown: { code: '500', message: 'relation "safe_contacts" does not exist', details: null, hint: null }
} as const;

const INTERNALS = /safe_contacts|row-level|policy|constraint|relation|JWT|PGRST|23514|42501|TypeError|supabase|Failing row|7700|@example/i;
const CONTEXTS: SafeContactsErrorContext[] = ['load', 'add', 'remove'];

describe('safe contacts error kinds', () => {
  it.each(Object.entries(CASES))('%s', (kind, error) => {
    expect(safeContactsErrorKind(error)).toBe(kind);
  });

  it('the browser being offline wins', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(safeContactsErrorKind({ code: '500', message: 'x' })).toBe('offline');
  });
});

describe('friendly safe contacts errors', () => {
  it.each(CONTEXTS)('%s: never contains database text or a contact’s details', (context) => {
    for (const error of [...Object.values(CASES), new Error('secret internal text'), 'raw string', undefined, null]) {
      const text = friendlySafeContactsError(error, context, SAFE_CONTACT_MESSAGE_LIST);
      expect(text).not.toMatch(INTERNALS);
      expect(text).not.toContain('secret internal text');
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it('the app’s own sentences pass through unchanged; nothing else does', () => {
    expect(friendlySafeContactsError(new Error(SAFE_CONTACT_MESSAGES.signedOut), 'add', SAFE_CONTACT_MESSAGE_LIST)).toBe(
      SAFE_CONTACT_MESSAGES.signedOut
    );
    // The same text on a plain object (as from Supabase) is not trusted.
    expect(
      friendlySafeContactsError({ message: SAFE_CONTACT_MESSAGES.signedOut }, 'add', SAFE_CONTACT_MESSAGE_LIST)
    ).not.toBe(SAFE_CONTACT_MESSAGES.signedOut);
  });

  it('a failed add says what was typed is kept; a failed remove says the circle is unchanged', () => {
    for (const error of [CASES.offline, CASES.expired, CASES.permission, CASES.unknown]) {
      expect(friendlySafeContactsError(error, 'add')).toMatch(/still here|wasn’t added/);
      expect(friendlySafeContactsError(error, 'remove')).toMatch(/nobody was removed/);
    }
  });

  it('a failed load points back to the emergency numbers when offline', () => {
    expect(friendlySafeContactsError(CASES.offline, 'load')).toMatch(/emergency numbers above still work/);
  });
});
