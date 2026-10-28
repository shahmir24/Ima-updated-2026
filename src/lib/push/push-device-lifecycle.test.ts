import { describe, expect, it, vi } from 'vitest';
import type { PushSubscriptionLike } from './gentle-nudges-push';
import { createNudgePushController, type NudgePushApi } from './gentle-nudges-push';
import { createPushCoordination, type PushCoordination } from './push-coordination';
import { createPushLock, PUSH_LOCK_NAME, type PushLock } from './push-lock';
import { fakeLocks } from './test-helpers';
import {
  cleanupLeftDeviceConnected,
  DEVICE_STILL_CONNECTED_MESSAGE,
  reconcileDeviceSubscription,
  releaseDeviceOnSignOut,
  signOutWithDeviceRelease,
  type PushDeviceDeps
} from './push-device-lifecycle';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THIS_DEVICE = 'https://fcm.googleapis.com/fcm/send/this-device';
const LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/laptop';
const B_PHONE = 'https://web.push.apple.com/b-phone';
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const VAPID_KEY = b64url(Uint8Array.from([0x04, ...new Array(64).fill(7)]));
const P256DH = b64url(Uint8Array.from([0x04, ...new Array(64).fill(3)]));
const AUTH = b64url(new Uint8Array(16).fill(5));

/** A promise to resolve by hand, to hold an async step open at a chosen moment. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/**
 * push_subscriptions as RLS sees it: a user can read and delete only their own
 * rows. The sender keeps sending to a row until the push service rejects the
 * endpoint, which it does once the browser has unsubscribed.
 */
function world(options: { rows?: { user: string; endpoint: string }[]; subscribed?: boolean } = {}) {
  const rows = [...(options.rows ?? [{ user: A, endpoint: THIS_DEVICE }, { user: A, endpoint: LAPTOP }, { user: B, endpoint: B_PHONE }])];
  const browser = { subscribed: options.subscribed ?? true, unsubscribeFails: false, unsubscribeHangs: false };
  const server = { deleteFails: false, deleteThrows: false, deleteHangs: false, readFails: false, flagsReadFails: false };
  /** user_settings: each account's two feature switches. */
  const flags: Record<string, { nudges_enabled: boolean; focus_alerts_enabled: boolean }> = {};
  const flagsOf = (user: string) => (flags[user] ??= { nudges_enabled: false, focus_alerts_enabled: false });
  const calls: string[] = [];

  const subscription: PushSubscriptionLike = {
    endpoint: THIS_DEVICE,
    toJSON: () => ({ endpoint: THIS_DEVICE, keys: { p256dh: P256DH, auth: AUTH } }),
    unsubscribe: vi.fn(async () => {
      calls.push('browser.unsubscribe');
      if (browser.unsubscribeHangs) return new Promise<boolean>(() => {});
      if (browser.unsubscribeFails) throw new Error('InvalidStateError');
      browser.subscribed = false;
      return true;
    })
  };

  const coordination = createPushCoordination();
  const deps: PushDeviceDeps = {
    timeoutMs: 50,
    coordination,
    getSubscription: async () => (browser.subscribed ? subscription : null),
    async removeServerSubscription(userId, endpoint) {
      calls.push(`server.delete(${userId === A ? 'A' : 'B'})`);
      if (server.deleteHangs) return new Promise(() => {});
      if (server.deleteThrows) throw new Error('Failed to fetch');
      if (server.deleteFails) return { error: { code: 'PGRST301' } };
      // RLS: own rows only, and the query names this endpoint only.
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user === userId && rows[i].endpoint === endpoint) rows.splice(i, 1);
      return { error: null };
    },
    async ownsSubscription(userId, endpoint) {
      calls.push('server.owns');
      if (server.readFails) return { error: { message: 'Failed to fetch' } };
      return { owned: rows.some((row) => row.user === userId && row.endpoint === endpoint) };
    }
  };

  /** Who would get a push sent to this device's endpoint right now. */
  const deliversTo = () =>
    browser.subscribed ? rows.filter((row) => row.endpoint === THIS_DEVICE).map((row) => (row.user === A ? 'A' : 'B')) : [];

  return { rows, browser, server, calls, deps, subscription, deliversTo, coordination, flags, flagsOf };
}

