import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_TASK_BODY,
  NO_TASK_BODY,
  NUDGE_TITLE,
  buildNudgeNotification,
  cleanTaskTitle,
  handleSendNudgesRequest,
  parseClaim,
  parseRunOptions,
  selectNudgeTask,
  type DeliveryOutcome,
  type NudgeStore,
  type NudgeTaskRow,
  type SendNudgesDeps,
  type StoredSubscription
} from './handler';
import type { PushTarget } from '../_shared/push-subscription';

// ---------------------------------------------------------------------------
// Fixtures: an in-memory database and fake push services
// ---------------------------------------------------------------------------

const SERVICE_KEY = 'service-role-key-for-tests';
const NOW = new Date('2026-10-02T11:12:00Z');
const P256DH = 'B' + 'A'.repeat(86);
const AUTH = 'A'.repeat(22);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER_A = uuid(1);
const USER_B = uuid(2);

interface DeviceRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
  last_success_at: string | null;
}

let nextId = 100;
const device = (userId: string, host = 'fcm.googleapis.com', extra: Partial<DeviceRow> = {}): DeviceRow => ({
  id: uuid(nextId++),
  user_id: userId,
  endpoint: `https://${host}/push/${nextId}`,
  p256dh: P256DH,
  auth: AUTH,
  failure_count: 0,
  last_success_at: null,
  ...extra
});

const task = (id: number, title: string, scheduled_date: string, extra: Partial<NudgeTaskRow> = {}): NudgeTaskRow => ({
  id: uuid(id),
  title,
  scheduled_date,
  created_at: '2026-09-01T09:00:00Z',
  completed: false,
  importance: 'normal',
  ...extra
});

interface Delivery extends Partial<Omit<DeliveryOutcome, 'status'>> {
  id: string;
  user_id: string;
  local_date: string;
  status: string;
}

function database(init: {
  claims?: { userId: string; localDate?: string; showTitles?: unknown }[];
  tasks?: Record<string, NudgeTaskRow[]>;
  devices?: ReturnType<typeof device>[];
}) {
  const deliveries = new Map<string, Delivery>();
  const devices = [...(init.devices ?? [])];
  const calls: string[] = [];
  let claimed = false;

  const store: NudgeStore & { fail: Partial<Record<keyof NudgeStore, boolean>>; failTasksFor: Set<string> } = {
    fail: {},
    failTasksFor: new Set(),
    async claimDueNudges(limit) {
      calls.push(`claim:${limit}`);
      if (store.fail.claimDueNudges) throw new Error('db down');
      // The database's guard: one delivery per user per local date, ever.
      if (claimed) return [];
      claimed = true;
      return (init.claims ?? []).map((claim, i) => {
        const id = uuid(900 + i);
        const local_date = claim.localDate ?? '2026-10-02';
        deliveries.set(id, { id, user_id: claim.userId, local_date, status: 'claimed' });
        return { delivery_id: id, user_id: claim.userId, local_date, show_task_titles: claim.showTitles ?? true };
      });
    },
    async loadTasks(userId, localDate) {
      calls.push(`tasks:${userId}:${localDate}`);
      if (store.fail.loadTasks || store.failTasksFor.has(userId)) throw new Error('db down');
      return (init.tasks?.[userId] ?? []).filter((t) => !t.completed && t.scheduled_date <= localDate);
    },
    async loadSubscriptions(userId) {
      if (store.fail.loadSubscriptions) throw new Error('db down');
      return devices.filter((d) => d.user_id === userId).map((d): StoredSubscription => ({ ...d }));
    },
    async markSubscriptionSuccess(id, userId, at) {
      if (store.fail.markSubscriptionSuccess) throw new Error('db down');
      const row = devices.find((d) => d.id === id && d.user_id === userId);
      if (row) Object.assign(row, { last_success_at: at, failure_count: 0 });
    },
    async markSubscriptionFailure(id, userId, failureCount) {
      const row = devices.find((d) => d.id === id && d.user_id === userId);
      if (row) row.failure_count = failureCount;
    },
    async deleteSubscription(id, userId) {
      const index = devices.findIndex((d) => d.id === id && d.user_id === userId);
      if (index >= 0) devices.splice(index, 1);
    },
    async completeDelivery(id, outcome) {
      if (store.fail.completeDelivery) throw new Error('db down');
      const row = deliveries.get(id);
      if (!row || row.status !== 'claimed') throw new Error('not claimed');
      Object.assign(row, outcome);
    }
  };
  return { store, deliveries, devices, calls };
}

