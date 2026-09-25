import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankTasks } from '@/lib/context-engine';
import type { NewTaskInput, TaskRow } from '@/hooks/use-tasks';
import {
  GUEST_STORE_TTL_MS,
  GUEST_STORE_VERSION,
  GUEST_TASKS_STORAGE_KEY,
  GUEST_TASK_ID_PREFIX,
  GUEST_USER_ID,
  createGuestTaskStore,
  isGuestTaskId,
  type GuestTask,
  type GuestTaskInput,
  type GuestTaskStoreOptions
} from './guest-task-store';

// If anything the store loads ever pulls in Supabase, these factories run and
// the isolation test below fails. vi.mock is not an import, so the guest lint
// rule does not apply to it.
const supabaseLoaded = vi.hoisted(() => ({ client: false, library: false }));
vi.mock('@/integrations/supabase/client', () => {
  supabaseLoaded.client = true;
  return { supabase: {} };
});
vi.mock('@supabase/supabase-js', () => {
  supabaseLoaded.library = true;
  return {};
});

/** A Storage backed by a Map, with switches to make it misbehave. */
class FakeStorage implements Storage {
  data = new Map<string, string>();
  failWrites = false;
  failReads = false;

  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    if (this.failReads) throw new Error('SecurityError');
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
}

const START = new Date('2026-09-25T09:00:00.000Z');

/** A store with a controllable clock and predictable ids. */
function setup(overrides: GuestTaskStoreOptions & { storage?: () => Storage | null } = {}) {
  const storage = new FakeStorage();
  let clock = START.getTime();
  let seq = 0;
  const options: GuestTaskStoreOptions = {
    storage: () => storage,
    now: () => new Date(clock),
    randomId: () => `id-${String(++seq).padStart(3, '0')}`,
    ...overrides
  };
  return {
    storage,
    options,
    store: createGuestTaskStore(options),
    advance: (ms: number) => {
      clock += ms;
    }
  };
}

const TODAY = '2026-09-25';

describe('guest task identity', () => {
  it('uses guest-prefixed ids and the guest user id, never a UUID', () => {
    const { store } = setup({ randomId: undefined });
    const task = store.create({ title: 'Write the intro', scheduled_date: TODAY });

    expect(task.id.startsWith(GUEST_TASK_ID_PREFIX)).toBe(true);
    expect(isGuestTaskId(task.id)).toBe(true);
    expect(task.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(task.user_id).toBe(GUEST_USER_ID);
  });

  it('gives every task a distinct id', () => {
    const { store } = setup({ randomId: undefined });
    const ids = new Set(Array.from({ length: 50 }, (_, i) => store.create({ title: `t${i}`, scheduled_date: TODAY }).id));
    expect(ids.size).toBe(50);
  });

  it('refuses to look up or change anything that is not a guest id', () => {
    const { store } = setup();
    store.create({ title: 'A', scheduled_date: TODAY });
    const uuid = '3f1c1b0e-8d3a-4e8b-9a47-2b1f0c9d7e61';

    expect(store.get(uuid)).toBeNull();
    expect(() => store.update(uuid, { title: 'B' })).toThrow();
    expect(() => store.toggleCompleted(uuid)).toThrow();
    store.remove(uuid);
    expect(store.list()).toHaveLength(1);
  });
});

describe('creating tasks', () => {
  it('applies the same defaults and normalisation as useCreateTask', () => {
    const { store } = setup();
    const task = store.create({
      title: '  Email Sam  ',
      description: '   ',
      scheduled_date: TODAY,
      start_time: '14:30'
    });

    expect(task).toEqual({
      id: 'guest_id-001',
      user_id: 'guest',
      title: 'Email Sam',
      description: null,
      tag: 'focus',
      scheduled_date: TODAY,
      start_time: '14:30:00',
      end_time: null,
      importance: 'normal',
      completed: false,
      completed_at: null,
      created_at: START.toISOString(),
      updated_at: START.toISOString()
    });
  });

  it('rejects what the tasks table CHECK constraints would reject', () => {
    const { store } = setup();
    expect(() => store.create({ title: '   ', scheduled_date: TODAY })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: '2026-02-30' })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: 'tomorrow' })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: TODAY, tag: 'urgent' })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: TODAY, importance: 'critical' })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: TODAY, start_time: '25:00' })).toThrow();
    expect(() =>
      store.create({ title: 'x', scheduled_date: TODAY, start_time: '10:00', end_time: '09:00' })
    ).toThrow();
    expect(store.list()).toHaveLength(0);
  });
});

