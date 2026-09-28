import { describe, expect, it, vi } from 'vitest';
import {
  createNudgePushController,
  decodeVapidPublicKey,
  toSubscriptionRecord,
  type NudgePushApi,
  type NudgePushEnvironment,
  type PushSubscriptionLike
} from './gentle-nudges-push';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const point = (fill: number) => Uint8Array.from([0x04, ...new Array(64).fill(fill)]);
const VAPID_BYTES = point(7);
const VAPID_KEY = b64url(VAPID_BYTES);
const OTHER_KEY_BYTES = point(9);

const P256DH = b64url(point(3));
const AUTH = b64url(new Uint8Array(16).fill(5));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';

function fakeSubscription(options: { endpoint?: string; key?: Uint8Array | null; p256dh?: string; auth?: string } = {}) {
  const endpoint = options.endpoint ?? ENDPOINT;
  const key = options.key === undefined ? VAPID_BYTES : options.key;
  return {
    endpoint,
    options: { applicationServerKey: key ? key.slice().buffer : null },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: options.p256dh ?? P256DH, auth: options.auth ?? AUTH } }),
    unsubscribe: vi.fn(async () => true)
  } satisfies PushSubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> };
}

type Answer = NotificationPermission | 'throw' | 'callback-granted';

interface BrowserOptions {
  permission?: NotificationPermission;
  answer?: Answer;
  existing?: ReturnType<typeof fakeSubscription> | null;
  subscribeResult?: ReturnType<typeof fakeSubscription> | 'reject';
  registration?: 'active' | 'none' | 'installing-never' | 'installing-then-ready';
  missing?: Array<'serviceWorker' | 'PushManager' | 'Notification' | 'secure'>;
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  timeZone?: string | undefined | 'throw-free-undefined';
}

function fakeBrowser(options: BrowserOptions = {}) {
  const log: string[] = [];
  let permission: NotificationPermission = options.permission ?? 'default';
  let current = options.existing === undefined ? null : options.existing;
  const created = options.subscribeResult ?? fakeSubscription();

  const requestPermission = vi.fn((callback?: (p: NotificationPermission) => void) => {
    log.push('requestPermission');
    const answer = options.answer ?? 'granted';
    if (answer === 'throw') throw new Error('not allowed');
    if (answer === 'callback-granted') {
      permission = 'granted';
      callback?.('granted');
      return undefined;
    }
    permission = answer;
    return Promise.resolve(answer);
  });

  const pushManager = {
    getSubscription: vi.fn(async () => {
      log.push('getSubscription');
      return current;
    }),
    subscribe: vi.fn(async (_opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
      log.push('subscribe');
      if (created === 'reject') throw new DOMException('push service error', 'AbortError');
      current = created;
      return created;
    })
  };
  const mode = options.registration ?? 'active';
  const registration = { active: mode === 'active' ? {} : null, pushManager };
  const getRegistration = vi.fn(async () => {
    log.push('getRegistration');
    return mode === 'none' ? undefined : registration;
  });
  const ready =
    mode === 'installing-then-ready' ? Promise.resolve({ ...registration, active: {} }) : new Promise<never>(() => {});

  const missing = new Set(options.missing ?? []);
  const environment: NudgePushEnvironment = {
    navigator: {
      userAgent: options.userAgent ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',
      maxTouchPoints: options.maxTouchPoints ?? 0,
      ...(missing.has('serviceWorker') ? {} : { serviceWorker: { getRegistration, ready } })
    },
    Notification: missing.has('Notification')
      ? undefined
      : {
          get permission() {
            return permission;
          },
          requestPermission
        },
    hasPushManager: !missing.has('PushManager'),
    isSecureContext: !missing.has('secure'),
    isStandalone: () => options.standalone ?? false,
    timeZone: () => ('timeZone' in options ? (options.timeZone === 'throw-free-undefined' ? undefined : options.timeZone) : 'Asia/Karachi'),
    serviceWorkerTimeoutMs: 20
  };
  return { environment, log, requestPermission, pushManager, getRegistration, current: () => current };
}

