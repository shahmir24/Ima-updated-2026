/**
 * Gentle Nudges — this browser's Web Push subscription, for a signed-in user.
 *
 * Plain TypeScript with no React and no Supabase import: the browser and the
 * server are both handed in, so every path can be tested. The hook
 * (hooks/use-gentle-nudges-push.ts) wires in the real ones, and only ever for
 * a signed-in user — a controller cannot be created without a user id, so a
 * guest has nothing to call.
 *
 * Nothing here runs by itself. Creating a controller and refresh() only READ
 * (support, Notification.permission, any existing subscription). Permission
 * is requested, and a subscription made, only inside enable(), which the
 * Settings screen calls from a click.
 *
 * enable() and the user gesture — the iPhone/Safari rule
 * ------------------------------------------------------
 * Safari only shows the permission prompt if Notification.requestPermission()
 * is called while the click is still being handled. So enable() is written to
 * reach requestPermission() SYNCHRONOUSLY: every check before it is
 * synchronous, and the first `await` comes after it. The caller must call
 * enable() directly in the click handler — not after its own await, a
 * setTimeout, or a promise.then.
 */

export type NudgePermission = NotificationPermission | 'unsupported';

export type NudgePushErrorCode =
  /** Push, Notifications or Service Workers are missing (or not a secure context). */
  | 'unsupported'
  /** iPhone/iPad Safari: push only works once iMA is added to the Home Screen. */
  | 'install-required'
  /** VITE_VAPID_PUBLIC_KEY is missing or is not a valid P-256 public key. */
  | 'not-configured'
  /** The user (or the browser) has blocked notifications for iMA. */
  | 'permission-denied'
  /** The prompt was closed without an answer. It can be asked again later. */
  | 'permission-dismissed'
  /** No active iMA service worker (e.g. a development build, or it failed to install). */
  | 'service-worker-unavailable'
  /** The browser or its push service refused to create a subscription. */
  | 'subscribe-failed'
  /** The server did not store the subscription. */
  | 'register-failed'
  /** The subscription is stored but the nudge setting was not saved. */
  | 'settings-failed'
  /** Turning nudges off failed. */
  | 'disable-failed';

export interface NudgePushError {
  code: NudgePushErrorCode;
  message: string;
}

export interface NudgePushState {
  /** Push, Notifications and Service Workers all exist here, in a secure context. */
  supported: boolean;
  /** iPhone/iPad Safari outside the installed app: supported only after "Add to Home Screen". */
  installRequired: boolean;
  /** A valid VAPID public key is built in. Without it nothing can subscribe. */
  configured: boolean;
  /** Notification.permission, or 'unsupported'. */
  permission: NudgePermission;
  /** This browser holds a push subscription for iMA. null until first checked. */
  subscribed: boolean | null;
  /** Reading the current status, or enabling/disabling. */
  loading: boolean;
  /** The last enable/disable/refresh failure; cleared when the next one starts. */
  error: NudgePushError | null;
}

export type NudgePushResult =
  | { ok: true; timezoneSaved: boolean }
  | { ok: false; error: NudgePushError };

/** A PushSubscription reduced to what the server stores. */
export interface NudgeSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface NudgeSettingsPatch {
  nudges_enabled: boolean;
  timezone?: string;
}

/** The server side. Every method resolves; failures come back as `error`. */
export interface NudgePushApi {
  registerSubscription(record: NudgeSubscriptionRecord): Promise<{ error: unknown }>;
  removeSubscription(userId: string, endpoint: string): Promise<{ error: unknown }>;
  saveSettings(userId: string, patch: NudgeSettingsPatch): Promise<{ error: unknown }>;
}

