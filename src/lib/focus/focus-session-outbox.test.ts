import { describe, expect, it, vi } from 'vitest';
import {
  createFocusOutbox,
  enqueueOps,
  focusOutboxStorageKey,
  opsForEvents,
  plannedValues,
  type FocusSessionApi,
  type FocusSessionOp,
  type WriteResult
} from './focus-session-outbox';
import type { FocusSessionSnapshot, FocusTimerEvent } from './focus-timer-state';
import { memoryStorage, noLock } from './test-helpers';

const T0 = Date.UTC(2026, 9, 14, 9, 0, 0);
const USER = 'user-1';

const snap = (over: Partial<FocusSessionSnapshot> = {}): FocusSessionSnapshot => ({
  sessionId: 's1',
  startedAt: T0,
  taskId: null,
  config: { blockMinutes: 25, breakMinutes: 5, flows: 4 },
  flowsCompleted: 0,
  breaksTaken: 0,
  focusSeconds: 0,
  ...over
});

let n = 0;
const opId = () => `op-${++n}`;

/** A fake database: rows by id, applying the same guards the real writes use. */
function fakeDb() {
  const rows = new Map<string, { status: string; focus_seconds: number; flows_completed: number; ended_at: string | null; started_at: string }>();
  const calls: string[] = [];
  let mode: 'ok' | 'offline' | 'refused' = 'ok';
  const answer = (): WriteResult | null => (mode === 'offline' ? { ok: false, retry: true } : mode === 'refused' ? { ok: false, retry: false } : null);
  const api: FocusSessionApi = {
    async start(_user, op) {
      calls.push(`start:${op.sessionId}`);
      const fail = answer();
      if (fail) return fail;
      if (!rows.has(op.sessionId)) rows.set(op.sessionId, { status: 'active', focus_seconds: 0, flows_completed: 0, ended_at: null, started_at: op.startedAt });
      return { ok: true };
    },
    async checkpoint(_user, op) {
      calls.push(`checkpoint:${op.sessionId}:${op.focusSeconds}`);
      const fail = answer();
      if (fail) return fail;
      const row = rows.get(op.sessionId);
      if (row && row.status === 'active' && row.focus_seconds <= op.focusSeconds) Object.assign(row, { focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted });
      return { ok: true };
    },
    async finish(_user, op) {
      calls.push(`finish:${op.sessionId}:${op.status}`);
      const fail = answer();
      if (fail) return fail;
      const row = rows.get(op.sessionId);
      if (row && row.status === 'active') Object.assign(row, { status: op.status, focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted, ended_at: op.endedAt });
      return { ok: true };
    },
    async discard(_user, op) {
      calls.push(`discard:${op.sessionId}`);
      const fail = answer();
      if (fail) return fail;
      if (rows.get(op.sessionId)?.status === 'active') rows.delete(op.sessionId);
      return { ok: true };
    }
  };
  return { rows, calls, api, setMode: (m: typeof mode) => (mode = m) };
}

const makeOutbox = (db = fakeDb(), storage = memoryStorage()) => ({
  db,
  storage,
  outbox: createFocusOutbox({ userId: USER, storage, api: db.api, newOpId: opId, lock: noLock })
});

const started: FocusTimerEvent = { type: 'started', snapshot: snap() };
const progress = (focusSeconds: number): FocusTimerEvent => ({ type: 'progress', snapshot: snap({ focusSeconds }) });
const completed = (focusSeconds: number, endedAt = T0 + 25 * 60_000): FocusTimerEvent => ({
  type: 'completed',
  snapshot: snap({ focusSeconds, flowsCompleted: 4 }),
  endedAt
});
const abandoned = (focusSeconds: number, endedAt = T0 + 60_000): FocusTimerEvent => ({ type: 'abandoned', snapshot: snap({ focusSeconds }), endedAt });
const discarded = (focusSeconds = 0): FocusTimerEvent => ({ type: 'discarded', snapshot: snap({ focusSeconds }) });

