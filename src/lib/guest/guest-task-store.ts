/**
 * Guest task store — temporary tasks for a visitor with no account.
 *
 * Plain TypeScript with no React, no network and, above all, no Supabase. The
 * one way guest data reaches an account is a deliberate import step run by a
 * signed-in user; nothing in this module can write anywhere but the browser
 * tab it is running in. The ESLint config enforces that by refusing any
 * Supabase import under src/lib/guest.
 *
 * Where the tasks live, and why:
 *
 *   * sessionStorage, under one namespaced, versioned key. It survives a
 *     refresh and in-app navigation (so Focus's ?task= handoff still resolves
 *     after a reload, and a guest who signs up in the same tab keeps their
 *     tasks through onboarding), but it is scoped to the tab and gone when the
 *     tab closes. That is what "temporary" should mean on a shared device.
 *   * Not localStorage: that outlives the visit, is shared by every tab, and is
 *     where the Supabase session itself is kept.
 *   * A plain in-memory copy when storage is unavailable or refuses a write
 *     (private browsing, blocked site data, a full quota). The guest keeps
 *     working for as long as the page is open; only a refresh loses the tasks.
 *
 * Stored tasks also expire GUEST_STORE_TTL_MS after the first one was created,
 * so a tab left open for days does not hand stale tasks to whoever uses it next.
 *
 * The task objects have the same fields as a Supabase task row, so the Context
 * Engine and every task component take them unchanged. Two fields make sure a
 * guest task can never pass for a real one:
 *
 *   * `id` always starts with GUEST_TASK_ID_PREFIX. It is not a valid UUID, so
 *     it cannot match, or be written as, a real task id.
 *   * `user_id` is always GUEST_USER_ID. It matches no account, so the
 *     database's own rules would refuse a row carrying it.
 */

/** The single sessionStorage key. Namespaced away from Supabase's own keys. */
export const GUEST_TASKS_STORAGE_KEY = 'ima.guest.v1.tasks';

/** Bumped whenever the stored shape changes; an older envelope is discarded. */
export const GUEST_STORE_VERSION = 1;

/** Every guest task id starts with this. */
export const GUEST_TASK_ID_PREFIX = 'guest_';

/** Stands in for user_id. Deliberately not a UUID and not any account. */
export const GUEST_USER_ID = 'guest';

/** How long stored guest tasks are kept, measured from the first one. */
export const GUEST_STORE_TTL_MS = 24 * 60 * 60 * 1000;

/** Same vocabularies as the tasks table's CHECK constraints. */
export const GUEST_TASK_TAGS = ['flow', 'break', 'focus'] as const;
export const GUEST_TASK_IMPORTANCE = ['low', 'normal', 'high'] as const;

export type GuestTaskTag = (typeof GUEST_TASK_TAGS)[number];
export type GuestTaskImportance = (typeof GUEST_TASK_IMPORTANCE)[number];
export type GuestTaskId = `${typeof GUEST_TASK_ID_PREFIX}${string}`;

/**
 * A guest task. Field for field the same as a tasks row, so anything that
 * reads a TaskRow — the Context Engine included — reads this too.
 */
