import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';

/**
 * The journal form hook against a stand-in database.
 *
 * There is no DOM in these tests, so the hook is rendered once on the server
 * and its `save` is called directly: that runs the real look-up, write and
 * outcome logic against the recorded calls below. Effects (refilling the form
 * after a load) do not run here; they are covered by mergeIntoUntouched's own
 * tests and by browser QA.
 */

type Result = { data: unknown; error: unknown };
const db = vi.hoisted(() => ({
  calls: [] as string[],
  select: [] as Result[],
  insert: { data: null, error: null } as Result,
  update: { data: null, error: null } as Result
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (kind: 'select' | 'insert' | 'update', detail: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'single']) builder[method] = () => builder;
    builder.then = (resolve: (value: Result) => void, reject: (reason: unknown) => void) => {
      db.calls.push(`${kind}${detail}`);
      const result = kind === 'select' ? db.select.shift() ?? { data: [], error: null } : db[kind];
      return Promise.resolve(result).then(resolve, reject);
    };
    return builder;
  };
  return {
    supabase: {
      from: () => ({
        select: () => chain('select', ''),
        insert: (row: unknown) => chain('insert', ` ${JSON.stringify(row)}`),
        update: (patch: unknown) => chain('update', ` ${JSON.stringify(patch)}`)
      })
    }
  };
});

const { useJournalEntryForm, TODAY_ENTRY_RETRIES, TODAY_ENTRY_RETRY_DELAY_MS } = await import('./use-journal');
type Form = ReturnType<typeof useJournalEntryForm>;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const auth: AuthContextValue = {
  session: { user: { id: USER_ID } as User } as Session, user: { id: USER_ID } as User, onboardingCompleted: true,
  loading: false, signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

const row = (id: string, entry_type: string, responses: Record<string, string>) => ({
  id, user_id: USER_ID, entry_type, responses, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
});

/** Render the hook once; the initial values stand in for what the user has written. */
function mount(type: Parameters<typeof useJournalEntryForm>[0], values: Record<string, string>): Form {
  let form: Form | undefined;
  const Probe = () => {
    form = useJournalEntryForm(type, values);
    return null;
  };
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <Probe />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return form as Form;
}

beforeEach(() => {
  db.calls = [];
  db.select = [];
  db.insert = { data: row('new', 'gratitude', {}), error: null };
  db.update = { data: null, error: null };
});
afterEach(() => vi.restoreAllMocks());

const writes = () => db.calls.filter((call) => !call.startsWith('select'));

describe('useJournalEntryForm — saving a one-per-day journal without today’s entry in hand', () => {
  it('loading has not finished: the form says so, and its fields are read-only until it does', () => {
    const form = mount('gratitude', { smile: '', warmth: '' });
    expect(form.isLoading).toBe(true);
    expect(form.isBusy).toBe(true);
    expect(form.notice).toBeNull();
  });

  it('no entry today: looks again, then creates exactly one', async () => {
    const form = mount('gratitude', { smile: 'Evening', warmth: '' });
    db.select = [{ data: [], error: null }];
    expect(await form.save()).toBe('saved');
    expect(db.calls[0]).toBe('select');
    expect(writes()).toEqual(['insert {"user_id":"' + USER_ID + '","entry_type":"gratitude","responses":{"smile":"Evening","warmth":""}}']);
  });

  it('load failed but an entry exists (or another tab saved first): no duplicate — the user is asked to review', async () => {
    const form = mount('gratitude', { smile: 'Evening', warmth: '' });
    db.select = [{ data: [row('morning', 'gratitude', { smile: 'Morning', warmth: 'Tea' })], error: null }];
    expect(await form.save()).toBe('review');
    expect(writes()).toEqual([]);
  });

  it('the look-up fails: nothing is written', async () => {
    const form = mount('daily-journal', { onMind: 'Keep me', energy: '', letGoLeanIn: '' });
    db.select = [{ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }];
    expect(await form.save()).toBe('failed');
    expect(writes()).toEqual([]);
  });

  it('an empty form is not saved, and nothing is read or written', async () => {
    const form = mount('focus-reset', { whatMatters: '  ', justNoise: '' });
    expect(await form.save()).toBe('empty');
    expect(db.calls).toEqual([]);
  });

  it('a failed insert is reported as failed, not thrown, and nothing else is written', async () => {
    const form = mount('sensory-checkin', { sensations: 'Warm', bodyAwareness: '', softenSpot: '' });
    db.select = [{ data: [], error: null }];
    db.insert = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "journal_entries"' } };
    expect(await form.save()).toBe('failed');
    expect(writes()).toHaveLength(1);
  });

  it.each(['morning-intention', 'daily-journal', 'focus-reset', 'gratitude', 'sensory-checkin'] as const)(
    '%s looks for today’s entry before creating one',
    async (type) => {
      const form = mount(type, { a: 'x' });
      db.select = [{ data: [row('x', type, { a: 'y' })], error: null }];
      expect(await form.save()).toBe('review');
      expect(writes()).toEqual([]);
    }
  );
});

describe('Post-Panic keeps one entry per episode', () => {
  it('is editable at once, never looks for today’s entry, and always creates a new one', async () => {
    db.insert = { data: row('episode', 'post-panic', {}), error: null };
    for (let episode = 1; episode <= 2; episode++) {
      const form = mount('post-panic', { whatHappened: `Episode ${episode}`, howItFelt: '', whatNeeded: '' });
      expect(form.isLoading).toBe(false);
      expect(await form.save()).toBe('saved');
    }
    expect(db.calls.filter((call) => call.startsWith('select'))).toEqual([]);
    expect(writes()).toHaveLength(2);
    expect(writes().every((call) => call.startsWith('insert'))).toBe(true);
  });
});

describe('loading today’s entry', () => {
  it('retries once, a second later, then gives up — about one second, not eight', async () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      const attempts: number[] = [];
      const start = Date.now();
      const query = client
        .fetchQuery({
          queryKey: ['retry-check'],
          retry: TODAY_ENTRY_RETRIES,
          retryDelay: TODAY_ENTRY_RETRY_DELAY_MS,
          queryFn: () => {
            attempts.push(Date.now() - start);
            return Promise.reject({ message: 'TypeError: Failed to fetch' });
          }
        })
        .catch((error) => error);
      await vi.advanceTimersByTimeAsync(5000);
      await query;
      expect(attempts).toEqual([0, 1000]);
    } finally {
      vi.useRealTimers();
    }
  });
});