type LooseApi = Partial<NudgePushApi>;

function fakeApi(overrides: LooseApi = {}, log: string[] = []) {
  const wrap = <K extends keyof NudgePushApi>(name: K) =>
    vi.fn(async (...args: Parameters<NudgePushApi[K]>): Promise<{ error: unknown }> => {
      log.push(name);
      const override = overrides[name] as unknown as ((...a: Parameters<NudgePushApi[K]>) => Promise<{ error: unknown }>) | undefined;
      return override ? override(...args) : { error: null };
    });
  return {
    registerSubscription: wrap('registerSubscription'),
    removeSubscription: wrap('removeSubscription'),
    saveSettings: wrap('saveSettings')
  };
}

function setup(browser: BrowserOptions = {}, apiOverrides: LooseApi = {}, vapid: { key: string | undefined } = { key: VAPID_KEY }) {
  const b = fakeBrowser(browser);
  const api = fakeApi(apiOverrides, b.log);
  const controller = createNudgePushController({ userId: USER_ID, vapidPublicKey: vapid.key, api, environment: b.environment });
  return { ...b, api, controller };
}

const noServerCalls = (api: ReturnType<typeof fakeApi>) => {
  expect(api.registerSubscription).not.toHaveBeenCalled();
  expect(api.removeSubscription).not.toHaveBeenCalled();
  expect(api.saveSettings).not.toHaveBeenCalled();
};

// ---------------------------------------------------------------------------

describe('decodeVapidPublicKey', () => {
  it('accepts an uncompressed P-256 public key in base64url, with or without padding', () => {
    expect(decodeVapidPublicKey(VAPID_KEY)).toEqual(VAPID_BYTES);
    expect(decodeVapidPublicKey(`  ${VAPID_KEY}=  `)).toEqual(VAPID_BYTES);
  });

  it('rejects missing, blank, malformed or wrong-sized keys instead of throwing', () => {
    const notAPoint = b64url(Uint8Array.from([0x03, ...new Array(64).fill(7)]));
    const privateKeySized = b64url(new Uint8Array(32).fill(1));
    const standardBase64 = Buffer.from(point(0xfb)).toString('base64'); // contains + and /
    for (const key of [undefined, null, '', '   ', 'not-a-key', privateKeySized, notAPoint, standardBase64, VAPID_KEY + 'A', 42 as unknown as string]) {
      expect(decodeVapidPublicKey(key), String(key)).toBeNull();
    }
  });
});

describe('toSubscriptionRecord', () => {
  it('keeps endpoint, p256dh, auth and a capped user agent', () => {
    expect(toSubscriptionRecord(fakeSubscription(), 'x'.repeat(600))).toEqual({
      endpoint: ENDPOINT,
      p256dh: P256DH,
      auth: AUTH,
      userAgent: 'x'.repeat(512)
    });
    expect(toSubscriptionRecord(fakeSubscription(), '   ')?.userAgent).toBeNull();
  });

  it('refuses anything the database would refuse', () => {
    expect(toSubscriptionRecord(fakeSubscription({ endpoint: 'http://push.test/x' }), 'ua')).toBeNull();
    expect(toSubscriptionRecord(fakeSubscription({ p256dh: 'short' }), 'ua')).toBeNull();
    expect(toSubscriptionRecord(fakeSubscription({ auth: 'a+b/' }), 'ua')).toBeNull();
  });
});