/** Push services answering by endpoint substring; default 201. */
function pushServices(answers: Record<string, number | 'throw'> = {}) {
  const sent: { endpoint: string; payload: unknown; headers: Record<string, string> }[] = [];
  const buildRequest = vi.fn((target: PushTarget, payload: string) => ({
    endpoint: target.endpoint,
    headers: { TTL: '14400', Topic: 'ima-daily-nudge' },
    body: new TextEncoder().encode(payload)
  }));
  const fetchImpl = vi.fn(async (endpoint: string, init: RequestInit) => {
    const answer = Object.entries(answers).find(([key]) => endpoint.includes(key))?.[1] ?? 201;
    if (answer === 'throw') throw new TypeError('network down');
    sent.push({ endpoint, payload: JSON.parse(new TextDecoder().decode(init.body as Uint8Array)), headers: init.headers as Record<string, string> });
    return new Response(null, { status: answer });
  });
  return { buildRequest, fetchImpl: fetchImpl as unknown as typeof fetch, fetchSpy: fetchImpl, sent };
}

function deps(db: ReturnType<typeof database>, push = pushServices(), overrides: Partial<SendNudgesDeps> = {}): SendNudgesDeps {
  return { serviceRoleKey: SERVICE_KEY, configured: true, store: db.store, buildRequest: push.buildRequest, fetchImpl: push.fetchImpl, now: () => NOW, ...overrides };
}

const run = (d: SendNudgesDeps, init: { body?: string; token?: string | null; method?: string } = {}) =>
  handleSendNudgesRequest(
    new Request('https://x.supabase.co/functions/v1/send-nudges', {
      method: init.method ?? 'POST',
      headers: init.token === null ? {} : { Authorization: `Bearer ${init.token ?? SERVICE_KEY}` },
      body: (init.method ?? 'POST') === 'GET' ? undefined : (init.body ?? '')
    }),
    d
  );

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Access and configuration
// ---------------------------------------------------------------------------

