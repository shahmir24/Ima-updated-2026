/**
 * One push-subscription operation at a time across every iMA tab.
 *
 * A browser holds ONE push subscription per site, shared by all its tabs, so
 * an opt-in in one tab and a sign-out cleanup in another can interleave and
 * leave the wrong result (e.g. tab 1 deletes the row, then tab 2's in-flight
 * registration recreates it). push-coordination.ts only sees its own tab. This
 * serialises the four operations that touch the subscription — opt-in,
 * opt-out, sign-out cleanup and the account check — with a Web Lock named
 * PUSH_LOCK_NAME, exclusive across all same-origin tabs.
 *
 * Design rules, because a lock is easy to misuse:
 *
 *   * BOUNDED WAIT. Every request gives up after `acquireTimeoutMs` (an
 *     AbortSignal), and the caller decides what that means: sign-out continues
 *     without the lock inside its 5-second cap, an opt-in fails ("try again"),
 *     the account check retries on the next start.
 *   * NEVER NESTED. Nothing that runs inside the lock asks for it again; the
 *     callers are the four top-level operations only.
 *   * HELD UNTIL REALLY DONE. A step can time out while its browser call keeps
 *     running. `holdAfter` keeps the lock (bounded) until this tab's in-flight
 *     unsubscribe settles, so another tab cannot reuse a subscription that is
 *     about to die. The caller gets its result without waiting for that.
 *   * A CLOSED TAB releases its lock: the browser does this itself.
 *   * RE-CHECK AFTER WAITING. Whatever ran while this waited (a sign-out, an
 *     account switch) is seen by the operation's own checks, which run inside
 *     the lock — not before it.
 *   * UNSUPPORTED BROWSERS (no navigator.locks) run the operation directly,
 *     with the single-tab protections of push-coordination.ts only. Every
 *     browser that can receive Web Push today also has Web Locks (Chrome 69+,
 *     Firefox 96+, Safari/iOS 15.4+, and iOS push needs 16.4+).
 */

export const PUSH_LOCK_NAME = 'ima-push-subscription';

/** The parts of navigator.locks used here; a fake in tests. */
export interface LockManagerLike {
  request<T>(name: string, options: { signal?: AbortSignal }, callback: () => Promise<T>): Promise<T>;
}

export type LockedResult<T> =
  /** Ran: with the cross-tab lock, or — where Web Locks do not exist — without it. */
  | { ran: true; value: T; locked: boolean }
  /** The lock could not be had in time; the operation did not run. */
  | { ran: false; reason: 'timeout' };

export interface PushLock {
  run<T>(
    operation: () => Promise<T>,
    options: { acquireTimeoutMs: number; holdAfter?: () => Promise<unknown> }
  ): Promise<LockedResult<T>>;
}

/** How long the lock may stay held after the operation returned, waiting for its in-flight browser work. */
const MAX_HOLD_AFTER_MS = 10_000;

export function createPushLock(getLocks: () => LockManagerLike | undefined): PushLock {
  return {
    run(operation, { acquireTimeoutMs, holdAfter }) {
      const locks = getLocks();
      if (!locks) {
        return operation().then((value) => ({ ran: true as const, value, locked: false }));
      }

      return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(0, acquireTimeoutMs));
        let acquired = false;

        locks
          .request(PUSH_LOCK_NAME, { signal: controller.signal }, async () => {
            acquired = true;
            clearTimeout(timer);
            try {
              resolve({ ran: true, value: await operation(), locked: true });
            } catch (error) {
              reject(error);
              return;
            }
            if (holdAfter) {
              // Keep the lock (bounded) until this tab's browser work has settled.
              let hold: ReturnType<typeof setTimeout> | undefined;
              await Promise.race([
                holdAfter().catch(() => undefined),
                new Promise((done) => {
                  hold = setTimeout(done, MAX_HOLD_AFTER_MS);
                })
              ]);
              clearTimeout(hold);
            }
          })
          .catch((error) => {
            clearTimeout(timer);
            // Aborted before the lock was granted: the operation never started.
            if (!acquired) resolve({ ran: false, reason: 'timeout' });
            else reject(error);
          });
      });
    }
  };
}

/** The real navigator.locks, looked up at call time (absent in old browsers and in tests). */
export const pushLock: PushLock = createPushLock(() => {
  if (typeof navigator === 'undefined') return undefined;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : undefined;
});