describe('guest/auth isolation', () => {
  it('a controller cannot exist without a signed-in user', () => {
    const b = fakeBrowser();
    expect(() => createNudgePushController({ userId: '', vapidPublicKey: VAPID_KEY, api: fakeApi(), environment: b.environment })).toThrow();
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});

describe('nothing happens by itself', () => {
  it('creating a controller and refreshing only read — no prompt, no subscribe, no server call', async () => {
    const { controller, requestPermission, pushManager, api } = setup({ permission: 'default' });
    expect(controller.getState()).toEqual({
      supported: true,
      installRequired: false,
      configured: true,
      permission: 'default',
      subscribed: null,
      loading: false,
      error: null
    });
    await controller.refresh();
    expect(controller.getState().subscribed).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    noServerCalls(api);
  });
});

describe('unsupported browsers', () => {
  it.each([['serviceWorker'], ['PushManager'], ['Notification'], ['secure']] as const)(
    'without %s: unsupported, and enable() never prompts or calls the server',
    async (missing) => {
      const { controller, requestPermission, getRegistration, api } = setup({ missing: [missing] });
      await controller.refresh();
      const state = controller.getState();
      expect(state.supported).toBe(false);
      expect(state.subscribed).toBe(false);
      expect(state.installRequired).toBe(false);
      if (missing === 'Notification') expect(state.permission).toBe('unsupported');

      const result = await controller.enable();
      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'unsupported' }) });
      expect(controller.getState().error?.code).toBe('unsupported');
      expect(requestPermission).not.toHaveBeenCalled();
      expect(getRegistration).not.toHaveBeenCalled();
      noServerCalls(api);
    }
  );

  it('iPhone Safari outside the installed app reports install-required', async () => {
    const { controller, requestPermission } = setup({
      missing: ['PushManager'],
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1'
    });
    expect(controller.getState().installRequired).toBe(true);
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState().error?.code).toBe('install-required');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('iPadOS (which reports a Mac) is recognised; the installed app is not flagged', () => {
    const ipad = setup({ missing: ['PushManager'], userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', maxTouchPoints: 5 });
    expect(ipad.controller.getState().installRequired).toBe(true);
    const installed = setup({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true });
    expect(installed.controller.getState()).toMatchObject({ supported: true, installRequired: false });
    const desktopSafari = setup({ missing: ['PushManager'], userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605' });
    expect(desktopSafari.controller.getState().installRequired).toBe(false);
  });
});

describe('VAPID configuration', () => {
  it.each([[undefined], [''], ['not-a-real-key'], [b64url(new Uint8Array(32).fill(1))]])(
    'missing or invalid key %j: not configured, and enable() never prompts',
    async (key) => {
      const { controller, requestPermission, pushManager, api } = setup({}, {}, { key });
      expect(controller.getState().configured).toBe(false);
      const result = await controller.enable();
      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not-configured' }) });
      expect(requestPermission).not.toHaveBeenCalled();
      expect(pushManager.subscribe).not.toHaveBeenCalled();
      noServerCalls(api);
    }
  );
});

describe('permission', () => {
  it('default: enable() calls requestPermission synchronously, before any await or other browser call', () => {
    const { controller, requestPermission, log } = setup({ permission: 'default' });
    void controller.enable();
    // No await yet: the prompt must already have been requested, inside the click.
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['requestPermission']);
    expect(controller.getState().loading).toBe(true);
  });

  it('default then dismissed: permission-dismissed, nothing subscribed', async () => {
    const { controller, pushManager, api } = setup({ permission: 'default', answer: 'default' });
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'permission-dismissed' }) });
    expect(controller.getState()).toMatchObject({ permission: 'default', loading: false, error: { code: 'permission-dismissed' } });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    noServerCalls(api);
  });

  it('default then blocked in the prompt: permission-denied, nothing subscribed', async () => {
    const { controller, pushManager, api } = setup({ permission: 'default', answer: 'denied' });
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState()).toMatchObject({ permission: 'denied', error: { code: 'permission-denied' } });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    noServerCalls(api);
  });

  it('already denied: reports it without prompting again', async () => {
    const { controller, requestPermission, api } = setup({ permission: 'denied' });
    expect(controller.getState().permission).toBe('denied');
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'permission-denied' }) });
    expect(requestPermission).not.toHaveBeenCalled();
    noServerCalls(api);
  });

  it('already granted: does not prompt, goes straight to subscribing', async () => {
    const { controller, requestPermission, pushManager } = setup({ permission: 'granted' });
    expect((await controller.enable()).ok).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
  });

  it('old callback-only Safari requestPermission works', async () => {
    const { controller, requestPermission } = setup({ permission: 'default', answer: 'callback-granted' });
    expect((await controller.enable()).ok).toBe(true);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(controller.getState().permission).toBe('granted');
  });

  it('a throwing requestPermission counts as dismissed, not a crash', async () => {
    const { controller, pushManager } = setup({ permission: 'default', answer: 'throw' });
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'permission-dismissed' }) });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('successful new subscription', () => {
  it('prompts, subscribes with the VAPID key, registers the device, then saves nudges on + timezone', async () => {
    const { controller, pushManager, api, log } = setup({ permission: 'default' });
    const seen: boolean[] = [];
    controller.subscribe(() => seen.push(controller.getState().loading));

    const result = await controller.enable();

    expect(result).toEqual({ ok: true, timezoneSaved: true });
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: VAPID_BYTES });
    expect(api.registerSubscription).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      p256dh: P256DH,
      auth: AUTH,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130'
    });
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: true, timezone: 'Asia/Karachi' });
    expect(log).toEqual(['requestPermission', 'getRegistration', 'getSubscription', 'subscribe', 'registerSubscription', 'saveSettings']);
    expect(controller.getState()).toEqual({
      supported: true,
      installRequired: false,
      configured: true,
      permission: 'granted',
      subscribed: true,
      loading: false,
      error: null
    });
    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('waits for a worker that is still installing', async () => {
    const { controller } = setup({ permission: 'granted', registration: 'installing-then-ready' });
    expect((await controller.enable()).ok).toBe(true);
  });

  it('a double click runs once', async () => {
    const { controller, requestPermission, api } = setup({ permission: 'default' });
    const first = controller.enable();
    const second = controller.enable();
    expect(second).toBe(first);
    await first;
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(api.registerSubscription).toHaveBeenCalledTimes(1);
  });
});