/** The browser side. Defaults to the real globals; tests pass fakes. */
export interface NudgePushEnvironment {
  navigator?: {
    userAgent?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    serviceWorker?: {
      getRegistration(): Promise<PushRegistrationLike | undefined>;
      ready: Promise<PushRegistrationLike>;
    };
  };
  Notification?: {
    permission: NotificationPermission;
    requestPermission(callback?: (permission: NotificationPermission) => void): Promise<NotificationPermission> | void;
  };
  hasPushManager?: boolean;
  isSecureContext?: boolean;
  isStandalone?: () => boolean;
  timeZone?: () => string | undefined;
  /** How long to wait for an installing worker to activate. */
  serviceWorkerTimeoutMs?: number;
}

export interface PushRegistrationLike {
  active?: unknown;
  pushManager: {
    getSubscription(): Promise<PushSubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<PushSubscriptionLike>;
  };
}

export interface PushSubscriptionLike {
  endpoint: string;
  options?: { applicationServerKey?: ArrayBuffer | null };
  toJSON(): { endpoint?: string; keys?: Record<string, string | undefined> };
  unsubscribe(): Promise<boolean>;
}

export interface NudgePushControllerOptions {
  userId: string;
  vapidPublicKey: string | undefined;
  api: NudgePushApi;
  environment?: NudgePushEnvironment;
}

export interface NudgePushController {
  getState(): NudgePushState;
  subscribe(listener: () => void): () => void;
  /** Re-reads support, permission and this browser's subscription. Never prompts. */
  refresh(): Promise<void>;
  /**
   * Turns nudges on for this account and this browser. CALL IT DIRECTLY FROM
   * A CLICK/TAP HANDLER: it requests notification permission synchronously,
   * before its first await (see the note at the top of this file).
   */
  enable(): Promise<NudgePushResult>;
  /** Turns nudges off for the account and removes this browser's subscription. */
  disable(): Promise<NudgePushResult>;
}

const MESSAGES: Record<NudgePushErrorCode, string> = {
  unsupported: "This browser can't show iMA notifications.",
  'install-required': 'On iPhone and iPad, add iMA to your Home Screen first, then turn nudges on from there.',
  'not-configured': "Nudges aren't available right now.",
  'permission-denied': 'Notifications are blocked for iMA. You can allow them in your browser or device settings.',
  'permission-dismissed': 'Notifications were not allowed. You can try again whenever you like.',
  'service-worker-unavailable': "iMA couldn't finish setting up notifications here. Please reload and try again.",
  'subscribe-failed': "Your browser couldn't set up notifications. Please try again.",
  'register-failed': "We couldn't save this device. Please try again.",
  'settings-failed': "We couldn't save your nudge setting. Please try again.",
  'disable-failed': "We couldn't turn nudges off. Please try again."
};

const errorOf = (result: NudgePushResult): NudgePushError | null => ('error' in result ? result.error : null);

const failure = (code: NudgePushErrorCode): { ok: false; error: NudgePushError } => ({
  ok: false,
  error: { code, message: MESSAGES[code] }
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The VAPID public key as the bytes pushManager.subscribe() wants: an
 * uncompressed P-256 point (65 bytes, first byte 0x04), given as base64url.
 * Anything else — missing, blank, wrong alphabet, wrong length, not a point —
 * is null, and nudges report 'not-configured' instead of throwing.
 */
export function decodeVapidPublicKey(key: string | undefined | null): Uint8Array | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim().replace(/=+$/, '');
  if (!/^[A-Za-z0-9_-]{87}$/.test(trimmed)) return null;
  let binary: string;
  try {
    binary = atob(trimmed.replace(/-/g, '+').replace(/_/g, '/') + '=');
  } catch {
    return null;
  }
  if (binary.length !== 65 || binary.charCodeAt(0) !== 0x04) return null;
  const bytes = new Uint8Array(65);
  for (let i = 0; i < 65; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Same shape rules as the push_subscriptions table, so a bad record never leaves the browser. */
export function toSubscriptionRecord(
  subscription: PushSubscriptionLike,
  userAgent: string | undefined
): NudgeSubscriptionRecord | null {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2048) return null;
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(p256dh)) return null;
  if (typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22,64}$/.test(auth)) return null;
  const agent = typeof userAgent === 'string' && userAgent.trim() ? userAgent.slice(0, 512) : null;
  return { endpoint, p256dh, auth, userAgent: agent };
}