describe('signing out: this device stops receiving the account\'s notifications', () => {
  it('1. success: this device\'s row is deleted while signed in, then the browser unsubscribes, then sign-out runs', async () => {
    const w = world();
    const signOut = vi.fn(async () => void w.calls.push('supabase.signOut'));
    const cleanup = await signOutWithDeviceRelease(A, w.deps, signOut);
    expect(cleanup).toEqual({ server: 'done', browser: 'done', deviceReleased: true });
    expect(w.calls).toEqual(['server.delete(A)', 'browser.unsubscribe', 'supabase.signOut']);
    expect(w.deliversTo()).toEqual([]);
  });

  it('2. no subscription on this device: nothing to clean, sign-out still runs', async () => {
    const w = world({ subscribed: false });
    const signOut = vi.fn(async () => {});
    expect(await signOutWithDeviceRelease(A, w.deps, signOut)).toEqual({ server: 'none', browser: 'none', deviceReleased: true });
    expect(w.calls).toEqual([]);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('3. server deletion fails: the browser still unsubscribes, so the leftover row can no longer deliver', async () => {
    for (const failure of ['deleteFails', 'deleteThrows', 'deleteHangs'] as const) {
      const w = world();
      w.server[failure] = true;
      const signOut = vi.fn(async () => {});
      const cleanup = await signOutWithDeviceRelease(A, w.deps, signOut);
      expect(cleanup).toEqual({ server: 'failed', browser: 'done', deviceReleased: true });
      expect(signOut).toHaveBeenCalledOnce();
      // The row is still there, but its endpoint is dead: the push service refuses it
      // and the sender deletes the row on its next attempt.
      expect(w.rows.some((row) => row.endpoint === THIS_DEVICE)).toBe(true);
      expect(w.deliversTo()).toEqual([]);
    }
  });

  it('4. browser unsubscribe fails: the row is already gone, so nothing is sent to this device', async () => {
    for (const failure of ['unsubscribeFails', 'unsubscribeHangs'] as const) {
      const w = world();
      w.browser[failure] = true;
      const cleanup = await signOutWithDeviceRelease(A, w.deps, async () => {});
      expect(cleanup).toEqual({ server: 'done', browser: 'failed', deviceReleased: true });
      expect(w.deliversTo()).toEqual([]);
    }
  });

  it('both fail (offline, expired session, stuck browser): reported honestly — the device may still receive — and sign-out still happens', async () => {
    const w = world();
    w.server.deleteThrows = true;
    w.browser.unsubscribeFails = true;
    const signOut = vi.fn(async () => {});
    const cleanup = await signOutWithDeviceRelease(A, w.deps, signOut);
    expect(cleanup).toEqual({ server: 'failed', browser: 'failed', deviceReleased: false });
    expect(w.deliversTo()).toEqual(['A']);
    expect(signOut).toHaveBeenCalledOnce();
    // The next start, signed out, tries the browser again.
    w.browser.unsubscribeFails = false;
    expect(await reconcileDeviceSubscription(null, w.deps)).toBe('released');
    expect(w.deliversTo()).toEqual([]);
  });

  it('5. a failing Supabase sign-out still had the cleanup run first; its own error handling is untouched', async () => {
    const w = world();
    const signOut = vi.fn(async () => {
      w.calls.push('supabase.signOut');
      throw new Error('AuthSessionMissingError');
    });
    await expect(signOutWithDeviceRelease(A, w.deps, signOut)).rejects.toThrow('AuthSessionMissingError');
    expect(w.calls).toEqual(['server.delete(A)', 'browser.unsubscribe', 'supabase.signOut']);
    expect(w.deliversTo()).toEqual([]);
  });

  it('a cleanup that never finishes cannot hold sign-out back beyond the cap', async () => {
    const w = world();
    w.deps.timeoutMs = 10_000;
    w.server.deleteHangs = true;
    const signOut = vi.fn(async () => {});
    const started = Date.now();
    expect(await signOutWithDeviceRelease(A, w.deps, signOut, 40)).toBe('timed-out');
    expect(signOut).toHaveBeenCalledOnce();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('8. nobody signed in (guest): no cleanup is attempted, sign-out runs as before', async () => {
    const w = world();
    const signOut = vi.fn(async () => {});
    expect(await signOutWithDeviceRelease(null, w.deps, signOut)).toBeNull();
    expect(w.calls).toEqual([]);
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe('only this device, only this account', () => {
  it('7 & 10. multiple devices: only this endpoint\'s row is deleted; the account\'s other devices and other accounts keep theirs', async () => {
    const w = world();
    await releaseDeviceOnSignOut(A, w.deps);
    expect(w.rows).toEqual([
      { user: A, endpoint: LAPTOP },
      { user: B, endpoint: B_PHONE }
    ]);
  });

  it('10. a row on this endpoint that belongs to another account is never deleted by this user', async () => {
    const w = world({ rows: [{ user: B, endpoint: THIS_DEVICE }] });
    const cleanup = await releaseDeviceOnSignOut(A, w.deps);
    expect(cleanup.server).toBe('done'); // the delete matched nothing of A's
    expect(w.rows).toEqual([{ user: B, endpoint: THIS_DEVICE }]);
  });

  it('nothing is logged: no endpoint, key or token reaches the console', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const w = world();
    w.server.deleteThrows = true;
    w.browser.unsubscribeFails = true;
    await signOutWithDeviceRelease(A, w.deps, async () => {});
    await reconcileDeviceSubscription(B, w.deps);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('6. account switching on one device', () => {
  it('A signed out but the cleanup failed; B signs in: A\'s leftover subscription is released, B is not subscribed', async () => {
    const w = world();
    w.server.deleteThrows = true;
    w.browser.unsubscribeFails = true;
    await signOutWithDeviceRelease(A, w.deps, async () => {});
    expect(w.deliversTo()).toEqual(['A']);

    w.browser.unsubscribeFails = false;
    expect(await reconcileDeviceSubscription(B, w.deps)).toBe('released');
    expect(w.deliversTo()).toEqual([]);
    // B was never registered and A's row was not touched by B (RLS).
    expect(w.rows.filter((row) => row.user === B)).toEqual([{ user: B, endpoint: B_PHONE }]);
  });

  it('the account that owns this device keeps it', async () => {
    const w = world();
    expect(await reconcileDeviceSubscription(A, w.deps)).toBe('kept');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('offline at sign-in: ownership unknown, so nothing is released (checked again next time)', async () => {
    const w = world();
    w.server.readFails = true;
    expect(await reconcileDeviceSubscription(B, w.deps)).toBe('unknown');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('a registration that lands between the two ownership checks is never undone', async () => {
    const w = world({ rows: [] });
    let checks = 0;
    const deps: PushDeviceDeps = {
      ...w.deps,
      async ownsSubscription() {
        checks++;
        return { owned: checks > 1 };
      }
    };
    expect(await reconcileDeviceSubscription(B, deps)).toBe('kept');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('signed out (or a guest) on a device that still holds a subscription: released, permission untouched', async () => {
    const w = world();
    expect(await reconcileDeviceSubscription(null, w.deps)).toBe('released');
    expect(w.calls).toEqual(['browser.unsubscribe']); // no server call without a session
  });

  it('nothing on the device: nothing to do', async () => {
    expect(await reconcileDeviceSubscription(B, world({ subscribed: false }).deps)).toBe('none');
  });
});

/**
 * The real Gentle Nudges opt-in, on the same device, table and coordination
 * record as the cleanup above. `session` is who the Supabase client is signed
 * in as: the registration RPC stores the device for auth.uid(), not for the
 * id the page passes.
 */
function optIn(
  w: ReturnType<typeof world>,
  userId: string,
  session: { user: string | null },
  hooks: { register?: Promise<void> } = {},
  tab: { coordination?: PushCoordination; lock?: PushLock } = {}
) {
  const registration = {
    active: {},
    pushManager: {
      getSubscription: async () => (w.browser.subscribed ? w.subscription : null),
      subscribe: async () => {
        w.calls.push('browser.subscribe');
        w.browser.subscribed = true;
        return w.subscription;
      }
    }
  };
  const api: NudgePushApi = {
    async registerSubscription(record) {
      w.calls.push(`server.register(${userId === A ? 'A' : 'B'})`);
      await hooks.register;
      if (!session.user) return { error: { code: '42501' } }; // "Not signed in"
      for (let i = w.rows.length - 1; i >= 0; i--) if (w.rows[i].endpoint === record.endpoint) w.rows.splice(i, 1);
      w.rows.push({ user: session.user, endpoint: record.endpoint });
      return { error: null };
    },
    removeSubscription: (user, endpoint) => w.deps.removeServerSubscription(user, endpoint),
    saveSettings: async (user, patch) => {
      w.calls.push(`settings(${patch.nudges_enabled || patch.focus_alerts_enabled ? 'on' : 'off'})`);
      const { timezone: _zone, ...switches } = patch;
      Object.assign(w.flagsOf(user), switches);
      return { error: null };
    },
    readFeatureFlags: async (user) => {
      w.calls.push('settings.read');
      if (w.server.flagsReadFails) return { error: { message: 'Failed to fetch' } };
      return { flags: { ...w.flagsOf(user) } };
    }
  };
  return createNudgePushController({
    userId,
    vapidPublicKey: VAPID_KEY,
    api,
    coordination: tab.coordination ?? w.coordination,
    lock: tab.lock,
    environment: {
      navigator: { userAgent: 'test', serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } },
      Notification: { permission: 'granted', requestPermission: async () => 'granted' as NotificationPermission },
      hasPushManager: true,
      isSecureContext: true,
      timeZone: () => 'UTC'
    }
  });
}

describe('race: a check started for A never acts after B signs in', () => {
  it('ownership answer for A arrives after B is active: nothing is unsubscribed', async () => {
    const w = world({ rows: [] });
    w.coordination.setActiveAccount(A);
    const answer = deferred<{ owned: boolean }>();
    const deps: PushDeviceDeps = { ...w.deps, timeoutMs: 1000, ownsSubscription: () => answer.promise };
    let current = true;
    const check = reconcileDeviceSubscription(A, deps, () => current);
    await tick();
    // The effect for A is cleaned up and B becomes the active account.
    current = false;
    w.coordination.setActiveAccount(B);
    answer.resolve({ owned: false });
    expect(await check).toBe('superseded');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('even without the effect cleanup, an account change alone stops it', async () => {
    const w = world({ rows: [] });
    w.coordination.setActiveAccount(A);
    const answer = deferred<{ owned: boolean }>();
    const check = reconcileDeviceSubscription(A, { ...w.deps, timeoutMs: 1000, ownsSubscription: () => answer.promise });
    await tick();
    w.coordination.setActiveAccount(B);
    answer.resolve({ owned: false });
    expect(await check).toBe('superseded');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('race: B opts in while the account check is running', () => {
  it("B's new registration is never undone by the check", async () => {
    const w = world({ rows: [{ user: A, endpoint: THIS_DEVICE }] }); // A's leftover on this device
    const session = { user: B as string | null };
    w.coordination.setActiveAccount(B);
    const answer = deferred<{ owned: boolean }>();
    const check = reconcileDeviceSubscription(B, { ...w.deps, timeoutMs: 1000, ownsSubscription: () => answer.promise });
    await tick();
    // B taps "Turn on" while the check waits on the server.
    const enabled = await optIn(w, B, session).enable();
    expect(enabled.ok).toBe(true);
    answer.resolve({ owned: false }); // the answer was computed before B registered
    expect(await check).toBe('superseded');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
    expect(w.deliversTo()).toEqual(['B']);
  });
});

describe('race: opting in and logging out at the same time', () => {
  it('a registration landing after sign-out began is taken back; nothing reaches A on this device', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    w.coordination.setActiveAccount(A);
    const register = deferred<void>();
    const enabling = optIn(w, A, session, { register: register.promise }).enable();
    await tick();
    // Log out while the registration is still in flight.
    const signOut = vi.fn(async () => {
      session.user = null;
    });
    const loggingOut = signOutWithDeviceRelease(A, w.deps, signOut, 5000, () => w.coordination.setActiveAccount(null));
    await tick(5);
    register.resolve(); // the RPC lands with A's still-valid session
    expect((await enabling).ok).toBe(false);
    await loggingOut;
    expect(signOut).toHaveBeenCalledOnce();
    expect(w.rows).toEqual([]); // the late row was removed while A's session still held
    expect(w.deliversTo()).toEqual([]); // and the browser is unsubscribed
  });

  it('an opt-in still waiting for the prompt when sign-out starts sets nothing up', async () => {
    const w = world({ subscribed: false, rows: [] });
    w.coordination.setActiveAccount(A);
    w.coordination.setActiveAccount(null); // signed out before the prompt was answered
    const result = await optIn(w, A, { user: null }).enable();
    expect(result.ok).toBe(false);
    expect(w.calls).not.toContain('browser.subscribe');
    expect(w.rows).toEqual([]);
  });
});

describe('the deadline: nothing further starts, and in-flight work cannot harm the next account', () => {
  it('cleanup past its deadline never starts the browser step, even later', async () => {
    const w = world();
    w.deps.timeoutMs = 10_000;
    w.server.deleteHangs = true;
    const result = await signOutWithDeviceRelease(A, w.deps, async () => {}, 40, () => w.coordination.setActiveAccount(null));
    expect(result).toBe('timed-out');
    await tick(120);
    expect(w.calls).toEqual(['server.delete(A)']);
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("an unsubscribe already in flight at the deadline: B's opt-in waits for it, then sets up a live subscription", async () => {
    const w = world();
    const hold = deferred<void>();
    const realUnsubscribe = w.subscription.unsubscribe;
    w.subscription.unsubscribe = vi.fn(async () => {
      await hold.promise;
      return realUnsubscribe();
    });
    w.deps.timeoutMs = 10_000;
    w.coordination.setActiveAccount(A);
    const result = await signOutWithDeviceRelease(A, w.deps, async () => {}, 40, () => w.coordination.setActiveAccount(null));
    expect(result).toBe('timed-out');

    // B signs in and opts in while A's unsubscribe is still running.
    const session = { user: B as string | null };
    w.coordination.setActiveAccount(B);
    const enabling = optIn(w, B, session).enable();
    await tick(20);
    expect(w.calls).not.toContain('server.register(B)'); // waiting, not reusing a dying subscription
    hold.resolve();
    expect((await enabling).ok).toBe(true);
    expect(w.calls.filter((c) => c === 'browser.subscribe')).toHaveLength(1); // a fresh one
    expect(w.deliversTo()).toEqual(['B']);
  });

  it('a server delete still running after the deadline can only ever touch A\'s row', async () => {
    const w = world({ rows: [{ user: A, endpoint: THIS_DEVICE }] });
    const late = deferred<void>();
    const deps: PushDeviceDeps = {
      ...w.deps,
      timeoutMs: 10_000,
      async removeServerSubscription(userId, endpoint) {
        await late.promise;
        return w.deps.removeServerSubscription(userId, endpoint);
      }
    };
    await signOutWithDeviceRelease(A, deps, async () => {}, 40, () => w.coordination.setActiveAccount(null));
    // B registers this device, then A's delayed delete finally runs.
    w.rows.splice(0, w.rows.length, { user: B, endpoint: THIS_DEVICE });
    late.resolve();
    await tick(10);
    expect(w.rows).toEqual([{ user: B, endpoint: THIS_DEVICE }]);
  });

  it('waiting for an unsubscribe that never settles gives up instead of hanging', async () => {
    const coordination = createPushCoordination();
    void coordination.trackUnsubscribe(new Promise(() => {}));
    expect(await coordination.waitForUnsubscribe(30)).toBe(false);
  });
});

describe('the warning after sign-out', () => {
  it('is due when neither step worked, or when the deadline passed; not after a normal sign-out', () => {
    expect(cleanupLeftDeviceConnected({ server: 'failed', browser: 'failed', deviceReleased: false })).toBe(true);
    expect(cleanupLeftDeviceConnected('timed-out')).toBe(true);
    expect(cleanupLeftDeviceConnected({ server: 'done', browser: 'done', deviceReleased: true })).toBe(false);
    expect(cleanupLeftDeviceConnected({ server: 'failed', browser: 'done', deviceReleased: true })).toBe(false);
    expect(cleanupLeftDeviceConnected({ server: 'none', browser: 'none', deviceReleased: true })).toBe(false);
    expect(cleanupLeftDeviceConnected(null)).toBe(false);
  });

  it('says exactly the approved words, and nothing about the device or account', () => {
    expect(DEVICE_STILL_CONNECTED_MESSAGE).toBe(
      "You're signed out, but notifications may still arrive on this device. Open iMA again when you're online to finish disconnecting notifications."
    );
    expect(DEVICE_STILL_CONNECTED_MESSAGE).not.toMatch(/https?:|@|token|endpoint/i);
  });
});

/**
 * Two tabs of the same browser: one subscription, one Supabase session, one
 * set of Web Locks — but each tab has its own in-memory coordination.
 */
function twoTabs(w: ReturnType<typeof world>) {
  const locks = fakeLocks();
  const tab = () => {
    const coordination = createPushCoordination();
    const lock = createPushLock(() => locks.manager);
    return { coordination, lock, deps: { ...w.deps, coordination, lock } as PushDeviceDeps };
  };
  return { locks, tab1: tab(), tab2: tab() };
}

describe('cross-tab: two tabs sharing one subscription', () => {
  it('logout in tab 1 racing an opt-in in tab 2: the opt-in finishes first, then the cleanup removes it — nothing left for A', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    tab2.coordination.setActiveAccount(A);

    const register = deferred<void>();
    const enabling = optIn(w, A, session, { register: register.promise }, tab2).enable();
    await tick(); // tab 2 now holds the lock, its registration in flight

    const signOut = vi.fn(async () => {
      session.user = null;
    });
    const loggingOut = signOutWithDeviceRelease(A, tab1.deps, signOut, 5000, () => tab1.coordination.setActiveAccount(null));
    await tick(10);
    expect(w.calls).not.toContain('server.delete(A)'); // tab 1 waits for the lock
    register.resolve();
    expect((await enabling).ok).toBe(true);
    const cleanup = await loggingOut;
    expect(cleanup).toEqual({ server: 'done', browser: 'done', deviceReleased: true });
    expect(w.calls.indexOf('server.register(A)')).toBeLessThan(w.calls.indexOf('server.delete(A)'));
    expect(w.rows).toEqual([]);
    expect(w.deliversTo()).toEqual([]);
  });

  it('without the lock (unsupported browser) the same race is still caught: tab 2 sees the sign-out and takes its registration back', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const tab1 = { coordination: createPushCoordination() };
    const tab2 = { coordination: createPushCoordination(), lock: createPushLock(() => undefined) };
    tab1.coordination.setActiveAccount(A);
    tab2.coordination.setActiveAccount(A);
    const register = deferred<void>();
    const enabling = optIn(w, A, session, { register: register.promise }, tab2).enable();
    await tick();
    await signOutWithDeviceRelease(A, { ...w.deps, coordination: tab1.coordination, lock: createPushLock(() => undefined) }, async () => {
      session.user = null;
    }, 5000, () => tab1.coordination.setActiveAccount(null));
    // Supabase tells tab 2 about the sign-out (storage event): AuthProvider clears its account.
    tab2.coordination.setActiveAccount(null);
    register.resolve();
    expect((await enabling).ok).toBe(false);
    expect(w.deliversTo()).toEqual([]);
  });

  it('opt-out in tab 1 racing an opt-in in tab 2: one runs after the other, never interleaved', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    tab2.coordination.setActiveAccount(A);
    const register = deferred<void>();
    const enabling = optIn(w, A, session, { register: register.promise }, tab2).enable();
    await tick();
    const disabling = optIn(w, A, session, {}, tab1).disable();
    await tick(10);
    // Tab 1 already saved "off" for the account, but waits to touch the device.
    expect(w.calls).toContain('settings(off)');
    expect(w.calls).not.toContain('server.delete(A)');
    register.resolve();
    await enabling;
    // Strictly in order: tab 2 registered and saved "on" after tab 1's "off";
    // tab 1 then read the switch back under the lock and left the device for it.
    expect(await disabling).toMatchObject({ ok: true, device: 'kept' });
    expect(w.calls.indexOf('server.register(A)')).toBeLessThan(w.calls.lastIndexOf('settings.read'));
    expect(w.calls).not.toContain('server.delete(A)');
    // The account and the device agree: on, and this device receives it.
    expect(w.flags[A].nudges_enabled).toBe(true);
    expect(w.deliversTo()).toEqual(['A']);
  });

  it('opt-out in tab 1 after an opt-in in tab 2 has finished: the device is removed', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    tab2.coordination.setActiveAccount(A);
    expect((await optIn(w, A, session, {}, tab2).enable()).ok).toBe(true);
    expect(await optIn(w, A, session, {}, tab1).disable()).toMatchObject({ ok: true, device: 'released' });
    expect(w.rows).toEqual([]);
    expect(w.deliversTo()).toEqual([]);
  });

  it("account switching: a check for A waiting on the lock while A signs out and B signs in does nothing to B's device", async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { locks, tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    // Tab 2 is holding the lock (stuck), so tab 1's check for A queues behind it.
    const holder = deferred<void>();
    void tab2.lock.run(() => holder.promise, { acquireTimeoutMs: 1000 });
    await tick();
    let current = true;
    const check = reconcileDeviceSubscription(A, tab1.deps, () => current);
    await tick(5);
    // A signs out, B signs in and opts in on this device (tab 1's effect for A is cleaned up).
    current = false;
    tab1.coordination.setActiveAccount(B);
    session.user = B;
    holder.resolve();
    expect(await check).toBe('superseded');
    expect((await optIn(w, B, session, {}, tab1).enable()).ok).toBe(true);
    expect(w.deliversTo()).toEqual(['B']);
    expect(locks.isHeld(PUSH_LOCK_NAME)).toBe(false);
  });

  it("lock acquisition timeout during sign-out: another tab stuck holding it cannot delay sign-out past the cap; cleanup still runs", async () => {
    const w = world();
    const { tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    void tab2.lock.run(() => new Promise(() => {}), { acquireTimeoutMs: 1000 }); // a stuck tab
    await tick();
    const signOut = vi.fn(async () => {});
    const started = Date.now();
    const cleanup = await signOutWithDeviceRelease(A, tab1.deps, signOut, 400, () => tab1.coordination.setActiveAccount(null));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(signOut).toHaveBeenCalledOnce();
    // Waited about half the budget for the lock, then cleaned up without it.
    expect(cleanup).toEqual({ server: 'done', browser: 'done', deviceReleased: true });
    expect(w.deliversTo()).toEqual([]);
  });

  it('the account check gives up on a busy lock and leaves everything for the next start', async () => {
    const w = world();
    const { tab1, tab2 } = twoTabs(w);
    void tab2.lock.run(() => new Promise(() => {}), { acquireTimeoutMs: 1000 });
    await tick();
    const deps = { ...tab1.deps };
    const lockWithShortWait: PushLock = { run: (op, o) => tab1.lock.run(op, { ...o, acquireTimeoutMs: 20 }) };
    expect(await reconcileDeviceSubscription(null, { ...deps, lock: lockWithShortWait })).toBe('unknown');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('an opt-in that cannot get the lock in time changes nothing and asks to try again', async () => {
    const w = world({ subscribed: false, rows: [] });
    const { tab1, tab2 } = twoTabs(w);
    tab1.coordination.setActiveAccount(A);
    void tab2.lock.run(() => new Promise(() => {}), { acquireTimeoutMs: 1000 });
    await tick();
    const lockWithShortWait: PushLock = { run: (op, o) => tab1.lock.run(op, { ...o, acquireTimeoutMs: 20 }) };
    const result = await optIn(w, A, { user: A }, {}, { coordination: tab1.coordination, lock: lockWithShortWait }).enable();
    expect(result).toMatchObject({ ok: false, error: { code: 'subscribe-failed' } });
    expect(w.calls).not.toContain('browser.subscribe');
    expect(w.rows).toEqual([]);
  });
});

describe('cross-tab: Gentle Nudges and Focus alerts share the one subscription', () => {
  const bothTabsSignedIn = (w: ReturnType<typeof world>) => {
    const tabs = twoTabs(w);
    tabs.tab1.coordination.setActiveAccount(A);
    tabs.tab2.coordination.setActiveAccount(A);
    return tabs;
  };

  it('tab 1 turns nudges off while tab 2 turns Focus alerts on: the device stays, for Focus alerts', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1, tab2 } = bothTabsSignedIn(w);
    expect((await optIn(w, A, session, {}, tab1).enable('nudges')).ok).toBe(true);

    // Tab 2's Focus opt-in holds the lock, its registration in flight…
    const register = deferred<void>();
    const focusOn = optIn(w, A, session, { register: register.promise }, tab2).enable('focus');
    await tick();
    // …while tab 1 — whose screen still thinks Focus is off — turns nudges off.
    const nudgesOff = optIn(w, A, session, {}, tab1).disable('nudges');
    await tick(10);
    expect(w.calls).not.toContain('server.delete(A)');
    register.resolve();
    expect((await focusOn).ok).toBe(true);
    expect(await nudgesOff).toMatchObject({ ok: true, device: 'kept' });

    expect(w.flags[A]).toEqual({ nudges_enabled: false, focus_alerts_enabled: true });
    expect(w.calls).not.toContain('server.delete(A)');
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
    expect(w.deliversTo()).toEqual(['A']);
  });

  it('both tabs turn their feature off at the same time: the device is removed once, nothing left', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1, tab2 } = bothTabsSignedIn(w);
    await optIn(w, A, session, {}, tab1).enable('nudges');
    await optIn(w, A, session, {}, tab2).enable('focus');
    expect(w.deliversTo()).toEqual(['A']);

    const [one, two] = await Promise.all([
      optIn(w, A, session, {}, tab1).disable('nudges'),
      optIn(w, A, session, {}, tab2).disable('focus')
    ]);
    expect([one, two].every((r) => r.ok)).toBe(true);
    // Whichever ran second found the device already gone; it was removed once.
    expect(w.calls.filter((c) => c === 'server.delete(A)')).toHaveLength(1);
    expect(w.subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(w.flags[A]).toEqual({ nudges_enabled: false, focus_alerts_enabled: false });
    expect(w.rows).toEqual([]);
    expect(w.deliversTo()).toEqual([]);
  });

  it('logout with both features on removes the device whatever the switches say', async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1 } = bothTabsSignedIn(w);
    await optIn(w, A, session, {}, tab1).enable('nudges');
    await optIn(w, A, session, {}, tab1).enable('focus');
    const cleanup = await signOutWithDeviceRelease(A, tab1.deps, async () => {
      session.user = null;
    }, 5000, () => tab1.coordination.setActiveAccount(null));
    expect(cleanup).toEqual({ server: 'done', browser: 'done', deviceReleased: true });
    expect(w.deliversTo()).toEqual([]);
  });

  it("account switching: A's turn-off, finishing after the tab moved on to B, leaves the device to sign-out cleanup", async () => {
    const w = world({ subscribed: false, rows: [] });
    const session = { user: A as string | null };
    const { tab1 } = bothTabsSignedIn(w);
    await optIn(w, A, session, {}, tab1).enable('nudges');
    // A's old screen finishes a disable after the tab has moved on to B.
    const controller = optIn(w, A, session, {}, tab1);
    tab1.coordination.setActiveAccount(B);
    w.calls.length = 0;
    const result = await controller.disable('nudges');
    // Both switches end up off, so only the account guard can be what keeps the device:
    expect(w.flags[A]).toEqual({ nudges_enabled: false, focus_alerts_enabled: false });
    expect(result).toEqual({ ok: true, timezoneSaved: false, device: 'kept' });
    // ...and it stops before even reading the switches.
    expect(w.calls).toEqual(['settings(off)']);
    expect(w.subscription.unsubscribe).not.toHaveBeenCalled();
  });
});