describe('events → operations', () => {
  it('maps each event to its write', () => {
    const ops = opsForEvents([started, progress(60), completed(1500)], opId);
    expect(ops.map((op) => op.kind)).toEqual(['start', 'checkpoint', 'finish']);
    expect(ops[0]).toMatchObject({ sessionId: 's1', startedAt: new Date(T0).toISOString(), plannedBlockMinutes: 25, plannedBreakMinutes: 5, plannedFlows: 4 });
    expect(ops[2]).toMatchObject({ status: 'completed', focusSeconds: 1500, flowsCompleted: 4, endedAt: new Date(T0 + 25 * 60_000).toISOString() });
  });

  it('an ending is never before the start (focus_sessions_span), even with a clock moved back', () => {
    const [op] = opsForEvents([abandoned(0, T0 - 3_600_000)], opId);
    expect(op).toMatchObject({ endedAt: new Date(T0).toISOString() });
  });

  it('planned values outside the schema CHECK ranges become null instead of a failed write', () => {
    expect(plannedValues(snap({ config: { blockMinutes: 300, breakMinutes: 90, flows: 20 } }))).toEqual({
      plannedBlockMinutes: null,
      plannedBreakMinutes: null,
      plannedFlows: null
    });
  });
});

describe('Reset (discard) in the queue', () => {
  it('becomes a discard op carrying only the session id', () => {
    const [op] = opsForEvents([discarded(900)], opId);
    expect(op).toEqual({ opId: expect.any(String), kind: 'discard', sessionId: 's1' });
  });

  it('replaces pending checkpoints but keeps the start (it may already be on its way)', () => {
    const q = enqueueOps([], opsForEvents([started, progress(60), discarded(60)], opId));
    expect(q.map((op) => op.kind)).toEqual(['start', 'discard']);
  });

  it('a queued ending stands: a later discard for that session is dropped', () => {
    const q = enqueueOps([], opsForEvents([started, completed(1500), discarded(1500)], opId));
    expect(q.map((op) => op.kind)).toEqual(['start', 'finish']);
  });

  it('nothing for the session after a discard is queued', () => {
    const q = enqueueOps([], opsForEvents([started, discarded(5), progress(10), abandoned(10)], opId));
    expect(q.map((op) => op.kind)).toEqual(['start', 'discard']);
  });
});

describe('queue rules', () => {
  const [start, cp1, cp2, done, again] = opsForEvents([started, progress(60), progress(120), completed(1500), abandoned(1500)], opId);

  it('a newer checkpoint replaces a pending one', () => {
    expect(enqueueOps([start, cp1], [cp2]).map((op) => op.opId)).toEqual([start.opId, cp2.opId]);
  });

  it('a finish replaces pending checkpoints and a second finish is dropped (first ending wins)', () => {
    const q = enqueueOps([start, cp1], [done, again]);
    expect(q.map((op) => op.kind)).toEqual(['start', 'finish']);
    expect((q[1] as Extract<FocusSessionOp, { kind: 'finish' }>).status).toBe('completed');
  });

  it('a duplicate start and a late checkpoint after a finish are dropped', () => {
    const q = enqueueOps([start, done], [{ ...start, opId: 'x' }, cp2]);
    expect(q.map((op) => op.kind)).toEqual(['start', 'finish']);
  });
});

