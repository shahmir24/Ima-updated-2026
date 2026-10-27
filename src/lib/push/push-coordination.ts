/**
 * Who this device's push subscription is being handled for, right now, and
 * what is touching it.
 *
 * Three things act on the one browser subscription: a user turning nudges on
 * (enable), sign-out cleanup, and the account check on start / account change
 * (reconcile). Each is asynchronous, and a timeout does not cancel the work
 * underneath it, so without coordination a late step from one can undo
 * another — e.g. a slow sign-out cleanup for A unsubscribing the subscription
 * B has just opted in with. This is the shared record they consult:
 *
 *   * the ACTIVE ACCOUNT, set by AuthProvider (null = signed out). Every
 *     destructive or registering step checks it immediately before acting;
 *   * a GENERATION that changes whenever the account changes;
 *   * the ENABLE in flight, and how many have started;
 *   * any UNSUBSCRIBE in flight. Enable waits for it to settle and refuses to
 *     reuse a subscription that may be about to die.
 *
 * One app-wide instance, because the browser has exactly one subscription per
 * site; tests make their own. Nothing here stores an endpoint, key or token.
 */

export interface PushCoordination {
  /** The account this device's subscription is being handled for; undefined = not tracked yet. */
  activeAccount(): string | null | undefined;
  /** AuthProvider: the signed-in account changed (null = signed out). */
  setActiveAccount(userId: string | null): void;
  accountGeneration(): number;
  /** True only when tracking is on and `userId` is not the active account. */
  isInactive(userId: string): boolean;
  enablesStarted(): number;
  enableInProgress(): boolean;
  /** Registers an enable; counted from the moment it starts. */
  trackEnable<T>(work: Promise<T>): Promise<T>;
  /** Registers an unsubscribe that may still be running after its caller gave up. */
  trackUnsubscribe<T>(work: Promise<T>): Promise<T>;
  /** Resolves true once no enable is in flight, or false after `ms`. */
  waitForEnable(ms: number): Promise<boolean>;
  /** Resolves true once no unsubscribe is in flight, or false after `ms`. */
  waitForUnsubscribe(ms: number): Promise<boolean>;
}

async function settled(current: () => Promise<unknown> | null, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  // Loop: another may start while we wait for the first.
  for (let pending = current(); pending; pending = current()) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      pending.then(
        () => false,
        () => false
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), left);
      })
    ]);
    clearTimeout(timer);
    if (timedOut) return false;
  }
  return true;
}

export function createPushCoordination(): PushCoordination {
  let activeAccount: string | null | undefined;
  let accountGeneration = 0;
  let enablesStarted = 0;
  let enableInFlight: Promise<unknown> | null = null;
  let unsubscribeInFlight: Promise<unknown> | null = null;

  return {
    activeAccount: () => activeAccount,
    setActiveAccount(userId) {
      if (activeAccount === userId) return;
      activeAccount = userId;
      accountGeneration++;
    },
    accountGeneration: () => accountGeneration,
    isInactive: (userId) => activeAccount !== undefined && activeAccount !== userId,
    enablesStarted: () => enablesStarted,
    enableInProgress: () => enableInFlight !== null,
    trackEnable(work) {
      enablesStarted++;
      const tracked = work.finally(() => {
        if (enableInFlight === tracked) enableInFlight = null;
      });
      enableInFlight = tracked;
      return tracked;
    },
    trackUnsubscribe(work) {
      const tracked = work.finally(() => {
        if (unsubscribeInFlight === tracked) unsubscribeInFlight = null;
      });
      unsubscribeInFlight = tracked;
      return tracked;
    },
    waitForEnable: (ms) => settled(() => enableInFlight, ms),
    waitForUnsubscribe: (ms) => settled(() => unsubscribeInFlight, ms)
  };
}

/** The app-wide record: AuthProvider, sign-out cleanup and Gentle Nudges all use this one. */
export const pushCoordination: PushCoordination = createPushCoordination();
