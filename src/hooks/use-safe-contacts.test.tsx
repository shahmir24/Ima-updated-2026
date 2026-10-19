import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';

/**
 * The safe contacts hooks against a stand-in database. There is no DOM here,
 * so each hook is rendered once on the server and its mutation is called
 * directly: that runs the real validation, insert and delete code.
 */

type Result = { data: unknown; error: unknown };
const db = vi.hoisted(() => ({
  calls: [] as string[],
  insert: { data: null, error: null } as Result,
  remove: { data: null, error: null } as Result
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (kind: 'insert' | 'delete', detail: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'single']) {
      builder[method] = (...args: unknown[]) => {
        if (method === 'eq') detail += ` ${args.join('=')}`;
        return builder;
      };
    }
    builder.then = (resolve: (value: Result) => void, reject: (reason: unknown) => void) => {
      db.calls.push(`${kind}${detail}`);
      return Promise.resolve(kind === 'insert' ? db.insert : db.remove).then(resolve, reject);
    };
    return builder;
  };
  return {
    supabase: {
      from: () => ({
        insert: (row: unknown) => chain('insert', ` ${JSON.stringify(row)}`),
        delete: () => chain('delete', '')
      })
    }
  };
});

const hooks = await import('./use-safe-contacts');
const { useCreateSafeContact, useDeleteSafeContact, SAFE_CONTACT_MESSAGES, SAFE_CONTACTS_RETRIES, SAFE_CONTACTS_RETRY_DELAY_MS } = hooks;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const auth: AuthContextValue = {
  session: { user: { id: USER_ID } as User } as Session, user: { id: USER_ID } as User, onboardingCompleted: true,
  loading: false, signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

function mount<T>(useHook: () => T): T {
  let value: T | undefined;
  const Probe = () => {
    value = useHook();
    return null;
  };
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <Probe />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return value as T;
}

const blank = { name: '', label: '', phone: '', email: '', instagram: '', note: '' };

beforeEach(() => {
  db.calls = [];
  db.insert = { data: { id: 'new' }, error: null };
  db.remove = { data: null, error: null };
});

describe('adding a safe contact', () => {
  it('writes one trimmed row, with the Instagram handle stored as the bare username', async () => {
    const create = mount(useCreateSafeContact);
    await create.mutateAsync({ ...blank, name: ' Sam ', instagram: ' https://www.instagram.com/sam.hype/ ' });
    expect(db.calls).toEqual([
      `insert {"user_id":"${USER_ID}","name":"Sam","label":"Support Person","phone":null,"email":null,"instagram":"sam.hype","note":null}`
    ]);
  });

  it.each([
    [{ ...blank }, SAFE_CONTACT_MESSAGES.nameRequired],
    [{ ...blank, name: 'Jo' }, SAFE_CONTACT_MESSAGES.methodRequired],
    [{ ...blank, name: 'Jo', phone: 'call me' }, SAFE_CONTACT_MESSAGES.phoneInvalid],
    [{ ...blank, name: 'Jo', email: 'not-an-email' }, SAFE_CONTACT_MESSAGES.emailInvalid],
    [{ ...blank, name: 'Jo', instagram: 'two words' }, SAFE_CONTACT_MESSAGES.instagramInvalid]
  ])('turns away %j before anything is sent', async (input, message) => {
    const create = mount(useCreateSafeContact);
    await expect(create.mutateAsync(input)).rejects.toThrow(message);
    expect(db.calls).toEqual([]);
  });

  it('a failed insert rejects with the database error, so the screen keeps what was typed', async () => {
    db.insert = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "safe_contacts"' } };
    const create = mount(useCreateSafeContact);
    await expect(create.mutateAsync({ ...blank, name: 'Kai', phone: '07700' })).rejects.toMatchObject({ code: '42501' });
    expect(db.calls).toHaveLength(1);
  });
});

describe('removing a safe contact', () => {
  it('deletes only that row, and only for this user', async () => {
    const remove = mount(useDeleteSafeContact);
    await remove.mutateAsync('c1');
    expect(db.calls).toEqual([`delete id=c1 user_id=${USER_ID}`]);
  });

  it('a failed delete rejects, so the contact stays listed', async () => {
    db.remove = { data: null, error: { code: '500', message: 'boom' } };
    const remove = mount(useDeleteSafeContact);
    await expect(remove.mutateAsync('c1')).rejects.toMatchObject({ code: '500' });
  });
});

describe('loading the circle', () => {
  it('retries once, a second later, then gives up — about one second, not eight', async () => {
    vi.useFakeTimers();
    try {
      const attempts: number[] = [];
      const start = Date.now();
      const query = new QueryClient()
        .fetchQuery({
          queryKey: ['retry-check'],
          retry: SAFE_CONTACTS_RETRIES,
          retryDelay: SAFE_CONTACTS_RETRY_DELAY_MS,
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
