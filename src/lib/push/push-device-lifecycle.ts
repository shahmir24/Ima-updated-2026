/**
 * This device's push subscription across sign-out and account switches.
 *
 * Two different things hold a device's push subscription, and they are
 * removed separately:
 *
 *   * the SERVER ROW (push_subscriptions): who the sender sends to. Deleting it
 *     needs the signed-in user's session — RLS lets a user delete only their
 *     own rows — so it must happen BEFORE Supabase signs out.
 *   * the BROWSER SUBSCRIPTION (PushManager): the endpoint itself. Once the
 *     browser unsubscribes, the push service rejects that endpoint (404/410),
 *     and the sender deletes any row still pointing at it on its next attempt.
 *     It needs no session. Notification permission is never touched.
 *
 * Either one alone stops delivery to this device: no row means nobody sends
 * to it; no browser subscription means the push service refuses it. Signing
 * out does both, and never waits on them for long. If both fail (offline, an
 * expired session AND a browser that refuses to unsubscribe), the device may
 * keep receiving the previous account's nudges — so the device is checked
 * again on every later start: signed out, any subscription is released; signed
 * in, a subscription that is not registered to this account is released.
 *
 * Every step is coordinated through push-coordination.ts so that nothing
 * started for one account can act after another has taken over: cleanup that
 * outlives its deadline starts no further step, a stale account check
 * re-checks the active account immediately before unsubscribing, and an
 * opt-in in progress is waited for (sign-out) or left alone (account check).
 *
 * Only ever this device, only ever the current user's own row. Nothing here
 * logs an endpoint, a key or a token.
 */
import type { PushSubscriptionLike } from './gentle-nudges-push';
import { pushCoordination, type PushCoordination } from './push-coordination';
import { pushLock, type PushLock } from './push-lock';

export interface PushDeviceDeps {
  /** This browser's subscription, or null (no worker, no push, none made). */
  getSubscription(): Promise<PushSubscriptionLike | null>;
  /** Deletes the current user's row for this endpoint only. */
  removeServerSubscription(userId: string, endpoint: string): Promise<{ error: unknown }>;
  /** Whether the current user has a row for this endpoint. */
  ownsSubscription(userId: string, endpoint: string): Promise<{ owned: boolean; error?: undefined } | { error: unknown }>;
  /** Per step; a cleanup step that takes longer is abandoned. */
  timeoutMs?: number;
  /** Defaults to the app-wide record; tests pass their own. */
  coordination?: PushCoordination;
  /** The cross-tab lock (push-lock.ts); tests pass their own. */
  lock?: PushLock;
}

export type StepResult = 'done' | 'none' | 'failed' | 'skipped';

export interface SignOutCleanup {
  /** This user's row for this device. */
  server: StepResult;
  /** This browser's subscription. */
  browser: StepResult;
  /**
   * True when at least one of the two is gone, so this device can no longer
   * receive the signed-out user's notifications. False means it still might.
   */
  deviceReleased: boolean;
}

const DEFAULT_TIMEOUT_MS = 4000;

