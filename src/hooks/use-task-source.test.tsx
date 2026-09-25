import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { GuestTaskStoreContext } from '@/contexts/guest-mode-context';
import { createGuestTaskStore, type GuestTaskStore } from '@/lib/guest/guest-task-store';
import { rankTasks } from '@/lib/context-engine';
import type { TaskRow } from '@/hooks/use-tasks';
import { useTaskSource } from './use-task-source';

/**
 * The Supabase client, replaced by a recorder. Every call any hook makes is
 * logged, so a test can say exactly what reached Supabase — or that nothing
 * did.
 */
const supabaseLog = vi.hoisted(() => ({ calls: [] as Array<{ table: string; chain: Array<[string, unknown[]]> }> }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const entry = { table, chain: [] as Array<[string, unknown[]]> };
    supabaseLog.calls.push(entry);
    const proxy: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'limit']) {
      proxy[method] = (...args: unknown[]) => {
        entry.chain.push([method, args]);
        return proxy;
      };
    }
    // Awaiting the chain resolves like PostgREST: the written row, or nothing.
    proxy.then = (resolve: (value: unknown) => void) => {
      const inserted = entry.chain.find(([m]) => m === 'insert')?.[1][0] as Record<string, unknown> | undefined;
      const updated = entry.chain.find(([m]) => m === 'update')?.[1][0] as Record<string, unknown> | undefined;
      const id = entry.chain.find(([m, a]) => m === 'eq' && a[0] === 'id')?.[1][1];
      resolve({ data: inserted ? { id: 'new-row', ...inserted } : updated ? { id, ...updated } : [], error: null });
    };
    return proxy;
  };
  return { supabase: { from: vi.fn(builder) } };
});

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TODAY = '2026-09-25';

const user = { id: USER_ID } as User;
const session = { user } as Session;

