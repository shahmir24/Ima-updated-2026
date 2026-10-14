/**
 * Recording Focus Timer sessions in `focus_sessions`, reliably.
 *
 * Timer events become write operations in a small outbox kept in localStorage
 * (per account). The outbox is sent in order and an operation is removed only
 * once Supabase has accepted it, so a write made offline, or cut short by the
 * tab closing, is sent the next time iMA is open.
 *
 * Replaying is always safe, because every write is idempotent:
 *
 *   start       insert with the session's own id; an existing row is left alone.
 *   checkpoint  absolute counters, only while the row is 'active' and only if
 *               focus_seconds does not go down.
 *   finish      'completed' or 'abandoned', only while the row is 'active' —
 *               the first ending wins and a repeat changes nothing.
 *   discard     Reset: deletes the row, only while it is still 'active'. A
 *               row already completed or abandoned is never touched, and a
 *               row that is already gone is simply not found.
 *
 * So refreshes, several tabs and repeated completion events cannot create a
 * second row or count the same focus minutes twice.
 *
 * Only signed-in accounts have an outbox. Guest sessions are never recorded.
 */
import type { FocusSessionSnapshot, FocusTimerEvent } from './focus-timer-state';
import { withBrowserLock, type StorageLike } from './browser-storage';

export const FOCUS_OUTBOX_STORAGE_PREFIX = 'ima.focus.v1.outbox';
export const focusOutboxStorageKey = (userId: string) => `${FOCUS_OUTBOX_STORAGE_PREFIX}.${userId}`;

/** A long-lost outbox cannot grow without bound. Oldest operations go first. */
const MAX_OPS = 200;

export interface PlannedValues {
  plannedBlockMinutes: number | null;
  plannedBreakMinutes: number | null;
  plannedFlows: number | null;
}

export interface SessionCounters {
  flowsCompleted: number;
  breaksTaken: number;
  focusSeconds: number;
}

export type FocusSessionOp =
  | ({ opId: string; kind: 'start'; sessionId: string; startedAt: string } & PlannedValues)
  | ({ opId: string; kind: 'checkpoint'; sessionId: string } & SessionCounters)
  | ({ opId: string; kind: 'finish'; sessionId: string; status: 'completed' | 'abandoned'; endedAt: string } & SessionCounters &
      PlannedValues)
  | { opId: string; kind: 'discard'; sessionId: string };

export type WriteResult = { ok: true } | { ok: false; retry: boolean };

/** The database side. Each method must be idempotent and must never throw. */
export interface FocusSessionApi {
  start(userId: string, op: Extract<FocusSessionOp, { kind: 'start' }>): Promise<WriteResult>;
  checkpoint(userId: string, op: Extract<FocusSessionOp, { kind: 'checkpoint' }>): Promise<WriteResult>;
  finish(userId: string, op: Extract<FocusSessionOp, { kind: 'finish' }>): Promise<WriteResult>;
  discard(userId: string, op: Extract<FocusSessionOp, { kind: 'discard' }>): Promise<WriteResult>;
}

// ---------------------------------------------------------------------------
// Events → operations
// ---------------------------------------------------------------------------

/** Planned values within the schema's CHECK ranges, or null rather than a failed write. */
export function plannedValues(snapshot: FocusSessionSnapshot): PlannedValues {
  const within = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max ? value : null;
  return {
    plannedBlockMinutes: within(snapshot.config.blockMinutes, 1, 240),
    plannedBreakMinutes: within(snapshot.config.breakMinutes, 0, 60),
    plannedFlows: within(snapshot.config.flows, 1, 12)
  };
}

const countersOf = (snapshot: FocusSessionSnapshot): SessionCounters => ({
  flowsCompleted: Math.max(0, Math.floor(snapshot.flowsCompleted)),
  breaksTaken: Math.max(0, Math.floor(snapshot.breaksTaken)),
  focusSeconds: Math.max(0, Math.floor(snapshot.focusSeconds))
});

export function opsForEvents(events: FocusTimerEvent[], newOpId: () => string): FocusSessionOp[] {
  return events.map((event): FocusSessionOp => {
    const { snapshot } = event;
    switch (event.type) {
      case 'started':
        return {
          opId: newOpId(),
          kind: 'start',
          sessionId: snapshot.sessionId,
          startedAt: new Date(snapshot.startedAt).toISOString(),
          ...plannedValues(snapshot)
        };
      case 'progress':
        return { opId: newOpId(), kind: 'checkpoint', sessionId: snapshot.sessionId, ...countersOf(snapshot) };
      case 'completed':
      case 'abandoned':
        return {
          opId: newOpId(),
          kind: 'finish',
          sessionId: snapshot.sessionId,
          status: event.type,
          // Same device clock as started_at, and never before it: focus_sessions_span holds.
          endedAt: new Date(Math.max(event.endedAt, snapshot.startedAt)).toISOString(),
          ...countersOf(snapshot),
          ...plannedValues(snapshot)
        };
      case 'discarded':
        return { opId: newOpId(), kind: 'discard', sessionId: snapshot.sessionId };
    }
  });
}

