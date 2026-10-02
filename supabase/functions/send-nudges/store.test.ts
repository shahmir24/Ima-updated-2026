import { describe, expect, it, vi } from 'vitest';
import { MAX_DEVICES_PER_USER, MAX_TASKS_PER_USER, createPostgrestNudgeStore } from './store';

const KEY = 'service-role-key';
const USER = '00000000-0000-4000-8000-000000000001';
const SUB = '00000000-0000-4000-8000-000000000002';
const DELIVERY = '00000000-0000-4000-8000-000000000003';
const TASK = '00000000-0000-4000-8000-000000000004';

function setup(respond: (url: URL, init: RequestInit) => Response | Promise<Response> = () => new Response('[]', { status: 200 })) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  const store = createPostgrestNudgeStore({ supabaseUrl: 'https://proj.supabase.co/', serviceRoleKey: KEY, fetchImpl });
  return { store, calls };
}

const params = (url: URL) => Object.fromEntries(url.searchParams.entries());

describe('PostgREST nudge store', () => {
  it('claims through the RPC with the limit and the 120-minute window, never p_now', async () => {
    const rows = [{ delivery_id: DELIVERY, user_id: USER, local_date: '2026-10-02', show_task_titles: true }];
    const { store, calls } = setup(() => new Response(JSON.stringify(rows)));
    expect(await store.claimDueNudges(50)).toEqual(rows);
    expect(calls[0].url.pathname).toBe('/rest/v1/rpc/claim_due_nudges');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_limit: 50, p_window_minutes: 120 });
  });

  it('authenticates every call with the service-role key in apikey and Authorization', async () => {
    const { store, calls } = setup();
    await store.claimDueNudges(1);
    expect(calls[0].init.headers).toMatchObject({ apikey: KEY, Authorization: `Bearer ${KEY}` });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('loads only the user’s incomplete tasks due on or before their local date', async () => {
    const { store, calls } = setup();
    await store.loadTasks(USER, '2026-10-02');
    expect(calls[0].url.pathname).toBe('/rest/v1/tasks');
    expect(params(calls[0].url)).toEqual({
      select: 'id,title,scheduled_date,created_at,completed,importance',
      user_id: `eq.${USER}`,
      completed: 'is.false',
      scheduled_date: 'lte.2026-10-02',
      order: 'scheduled_date.desc,created_at.asc',
      limit: String(MAX_TASKS_PER_USER)
    });
  });

  it('loads only the user’s devices, newest first, bounded', async () => {
    const { store, calls } = setup();
    await store.loadSubscriptions(USER);
    expect(calls[0].url.pathname).toBe('/rest/v1/push_subscriptions');
    expect(params(calls[0].url)).toEqual({
      select: 'id,endpoint,p256dh,auth,failure_count',
      user_id: `eq.${USER}`,
      order: 'updated_at.desc',
      limit: String(MAX_DEVICES_PER_USER)
    });
  });

  it('device success: last_success_at set and failure_count reset, scoped by id AND user', async () => {
    const { store, calls } = setup(() => new Response(null, { status: 204 }));
    await store.markSubscriptionSuccess(SUB, USER, '2026-10-02T11:12:00.000Z');
    expect(calls[0].init.method).toBe('PATCH');
    expect(params(calls[0].url)).toEqual({ id: `eq.${SUB}`, user_id: `eq.${USER}` });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ last_success_at: '2026-10-02T11:12:00.000Z', failure_count: 0 });
  });

  it('device failure: failure_count written, scoped by id AND user', async () => {
    const { store, calls } = setup(() => new Response(null, { status: 204 }));
    await store.markSubscriptionFailure(SUB, USER, 4);
    expect(params(calls[0].url)).toEqual({ id: `eq.${SUB}`, user_id: `eq.${USER}` });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ failure_count: 4 });
  });

  it('expired device: deleted, scoped by id AND user', async () => {
    const { store, calls } = setup(() => new Response(null, { status: 204 }));
    await store.deleteSubscription(SUB, USER);
    expect(calls[0].init.method).toBe('DELETE');
    expect(params(calls[0].url)).toEqual({ id: `eq.${SUB}`, user_id: `eq.${USER}` });
  });

  it('closes a delivery only while it is still claimed, and checks one row moved', async () => {
    const { store, calls } = setup(() => new Response(JSON.stringify([{ id: DELIVERY }])));
    await store.completeDelivery(DELIVERY, {
      status: 'sent',
      devicesAttempted: 2,
      devicesSucceeded: 1,
      taskId: TASK,
      completedAt: '2026-10-02T11:12:00.000Z'
    });
    expect(calls[0].init.method).toBe('PATCH');
    expect(params(calls[0].url)).toEqual({ id: `eq.${DELIVERY}`, status: 'eq.claimed', select: 'id' });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      status: 'sent',
      devices_attempted: 2,
      devices_succeeded: 1,
      task_id: TASK,
      completed_at: '2026-10-02T11:12:00.000Z'
    });
  });

  it('a delivery that was not claimed (zero rows moved) is an error', async () => {
    const { store } = setup(() => new Response('[]'));
    await expect(
      store.completeDelivery(DELIVERY, { status: 'failed', devicesAttempted: 0, devicesSucceeded: 0, taskId: null, completedAt: 'x' })
    ).rejects.toThrow();
  });

  it.each([
    ['user id', (s: ReturnType<typeof setup>['store']) => s.loadTasks('1 or 1=1', '2026-10-02')],
    ['date', (s: ReturnType<typeof setup>['store']) => s.loadTasks(USER, '2026-10-02&user_id=neq.x')],
    ['subscription id', (s: ReturnType<typeof setup>['store']) => s.deleteSubscription('*', USER)],
    ['delivery id', (s: ReturnType<typeof setup>['store']) => s.completeDelivery('x', { status: 'sent', devicesAttempted: 1, devicesSucceeded: 1, taskId: null, completedAt: 'x' })],
    ['task id', (s: ReturnType<typeof setup>['store']) => s.completeDelivery(DELIVERY, { status: 'sent', devicesAttempted: 1, devicesSucceeded: 1, taskId: 'x', completedAt: 'x' })]
  ])('an invalid %s never reaches the network', async (_label, call) => {
    const { store, calls } = setup();
    await expect(call(store)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('HTTP and network errors throw without the database’s message', async () => {
    const http = setup(() => new Response('{"message":"permission denied for table tasks, key=abc"}', { status: 403 }));
    await expect(http.store.loadTasks(USER, '2026-10-02')).rejects.toThrow('store tasks failed (403)');
    const down = setup(() => {
      throw new TypeError('connect ECONNREFUSED');
    });
    await expect(down.store.claimDueNudges(1)).rejects.toThrow('store claim failed');
    const garbage = setup(() => new Response('{"not":"an array"}'));
    await expect(garbage.store.claimDueNudges(1)).rejects.toThrow();
  });
});