describe('updating, completing and deleting', () => {
  it('updates fields and stamps updated_at, leaving identity alone', () => {
    const { store, advance } = setup();
    const task = store.create({ title: 'Draft', scheduled_date: TODAY });
    advance(60_000);

    const next = store.update(task.id, { title: 'Final draft', importance: 'high', start_time: '09:15' });

    expect(next.id).toBe(task.id);
    expect(next.user_id).toBe(GUEST_USER_ID);
    expect(next.created_at).toBe(task.created_at);
    expect(next.title).toBe('Final draft');
    expect(next.importance).toBe('high');
    expect(next.start_time).toBe('09:15:00');
    expect(next.updated_at).toBe(new Date(START.getTime() + 60_000).toISOString());
  });

  it('moves completed_at with completed, as tasks_completed_at_consistent requires', () => {
    const { store, advance } = setup();
    const task = store.create({ title: 'Call', scheduled_date: TODAY });
    advance(1_000);

    const done = store.toggleCompleted(task.id);
    expect(done.completed).toBe(true);
    expect(done.completed_at).toBe(new Date(START.getTime() + 1_000).toISOString());

    advance(1_000);
    const renamed = store.update(task.id, { title: 'Call Sam' });
    expect(renamed.completed_at).toBe(done.completed_at);

    const reopened = store.toggleCompleted(task.id);
    expect(reopened.completed).toBe(false);
    expect(reopened.completed_at).toBeNull();
  });

  it('rejects an edit that would put the end before the start', () => {
    const { store } = setup();
    const task = store.create({ title: 'Meet', scheduled_date: TODAY, start_time: '10:00', end_time: '11:00' });
    expect(() => store.update(task.id, { end_time: '09:00' })).toThrow();
    expect(store.get(task.id)?.end_time).toBe('11:00:00');
  });

  it('deletes a task, and removes the stored key when the last one goes', () => {
    const { store, storage } = setup();
    const a = store.create({ title: 'A', scheduled_date: TODAY });
    const b = store.create({ title: 'B', scheduled_date: TODAY });

    store.remove(a.id);
    expect(store.list().map((t) => t.id)).toEqual([b.id]);

    store.remove(b.id);
    expect(store.list()).toEqual([]);
    expect(storage.data.has(GUEST_TASKS_STORAGE_KEY)).toBe(false);
  });

  it('clear() drops everything', () => {
    const { store, storage } = setup();
    store.create({ title: 'A', scheduled_date: TODAY });
    store.clear();
    expect(store.list()).toEqual([]);
    expect(storage.data.size).toBe(0);
  });
});

