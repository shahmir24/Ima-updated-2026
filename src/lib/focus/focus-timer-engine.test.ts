import { describe, expect, it, vi } from 'vitest';
import { createFocusOutbox, type FocusSessionApi } from './focus-session-outbox';
import { createFocusTimerEngine, newUuid } from './focus-timer-engine';
import { IDLE_ABANDON_MS, isRunning, timeLeftSeconds } from './focus-timer-state';
import { createFocusTimerStore, focusTimerStorageKey } from './focus-timer-store';
import { memoryStorage, noLock } from './test-helpers';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 9, 0, 0);
const USER = 'user-1';

/** A fake focus_sessions table applying the same guards as the real writes. */
function fakeTable() {
  type Row = { source: string; status: string; started_at: string; ended_at: string | null; focus_seconds: number; flows_completed: number; breaks_taken: number };
  const rows = new Map<string, Row>();
  let offline = false;
  const api: FocusSessionApi = {
    async start(_u, op) {
      if (offline) return { ok: false, retry: true };
      if (!rows.has(op.sessionId)) {
        rows.set(op.sessionId, { source: 'focus-timer', status: 'active', started_at: op.startedAt, ended_at: null, focus_seconds: 0, flows_completed: 0, breaks_taken: 0 });
      }
      return { ok: true };
    },
    async checkpoint(_u, op) {
      if (offline) return { ok: false, retry: true };
      const row = rows.get(op.sessionId);
      if (row?.status === 'active' && row.focus_seconds <= op.focusSeconds) {
        Object.assign(row, { focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted, breaks_taken: op.breaksTaken });
      }
      return { ok: true };
    },
    async finish(_u, op) {
      if (offline) return { ok: false, retry: true };
      const row = rows.get(op.sessionId);
      if (row?.status === 'active') {
        Object.assign(row, { status: op.status, ended_at: op.endedAt, focus_seconds: op.focusSeconds, flows_completed: op.flowsCompleted, breaks_taken: op.breaksTaken });
      }
      return { ok: true };
    },
    async discard(_u, op) {
      if (offline) return { ok: false, retry: true };
      if (rows.get(op.sessionId)?.status === 'active') rows.delete(op.sessionId);
      return { ok: true };
    }
  };
  return { rows, api, setOffline: (value: boolean) => (offline = value) };
}

/**
 * One "tab": an engine on shared storage. Building a new one on the same
 * storage is a refresh, a reopened browser, or another tab.
 */
function openTab(env: { storage: ReturnType<typeof memoryStorage>; table: ReturnType<typeof fakeTable>; clock: { now: number } }, owner: string | null = USER) {
  const key = focusTimerStorageKey(owner ?? 'guest');
  const now = () => env.clock.now;
  const store = createFocusTimerStore({ storage: env.storage, key, now, lock: noLock });
  const outbox = owner ? createFocusOutbox({ userId: owner, storage: env.storage, api: env.table.api, lock: noLock }) : null;
  const onRecorded = vi.fn();
  const engine = createFocusTimerEngine({ store, outbox, now, onRecorded });
  return { engine, onRecorded };
}

function setup() {
  return { storage: memoryStorage(), table: fakeTable(), clock: { now: T0 } };
}

const settle = async (engine: ReturnType<typeof openTab>['engine']) => {
  await engine.flush();
};

