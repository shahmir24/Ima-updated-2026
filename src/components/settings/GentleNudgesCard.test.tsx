import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import type { UserSettingsRow } from '@/hooks/use-user-settings';
import type { NudgePushEnvironment } from '@/lib/push/gentle-nudges-push';
import { GentleNudgesCard } from './GentleNudgesCard';

// The real Supabase-backed API must never be reached from these tests.
const realApi = vi.hoisted(() => ({ used: false }));
vi.mock('@/lib/push/gentle-nudges-push-api', () => ({
  supabaseNudgePushApi: new Proxy({}, { get: () => { realApi.used = true; return async () => ({ error: null }); } })
}));

// Server rendering cannot click, so the Switch and Input record their props and
// the tests call the handlers exactly as Radix does: synchronously, in the tap.
type ControlProps = { id?: string; checked?: boolean; disabled?: boolean; value?: string; onCheckedChange?: (on: boolean) => void; onChange?: (e: { target: { value: string } }) => void };
const controls = vi.hoisted(() => new Map<string, ControlProps>());
vi.mock('@/components/ui/switch', () => ({
  Switch: (props: ControlProps) => {
    controls.set(props.id ?? '?', props);
    return null;
  }
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: ControlProps) => {
    controls.set(props.id ?? '?', props);
    return null;
  }
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { id: USER_ID } as User;
const VAPID_KEY = Buffer.from(Uint8Array.from([0x04, ...new Array(64).fill(7)])).toString('base64url');

const authValue = (signedIn: boolean): AuthContextValue => ({
  session: signedIn ? ({ user } as Session) : null,
  user: signedIn ? user : null,
  onboardingCompleted: signedIn ? true : null,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

function browser(overrides: Partial<NudgePushEnvironment> = {}, permission: NotificationPermission = 'default') {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }),
    unsubscribe: vi.fn(async () => true)
  };
  const pushManager = { getSubscription: vi.fn(async () => subscription as typeof subscription | null), subscribe: vi.fn(async () => subscription) };
  pushManager.getSubscription.mockResolvedValue(null);
  const registration = { active: {}, pushManager };
  const serviceWorker = { getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) };
  const gesture = { inside: false, promptedInsideTap: null as boolean | null };
  const requestPermission = vi.fn(() => {
    gesture.promptedInsideTap = gesture.inside;
    return Promise.resolve('granted' as NotificationPermission);
  });
  const environment: NudgePushEnvironment = {
    navigator: { userAgent: 'Test', serviceWorker },
    Notification: { permission, requestPermission },
    hasPushManager: true,
    isSecureContext: true,
    timeZone: () => 'Europe/London',
    ...overrides
  };
  return { environment, requestPermission, pushManager, serviceWorker, subscription, gesture };
}

const serverApi = () => ({
  registerSubscription: vi.fn(async () => ({ error: null as unknown })),
  removeSubscription: vi.fn(async () => ({ error: null as unknown })),
  saveSettings: vi.fn(async () => ({ error: null as unknown }))
});

const settingsRow = (patch: Partial<UserSettingsRow> = {}) =>
  ({ nudges_enabled: false, nudge_time: '09:00:00', nudge_show_task_titles: true, timezone: 'UTC', ...patch }) as UserSettingsRow;

function render(options: {
  signedIn?: boolean;
  environment: NudgePushEnvironment;
  api: ReturnType<typeof serverApi>;
  settings?: UserSettingsRow | null;
  vapidPublicKey?: string;
}) {
  controls.clear();
  const save = { saveNow: vi.fn(), saveSoon: vi.fn() };
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={authValue(options.signedIn ?? true)}>
        <GentleNudgesCard
          settings={options.settings === undefined ? settingsRow() : options.settings}
          save={save}
          pushOptions={{ environment: options.environment, api: options.api, vapidPublicKey: options.vapidPublicKey ?? VAPID_KEY }}
        />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const control = (id: string) => {
    const props = controls.get(id);
    if (!props) throw new Error(`no control #${id}`);
    return props;
  };
  return { html, save, control };
}

/** Tap a switch the way Radix does: onCheckedChange runs inside the click. */
function tap(props: ControlProps, on: boolean, gesture?: { inside: boolean }) {
  if (gesture) gesture.inside = true;
  try {
    props.onCheckedChange?.(on);
  } finally {
    if (gesture) gesture.inside = false;
  }
}

afterEach(() => {
  expect(realApi.used).toBe(false);
});

