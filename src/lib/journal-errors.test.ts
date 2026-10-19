import { afterEach, describe, expect, it, vi } from 'vitest';
import { friendlyJournalError, journalErrorKind, SIGNED_OUT_MESSAGE, type JournalErrorContext } from './journal-errors';

afterEach(() => vi.unstubAllGlobals());

/** Errors as Supabase actually returns them: plain objects, with internals in the text. */
const CASES = {
  offline: { message: 'TypeError: Failed to fetch', details: 'TypeError: Failed to fetch\n    at fetch (supabase.js:1:1)', hint: '', code: '' },
  expired: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null },
  permission: { code: '42501', message: 'new row violates row-level security policy for table "journal_entries"', details: null, hint: null },
  changed: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows', hint: null },
  unknown: { code: '23514', message: 'new row for relation "journal_entries" violates check constraint "journal_entries_responses_object"', details: 'Failing row contains (...)', hint: null }
} as const;

describe('journal error kinds', () => {
  it.each(Object.entries(CASES))('%s', (kind, error) => {
    expect(journalErrorKind(error)).toBe(kind);
  });

  it('Firefox and Safari network wording, and the browser being offline', () => {
    expect(journalErrorKind({ message: 'NetworkError when attempting to fetch resource.' })).toBe('offline');
    expect(journalErrorKind({ message: 'Load failed' })).toBe('offline');
    vi.stubGlobal('navigator', { onLine: false });
    expect(journalErrorKind({ code: '500', message: 'anything' })).toBe('offline');
  });

  it('the hook’s own signed-out error', () => {
    expect(journalErrorKind(new Error(SIGNED_OUT_MESSAGE))).toBe('signed-out');
  });

  it('anything unrecognised — including thrown Errors and non-objects — is unknown', () => {
    expect(journalErrorKind(new TypeError('x is undefined'))).toBe('unknown');
    expect(journalErrorKind('boom')).toBe('unknown');
    expect(journalErrorKind(null)).toBe('unknown');
  });
});

describe('friendly journal errors', () => {
  const contexts: JournalErrorContext[] = ['load', 'check', 'save'];
  const internals = /journal_entries|row-level|policy|constraint|relation|JWT|PGRST|23514|42501|TypeError|supabase|Failing row|JSON object/i;

  it.each(contexts)('%s: never contains database details, for any kind of error', (context) => {
    for (const error of [...Object.values(CASES), new Error('secret internal text'), 'raw string', undefined]) {
      const text = friendlyJournalError(error, context);
      expect(text).not.toMatch(internals);
      expect(text).not.toContain('secret internal text');
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it('save and check failures say the writing is still there', () => {
    for (const error of Object.values(CASES)) {
      expect(friendlyJournalError(error, 'save')).toContain('Your writing is still here');
      expect(friendlyJournalError(error, 'check')).toContain('Your writing is still here');
    }
  });

  it('a failed check says nothing was saved', () => {
    for (const error of Object.values(CASES)) expect(friendlyJournalError(error, 'check')).toMatch(/nothing was saved/);
  });

  it('a failed load no longer promises a blank page that can simply be saved', () => {
    expect(friendlyJournalError(CASES.unknown, 'load')).not.toMatch(/blank page/i);
    expect(friendlyJournalError(CASES.unknown, 'load')).toMatch(/check for it again before saving/);
  });
});