describe('the Focus Timer survives everything that is not the user ending it', () => {
  it('navigation / refresh / browser closed: a new tab continues the same session with the right time', async () => {
    const env = setup();
    const tab1 = openTab(env);
    await tab1.engine.play('task-1');
    await settle(tab1.engine);

    env.clock.now = T0 + 10 * MIN; // away: another page, another app, a locked phone, browser closed
    const tab2 = openTab(env);
    const state = tab2.engine.state();
    expect(isRunning(state)).toBe(true);
    expect(state.taskId).toBe('task-1');
    expect(timeLeftSeconds(state, env.clock.now)).toBe(15 * 60);
    expect([...env.table.rows.values()].map((r) => r.status)).toEqual(['active']);
  });

  it('none of it is recorded as abandoned', async () => {
    const env = setup();
    for (let i = 0; i < 5; i++) {
      const tab = openTab(env);
      if (i === 0) await tab.engine.play();
      env.clock.now += 3 * MIN;
      await tab.engine.reconcile();
      await settle(tab.engine);
    }
    expect([...env.table.rows.values()].map((r) => r.status)).toEqual(['active']);
  });

  it('a block that finished while the app was closed ran its break on schedule; reopened, the next block waits paused', async () => {
    const env = setup();
    await openTab(env).engine.play();
    env.clock.now = T0 + 5 * 60 * MIN;
    const tab = openTab(env);
    await tab.engine.reconcile();
    await settle(tab.engine);
    const state = tab.engine.state();
    expect(state.phase).toBe('focus');
    expect(isRunning(state)).toBe(false);
    expect(state.flowsCompleted).toBe(1);
    expect(state.breaksTaken).toBe(1);
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'active', focus_seconds: 1500, flows_completed: 1, breaks_taken: 1 });
  });

  it('reopened during the break: the same break, with the right time left', async () => {
    const env = setup();
    await openTab(env).engine.play();
    env.clock.now = T0 + 28 * MIN;
    const tab = openTab(env);
    await tab.engine.reconcile();
    const state = tab.engine.state();
    expect(state.phase).toBe('break');
    expect(isRunning(state)).toBe(true);
    expect(timeLeftSeconds(state, env.clock.now)).toBe(2 * 60);
  });
});