describe('GentleNudgesCard — rendering', () => {
  it('shows the section, explanation, time and privacy controls; off by default', () => {
    const b = browser();
    const api = serverApi();
    const { html, control } = render({ environment: b.environment, api });

    expect(html).toContain('Gentle nudges');
    expect(html).toContain('iMA can send you a gentle reminder about what deserves your attention today.');
    expect(html).toContain('Daily nudge time');
    expect(html).toContain('Show task names in notifications');
    expect(control('gentle-nudges').checked).toBe(false);
    expect(control('nudge-time').value).toBe('09:00');
    expect(control('nudge-show-titles').checked).toBe(true);
  });

  it('rendering never asks for permission, subscribes or writes anything', () => {
    const b = browser();
    const api = serverApi();
    const { save } = render({ environment: b.environment, api, settings: settingsRow({ nudges_enabled: true }) });
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(Object.values(api).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(save.saveNow).not.toHaveBeenCalled();
    expect(save.saveSoon).not.toHaveBeenCalled();
  });

  it('a saved "on" does not show on until this device is confirmed', () => {
    const b = browser({}, 'granted');
    const { control } = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ nudges_enabled: true }) });
    expect(control('gentle-nudges').checked).toBe(false);
  });

  it('shows saved preferences', () => {
    const b = browser();
    const { control } = render({
      environment: b.environment,
      api: serverApi(),
      settings: settingsRow({ nudge_time: '20:45:00', nudge_show_task_titles: false })
    });
    expect(control('nudge-time').value).toBe('20:45');
    expect(control('nudge-show-titles').checked).toBe(false);
  });

  it('signed out (Guest Mode): everything disabled, asks to sign in, touches nothing', () => {
    const b = browser();
    const api = serverApi();
    const { html, control } = render({ signedIn: false, environment: b.environment, api, settings: null });
    expect(html).toContain('Sign in to turn on gentle nudges');
    expect(control('gentle-nudges')).toMatchObject({ checked: false, disabled: true });
    expect(control('nudge-time').disabled).toBe(true);
    expect(control('nudge-show-titles').disabled).toBe(true);
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(Object.values(api).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ['iPhone/iPad Safari outside the Home Screen app', { hasPushManager: false, navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' }, isStandalone: () => false }, undefined, 'Add to Home Screen'],
    ['unsupported browser', { hasPushManager: false }, undefined, 'can&#x27;t show notifications from iMA'],
    ['missing configuration', {}, '', 'aren&#x27;t available right now'],
  ] as const)('%s: switch disabled with a human message', (_label, overrides, vapid, text) => {
    const b = browser(overrides as Partial<NudgePushEnvironment>);
    const { html, control } = render({ environment: b.environment, api: serverApi(), vapidPublicKey: vapid });
    expect(control('gentle-nudges')).toMatchObject({ checked: false, disabled: true });
    expect(html).toContain(text);
    expect(html).not.toMatch(/vapid|VITE_|service worker|not-configured|install-required/i);
  });

  it('permission blocked: switch disabled, explains how to allow', () => {
    const b = browser({}, 'denied');
    const { html, control } = render({ environment: b.environment, api: serverApi() });
    expect(control('gentle-nudges').disabled).toBe(true);
    expect(html).toContain('Notifications are blocked for iMA');
  });
});

describe('GentleNudgesCard — turning nudges on (Safari user-gesture rule)', () => {
  it('asks for permission synchronously, inside the tap, before any await', () => {
    const b = browser();
    const { control } = render({ environment: b.environment, api: serverApi() });

    tap(control('gentle-nudges'), true, b.gesture);

    expect(b.requestPermission).toHaveBeenCalledTimes(1);
    expect(b.gesture.promptedInsideTap).toBe(true);
  });

  it('runs the existing enable flow: subscribe, register device, then save the account setting', async () => {
    const b = browser();
    const api = serverApi();
    const { control, save } = render({ environment: b.environment, api });

    tap(control('gentle-nudges'), true);

    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalled());
    expect(b.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(api.registerSubscription).toHaveBeenCalledTimes(1);
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: true, timezone: 'Europe/London' });
    // nudges_enabled is never written through the generic settings save.
    expect(save.saveNow).not.toHaveBeenCalled();
    expect(save.saveSoon).not.toHaveBeenCalled();
  });

  it('a dismissed prompt saves nothing', async () => {
    const b = browser();
    b.requestPermission.mockImplementation(() => Promise.resolve('default'));
    const api = serverApi();
    const { control } = render({ environment: b.environment, api });

    tap(control('gentle-nudges'), true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(Object.values(api).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('the source keeps enable() as the first thing the tap handler does', () => {
    const source = readFileSync(new URL('./GentleNudgesCard.tsx', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('const handleToggle'));
    const body = handler.slice(handler.indexOf('// FIRST'), handler.indexOf('nudges.enable()'));
    // Only comments between the "on" branch and the enable() call.
    expect(body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'))).toEqual(['const enabling =']);
    const code = handler.slice(0, handler.indexOf('nudges.enable()')).replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bawait\b|\basync\b|setTimeout|\.then\(/);
  });
});

describe('GentleNudgesCard — turning nudges off', () => {
  it('runs the existing disable flow and never prompts', async () => {
    const b = browser({}, 'granted');
    b.pushManager.getSubscription.mockResolvedValue(b.subscription);
    const api = serverApi();
    const { control } = render({ environment: b.environment, api, settings: settingsRow({ nudges_enabled: true }) });

    tap(control('gentle-nudges'), false);

    await vi.waitFor(() => expect(b.subscription.unsubscribe).toHaveBeenCalled());
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: false });
    expect(api.removeSubscription).toHaveBeenCalledWith(USER_ID, b.subscription.endpoint);
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});

describe('GentleNudgesCard — preferences persist through user_settings', () => {
  it('the daily time saves as HH:MM once complete', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });

    control('nudge-time').onChange?.({ target: { value: '' } });
    expect(save.saveSoon).not.toHaveBeenCalled();

    control('nudge-time').onChange?.({ target: { value: '18:30' } });
    expect(save.saveSoon).toHaveBeenCalledWith({ nudge_time: '18:30' });
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it('the task-name privacy switch saves immediately', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });

    tap(control('nudge-show-titles'), false);
    expect(save.saveNow).toHaveBeenCalledWith({ nudge_show_task_titles: false });
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});
