import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { createSupabaseFocusSessionApi, FOCUS_TIMER_SOURCE, toWriteResult } from './focus-session-api';

/** Records every call on the query builder chain; resolves with `result`. */
function fakeClient(result: { error: unknown; status?: number } | Error = { error: null, status: 204 }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['upsert', 'update', 'insert', 'delete', 'eq', 'lte', 'in']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
    result instanceof Error ? reject(result) : resolve(result);
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    }
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

afterEach(() => vi.useRealTimers());

const planned = { plannedBlockMinutes: 25, plannedBreakMinutes: 5, plannedFlows: 4 };
const counters = { flowsCompleted: 2, breaksTaken: 1, focusSeconds: 3000 };

describe('focus session writes', () => {
  it('start: inserts a focus-timer row with its own id, and leaves an existing row alone', async () => {
    const { client, calls } = fakeClient();
    const result = await createSupabaseFocusSessionApi(client).start('user-1', {
      opId: 'o',
      kind: 'start',
      sessionId: 'sess-1',
      startedAt: '2026-10-14T09:00:00.000Z',
      ...planned
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      ['from', 'focus_sessions'],
      [
        'upsert',
        {
          id: 'sess-1',
          user_id: 'user-1',
          source: FOCUS_TIMER_SOURCE,
          status: 'active',
          started_at: '2026-10-14T09:00:00.000Z',
          planned_block_minutes: 25,
          planned_break_minutes: 5,
          planned_flows: 4
        },
        { onConflict: 'id', ignoreDuplicates: true }
      ]
    ]);
    expect(FOCUS_TIMER_SOURCE).toBe('focus-timer');
  });

  it('checkpoint: only an active row of this user, and never lowering focus_seconds', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseFocusSessionApi(client).checkpoint('user-1', { opId: 'o', kind: 'checkpoint', sessionId: 'sess-1', ...counters });
    expect(calls).toEqual([
      ['from', 'focus_sessions'],
      ['update', { flows_completed: 2, breaks_taken: 1, focus_seconds: 3000 }],
      ['eq', 'id', 'sess-1'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'status', 'active'],
      ['lte', 'focus_seconds', 3000]
    ]);
  });

  it.each(['completed', 'abandoned'] as const)('finish (%s): only while still active — the first ending wins', async (status) => {
    const { client, calls } = fakeClient();
    await createSupabaseFocusSessionApi(client).finish('user-1', {
      opId: 'o',
      kind: 'finish',
      sessionId: 'sess-1',
      status,
      endedAt: '2026-10-14T10:00:00.000Z',
      ...counters,
      ...planned
    });
    expect(calls).toEqual([
      ['from', 'focus_sessions'],
      [
        'update',
        {
          status,
          ended_at: '2026-10-14T10:00:00.000Z',
          flows_completed: 2,
          breaks_taken: 1,
          focus_seconds: 3000,
          planned_block_minutes: 25,
          planned_break_minutes: 5,
          planned_flows: 4
        }
      ],
      ['eq', 'id', 'sess-1'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'status', 'active']
    ]);
  });

  it('discard (Reset): deletes only an active row of this user — never a completed or abandoned one', async () => {
    const { client, calls } = fakeClient();
    const result = await createSupabaseFocusSessionApi(client).discard('user-1', { opId: 'o', kind: 'discard', sessionId: 'sess-1' });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      ['from', 'focus_sessions'],
      ['delete'],
      ['eq', 'id', 'sess-1'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'status', 'active']
    ]);
  });

  it('a request that never answers is given up on and retried later', async () => {
    vi.useFakeTimers();
    const calls: unknown[] = [];
    const hanging = { then: () => undefined };
    const builder = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? hanging.then : (...args: unknown[]) => (calls.push(args), builder)) });
    const client = { from: () => builder } as unknown as SupabaseClient<Database>;
    const pending = createSupabaseFocusSessionApi(client).checkpoint('user-1', { opId: 'o', kind: 'checkpoint', sessionId: 's', ...counters });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toEqual({ ok: false, retry: true });
  });

  it('a thrown network error is retried later, never thrown', async () => {
    const { client } = fakeClient(new TypeError('Failed to fetch'));
    await expect(
      createSupabaseFocusSessionApi(client).checkpoint('user-1', { opId: 'o', kind: 'checkpoint', sessionId: 's', ...counters })
    ).resolves.toEqual({ ok: false, retry: true });
  });
});

describe('which failures are worth retrying', () => {
  it.each([
    [0, true],
    [500, true],
    [503, true],
    [401, true],
    [408, true],
    [429, true],
    [400, false],
    [403, false],
    [409, false]
  ])('status %i → retry %s', (status, retry) => {
    expect(toWriteResult({ error: { message: 'x' }, status })).toEqual({ ok: false, retry });
  });

  it('no error is success', () => {
    expect(toWriteResult({ error: null, status: 201 })).toEqual({ ok: true });
  });
});