describe('recording', () => {
  it('a full session is recorded once, completed, with its real focus time', async () => {
    const env = setup();
    const { engine, onRecorded } = openTab(env);
    await engine.changeSetting('flows', 2);
    await engine.play();
    env.clock.now = T0 + 25 * MIN;
    await engine.reconcile();
    env.clock.now = T0 + 26 * MIN;
    await engine.play(); // already in its automatic break: changes nothing
    env.clock.now = T0 + 31 * MIN;
    await engine.reconcile();
    env.clock.now = T0 + 40 * MIN;
    await engine.play(); // final block
    env.clock.now = T0 + 50 * MIN;
    await engine.pause();
    env.clock.now = T0 + 60 * MIN;
    await engine.play();
    env.clock.now = T0 + 80 * MIN; // 25 minutes of running in the final block
    await engine.reconcile();
    await settle(engine);

    expect(env.table.rows.size).toBe(1);
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'completed', focus_seconds: 50 * 60, flows_completed: 2, breaks_taken: 1 });
    expect(row.ended_at).toBe(new Date(T0 + 75 * MIN).toISOString());
    expect(onRecorded).toHaveBeenCalled();
  });

  it('the final block reaching zero in another app counts as completed when reconciled', async () => {
    const env = setup();
    const tab1 = openTab(env);
    await tab1.engine.changeSetting('flows', 1);
    await tab1.engine.play();
    await settle(tab1.engine);
    env.clock.now = T0 + 3 * 60 * MIN;
    const tab2 = openTab(env);
    await tab2.engine.reconcile();
    await settle(tab2.engine);
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'completed', focus_seconds: 1500, ended_at: new Date(T0 + 25 * MIN).toISOString() });
  });

  describe('Reset never counts', () => {
    const statuses = (env: ReturnType<typeof setup>) => [...env.table.rows.values()].map((r) => r.status);

    it('before Play: nothing is written at all', async () => {
      const env = setup();
      const { engine } = openTab(env);
      await engine.reset();
      await settle(engine);
      expect(env.table.rows.size).toBe(0);
      expect(engine.state().sessionId).toBeNull();
    });

    it('after a few seconds: the active row is removed', async () => {
      const env = setup();
      const { engine } = openTab(env);
      await engine.play();
      await settle(engine);
      expect(statuses(env)).toEqual(['active']);
      env.clock.now = T0 + 4_000;
      await engine.reset();
      await settle(engine);
      expect(env.table.rows.size).toBe(0);
      expect(timeLeftSeconds(engine.state(), env.clock.now)).toBe(25 * 60);
    });

    it('after substantial focus time (2 full blocks recorded): the row is removed, no minutes counted anywhere', async () => {
      const env = setup();
      const { engine } = openTab(env);
      await engine.play();
      env.clock.now = T0 + 25 * MIN;
      await engine.reconcile();
      await engine.play();
      env.clock.now = T0 + 30 * MIN;
      await engine.reconcile();
      await engine.play();
      env.clock.now = T0 + 55 * MIN;
      await engine.reconcile();
      await settle(engine);
      expect([...env.table.rows.values()][0]).toMatchObject({ status: 'active', focus_seconds: 3000, flows_completed: 2 });
      env.clock.now = T0 + 56 * MIN;
      await engine.reset();
      await settle(engine);
      expect(env.table.rows.size).toBe(0);
      expect(engine.state()).toMatchObject({ sessionId: null, flowsCompleted: 0, focusMs: 0, phase: 'focus' });
    });

    it('Reset while offline: start and discard are both sent later, leaving no row', async () => {
      const env = setup();
      env.table.setOffline(true);
      const { engine } = openTab(env);
      await engine.play();
      env.clock.now = T0 + 10 * MIN;
      await engine.reset();
      await settle(engine);
      env.table.setOffline(false);
      await openTab(env).engine.flush();
      expect(env.table.rows.size).toBe(0);
    });

    it('Reset in one tab after another tab recorded the completion leaves the completed row alone', async () => {
      const env = setup();
      const tabA = openTab(env);
      await tabA.engine.changeSetting('flows', 1);
      await tabA.engine.play();
      env.clock.now = T0 + 25 * MIN;
      await tabA.engine.reconcile();
      await settle(tabA.engine);
      const tabB = openTab(env);
      await tabB.engine.reset();
      await settle(tabB.engine);
      expect(statuses(env)).toEqual(['completed']);
    });

    it('the next session after a Reset is recorded normally', async () => {
      const env = setup();
      const { engine } = openTab(env);
      await engine.changeSetting('flows', 1);
      await engine.play();
      env.clock.now = T0 + MIN;
      await engine.reset();
      await engine.play();
      env.clock.now = T0 + 26 * MIN;
      await engine.reconcile();
      await settle(engine);
      expect(statuses(env)).toEqual(['completed']);
      expect([...env.table.rows.values()][0].focus_seconds).toBe(1500);
    });
  });

  it('a paused session left for 12 hours is abandoned at its last action; a running block is not', async () => {
    const env = setup();
    const { engine } = openTab(env);
    await engine.play();
    env.clock.now = T0 + 5 * MIN;
    await engine.pause();
    env.clock.now = T0 + 5 * MIN + IDLE_ABANDON_MS;
    const later = openTab(env);
    await later.engine.reconcile();
    await settle(later.engine);
    const [row] = env.table.rows.values();
    expect(row).toMatchObject({ status: 'abandoned', focus_seconds: 300, ended_at: new Date(T0 + 5 * MIN).toISOString() });
  });

  it('offline the whole time: everything is sent, once, when the connection returns', async () => {
    const env = setup();
    env.table.setOffline(true);
    const { engine } = openTab(env);
    await engine.changeSetting('flows', 1);
    await engine.play();
    env.clock.now = T0 + 25 * MIN;
    await engine.reconcile();
    await settle(engine);
    expect(env.table.rows.size).toBe(0);

    env.table.setOffline(false);
    const reopened = openTab(env);
    await reopened.engine.flush();
    await reopened.engine.flush();
    expect(env.table.rows.size).toBe(1);
    expect([...env.table.rows.values()][0]).toMatchObject({ status: 'completed', focus_seconds: 1500 });
  });

  it('two tabs reconciling the same completion record ONE completed row, minutes counted once', async () => {
    const env = setup();
    const tabA = openTab(env);
    const tabB = openTab(env);
    await tabA.engine.changeSetting('flows', 1);
    await tabA.engine.play();
    await settle(tabA.engine);
    env.clock.now = T0 + 30 * MIN;
    await Promise.all([tabA.engine.reconcile(), tabB.engine.reconcile()]);
    await Promise.all([tabA.engine.flush(), tabB.engine.flush()]);
    expect(env.table.rows.size).toBe(1);
    expect([...env.table.rows.values()][0]).toMatchObject({ status: 'completed', focus_seconds: 1500 });
  });

  it('a guest timer works the same but is never recorded', async () => {
    const env = setup();
    const guest = openTab(env, null);
    await guest.engine.play();
    env.clock.now = T0 + 26 * MIN;
    await guest.engine.reconcile();
    expect(guest.engine.state().phase).toBe('break');
    await guest.engine.reset();
    expect(env.table.rows.size).toBe(0);
    expect([...env.storage.data.keys()].some((key) => key.includes('outbox'))).toBe(false);
  });

  it("accounts never see each other's timer", async () => {
    const env = setup();
    await openTab(env, 'user-1').engine.play();
    expect(openTab(env, 'user-2').engine.state().sessionId).toBeNull();
  });
});

describe('ids', () => {
  it('newUuid makes v4 UUIDs (focus_sessions.id is a uuid)', () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