describe('send-nudges — access (server/service-role only, fail closed)', () => {
  it.each([
    ['no token', null, 401],
    ['the anon key', 'anon-key', 401],
    ['a user session token', 'eyJhbGciOiJIUzI1NiJ9.user.sig', 401],
    ['a prefix of the key', SERVICE_KEY.slice(0, -1), 401]
  ])('%s → refused, nothing claimed', async (_label, token, status) => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const response = await run(deps(db), { token });
    expect(response.status).toBe(status);
    expect(db.calls).toEqual([]);
  });

  it.each([[undefined], [''], ['   ']])('service key unset (%j) → 503, nothing claimed', async (key) => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const response = await run(deps(db, pushServices(), { serviceRoleKey: key }), { token: 'anything' });
    expect(response.status).toBe(503);
    expect(db.calls).toEqual([]);
  });

  it('VAPID/config missing → 503 BEFORE claiming, so nobody loses a nudge', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const push = pushServices();
    const response = await run(deps(db, push, { configured: false }));
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ outcome: 'not_configured' });
    expect(db.calls).toEqual([]);
    expect(push.fetchSpy).not.toHaveBeenCalled();
  });

  it('only POST', async () => {
    const db = database({});
    expect((await run(deps(db), { method: 'GET' })).status).toBe(405);
    expect(db.calls).toEqual([]);
  });

  it.each([
    ['not JSON', '{', 400],
    ['an array', '[]', 400],
    ['unknown field', '{"p_now":"2026-01-01T00:00:00Z"}', 400],
    ['limit too large', '{"limit":201}', 400],
    ['limit zero', '{"limit":0}', 400],
    ['limit fractional', '{"limit":1.5}', 400],
    ['limit a string', '{"limit":"5"}', 400],
    ['too large', JSON.stringify({ limit: 1, pad: 'x'.repeat(2000) }), 413]
  ])('body %s → %d, nothing claimed', async (_label, body, status) => {
    const db = database({ claims: [{ userId: USER_A }] });
    expect((await run(deps(db), { body })).status).toBe(status);
    expect(db.calls).toEqual([]);
  });

  it('accepts an empty body (limit 200) or {"limit": n}', async () => {
    expect(parseRunOptions('')).toEqual({ limit: 200 });
    expect(parseRunOptions('{}')).toEqual({ limit: 200 });
    expect(parseRunOptions('{"limit":5}')).toEqual({ limit: 5 });
    const db = database({});
    await run(deps(db), { body: '{"limit":5}' });
    expect(db.calls).toEqual(['claim:5']);
  });

  it('a failed claim → 500 and nothing sent', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    db.store.fail.claimDueNudges = true;
    const push = pushServices();
    const response = await run(deps(db, push));
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ outcome: 'claim_failed' });
    expect(push.fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task selection and copy
// ---------------------------------------------------------------------------

describe('send-nudges — task selection (Context Engine, no model)', () => {
  const TODAY = '2026-10-02';

  it('picks the engine’s first task for the user’s local date', () => {
    const tasks = [
      task(1, 'Old backlog', '2026-08-01'),
      task(2, 'Yesterday', '2026-10-01', { importance: 'high' }),
      task(3, 'Today low', TODAY, { importance: 'low' }),
      task(4, 'Today high', TODAY, { importance: 'high' })
    ];
    expect(selectNudgeTask(tasks, TODAY)?.title).toBe('Today high');
  });

  it('uses the claim’s local date as "today", not the server’s', () => {
    const tasks = [task(1, 'Due on the 3rd', '2026-10-03')];
    expect(selectNudgeTask(tasks, '2026-10-02')).toBeNull();
    expect(selectNudgeTask(tasks, '2026-10-03')?.title).toBe('Due on the 3rd');
  });

  it('ignores completed and future tasks; none eligible → null', () => {
    expect(selectNudgeTask([task(1, 'Done', TODAY, { completed: true }), task(2, 'Later', '2026-10-09')], TODAY)).toBeNull();
    expect(selectNudgeTask([], TODAY)).toBeNull();
  });
});

describe('send-nudges — notification copy and deep links', () => {
  const t = task(1, 'Email the landlord', '2026-10-02');

  it('titles allowed: names the task, links Home (the Right Now card)', () => {
    expect(buildNudgeNotification(t, true)).toEqual({
      title: NUDGE_TITLE,
      body: 'Maybe start with “Email the landlord”. One small step is enough.',
      url: '/'
    });
  });

  it('titles hidden: generic copy, and nothing about the task in the payload', () => {
    const notification = buildNudgeNotification(t, false);
    expect(notification).toEqual({ title: NUDGE_TITLE, body: GENERIC_TASK_BODY, url: '/' });
    const payload = JSON.stringify(notification);
    for (const secret of ['landlord', 'Email', t.id, t.scheduled_date]) expect(payload).not.toContain(secret);
  });

  it('no eligible task: generic copy, links to Tasks to plan one', () => {
    expect(buildNudgeNotification(null, true)).toEqual({ title: NUDGE_TITLE, body: NO_TASK_BODY, url: '/tasks' });
    expect(buildNudgeNotification(null, false)).toEqual({ title: NUDGE_TITLE, body: NO_TASK_BODY, url: '/tasks' });
  });

  it('a blank title falls back to the generic copy', () => {
    expect(buildNudgeNotification(task(1, '  \n ', '2026-10-02'), true).body).toBe(GENERIC_TASK_BODY);
  });

  it('task titles are flattened and bounded', () => {
    expect(cleanTaskTitle('  Call\n\tmum\u0007  ')).toBe('Call mum');
    const long = cleanTaskTitle('x'.repeat(200))!;
    expect(Array.from(long)).toHaveLength(60);
    expect(long.endsWith('…')).toBe(true);
    expect(cleanTaskTitle(42)).toBeNull();
  });

  it('every deep link is an internal path the service worker accepts', () => {
    for (const n of [buildNudgeNotification(t, true), buildNudgeNotification(t, false), buildNudgeNotification(null, true)]) {
      expect(n.url.startsWith('/') && !n.url.startsWith('//')).toBe(true);
    }
  });
});

describe('parseClaim', () => {
  const good = { delivery_id: uuid(1), user_id: uuid(2), local_date: '2026-10-02', show_task_titles: true };
  it('accepts a claim row', () => {
    expect(parseClaim(good)).toEqual({ deliveryId: uuid(1), userId: uuid(2), localDate: '2026-10-02', showTaskTitles: true });
  });
  it('anything but an explicit true hides task names', () => {
    for (const value of [false, null, undefined, 'true', 1]) expect(parseClaim({ ...good, show_task_titles: value })?.showTaskTitles).toBe(false);
  });
  it.each([
    ['bad delivery id', { ...good, delivery_id: '1; drop table' }],
    ['bad user id', { ...good, user_id: 'x' }],
    ['bad date', { ...good, local_date: '02/10/2026' }],
    ['not an object', 'row']
  ])('%s → null', (_label, row) => {
    expect(parseClaim(row)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Whole runs
// ---------------------------------------------------------------------------

describe('send-nudges — due claims end to end', () => {
  it('sends one named nudge to every device and records sent', async () => {
    const a1 = device(USER_A);
    const a2 = device(USER_A, 'web.push.apple.com');
    const db = database({
      claims: [{ userId: USER_A, showTitles: true }],
      tasks: { [USER_A]: [task(1, 'Backlog', '2026-08-01'), task(2, 'Book the dentist', '2026-10-02')] },
      devices: [a1, a2]
    });
    const push = pushServices();

    const response = await run(deps(db, push));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      outcome: 'done',
      claimed: 1,
      sent: 1,
      noDevices: 0,
      failed: 0,
      skipped: 0,
      devicesAttempted: 2,
      devicesSucceeded: 2,
      subscriptionsRemoved: 0,
      recordErrors: 0
    });
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([a1.endpoint, a2.endpoint].sort());
    for (const s of push.sent) expect(s.payload).toEqual({ title: NUDGE_TITLE, body: 'Maybe start with “Book the dentist”. One small step is enough.', url: '/' });
    expect([...db.deliveries.values()][0]).toMatchObject({
      status: 'sent',
      devicesAttempted: 2,
      devicesSucceeded: 2,
      taskId: uuid(2),
      completedAt: NOW.toISOString()
    });
    expect(db.devices.every((d) => d.last_success_at === NOW.toISOString() && d.failure_count === 0)).toBe(true);
  });

  it('titles hidden: the same task is chosen and recorded, but never sent', async () => {
    const db = database({
      claims: [{ userId: USER_A, showTitles: false }],
      tasks: { [USER_A]: [task(2, 'Therapy appointment', '2026-10-02')] },
      devices: [device(USER_A)]
    });
    const push = pushServices();
    await run(deps(db, push));
    expect(push.sent[0].payload).toEqual({ title: NUDGE_TITLE, body: GENERIC_TASK_BODY, url: '/' });
    expect(JSON.stringify(push.sent)).not.toContain('Therapy');
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'sent', taskId: uuid(2) });
  });

  it('no eligible task: generic nudge to /tasks, task_id null', async () => {
    const db = database({
      claims: [{ userId: USER_A }],
      tasks: { [USER_A]: [task(1, 'Next week', '2026-10-09'), task(2, 'Done', '2026-10-01', { completed: true })] },
      devices: [device(USER_A)]
    });
    const push = pushServices();
    await run(deps(db, push));
    expect(push.sent[0].payload).toEqual({ title: NUDGE_TITLE, body: NO_TASK_BODY, url: '/tasks' });
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'sent', taskId: null });
  });

  it('a successful but empty task result still sends the no-task nudge to /tasks', async () => {
    const db = database({ claims: [{ userId: USER_A }], tasks: { [USER_A]: [] }, devices: [device(USER_A)] });
    const push = pushServices();
    await run(deps(db, push));
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].payload).toEqual({ title: NUDGE_TITLE, body: NO_TASK_BODY, url: '/tasks' });
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'sent', taskId: null });
  });

  it('tasks failing to load: zero pushes, never the no-task copy, delivery closed as failed', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A), device(USER_A, 'web.push.apple.com')] });
    db.store.fail.loadTasks = true;
    const push = pushServices();
    const response = await run(deps(db, push));

    expect(response.status).toBe(200);
    expect(push.fetchSpy).not.toHaveBeenCalled();
    expect(push.buildRequest).not.toHaveBeenCalled();
    expect(await json(response)).toMatchObject({ claimed: 1, sent: 0, noDevices: 0, failed: 1, devicesAttempted: 0, devicesSucceeded: 0 });
    expect([...db.deliveries.values()][0]).toEqual({
      id: expect.any(String),
      user_id: USER_A,
      local_date: '2026-10-02',
      status: 'failed',
      devicesAttempted: 0,
      devicesSucceeded: 0,
      taskId: null,
      completedAt: NOW.toISOString()
    });
    // Devices are left exactly as they were: nothing was attempted.
    expect(db.devices.every((d) => d.failure_count === 0 && d.last_success_at === null)).toBe(true);
  });

  it('one user’s task-load failure does not stop the other claimed users', async () => {
    const userC = uuid(3);
    const db = database({
      claims: [{ userId: USER_A }, { userId: USER_B }, { userId: userC }],
      tasks: { [USER_A]: [task(1, 'A task', '2026-10-02')], [userC]: [] },
      devices: [device(USER_A), device(USER_B), device(userC)]
    });
    db.store.failTasksFor.add(USER_B);
    const push = pushServices();
    const lines: unknown[] = [];
    const body = await json(await run(deps(db, push, { concurrency: 1, log: (event) => lines.push(event) })));

    expect(body).toMatchObject({ claimed: 3, sent: 2, failed: 1, devicesAttempted: 2, devicesSucceeded: 2 });
    const deviceB = db.devices.find((d) => d.user_id === USER_B)!;
    expect(push.sent.map((s) => s.endpoint)).not.toContain(deviceB.endpoint);
    const byUser = Object.fromEntries([...db.deliveries.values()].map((d) => [d.user_id, d]));
    expect(byUser[USER_A]).toMatchObject({ status: 'sent', taskId: uuid(1) });
    expect(byUser[USER_B]).toMatchObject({ status: 'failed', devicesAttempted: 0, devicesSucceeded: 0, taskId: null, completedAt: NOW.toISOString() });
    expect(byUser[userC]).toMatchObject({ status: 'sent', taskId: null });
    // Counts only: the failing user is not identified anywhere in the log.
    expect(JSON.stringify(lines)).not.toContain(USER_B);
  });

  it('each user gets their own task, never another user’s', async () => {
    const db = database({
      claims: [{ userId: USER_A }, { userId: USER_B }],
      tasks: { [USER_A]: [task(1, 'A task', '2026-10-02')], [USER_B]: [task(2, 'B task', '2026-10-02')] },
      devices: [device(USER_A), device(USER_B)]
    });
    const push = pushServices();
    await run(deps(db, push));
    const byEndpoint = Object.fromEntries(push.sent.map((s) => [s.endpoint, (s.payload as { body: string }).body]));
    expect(byEndpoint[db.devices[0].endpoint]).toContain('A task');
    expect(byEndpoint[db.devices[1].endpoint]).toContain('B task');
  });

  it('no devices left at send time → no_devices, nothing sent', async () => {
    const db = database({ claims: [{ userId: USER_A }], tasks: { [USER_A]: [task(1, 'x', '2026-10-02')] } });
    const push = pushServices();
    const body = await json(await run(deps(db, push)));
    expect(body).toMatchObject({ claimed: 1, noDevices: 1, sent: 0, failed: 0 });
    expect(push.fetchSpy).not.toHaveBeenCalled();
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'no_devices', devicesAttempted: 0, devicesSucceeded: 0, taskId: null, completedAt: NOW.toISOString() });
  });

  it('device list failing to load → failed', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    db.store.fail.loadSubscriptions = true;
    await run(deps(db));
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'failed', devicesAttempted: 0 });
  });
});