const authValue = (signedIn: boolean, loading = false): AuthContextValue => ({
  session: signedIn ? session : null,
  user: signedIn ? user : null,
  onboardingCompleted: signedIn ? true : null,
  loading,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

const dbRow = (id: string, title: string, scheduled_date: string, importance = 'normal'): TaskRow => ({
  id,
  user_id: USER_ID,
  title,
  description: null,
  tag: 'focus',
  scheduled_date,
  start_time: null,
  end_time: null,
  importance,
  completed: false,
  completed_at: null,
  created_at: '2026-09-20T10:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z'
});

/** Renders useTaskSource once, the way a screen would, and returns what it saw. */
function renderTaskSource(options: {
  signedIn: boolean;
  authLoading?: boolean;
  guestStore?: GuestTaskStore | null;
  queryClient?: QueryClient;
}): ReturnType<typeof useTaskSource> {
  let captured: ReturnType<typeof useTaskSource> | undefined;
  const Probe = () => {
    captured = useTaskSource();
    return null;
  };
  renderToString(
    <QueryClientProvider client={options.queryClient ?? new QueryClient()}>
      <AuthContext.Provider value={authValue(options.signedIn, options.authLoading)}>
        <GuestTaskStoreContext.Provider value={options.guestStore ?? null}>
          <Probe />
        </GuestTaskStoreContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return captured as ReturnType<typeof useTaskSource>;
}

const memoryStore = () => createGuestTaskStore({ storage: () => null });

beforeEach(() => {
  supabaseLog.calls.length = 0;
});

describe('authenticated users', () => {
  it('get their Supabase tasks — the same cached array Home ranks today', () => {
    const queryClient = new QueryClient();
    const rows = [
      dbRow('a0000000-0000-4000-8000-000000000001', 'today', TODAY),
      dbRow('a0000000-0000-4000-8000-000000000002', 'overdue high', '2026-09-01', 'high'),
      dbRow('a0000000-0000-4000-8000-000000000003', 'tomorrow', '2026-09-26')
    ];
    // useTasks() caches under ['tasks', userId]; seeding it is what a
    // completed fetch leaves behind.
    queryClient.setQueryData(['tasks', USER_ID], rows);

    const source = renderTaskSource({ signedIn: true, queryClient });

    expect(source.mode).toBe('authenticated');
    expect(source.tasks).toBe(rows);
    expect(source.isPending).toBe(false);
    expect(rankTasks(source.tasks, { today: TODAY })).toEqual(rankTasks(rows, { today: TODAY }));
  });

  it('still use Supabase inside a part of the app that allows guests', async () => {
    const guestStore = memoryStore();
    const source = renderTaskSource({ signedIn: true, guestStore });

    expect(source.mode).toBe('authenticated');
    await source.create.run({ title: 'Real task', scheduled_date: TODAY });

    expect(guestStore.list()).toEqual([]);
    expect(supabaseLog.calls).toHaveLength(1);
    expect(supabaseLog.calls[0].table).toBe('tasks');
  });

  it('create, update, toggle and delete with exactly the existing Supabase writes', async () => {
    const source = renderTaskSource({ signedIn: true });
    const task = dbRow('a0000000-0000-4000-8000-000000000009', 'Write', TODAY);

    await source.create.run({ title: '  Write  ', scheduled_date: TODAY, start_time: '09:00', importance: 'high' });
    await source.update.run({ id: task.id, changes: { title: 'Rewrite', start_time: '10:00' } });
    await source.toggle.run(task);
    await source.remove.run(task.id);

    const chains = supabaseLog.calls.map((call) => [call.table, call.chain.map(([method]) => method)]);
    expect(chains).toEqual([
      ['tasks', ['insert', 'select', 'single']],
      ['tasks', ['update', 'eq', 'eq', 'select', 'single']],
      ['tasks', ['update', 'eq', 'eq', 'select', 'single']],
      ['tasks', ['delete', 'eq', 'eq']]
    ]);

    const [create, update, toggle, remove] = supabaseLog.calls.map((call) => call.chain);
    expect(create[0][1][0]).toEqual({
      user_id: USER_ID,
      title: 'Write',
      description: null,
      tag: 'focus',
      scheduled_date: TODAY,
      start_time: '09:00',
      end_time: null,
      importance: 'high'
    });
    expect(update[0][1][0]).toEqual({ title: 'Rewrite', start_time: '10:00' });
    expect(update.slice(1, 3)).toEqual([['eq', ['id', task.id]], ['eq', ['user_id', USER_ID]]]);
    expect(toggle[0][1][0]).toMatchObject({ completed: true });
    expect(typeof (toggle[0][1][0] as { completed_at: unknown }).completed_at).toBe('string');
    expect(remove.slice(1)).toEqual([['eq', ['id', task.id]], ['eq', ['user_id', USER_ID]]]);
  });

  it('never send a guest id to Supabase', async () => {
    const source = renderTaskSource({ signedIn: true });
    await expect(source.remove.run('guest_x')).rejects.toThrow();
    await expect(source.update.run({ id: 'guest_x', changes: { title: 'x' } })).rejects.toThrow();
    await expect(source.toggle.run({ ...dbRow('guest_x', 'x', TODAY) })).rejects.toThrow();
    expect(supabaseLog.calls).toEqual([]);
  });
});

describe('signed-out visitors where Guest Mode is not offered (every screen today)', () => {
  it('behave exactly as before: no tasks, still pending, and writes refused without a request', async () => {
    const source = renderTaskSource({ signedIn: false });

    expect(source.mode).toBe('signed-out');
    expect(source.tasks).toEqual([]);
    expect(source.isPending).toBe(true);
    await expect(source.create.run({ title: 'x', scheduled_date: TODAY })).rejects.toThrow(
      'You must be signed in to create a task.'
    );
    expect(supabaseLog.calls).toEqual([]);
  });

  it('are not guests while auth is still loading, even where guests are allowed', () => {
    const source = renderTaskSource({ signedIn: false, authLoading: true, guestStore: memoryStore() });
    expect(source.mode).toBe('signed-out');
  });
});

describe('guest backend (selected internally; not reachable from any route yet)', () => {
  it('runs every operation against the guest store and never touches Supabase', async () => {
    const guestStore = memoryStore();
    let source = renderTaskSource({ signedIn: false, guestStore });
    expect(source.mode).toBe('guest');
    expect(source.tasks).toEqual([]);
    expect(source.isPending).toBe(false);

    const created = await source.create.run({ title: 'Guest task', scheduled_date: TODAY, importance: 'high' });
    expect(created.id.startsWith('guest_')).toBe(true);

    source = renderTaskSource({ signedIn: false, guestStore });
    expect(source.tasks.map((task) => task.title)).toEqual(['Guest task']);

    const renamed = await source.update.run({ id: created.id, changes: { title: 'Renamed', start_time: '09:30' } });
    expect(renamed.start_time).toBe('09:30:00');

    const done = await source.toggle.run(renamed);
    expect(done.completed).toBe(true);
    expect(done.completed_at).not.toBeNull();

    await source.remove.run(created.id);
    expect(guestStore.list()).toEqual([]);

    await expect(source.create.run({ title: '   ', scheduled_date: TODAY })).rejects.toThrow();

    expect(supabaseLog.calls).toEqual([]);
  });

  it('feeds the Context Engine guest tasks it ranks like database rows', async () => {
    const guestStore = memoryStore();
    guestStore.create({ title: 'today', scheduled_date: TODAY });
    guestStore.create({ title: 'overdue high', scheduled_date: '2026-09-01', importance: 'high' });
    guestStore.create({ title: 'tomorrow', scheduled_date: '2026-09-26' });

    const source = renderTaskSource({ signedIn: false, guestStore });
    const titles = rankTasks(source.tasks, { today: TODAY }).map((entry) => entry.task.title);
    expect(titles).toEqual(['today', 'overdue high']);
    expect(supabaseLog.calls).toEqual([]);
  });
});