/**
 * Adds operations to a queue, keeping it minimal and safe to replay:
 *   * a newer checkpoint replaces a pending one for the same session;
 *   * a finish replaces pending checkpoints for that session (it carries the totals);
 *   * a second finish for a session already finishing is dropped — the first ending wins;
 *   * a second start for the same session is dropped;
 *   * a discard replaces pending checkpoints, and is dropped if the session
 *     already has an ending queued (that ending stands). Its start is KEPT:
 *     it may already be on its way, and start → discard always nets to no row.
 */
export function enqueueOps(queue: FocusSessionOp[], ops: FocusSessionOp[]): FocusSessionOp[] {
  let next = [...queue];
  for (const op of ops) {
    const same = (other: FocusSessionOp) => other.sessionId === op.sessionId;
    if (op.kind === 'start') {
      if (next.some((other) => same(other) && other.kind === 'start')) continue;
    } else if (op.kind === 'checkpoint') {
      if (next.some((other) => same(other) && (other.kind === 'finish' || other.kind === 'discard'))) continue;
      next = next.filter((other) => !(same(other) && other.kind === 'checkpoint'));
    } else {
      // An ending or a discard: whichever is queued first for a session stands.
      if (next.some((other) => same(other) && (other.kind === 'finish' || other.kind === 'discard'))) continue;
      next = next.filter((other) => !(same(other) && other.kind === 'checkpoint'));
    }
    next.push(op);
  }
  return next.length > MAX_OPS ? next.slice(next.length - MAX_OPS) : next;
}

// ---------------------------------------------------------------------------
// The stored queue
// ---------------------------------------------------------------------------

const isStr = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isPlanned = (value: unknown) => value === null || (typeof value === 'number' && Number.isInteger(value));

function parseOp(value: unknown): FocusSessionOp | null {
  if (!value || typeof value !== 'object') return null;
  const op = value as Record<string, unknown>;
  if (!isStr(op.opId) || !isStr(op.sessionId)) return null;
  const planned = isPlanned(op.plannedBlockMinutes) && isPlanned(op.plannedBreakMinutes) && isPlanned(op.plannedFlows);
  const counters = isCount(op.flowsCompleted) && isCount(op.breaksTaken) && isCount(op.focusSeconds);
  if (op.kind === 'start' && isStr(op.startedAt) && planned) return op as unknown as FocusSessionOp;
  if (op.kind === 'checkpoint' && counters) return op as unknown as FocusSessionOp;
  if (op.kind === 'finish' && (op.status === 'completed' || op.status === 'abandoned') && isStr(op.endedAt) && counters && planned) {
    return op as unknown as FocusSessionOp;
  }
  if (op.kind === 'discard') return op as unknown as FocusSessionOp;
  return null;
}

export function readOutbox(storage: StorageLike, key: string): FocusSessionOp[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseOp).filter((op): op is FocusSessionOp => op !== null);
  } catch {
    return [];
  }
}

function writeOutbox(storage: StorageLike, key: string, ops: FocusSessionOp[]): void {
  if (ops.length === 0) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify(ops));
}

export interface FocusOutbox {
  readonly userId: string;
  enqueue(events: FocusTimerEvent[]): void;
  /** Sends what is queued, in order. Resolves with the operations that were accepted. */
  flush(): Promise<FocusSessionOp[]>;
  pending(): FocusSessionOp[];
}

export interface FocusOutboxOptions {
  userId: string;
  storage: StorageLike;
  api: FocusSessionApi;
  newOpId?: () => string;
  lock?: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
}

const randomId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createFocusOutbox(options: FocusOutboxOptions): FocusOutbox {
  const { userId, storage, api } = options;
  const key = focusOutboxStorageKey(userId);
  const newOpId = options.newOpId ?? randomId;
  const lock = options.lock ?? withBrowserLock;
  let inFlight: Promise<FocusSessionOp[]> | null = null;

  const send = (op: FocusSessionOp): Promise<WriteResult> => {
    try {
      if (op.kind === 'start') return api.start(userId, op);
      if (op.kind === 'checkpoint') return api.checkpoint(userId, op);
      if (op.kind === 'discard') return api.discard(userId, op);
      return api.finish(userId, op);
    } catch {
      return Promise.resolve({ ok: false, retry: true });
    }
  };

  const drain = async (): Promise<FocusSessionOp[]> => {
    const accepted: FocusSessionOp[] = [];
    // Re-read before every send: another tab may have sent or added operations.
    for (;;) {
      const [op] = readOutbox(storage, key);
      if (!op) break;
      let result: WriteResult;
      try {
        result = await send(op);
      } catch {
        result = { ok: false, retry: true };
      }
      // Offline, a server error or an expired session: keep it, in order, for next time.
      if (!result.ok && 'retry' in result && result.retry) break;
      // Accepted — or refused for good (it can never succeed, and must not block the rest).
      writeOutbox(storage, key, readOutbox(storage, key).filter((queued) => queued.opId !== op.opId));
      if (result.ok) accepted.push(op);
    }
    return accepted;
  };

  return {
    userId,
    enqueue(events) {
      const ops = opsForEvents(events, newOpId);
      if (ops.length === 0) return;
      writeOutbox(storage, key, enqueueOps(readOutbox(storage, key), ops));
    },
    flush() {
      // One flush at a time in this tab, and one across tabs where locks exist.
      if (!inFlight) {
        inFlight = lock(`${key}:flush`, drain).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    pending: () => readOutbox(storage, key)
  };
}