describe('ordering and snapshots', () => {
  it('lists tasks in useTasks() order: date, start time (untimed last), then creation', () => {
    const { store, advance } = setup();
    const untimedToday = store.create({ title: 'untimed today', scheduled_date: TODAY });
    advance(1);
    const late = store.create({ title: 'late', scheduled_date: TODAY, start_time: '16:00' });
    advance(1);
    const early = store.create({ title: 'early', scheduled_date: TODAY, start_time: '08:00' });
    advance(1);
    const yesterday = store.create({ title: 'yesterday', scheduled_date: '2026-09-24' });
    advance(1);
    const untimedToday2 = store.create({ title: 'untimed today 2', scheduled_date: TODAY });

    expect(store.list().map((t) => t.id)).toEqual([
      yesterday.id,
      early.id,
      late.id,
      untimedToday.id,
      untimedToday2.id
    ]);
  });

  it('returns the same frozen array until something changes, and notifies subscribers', () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.create({ title: 'A', scheduled_date: TODAY });
    expect(listener).toHaveBeenCalledTimes(1);

    const first = store.list();
    expect(store.list()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);

    store.create({ title: 'B', scheduled_date: TODAY });
    expect(store.list()).not.toBe(first);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('persistence in sessionStorage', () => {
  it('writes one namespaced, versioned envelope', () => {
    const { store, storage } = setup();
    store.create({ title: 'A', scheduled_date: TODAY });

    expect([...storage.data.keys()]).toEqual([GUEST_TASKS_STORAGE_KEY]);
    expect(GUEST_TASKS_STORAGE_KEY).toBe('ima.guest.v1.tasks');
    const envelope = JSON.parse(storage.data.get(GUEST_TASKS_STORAGE_KEY) as string);
    expect(envelope.version).toBe(GUEST_STORE_VERSION);
    expect(envelope.createdAt).toBe(START.toISOString());
    expect(envelope.tasks).toHaveLength(1);
  });

  it('survives a reload: a new store over the same storage sees the tasks', () => {
    const { store, storage, options } = setup();
    const task = store.create({ title: 'Keep me', scheduled_date: TODAY });

    const reloaded = createGuestTaskStore({ ...options, storage: () => storage });
    expect(reloaded.list()).toEqual([task]);
    expect(reloaded.isPersistent()).toBe(true);
  });

  it('expires stored tasks GUEST_STORE_TTL_MS after the first was created', () => {
    const { store, storage, advance } = setup();
    store.create({ title: 'Old', scheduled_date: TODAY });

    advance(GUEST_STORE_TTL_MS);
    expect(store.list()).toHaveLength(1);

    advance(1);
    expect(store.list()).toEqual([]);
    expect(storage.data.has(GUEST_TASKS_STORAGE_KEY)).toBe(false);

    // A fresh task starts a fresh lifetime.
    store.create({ title: 'New', scheduled_date: TODAY });
    expect(store.list()).toHaveLength(1);
  });

  it('discards corrupt JSON, other versions, and malformed or non-guest entries', () => {
    const { storage, options } = setup();

    storage.data.set(GUEST_TASKS_STORAGE_KEY, '{not json');
    expect(createGuestTaskStore(options).list()).toEqual([]);
    expect(storage.data.has(GUEST_TASKS_STORAGE_KEY)).toBe(false);

    storage.data.set(
      GUEST_TASKS_STORAGE_KEY,
      JSON.stringify({ version: 99, createdAt: START.toISOString(), tasks: [] })
    );
    expect(createGuestTaskStore(options).list()).toEqual([]);
    expect(storage.data.has(GUEST_TASKS_STORAGE_KEY)).toBe(false);

    const good = setup().store.create({ title: 'Good', scheduled_date: TODAY });
    storage.data.set(
      GUEST_TASKS_STORAGE_KEY,
      JSON.stringify({
        version: GUEST_STORE_VERSION,
        createdAt: START.toISOString(),
        tasks: [
          good,
          { ...good, id: '3f1c1b0e-8d3a-4e8b-9a47-2b1f0c9d7e61' },
          { ...good, id: 'guest_x', user_id: 'someone-else' },
          { ...good, id: 'guest_y', completed: true, completed_at: null },
          'nonsense'
        ]
      })
    );
    expect(createGuestTaskStore(options).list()).toEqual([good]);
  });
});

describe('in-memory fallback', () => {
  it('runs in memory when storage cannot be reached at all', () => {
    const { store } = setup({
      storage: () => {
        throw new Error('SecurityError: access denied');
      }
    });
    const task = store.create({ title: 'Still works', scheduled_date: TODAY });
    expect(store.isPersistent()).toBe(false);
    expect(store.list()).toEqual([task]);
    store.toggleCompleted(task.id);
    expect(store.get(task.id)?.completed).toBe(true);
  });

  it('runs in memory when storage exists but refuses writes', () => {
    const blocked = new FakeStorage();
    blocked.failWrites = true;
    const { store } = setup({ storage: () => blocked });

    store.create({ title: 'A', scheduled_date: TODAY });
    expect(store.isPersistent()).toBe(false);
    expect(store.list()).toHaveLength(1);
    expect(blocked.data.size).toBe(0);
  });

  it('keeps every task when storage starts failing mid-session', () => {
    const { store, storage } = setup();
    const a = store.create({ title: 'A', scheduled_date: TODAY });
    expect(store.isPersistent()).toBe(true);

    storage.failWrites = true;
    const b = store.create({ title: 'B', scheduled_date: TODAY });
    expect(store.isPersistent()).toBe(false);

    storage.failReads = true;
    expect(store.list().map((t) => t.id)).toEqual([a.id, b.id]);
    store.remove(a.id);
    expect(store.list().map((t) => t.id)).toEqual([b.id]);
  });

  it('runs in memory when there is no window (tests, prerendering)', () => {
    const store = createGuestTaskStore();
    store.create({ title: 'A', scheduled_date: TODAY });
    expect(store.isPersistent()).toBe(false);
    expect(store.list()).toHaveLength(1);
  });
});

describe('browser storage choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses window.sessionStorage by default and never touches localStorage', () => {
    const session = new FakeStorage();
    const local = new FakeStorage();
    const localSpy = vi.spyOn(local, 'setItem');
    vi.stubGlobal('window', { sessionStorage: session, localStorage: local });

    const store = createGuestTaskStore();
    store.create({ title: 'A', scheduled_date: TODAY });

    expect(store.isPersistent()).toBe(true);
    expect(session.data.has(GUEST_TASKS_STORAGE_KEY)).toBe(true);
    expect(local.data.size).toBe(0);
    expect(localSpy).not.toHaveBeenCalled();
  });
});

describe('Context Engine compatibility', () => {
  it('is a TaskRow and accepts a NewTaskInput (compile-time)', () => {
    const { store } = setup();
    const guest: GuestTask = store.create({ title: 'A', scheduled_date: TODAY });
    // These two lines are the real test: tsc fails if the shapes drift apart.
    const asRow: TaskRow = guest;
    const input: NewTaskInput = { title: 'B', scheduled_date: TODAY, importance: 'high' };
    const asGuestInput: GuestTaskInput = input;
    expect(asRow.id).toBe(guest.id);
    expect(store.create(asGuestInput).importance).toBe('high');
  });

  it('ranks guest tasks exactly as it ranks the same tasks from Supabase', () => {
    const { store, advance } = setup();
    const specs: GuestTaskInput[] = [
      { title: 'today normal', scheduled_date: TODAY },
      { title: 'today high', scheduled_date: TODAY, importance: 'high' },
      { title: 'today low', scheduled_date: TODAY, importance: 'low' },
      { title: 'recent', scheduled_date: '2026-09-22' },
      { title: 'long low', scheduled_date: '2026-08-01', importance: 'low' },
      { title: 'long high', scheduled_date: '2026-08-02', importance: 'high' },
      { title: 'long normal a', scheduled_date: '2026-07-01' },
      { title: 'long normal b', scheduled_date: '2026-07-02' },
      { title: 'future', scheduled_date: '2026-09-26' }
    ];
    for (const spec of specs) {
      store.create(spec);
      advance(1_000);
    }
    const done = store.create({ title: 'done', scheduled_date: TODAY });
    store.toggleCompleted(done.id);

    const guestTasks = [...store.list()];
    // The same tasks as rows from the database: real-looking ids and owner.
    const rows: TaskRow[] = guestTasks.map((task, i) => ({
      ...task,
      user_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    }));

    const rankedGuest = rankTasks(guestTasks, { today: TODAY });
    const rankedRows = rankTasks(rows, { today: TODAY });

    expect(rankedGuest.map((r) => r.task.title)).toEqual(rankedRows.map((r) => r.task.title));
    expect(rankedGuest.map((r) => r.reason)).toEqual(rankedRows.map((r) => r.reason));
    expect(rankedGuest.map((r) => r.task.title).slice(0, 3)).toEqual(['today high', 'today normal', 'today low']);
    expect(rankedGuest.map((r) => r.task.title)).not.toContain('future');
    expect(rankedGuest.map((r) => r.task.title)).not.toContain('done');
    // The engine hands back the caller's own objects.
    expect(rankedGuest[0].task).toBe(guestTasks.find((t) => t.title === 'today high'));
  });
});

describe('Supabase isolation', () => {
  it('never loads the Supabase client or library', () => {
    const { store } = setup();
    const task = store.create({ title: 'A', scheduled_date: TODAY });
    store.update(task.id, { title: 'B' });
    store.toggleCompleted(task.id);
    store.remove(task.id);

    expect(supabaseLoaded.client).toBe(false);
    expect(supabaseLoaded.library).toBe(false);
  });

  it('has no value import of anything Supabase-backed in the guest source', () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8');
      const specifiers = [...text.matchAll(/^\s*import\s+(?!type\b)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      const dynamic = [...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
      for (const specifier of [...specifiers, ...dynamic]) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(/supabase|\/hooks\/|AuthProvider/i);
      }
    }
  });
});