describe('existing subscription', () => {
  it('refresh() reports it; enable() re-registers it without subscribing again', async () => {
    const existing = fakeSubscription();
    const { controller, pushManager, api, requestPermission } = setup({ permission: 'granted', existing });
    await controller.refresh();
    expect(controller.getState()).toMatchObject({ subscribed: true, permission: 'granted', loading: false });

    expect((await controller.enable()).ok).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(api.registerSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT }));
  });

  it('a browser that does not report its key is trusted', async () => {
    const existing = fakeSubscription({ key: null });
    const { controller, pushManager } = setup({ permission: 'granted', existing });
    expect((await controller.enable()).ok).toBe(true);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('one made with another VAPID key is replaced', async () => {
    const stale = fakeSubscription({ key: OTHER_KEY_BYTES, endpoint: 'https://fcm.googleapis.com/fcm/send/old' });
    const { controller, pushManager, api } = setup({ permission: 'granted', existing: stale });
    expect((await controller.enable()).ok).toBe(true);
    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(api.registerSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT }));
  });
});

describe('timezone persistence', () => {
  it('saves the browser IANA zone with nudges_enabled', async () => {
    const { controller, api } = setup({ permission: 'granted', timeZone: 'America/New_York' });
    await controller.enable();
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: true, timezone: 'America/New_York' });
  });

  it('with no zone from the browser, turns nudges on and leaves timezone alone', async () => {
    const { controller, api } = setup({ permission: 'granted', timeZone: 'throw-free-undefined' });
    expect(await controller.enable()).toEqual({ ok: true, timezoneSaved: false });
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: true });
  });

  it('a zone the database refuses (22023) still turns nudges on, without the zone', async () => {
    const saveSettings = vi.fn(async (_u: string, patch: { timezone?: string }) =>
      patch.timezone ? { error: { code: '22023', message: 'Unknown time zone' } } : { error: null }
    );
    const { controller, api } = setup({ permission: 'granted', timeZone: 'Etc/Unknown' }, { saveSettings });
    expect(await controller.enable()).toEqual({ ok: true, timezoneSaved: false });
    expect(api.saveSettings.mock.calls).toEqual([
      [USER_ID, { nudges_enabled: true, timezone: 'Etc/Unknown' }],
      [USER_ID, { nudges_enabled: true }]
    ]);
  });

  it('settings that cannot be saved at all report settings-failed (device stays registered)', async () => {
    const { controller, api } = setup({ permission: 'granted' }, { saveSettings: async () => ({ error: { message: 'offline' } }) });
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'settings-failed' }) });
    expect(api.registerSubscription).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ subscribed: true, loading: false, error: { code: 'settings-failed' } });
  });
});