export interface GuestTask {
  id: GuestTaskId;
  user_id: typeof GUEST_USER_ID;
  title: string;
  description: string | null;
  tag: GuestTaskTag;
  /** 'YYYY-MM-DD', the local day the task is planned for. */
  scheduled_date: string;
  /** 'HH:MM:SS', the form the database returns, or null. */
  start_time: string | null;
  end_time: string | null;
  importance: GuestTaskImportance;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What creating a task takes. Accepts the same input as useCreateTask. */
export interface GuestTaskInput {
  title: string;
  description?: string | null;
  tag?: string;
  scheduled_date: string;
  /** 'HH:MM' or 'HH:MM:SS', or null. */
  start_time?: string | null;
  end_time?: string | null;
  importance?: string;
}

/** Fields an edit may change. Identity, ownership and timestamps are not among them. */
export type GuestTaskChanges = Partial<
  Pick<
    GuestTask,
    'title' | 'description' | 'tag' | 'scheduled_date' | 'start_time' | 'end_time' | 'importance' | 'completed'
  >
>;

export interface GuestTaskStore {
  /**
   * Every guest task, in the same order useTasks() returns rows: date, then
   * start time with untimed tasks last, then creation time. The array is the
   * same object until something changes, so it can back useSyncExternalStore.
   */
  list(): readonly GuestTask[];
  get(id: string): GuestTask | null;
  create(input: GuestTaskInput): GuestTask;
  update(id: string, changes: GuestTaskChanges): GuestTask;
  /** Flips completion, moving completed_at with it as the database requires. */
  toggleCompleted(id: string): GuestTask;
  remove(id: string): void;
  /** Drops every guest task and the stored key with them. */
  clear(): void;
  /** Called after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** False once the store has fallen back to memory for this page. */
  isPersistent(): boolean;
}

export interface GuestTaskStoreOptions {
  /**
   * Where to persist. Defaults to window.sessionStorage. Return null to run in
   * memory only. A getter rather than a value, because merely touching
   * window.sessionStorage throws when site data is blocked.
   */
  storage?: () => Storage | null;
  /** Clock, for tests. */
  now?: () => Date;
  /** Random part of a new id, for tests. Defaults to crypto.randomUUID. */
  randomId?: () => string;
}

/** What is written under GUEST_TASKS_STORAGE_KEY. */
interface GuestTaskEnvelope {
  version: typeof GUEST_STORE_VERSION;
  /** ISO timestamp of the first task. The TTL runs from here. */
  createdAt: string;
  tasks: GuestTask[];
}

/** A place to keep the serialised envelope: sessionStorage, or memory. */
interface Backend {
  read(): string | null;
  write(value: string): void;
  remove(): void;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** A real calendar date, so 2026-02-30 is refused as the database would. */
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM:SS'. Null for blank; throws for garbage. */
function normaliseTime(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const match = TIME.exec(value.trim());
  if (!match) throw new Error(`${field} must be a time like 14:30.`);
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

function normaliseTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') throw new Error('A task needs a title.');
  return title;
}

function normaliseDescription(value: string | null | undefined): string | null {
  const description = (value ?? '').trim();
  return description === '' ? null : description;
}

function normaliseTag(value: string | undefined): GuestTaskTag {
  if (value === undefined) return 'focus';
  if ((GUEST_TASK_TAGS as readonly string[]).includes(value)) return value as GuestTaskTag;
  throw new Error(`Unknown task tag "${value}".`);
}

function normaliseImportance(value: string | undefined): GuestTaskImportance {
  if (value === undefined) return 'normal';
  if ((GUEST_TASK_IMPORTANCE as readonly string[]).includes(value)) return value as GuestTaskImportance;
  throw new Error(`Unknown task importance "${value}".`);
}

function requireDate(value: unknown): string {
  if (!isValidDate(value)) throw new Error('A task needs a scheduled date like 2026-09-25.');
  return value;
}

/** tasks_time_order: an end time, when both are set, comes after the start. */
function checkTimeOrder(start: string | null, end: string | null): void {
  if (start !== null && end !== null && end <= start) {
    throw new Error('A task cannot end before it starts.');
  }
}

export function isGuestTaskId(value: unknown): value is GuestTaskId {
  return typeof value === 'string' && value.startsWith(GUEST_TASK_ID_PREFIX) && value.length > GUEST_TASK_ID_PREFIX.length;
}

/**
 * Whether a stored value is a well-formed guest task. Anything else in storage
 * — a hand-edited value, a half-written entry — is dropped on read rather than
 * handed to the UI.
 */
function isStoredGuestTask(value: unknown): value is GuestTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  const nullableString = (field: unknown) => field === null || typeof field === 'string';
  return (
    isGuestTaskId(task.id) &&
    task.user_id === GUEST_USER_ID &&
    typeof task.title === 'string' &&
    task.title.trim() !== '' &&
    nullableString(task.description) &&
    (GUEST_TASK_TAGS as readonly unknown[]).includes(task.tag) &&
    isValidDate(task.scheduled_date) &&
    nullableString(task.start_time) &&
    nullableString(task.end_time) &&
    (GUEST_TASK_IMPORTANCE as readonly unknown[]).includes(task.importance) &&
    typeof task.completed === 'boolean' &&
    (task.completed ? typeof task.completed_at === 'string' : task.completed_at === null) &&
    typeof task.created_at === 'string' &&
    typeof task.updated_at === 'string'
  );
}

/** useTasks() order: date, start time (untimed last), then creation time. Id breaks ties. */
function compareTasks(a: GuestTask, b: GuestTask): number {
  if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date < b.scheduled_date ? -1 : 1;
  if (a.start_time !== b.start_time) {
    if (a.start_time === null) return 1;
    if (b.start_time === null) return -1;
    return a.start_time < b.start_time ? -1 : 1;
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function defaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function defaultRandomId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  // randomUUID needs a secure context. Uniqueness within one tab is all a
  // guest id needs; it is never used as a secret.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function memoryBackend(initial: string | null = null): Backend {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    remove: () => {
      value = null;
    }
  };
}