function sameKey(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  // A browser that does not report the key is trusted to hold the right one.
  if (!existing) return true;
  const bytes = new Uint8Array(existing);
  return bytes.length === wanted.length && bytes.every((byte, i) => byte === wanted[i]);
}

function isIosDevice(nav: NudgePushEnvironment['navigator']): boolean {
  const ua = nav?.userAgent ?? '';
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
}

function realEnvironment(): NudgePushEnvironment {
  const g = globalThis as typeof globalThis & { Notification?: NudgePushEnvironment['Notification'] };
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as unknown as NudgePushEnvironment['navigator']);
  return {
    navigator: nav,
    Notification: typeof g.Notification === 'undefined' ? undefined : g.Notification,
    hasPushManager: typeof (g as { PushManager?: unknown }).PushManager !== 'undefined',
    isSecureContext: typeof window === 'undefined' ? false : window.isSecureContext,
    isStandalone: () =>
      (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
      (nav as { standalone?: boolean } | undefined)?.standalone === true,
    timeZone: () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return undefined;
      }
    }
  };
}

/**
 * Notification.requestPermission(), called synchronously. Older Safari only
 * takes a callback and returns nothing; newer browsers return a promise. Both
 * are covered, and a throw counts as "no answer".
 */
function requestPermissionNow(notification: NonNullable<NudgePushEnvironment['Notification']>): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    try {
      const returned = notification.requestPermission(resolve);
      if (returned && typeof returned.then === 'function') returned.then(resolve, () => resolve('default'));
    } catch {
      resolve('default');
    }
  });
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function createNudgePushController(options: NudgePushControllerOptions): NudgePushController {
  if (!options.userId) throw new Error('Gentle nudges need a signed-in user.');

  const env = options.environment ?? realEnvironment();
  const { userId, api } = options;
  const vapidKey = decodeVapidPublicKey(options.vapidPublicKey);
  const nav = env.navigator;
  const serviceWorker = nav?.serviceWorker;
  const notification = env.Notification;

  const supported = !!(env.isSecureContext && serviceWorker && env.hasPushManager && notification);
  const installRequired = !supported && isIosDevice(nav) && !(env.isStandalone?.() ?? false);

  const listeners = new Set<() => void>();
  let state: NudgePushState = {
    supported,
    installRequired,
    configured: vapidKey !== null,
    permission: notification ? notification.permission : 'unsupported',
    subscribed: supported ? null : false,
    loading: false,
    error: null
  };
  let inFlight: Promise<NudgePushResult> | null = null;

  const set = (patch: Partial<NudgePushState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const readPermission = (): NudgePermission => (notification ? notification.permission : 'unsupported');
  const unsupportedError = () => failure(installRequired ? 'install-required' : 'unsupported');

  /** The active registration, waiting briefly for one that is still installing. */
  async function activeRegistration(): Promise<PushRegistrationLike | null> {
    if (!serviceWorker) return null;
    let registration: PushRegistrationLike | undefined;
    try {
      registration = await serviceWorker.getRegistration();
    } catch {
      return null;
    }
    if (!registration) return null;
    if (registration.active) return registration;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), env.serviceWorkerTimeoutMs ?? 10_000));
    return Promise.race([serviceWorker.ready.catch(() => null), timeout]);
  }

  async function currentSubscription(): Promise<PushSubscriptionLike | null> {
    if (!serviceWorker) return null;
    const registration = await serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
  }

  async function refresh(): Promise<void> {
    if (!supported) {
      set({ permission: readPermission(), subscribed: false });
      return;
    }
    if (inFlight) return;
    set({ loading: true, permission: readPermission() });
    try {
      set({ subscribed: (await currentSubscription()) !== null, loading: false });
    } catch {
      set({ subscribed: null, loading: false });
    }
  }

  async function finishEnable(permissionAnswer: Promise<NotificationPermission>, key: Uint8Array): Promise<NudgePushResult> {
    const permission = await permissionAnswer;
    set({ permission });
    if (permission === 'denied') return failure('permission-denied');
    if (permission !== 'granted') return failure('permission-dismissed');

    const registration = await activeRegistration();
    if (!registration) return failure('service-worker-unavailable');

    let subscription: PushSubscriptionLike;
    try {
      const existing = await registration.pushManager.getSubscription();
      if (existing && sameKey(existing.options?.applicationServerKey, key)) {
        subscription = existing;
      } else {
        // A subscription made with another VAPID key can never receive our
        // pushes; replace it.
        if (existing) await existing.unsubscribe().catch(() => false);
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
    } catch {
      set({ subscribed: false });
      return failure('subscribe-failed');
    }
    set({ subscribed: true });

    const record = toSubscriptionRecord(subscription, nav?.userAgent);
    if (!record) return failure('subscribe-failed');

    // The device first, then the switch: the server never has nudges on for
    // a user whose device it has not stored. A failure leaves the browser
    // subscribed, so trying again simply re-registers the same subscription.
    try {
      const { error } = await api.registerSubscription(record);
      if (error) return failure('register-failed');
    } catch {
      return failure('register-failed');
    }

    const zone = env.timeZone?.();
    const timezone = typeof zone === 'string' && zone.trim() ? zone.trim() : undefined;
    try {
      if (timezone) {
        const { error } = await api.saveSettings(userId, { nudges_enabled: true, timezone });
        if (!error) return { ok: true, timezoneSaved: true };
        // Most likely a zone name this database does not know. Nudges still
        // go on, at the timezone already saved (UTC unless changed).
      }
      const { error } = await api.saveSettings(userId, { nudges_enabled: true });
      if (error) return failure('settings-failed');
      return { ok: true, timezoneSaved: false };
    } catch {
      return failure('settings-failed');
    }
  }

  function enable(): Promise<NudgePushResult> {
    if (inFlight) return inFlight;

    // Everything up to requestPermission() is synchronous. Keep it that way.
    let immediate: NudgePushResult | null = null;
    if (!supported || !notification) immediate = unsupportedError();
    else if (!vapidKey) immediate = failure('not-configured');
    else if (notification.permission === 'denied') immediate = failure('permission-denied');
    if (immediate) {
      set({ permission: readPermission(), error: errorOf(immediate) });
      return Promise.resolve(immediate);
    }

    const permissionAnswer: Promise<NotificationPermission> =
      notification!.permission === 'granted' ? Promise.resolve('granted') : requestPermissionNow(notification!);

    set({ loading: true, error: null });
    inFlight = finishEnable(permissionAnswer, vapidKey!)
      .catch(() => failure('subscribe-failed'))
      .then((result) => {
        inFlight = null;
        set({ loading: false, error: errorOf(result) });
        return result;
      });
    return inFlight;
  }

  async function runDisable(): Promise<NudgePushResult> {
    // Account-wide off first: once saved, the sender skips this user on every
    // device, whatever happens to this browser's subscription below.
    try {
      const { error } = await api.saveSettings(userId, { nudges_enabled: false });
      if (error) return failure('disable-failed');
    } catch {
      return failure('disable-failed');
    }

    // Then forget this browser. Best effort: nudges are already off.
    if (supported) {
      try {
        const subscription = await currentSubscription();
        if (subscription) {
          await api.removeSubscription(userId, subscription.endpoint).catch(() => undefined);
          await subscription.unsubscribe().catch(() => false);
        }
        set({ subscribed: false });
      } catch {
        // Leave `subscribed` as it was; a refresh() will re-read it.
      }
    }
    return { ok: true, timezoneSaved: false };
  }

  function disable(): Promise<NudgePushResult> {
    if (inFlight) return inFlight;
    set({ loading: true, error: null });
    inFlight = runDisable()
      .catch(() => failure('disable-failed'))
      .then((result) => {
        inFlight = null;
        set({ loading: false, error: errorOf(result) });
        return result;
      });
    return inFlight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    enable,
    disable
  };
}