describe('send-nudges — push failures and device upkeep', () => {
  it('partial success: sent, with attempted/succeeded counts; the failing device’s failure_count rises', async () => {
    const ok = device(USER_A);
    const bad = device(USER_A, 'web.push.apple.com', { failure_count: 2 });
    const db = database({ claims: [{ userId: USER_A }], tasks: { [USER_A]: [task(1, 'x', '2026-10-02')] }, devices: [ok, bad] });
    const body = await json(await run(deps(db, pushServices({ 'apple.com': 503 }))));
    expect(body).toMatchObject({ sent: 1, failed: 0, devicesAttempted: 2, devicesSucceeded: 1 });
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'sent', devicesAttempted: 2, devicesSucceeded: 1, taskId: uuid(1) });
    expect(db.devices.find((d) => d.id === bad.id)).toMatchObject({ failure_count: 3, last_success_at: null });
    expect(db.devices.find((d) => d.id === ok.id)).toMatchObject({ failure_count: 0, last_success_at: NOW.toISOString() });
  });

  it('a success resets an earlier failure_count', async () => {
    const flaky = device(USER_A, 'fcm.googleapis.com', { failure_count: 5 });
    const db = database({ claims: [{ userId: USER_A }], devices: [flaky] });
    await run(deps(db));
    expect(db.devices[0]).toMatchObject({ failure_count: 0, last_success_at: NOW.toISOString() });
  });

  it('every device failing → failed, with the task still recorded', async () => {
    const db = database({
      claims: [{ userId: USER_A }],
      tasks: { [USER_A]: [task(1, 'x', '2026-10-02')] },
      devices: [device(USER_A), device(USER_A, 'web.push.apple.com')]
    });
    const body = await json(await run(deps(db, pushServices({ 'fcm.': 500, 'apple.com': 'throw' }))));
    expect(body).toMatchObject({ sent: 0, failed: 1, devicesAttempted: 2, devicesSucceeded: 0 });
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'failed', devicesAttempted: 2, devicesSucceeded: 0, taskId: uuid(1) });
    expect(db.devices.map((d) => d.failure_count)).toEqual([1, 1]);
  });

  it.each([[404], [410]])('%d: the expired subscription is deleted, not counted as a failure', async (status) => {
    const gone = device(USER_A, 'updates.push.services.mozilla.com', { failure_count: 1 });
    const ok = device(USER_A);
    const db = database({ claims: [{ userId: USER_A }], devices: [gone, ok] });
    const body = await json(await run(deps(db, pushServices({ mozilla: status }))));
    expect(body).toMatchObject({ subscriptionsRemoved: 1, sent: 1, devicesAttempted: 2, devicesSucceeded: 1 });
    expect(db.devices.map((d) => d.id)).toEqual([ok.id]);
  });

  it('all devices expired → failed, and every row is removed', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A), device(USER_A)] });
    const body = await json(await run(deps(db, pushServices({ 'fcm.': 410 }))));
    expect(body).toMatchObject({ failed: 1, subscriptionsRemoved: 2 });
    expect(db.devices).toEqual([]);
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'failed', devicesAttempted: 2, devicesSucceeded: 0 });
  });

  it.each([[400], [403], [413], [429], [500], [502]])('%d: failure_count rises, the row is kept', async (status) => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    await run(deps(db, pushServices({ 'fcm.': status })));
    expect(db.devices).toHaveLength(1);
    expect(db.devices[0].failure_count).toBe(1);
  });

  it('malformed subscription rows are never sent to; they count as failed attempts', async () => {
    const unknownHost = device(USER_A, 'attacker.example');
    const badKey = device(USER_A, 'fcm.googleapis.com', { p256dh: 'short' });
    const ok = device(USER_A);
    const db = database({ claims: [{ userId: USER_A }], devices: [unknownHost, badKey, ok] });
    const push = pushServices();
    const body = await json(await run(deps(db, push)));
    expect(push.sent.map((s) => s.endpoint)).toEqual([ok.endpoint]);
    expect(push.buildRequest).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ sent: 1, devicesAttempted: 3, devicesSucceeded: 1 });
    expect(db.devices.find((d) => d.id === unknownHost.id)?.failure_count).toBe(1);
    expect(db.devices.find((d) => d.id === badKey.id)?.failure_count).toBe(1);
  });

  it('an encryption/VAPID signing failure is a failed device, with no detail leaked', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const push = pushServices();
    push.buildRequest.mockImplementation(() => {
      throw new Error('Vapid private key should be 32 bytes long: kkkkkkkk');
    });
    const response = await run(deps(db, push));
    const text = await response.clone().text();
    expect(response.status).toBe(200);
    expect(text).not.toMatch(/vapid|private|kkkk/i);
    expect([...db.deliveries.values()][0]).toMatchObject({ status: 'failed', devicesAttempted: 1, devicesSucceeded: 0 });
    expect(db.devices[0].failure_count).toBe(1);
  });

  it('sends with the 4-hour TTL and daily-nudge Topic from the builder, and a timeout signal', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const push = pushServices();
    await run(deps(db, push));
    const [, init] = push.fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ TTL: '14400', Topic: 'ima-daily-nudge' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('send-nudges — delivery state and duplicate protection', () => {
  it('a second run the same day claims nobody and sends nothing', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A)] });
    const push = pushServices();
    await run(deps(db, push));
    const second = await json(await run(deps(db, push)));
    expect(second).toMatchObject({ claimed: 0, sent: 0 });
    expect(push.sent).toHaveLength(1);
  });

  it('only ever sends to users the claim returned', async () => {
    const db = database({ claims: [{ userId: USER_A }], devices: [device(USER_A), device(USER_B)] });
    const push = pushServices();
    await run(deps(db, push));
    expect(push.sent.map((s) => s.endpoint)).toEqual([db.devices[0].endpoint]);
  });

  it('a malformed claim row is never sent to, and its delivery is closed as failed', async () => {
    const db = database({ claims: [{ userId: 'not-a-uuid' }, { userId: USER_A }], devices: [device(USER_A)] });
    const push = pushServices();
    const body = await json(await run(deps(db, push)));
    expect(body).toMatchObject({ claimed: 2, skipped: 1, sent: 1 });
    expect(push.sent).toHaveLength(1);
    const statuses = [...db.deliveries.values()].map((d) => d.status);
    expect(statuses.sort()).toEqual(['failed', 'sent']);
  });

  it('every claimed delivery ends sent / no_devices / failed with completed_at', async () => {
    const db = database({
      claims: [{ userId: USER_A }, { userId: USER_B }, { userId: uuid(3) }],
      devices: [device(USER_A), device(USER_B, 'web.push.apple.com')]
    });
    await run(deps(db, pushServices({ 'apple.com': 500 })));
    const rows = [...db.deliveries.values()];
    expect(rows.map((r) => r.status).sort()).toEqual(['failed', 'no_devices', 'sent']);
    expect(rows.every((r) => r.completedAt === NOW.toISOString())).toBe(true);
    expect(rows.every((r) => (r.devicesSucceeded ?? 0) <= (r.devicesAttempted ?? 0))).toBe(true);
  });

  it('a delivery bookkeeping failure is counted, not thrown; the run still answers 200', async () => {
    const db = database({ claims: [{ userId: USER_A }, { userId: USER_B }], devices: [device(USER_A), device(USER_B)] });
    db.store.fail.completeDelivery = true;
    db.store.fail.markSubscriptionSuccess = true;
    const push = pushServices();
    const response = await run(deps(db, push));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ sent: 2, recordErrors: 4 });
    expect(push.sent).toHaveLength(2);
  });

  it('processes many users with bounded concurrency', async () => {
    const users = Array.from({ length: 13 }, (_, i) => uuid(500 + i));
    const db = database({ claims: users.map((userId) => ({ userId })), devices: users.map((u) => device(u)) });
    let inFlight = 0;
    let peak = 0;
    const push = pushServices();
    const realFetch = push.fetchImpl;
    const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        return await realFetch(...args);
      } finally {
        inFlight--;
      }
    }) as typeof fetch;
    const body = await json(await run(deps(db, push, { fetchImpl, concurrency: 3 })));
    expect(body).toMatchObject({ claimed: 13, sent: 13 });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('send-nudges — logging', () => {
  it('logs outcome and counts only', async () => {
    const lines: unknown[] = [];
    const db = database({
      claims: [{ userId: USER_A }],
      tasks: { [USER_A]: [task(1, 'Secret task', '2026-10-02')] },
      devices: [device(USER_A)]
    });
    await run(deps(db, pushServices(), { log: (event) => lines.push(event) }));
    expect(lines).toEqual([{ status: 200, outcome: 'done', claimed: 1, sent: 1, noDevices: 0, failed: 0 }]);
    const text = JSON.stringify(lines);
    for (const secret of ['Secret', USER_A, 'fcm.googleapis.com', SERVICE_KEY, P256DH]) expect(text).not.toContain(secret);
  });
});