/** Resolves to the value, or to `fallback` if it rejects or takes too long. Never rejects. */
async function bounded<T>(work: () => Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([work().catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unsubscribes, registered as in flight so an opt-in waits for it to settle
 * even after this caller has stopped waiting.
 */
async function unsubscribe(subscription: PushSubscriptionLike, timeoutMs: number, coordination: PushCoordination): Promise<StepResult> {
  // unsubscribe() resolves false when there was nothing to remove; either way it is gone.
  const work = coordination.trackUnsubscribe(Promise.resolve().then(() => subscription.unsubscribe()));
  const ok = await bounded(async () => {
    await work;
    return true;
  }, false, timeoutMs);
  return ok ? 'done' : 'failed';
}

/**
 * Before signing out: remove this device's row for `userId` (while the session
 * still works), then unsubscribe the browser. Never throws, never blocks for
 * long; the caller signs out whatever this returns. `isCancelled` is checked
 * before every step: once the caller's deadline has passed, nothing further
 * starts.
 */
export async function releaseDeviceOnSignOut(
  userId: string,
  deps: PushDeviceDeps,
  isCancelled: () => boolean = () => false
): Promise<SignOutCleanup> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const coordination = deps.coordination ?? pushCoordination;
  const subscription = await bounded(() => deps.getSubscription(), null, timeoutMs);
  if (!subscription) return { server: 'none', browser: 'none', deviceReleased: true };
  if (isCancelled()) return { server: 'skipped', browser: 'skipped', deviceReleased: false };

  const endpoint = subscription.endpoint;
  // Even if this delete is still running after the deadline it is harmless: it
  // names user `userId` and this endpoint only, and RLS checks whoever is signed in.
  const server: StepResult = await bounded(
    async () => ((await deps.removeServerSubscription(userId, endpoint)).error ? 'failed' : 'done'),
    'failed',
    timeoutMs
  );
  if (isCancelled()) return { server, browser: 'skipped', deviceReleased: server === 'done' };
  const browser = await unsubscribe(subscription, timeoutMs, coordination);
  return { server, browser, deviceReleased: server === 'done' || browser === 'done' };
}

export type ReconcileResult =
  /** No subscription on this device. */
  | 'none'
  /** Registered to the signed-in user: left alone. */
  | 'kept'
  /** Belonged to nobody signed in here, or to another account: unsubscribed. */
  | 'released'
  /** Ownership could not be confirmed (offline): left alone, checked next time. */
  | 'unknown'
  /** The account changed, or an opt-in started, while checking: left alone. */
  | 'superseded'
  | 'failed';

/**
 * On every start and account change. Signed out (or a guest): this device
 * should receive nothing, so any subscription is released. Signed in: a
 * subscription not registered to this user — a previous account's, or one
 * whose row is gone — is released, so this user never inherits it and never
 * appears subscribed without having chosen to be. Ownership is checked twice
 * before releasing, and only a definite "not this user's" releases.
 *
 * Immediately before unsubscribing it confirms that this run is still current
 * (`isCurrent`), that `userId` is still the active account, and that no opt-in
 * has started since it began; otherwise it does nothing.
 */
export async function reconcileDeviceSubscription(
  userId: string | null,
  deps: PushDeviceDeps,
  isCurrent: () => boolean = () => true
): Promise<ReconcileResult> {
  const coordination = deps.coordination ?? pushCoordination;
  // Another tab is busy with the subscription: try again on the next start.
  const locked = await (deps.lock ?? pushLock).run(() => reconcileUnderLock(userId, deps, isCurrent), {
    acquireTimeoutMs: RECONCILE_LOCK_WAIT_MS,
    holdAfter: () => coordination.waitForUnsubscribe(UNSUBSCRIBE_HOLD_MS)
  });
  return locked.ran ? locked.value : 'unknown';
}

async function reconcileUnderLock(
  userId: string | null,
  deps: PushDeviceDeps,
  isCurrent: () => boolean
): Promise<ReconcileResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const coordination = deps.coordination ?? pushCoordination;
  const generation = coordination.accountGeneration();
  const enables = coordination.enablesStarted();
  const stillMine = () =>
    isCurrent() &&
    coordination.accountGeneration() === generation &&
    (coordination.activeAccount() === undefined || coordination.activeAccount() === userId) &&
    coordination.enablesStarted() === enables &&
    !coordination.enableInProgress();

  if (!stillMine()) return 'superseded';
  const subscription = await bounded(() => deps.getSubscription(), null, timeoutMs);
  if (!subscription) return 'none';

  if (userId) {
    const owned = async () => {
      const result = await bounded(() => deps.ownsSubscription(userId, subscription.endpoint), { error: 'timeout' }, timeoutMs);
      return 'owned' in result ? result.owned : null;
    };
    const first = await owned();
    if (first !== false) return first === true ? 'kept' : 'unknown';
    // Asked again just before acting, so a registration that landed meanwhile is never undone.
    const second = await owned();
    if (second !== false) return second === true ? 'kept' : 'unknown';
  }

  // The last moment before anything destructive: still this run, this account, no opt-in.
  if (!stillMine()) return 'superseded';
  return (await unsubscribe(subscription, timeoutMs, coordination)) === 'done' ? 'released' : 'failed';
}

/** How long sign-out waits for an opt-in already in progress before cleaning up. */
const ENABLE_SETTLE_MS = 2000;
/** The account check waits this long for another tab's operation, then tries again next start. */
const RECONCILE_LOCK_WAIT_MS = 3000;
/** How long the lock stays held for this tab's own unsubscribe still in flight. */
const UNSUBSCRIBE_HOLD_MS = 10_000;

/**
 * Sign-out with this device's cleanup first. `signOut` (the real Supabase
 * sign-out, with its own fallbacks) ALWAYS runs: after the cleanup, or after
 * `capMs` if the cleanup is slow, or straight away for nobody signed in.
 *
 * The active account is cleared at the start, so an opt-in still finishing for
 * this user undoes itself (see gentle-nudges-push.ts). An opt-in in progress is
 * given a moment to settle first, so its subscription is cleaned up too. Once
 * the deadline passes, no further cleanup step starts.
 *
 * Returns the cleanup's outcome; 'timed-out' when the deadline passed first
 * (nothing can then be confirmed); null when nobody was signed in.
 */
export async function signOutWithDeviceRelease(
  userId: string | null,
  deps: PushDeviceDeps,
  signOut: () => Promise<void>,
  capMs = 5000,
  onAccountCleared: () => void = () => {}
): Promise<SignOutCleanup | 'timed-out' | null> {
  let cleanup: SignOutCleanup | 'timed-out' | null = null;
  if (userId) {
    const coordination = deps.coordination ?? pushCoordination;
    onAccountCleared();
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const work = (async () => {
      // This tab's opt-in first, OUTSIDE the lock: it may be holding the lock
      // itself, and waiting for it from inside would deadlock.
      await coordination.waitForEnable(Math.min(ENABLE_SETTLE_MS, capMs));
      if (expired) return null;
      const release = () => releaseDeviceOnSignOut(userId, deps, () => expired);
      // Then the cross-tab lock, for at most half of what is left of the cap.
      // If another tab holds it longer, clean up without it: signing out must
      // not wait, and the other tab sees the sign-out and checks its own work.
      const remaining = capMs - (Date.now() - started);
      const locked = await (deps.lock ?? pushLock).run(release, {
        acquireTimeoutMs: Math.max(0, Math.floor(remaining / 2)),
        holdAfter: () => coordination.waitForUnsubscribe(UNSUBSCRIBE_HOLD_MS)
      });
      if (locked.ran) return locked.value;
      if (expired) return null;
      return release();
    })().catch(() => null);
    cleanup = await Promise.race([
      work.then((result) => result ?? ('timed-out' as const)),
      new Promise<'timed-out'>((resolve) => {
        timer = setTimeout(() => {
          expired = true;
          resolve('timed-out');
        }, capMs);
      })
    ]);
    clearTimeout(timer);
    // Anything still running past this point starts no further step.
    expired = true;
  }
  await signOut();
  return cleanup;
}

/** Whether a sign-out cleanup leaves any doubt that this device stopped receiving notifications. */
export const cleanupLeftDeviceConnected = (cleanup: SignOutCleanup | 'timed-out' | null): boolean =>
  cleanup === 'timed-out' || (cleanup !== null && !cleanup.deviceReleased);

/** Shown after sign-out when that is in doubt. Names nothing about the account or the device. */
export const DEVICE_STILL_CONNECTED_MESSAGE =
  "You're signed out, but notifications may still arrive on this device. Open iMA again when you're online to finish disconnecting notifications.";