describe('subscription and server failures', () => {
  it('no service worker (e.g. a dev build): service-worker-unavailable, nothing else', async () => {
    const { controller, pushManager, api } = setup({ permission: 'granted', registration: 'none' });
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState().error?.code).toBe('service-worker-unavailable');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    noServerCalls(api);
  });

  it('a worker that never activates times out instead of hanging', async () => {
    const { controller } = setup({ permission: 'granted', registration: 'installing-never' });
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState().error?.code).toBe('service-worker-unavailable');
  });

  it('the push service refusing: subscribe-failed, not subscribed, no server call', async () => {
    const { controller, api } = setup({ permission: 'granted', subscribeResult: 'reject' });
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'subscribe-failed' }) });
    expect(controller.getState()).toMatchObject({ subscribed: false, loading: false });
    noServerCalls(api);
  });

  it('a malformed subscription is never sent to the server', async () => {
    const { controller, api } = setup({ permission: 'granted', subscribeResult: fakeSubscription({ p256dh: 'bad' }) });
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState().error?.code).toBe('subscribe-failed');
    noServerCalls(api);
  });

  it('the RPC returning an error: register-failed, and nudges are NOT switched on', async () => {
    const { controller, api } = setup({ permission: 'granted' }, { registerSubscription: async () => ({ error: { code: '42501' } }) });
    const result = await controller.enable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'register-failed' }) });
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ subscribed: true, error: { code: 'register-failed' } });
  });

  it('the RPC throwing (network): register-failed', async () => {
    const { controller, api } = setup({ permission: 'granted' }, { registerSubscription: async () => { throw new TypeError('Failed to fetch'); } });
    expect((await controller.enable()).ok).toBe(false);
    expect(controller.getState().error?.code).toBe('register-failed');
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it('after a failure, trying again works and clears the error', async () => {
    let fail = true;
    const { controller } = setup({ permission: 'granted' }, { registerSubscription: async () => ({ error: fail ? { code: 'x' } : null }) });
    await controller.enable();
    expect(controller.getState().error).not.toBeNull();
    fail = false;
    expect((await controller.enable()).ok).toBe(true);
    expect(controller.getState().error).toBeNull();
  });
});

describe('disable', () => {
  it('turns nudges off account-wide first, then removes and unsubscribes this browser', async () => {
    const existing = fakeSubscription();
    const { controller, api, log } = setup({ permission: 'granted', existing });
    expect(await controller.disable()).toEqual({ ok: true, timezoneSaved: false });
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: false });
    expect(api.removeSubscription).toHaveBeenCalledWith(USER_ID, ENDPOINT);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(log.indexOf('saveSettings')).toBeLessThan(log.indexOf('removeSubscription'));
    expect(controller.getState()).toMatchObject({ subscribed: false, loading: false, error: null });
  });

  it('never prompts', async () => {
    const { controller, requestPermission } = setup({ permission: 'default' });
    await controller.disable();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('if the setting cannot be saved, reports disable-failed and keeps the subscription', async () => {
    const existing = fakeSubscription();
    const { controller, api } = setup({ permission: 'granted', existing }, { saveSettings: async () => ({ error: { message: 'offline' } }) });
    const result = await controller.disable();
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'disable-failed' }) });
    expect(api.removeSubscription).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });

  it('a failed device removal does not undo nudges being off', async () => {
    const existing = fakeSubscription();
    const { controller } = setup({ permission: 'granted', existing }, { removeSubscription: async () => { throw new Error('offline'); } });
    expect((await controller.disable()).ok).toBe(true);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