/**
 * The storage backend, or null when storage cannot be used at all. Probed with
 * a real write, because some browsers expose sessionStorage and then throw on
 * the first setItem.
 */
function storageBackend(getStorage: () => Storage | null): Backend | null {
  let storage: Storage | null;
  try {
    storage = getStorage();
    if (!storage) return null;
    const probe = `${GUEST_TASKS_STORAGE_KEY}.probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
  } catch {
    return null;
  }

  return {
    read: () => storage.getItem(GUEST_TASKS_STORAGE_KEY),
    write: (value) => storage.setItem(GUEST_TASKS_STORAGE_KEY, value),
    remove: () => storage.removeItem(GUEST_TASKS_STORAGE_KEY)
  };
}

export function createGuestTaskStore(options: GuestTaskStoreOptions = {}): GuestTaskStore {
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? defaultRandomId;

  const stored = storageBackend(options.storage ?? defaultStorage);
  let backend: Backend = stored ?? memoryBackend();
  let persistent = stored !== null;

  const listeners = new Set<() => void>();

  /** The raw value the cached snapshot was built from, and the snapshot itself. */
  let cachedRaw: string | null | undefined;
  let cachedTasks: readonly GuestTask[] = Object.freeze([]);

  /** Moves to memory for the rest of the page, keeping what is already there. */
  const fallBackToMemory = (carry: string | null) => {
    backend = memoryBackend(carry);
    persistent = false;
  };

  const safeRead = (): string | null => {
    try {
      return backend.read();
    } catch {
      // Storage became unreadable mid-session. What was last seen is still the
      // best copy there is.
      fallBackToMemory(cachedRaw ?? null);
      return backend.read();
    }
  };

  const safeRemove = () => {
    try {
      backend.remove();
    } catch {
      fallBackToMemory(null);
    }
  };

  /**
   * The current envelope, or null when there is none. Anything unreadable,
   * from another version, or past its TTL is removed here, so every caller
   * sees the same answer.
   */
  const readEnvelope = (): GuestTaskEnvelope | null => {
    const raw = safeRead();
    if (raw === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      safeRemove();
      return null;
    }

    const envelope = parsed as Partial<GuestTaskEnvelope> | null;
    const createdAt = envelope && typeof envelope.createdAt === 'string' ? Date.parse(envelope.createdAt) : NaN;
    if (
      !envelope ||
      envelope.version !== GUEST_STORE_VERSION ||
      !Array.isArray(envelope.tasks) ||
      Number.isNaN(createdAt) ||
      now().getTime() - createdAt > GUEST_STORE_TTL_MS
    ) {
      safeRemove();
      return null;
    }

    return {
      version: GUEST_STORE_VERSION,
      createdAt: envelope.createdAt as string,
      tasks: envelope.tasks.filter(isStoredGuestTask)
    };
  };

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const writeEnvelope = (envelope: GuestTaskEnvelope | null) => {
    if (envelope === null || envelope.tasks.length === 0) {
      // No tasks means nothing to keep, and the TTL restarts with the next one.
      safeRemove();
    } else {
      const serialised = JSON.stringify(envelope);
      try {
        backend.write(serialised);
      } catch {
        // Quota or a storage that stopped accepting writes. The change must not
        // be lost, so it goes to memory with everything else.
        fallBackToMemory(serialised);
      }
    }
    notify();
  };

  const list = (): readonly GuestTask[] => {
    const envelope = readEnvelope();
    const raw = safeRead();
    if (raw === cachedRaw) return cachedTasks;
    cachedRaw = raw;
    // Frozen, task by task, so a caller cannot edit the cache in place.
    cachedTasks = Object.freeze((envelope?.tasks ?? []).map((task) => Object.freeze(task)).sort(compareTasks));
    return cachedTasks;
  };

  const requireTask = (envelope: GuestTaskEnvelope | null, id: string): { envelope: GuestTaskEnvelope; index: number } => {
    const index = envelope && isGuestTaskId(id) ? envelope.tasks.findIndex((task) => task.id === id) : -1;
    if (!envelope || index === -1) throw new Error('That task no longer exists.');
    return { envelope, index };
  };

  const create = (input: GuestTaskInput): GuestTask => {
    const start = normaliseTime(input.start_time, 'Start time');
    const end = normaliseTime(input.end_time, 'End time');
    checkTimeOrder(start, end);

    const stamp = now().toISOString();
    const task: GuestTask = {
      id: `${GUEST_TASK_ID_PREFIX}${randomId()}`,
      user_id: GUEST_USER_ID,
      title: normaliseTitle(input.title),
      description: normaliseDescription(input.description),
      tag: normaliseTag(input.tag),
      scheduled_date: requireDate(input.scheduled_date),
      start_time: start,
      end_time: end,
      importance: normaliseImportance(input.importance),
      completed: false,
      completed_at: null,
      created_at: stamp,
      updated_at: stamp
    };

    const envelope = readEnvelope() ?? { version: GUEST_STORE_VERSION, createdAt: stamp, tasks: [] };
    writeEnvelope({ ...envelope, tasks: [...envelope.tasks, task] });
    return task;
  };

  const update = (id: string, changes: GuestTaskChanges): GuestTask => {
    const { envelope, index } = requireTask(readEnvelope(), id);
    const current = envelope.tasks[index];

    const start = 'start_time' in changes ? normaliseTime(changes.start_time, 'Start time') : current.start_time;
    const end = 'end_time' in changes ? normaliseTime(changes.end_time, 'End time') : current.end_time;
    checkTimeOrder(start, end);

    const completed = 'completed' in changes ? Boolean(changes.completed) : current.completed;
    const stamp = now().toISOString();

    const next: GuestTask = {
      ...current,
      title: 'title' in changes ? normaliseTitle(changes.title) : current.title,
      description: 'description' in changes ? normaliseDescription(changes.description) : current.description,
      tag: 'tag' in changes ? normaliseTag(changes.tag) : current.tag,
      scheduled_date: 'scheduled_date' in changes ? requireDate(changes.scheduled_date) : current.scheduled_date,
      start_time: start,
      end_time: end,
      importance: 'importance' in changes ? normaliseImportance(changes.importance) : current.importance,
      completed,
      // tasks_completed_at_consistent: set with completion, cleared without it,
      // and kept as it was when completion did not change.
      completed_at: completed ? (current.completed ? current.completed_at : stamp) : null,
      updated_at: stamp
    };

    const tasks = envelope.tasks.slice();
    tasks[index] = next;
    writeEnvelope({ ...envelope, tasks });
    return next;
  };

  const toggleCompleted = (id: string): GuestTask => {
    const { envelope, index } = requireTask(readEnvelope(), id);
    return update(id, { completed: !envelope.tasks[index].completed });
  };

  const remove = (id: string): void => {
    const envelope = readEnvelope();
    if (!envelope || !isGuestTaskId(id)) return;
    const tasks = envelope.tasks.filter((task) => task.id !== id);
    if (tasks.length === envelope.tasks.length) return;
    writeEnvelope({ ...envelope, tasks });
  };

  const clear = (): void => {
    writeEnvelope(null);
  };

  return {
    list,
    get: (id) => (isGuestTaskId(id) ? list().find((task) => task.id === id) ?? null : null),
    create,
    update,
    toggleCompleted,
    remove,
    clear,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isPersistent: () => persistent
  };
}

let sharedStore: GuestTaskStore | null = null;

/** The one store the app uses, created on first use. */
export function getGuestTaskStore(): GuestTaskStore {
  if (!sharedStore) sharedStore = createGuestTaskStore();
  return sharedStore;
}