describe('outbox', () => {
  it('sends in order and empties the queue', async () => {
    const { db, outbox, storage } = makeOutbox();
    outbox.enqueue([started, progress(300)]);
    outbox.enqueue([completed(1500)]);
    const accepted = await outbox.flush();
    expect(db.calls).toEqual(['start:s1', 'finish:s1:completed']);
    expect(accepted.map((op) => op.kind)).toEqual(['start', 'finish']);
    expect(storage.data.has(focusOutboxStorageKey(USER))).toBe(false);
    expect(db.rows.get('s1')).toMatchObject({ status: 'completed', focus_seconds: 1500 });
  });

  it('offline: keeps everything, in order, and sends it once back online', async () => {
    const { db, outbox } = makeOutbox();
    db.setMode('offline');
    outbox.enqueue([started]);
    outbox.enqueue([completed(1500)]);
    expect(await outbox.flush()).toEqual([]);
    expect(outbox.pending().map((op) => op.kind)).toEqual(['start', 'finish']);
    expect(db.rows.size).toBe(0);

    db.setMode('ok');
    await outbox.flush();
    expect(outbox.pending()).toEqual([]);
    expect(db.rows.get('s1')).toMatchObject({ status: 'completed' });
  });

  it('survives a refresh: a new outbox on the same storage sends what was queued', async () => {
    const { db, storage, outbox } = makeOutbox();
    db.setMode('offline');
    outbox.enqueue([started, abandoned(60)]);
    await outbox.flush();
    db.setMode('ok');
    const reopened = createFocusOutbox({ userId: USER, storage, api: db.api, newOpId: opId, lock: noLock });
    await reopened.flush();
    expect(db.rows.get('s1')).toMatchObject({ status: 'abandoned', focus_seconds: 60 });
  });

  it('a write refused for good is dropped so it cannot block the rest', async () => {
    const { db, outbox } = makeOutbox();
    db.setMode('refused');
    outbox.enqueue([started]);
    await outbox.flush();
    expect(outbox.pending()).toEqual([]);
  });

  it('replaying everything twice leaves exactly one row with the first ending and no double minutes', async () => {
    const { db, outbox } = makeOutbox();
    outbox.enqueue([started, progress(600), completed(1500)]);
    await outbox.flush();
    // The same events again — another tab, a retry after a lost response.
    outbox.enqueue([started, progress(600), completed(1500), abandoned(1500)]);
    await outbox.flush();
    expect(db.rows.size).toBe(1);
    expect(db.rows.get('s1')).toMatchObject({ status: 'completed', focus_seconds: 1500 });
  });

  it('Reset after the row exists removes it — no completed, no abandoned', async () => {
    const { db, outbox } = makeOutbox();
    outbox.enqueue([started, progress(600)]);
    await outbox.flush();
    expect(db.rows.get('s1')?.status).toBe('active');
    outbox.enqueue([discarded(600)]);
    await outbox.flush();
    expect(db.rows.size).toBe(0);
  });

  it('Reset while offline before the row was ever written: start then discard nets to no row', async () => {
    const { db, outbox } = makeOutbox();
    db.setMode('offline');
    outbox.enqueue([started]);
    outbox.enqueue([discarded(3)]);
    await outbox.flush();
    db.setMode('ok');
    await outbox.flush();
    expect(db.calls).toContain('discard:s1');
    expect(db.rows.size).toBe(0);
    expect(outbox.pending()).toEqual([]);
  });

  it('a discard never deletes a session that already ended (e.g. completed in another tab)', async () => {
    const { db, outbox } = makeOutbox();
    outbox.enqueue([started, completed(1500)]);
    await outbox.flush();
    // A stale discard arriving later — the database guard keeps the completed row.
    await db.api.discard(USER, { opId: 'late', kind: 'discard', sessionId: 's1' });
    expect(db.rows.get('s1')?.status).toBe('completed');
  });

  it('replaying a discard is harmless', async () => {
    const { db, outbox } = makeOutbox();
    outbox.enqueue([started, discarded(5)]);
    await outbox.flush();
    await db.api.discard(USER, { opId: 'again', kind: 'discard', sessionId: 's1' });
    expect(db.rows.size).toBe(0);
  });

  it('a stale checkpoint cannot lower recorded focus time', async () => {
    const { db, outbox } = makeOutbox();
    outbox.enqueue([started, progress(900)]);
    await outbox.flush();
    outbox.enqueue([progress(300)]);
    await outbox.flush();
    expect(db.rows.get('s1')?.focus_seconds).toBe(900);
  });

  it('one flush at a time in a tab', async () => {
    const { db, outbox } = makeOutbox();
    const start = vi.spyOn(db.api, 'start');
    outbox.enqueue([started]);
    await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()]);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('an api that throws is treated as "try again later"', async () => {
    const { db, outbox } = makeOutbox();
    vi.spyOn(db.api, 'start').mockImplementation(() => {
      throw new Error('boom');
    });
    outbox.enqueue([started]);
    await outbox.flush();
    expect(outbox.pending().map((op) => op.kind)).toEqual(['start']);
  });

  it('ignores a corrupt stored queue', async () => {
    const storage = memoryStorage({ [focusOutboxStorageKey(USER)]: '{"nope":1}' });
    const { outbox } = makeOutbox(fakeDb(), storage);
    expect(outbox.pending()).toEqual([]);
  });
});
