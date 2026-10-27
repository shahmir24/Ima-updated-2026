import { describe, expect, it, vi } from 'vitest';
import { fakeLocks } from './test-helpers';
import { createPushLock, PUSH_LOCK_NAME } from './push-lock';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('cross-tab push lock', () => {
  it('two tabs: the second operation starts only after the first finishes', async () => {
    const locks = fakeLocks();
    const tab1 = createPushLock(() => locks.manager);
    const tab2 = createPushLock(() => locks.manager);
    const order: string[] = [];
    const gate = deferred();
    const first = tab1.run(async () => {
      order.push('tab1 start');
      await gate.promise;
      order.push('tab1 end');
      return 1;
    }, { acquireTimeoutMs: 1000 });
    await tick();
    const second = tab2.run(async () => {
      order.push('tab2 start');
      return 2;
    }, { acquireTimeoutMs: 1000 });
    await tick(10);
    expect(order).toEqual(['tab1 start']);
    gate.resolve();
    expect(await first).toEqual({ ran: true, value: 1, locked: true });
    expect(await second).toEqual({ ran: true, value: 2, locked: true });
    expect(order).toEqual(['tab1 start', 'tab1 end', 'tab2 start']);
  });

  it('lock acquisition timeout: the operation never runs and the caller is told', async () => {
    const locks = fakeLocks();
    const holder = createPushLock(() => locks.manager);
    void holder.run(() => new Promise(() => {}), { acquireTimeoutMs: 1000 }); // a stuck tab
    await tick();
    const operation = vi.fn(async () => 'ran');
    const result = await createPushLock(() => locks.manager).run(operation, { acquireTimeoutMs: 30 });
    expect(result).toEqual({ ran: false, reason: 'timeout' });
    expect(operation).not.toHaveBeenCalled();
    expect(locks.waiting()).toBe(0); // the request was withdrawn, not left queued
  });

  it('a tab closing while holding the lock releases it to the next tab', async () => {
    const locks = fakeLocks();
    void createPushLock(() => locks.manager).run(() => new Promise(() => {}), { acquireTimeoutMs: 1000 });
    await tick();
    const waiting = createPushLock(() => locks.manager).run(async () => 'next', { acquireTimeoutMs: 1000 });
    await tick(5);
    locks.closeHolder(PUSH_LOCK_NAME);
    expect(await waiting).toEqual({ ran: true, value: 'next', locked: true });
  });

  it('unsupported Web Locks: runs directly, unlocked, with the same result', async () => {
    const result = await createPushLock(() => undefined).run(async () => 'ok', { acquireTimeoutMs: 1 });
    expect(result).toEqual({ ran: true, value: 'ok', locked: false });
  });

  it("holdAfter keeps the lock until this tab's in-flight browser work settles, without delaying the caller", async () => {
    const locks = fakeLocks();
    const inFlight = deferred();
    const result = await createPushLock(() => locks.manager).run(async () => 'done', {
      acquireTimeoutMs: 1000,
      holdAfter: () => inFlight.promise
    });
    expect(result).toEqual({ ran: true, value: 'done', locked: true });
    expect(locks.isHeld(PUSH_LOCK_NAME)).toBe(true);
    inFlight.resolve();
    await tick();
    expect(locks.isHeld(PUSH_LOCK_NAME)).toBe(false);
  });

  it('an operation that throws releases the lock and reports the error', async () => {
    const locks = fakeLocks();
    const lock = createPushLock(() => locks.manager);
    await expect(lock.run(async () => {
      throw new Error('boom');
    }, { acquireTimeoutMs: 100 })).rejects.toThrow('boom');
    await tick();
    expect(locks.isHeld(PUSH_LOCK_NAME)).toBe(false);
  });
});
