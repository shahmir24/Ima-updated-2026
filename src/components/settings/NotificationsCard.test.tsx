import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import type { UserSettingsRow } from '@/hooks/use-user-settings';
import type { NudgePushEnvironment } from '@/lib/push/gentle-nudges-push';
import { NotificationsCard } from './NotificationsCard';

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

/** The server, with user_settings' two switches held where a fresh read finds them. */
const serverApi = (flags = { nudges_enabled: false, focus_alerts_enabled: false }) => {
  const server = { ...flags };
  return {
    server,
    registerSubscription: vi.fn(async () => ({ error: null as unknown })),
    removeSubscription: vi.fn(async () => ({ error: null as unknown })),
    saveSettings: vi.fn(async (_user: string, patch: Record<string, unknown>) => {
      const { timezone: _zone, ...switches } = patch;
      Object.assign(server, switches);
      return { error: null as unknown };
    }),
    readFeatureFlags: vi.fn(async () => ({ flags: { ...server } }))
  };
};
const apiCalls = (api: ReturnType<typeof serverApi>) =>
  [api.registerSubscription, api.removeSubscription, api.saveSettings, api.readFeatureFlags].reduce((n, fn) => n + fn.mock.calls.length, 0);

const settingsRow = (patch: Partial<UserSettingsRow> = {}) =>
  ({
    nudges_enabled: false,
    focus_alerts_enabled: false,
    nudge_time: '09:00:00',
    nudge_show_task_titles: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '07:00:00',
    timezone: 'UTC',
    ...patch
  }) as UserSettingsRow;

function render(options: {
  signedIn?: boolean;
  environment: NudgePushEnvironment;
  api: ReturnType<typeof serverApi>;
  settings?: UserSettingsRow | null;
  vapidPublicKey?: string;
  deviceTimeZone?: string | null;
}) {
  controls.clear();
  const save = { saveNow: vi.fn(), saveSoon: vi.fn() };
  const saveTimezone = vi.fn();
  const html = renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={authValue(options.signedIn ?? true)}>
        <NotificationsCard
          settings={options.settings === undefined ? settingsRow() : options.settings}
          save={save}
          saveTimezone={saveTimezone}
          deviceTimeZone={options.deviceTimeZone === undefined ? 'Europe/London' : options.deviceTimeZone}
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
  return { html, save, saveTimezone, control };
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

describe('NotificationsCard — rendering', () => {
  it('one card with every section, everything off by default', () => {
    const b = browser();
    const api = serverApi();
    const { html, control } = render({ environment: b.environment, api });

    const headings = [...html.matchAll(/<h4[^>]*>(.*?)<\/h4>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ''));
    expect(headings).toEqual(['This device', 'Focus alerts', 'Gentle Nudges', 'Quiet hours', 'Privacy', 'Time zone']);
    const sections = headings.map((t) => html.indexOf(t));
    expect(sections.every((i) => i >= 0)).toBe(true);
    expect([...sections].sort((a, z) => a - z)).toEqual(sections);
    expect(html).toContain('iMA can send you a gentle reminder about what deserves your attention today.');
    expect(html).toContain('Daily nudge time');
    expect(html).toContain('One nudge a day, at most');
    expect(html).toContain('Show task names in notifications');
    expect(control('focus-alerts').checked).toBe(false);
    expect(control('gentle-nudges').checked).toBe(false);
    expect(control('quiet-hours').checked).toBe(false);
    expect(control('quiet-hours-start').value).toBe('22:00');
    expect(control('quiet-hours-end').value).toBe('07:00');
    expect(control('nudge-time').value).toBe('09:00');
    expect(control('nudge-show-titles').checked).toBe(false);
  });

  it('a missing privacy value shows task names OFF', () => {
    const b = browser();
    const { control } = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ nudge_show_task_titles: undefined }) });
    expect(control('nudge-show-titles').checked).toBe(false);
  });

  it('an existing account that kept task names on still sees them on', () => {
    const b = browser();
    const { control } = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ nudge_show_task_titles: true }) });
    expect(control('nudge-show-titles').checked).toBe(true);
  });

  it('Focus alerts: explains the device rule and never claims delivery works yet', () => {
    const b = browser({}, 'granted');
    b.pushManager.getSubscription.mockResolvedValue(b.subscription);
    const { html } = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ focus_alerts_enabled: true }) });
    expect(html).toContain('sent only to the device running the timer');
    // This device is still being checked on first render, so the coming-soon note shows;
    // once on here, the notice says the same (see notifications-view.test.ts).
    expect(html).toContain('still setting up Focus alert delivery');
    expect(html).not.toMatch(/Focus alerts (are|will be) (sent|delivered)|you&#x27;ll get Focus alerts/i);
  });

  it('Focus alerts: the coming-soon disclaimer is always in the card, whatever the switch or notice shows', () => {
    const b = browser();
    for (const settings of [settingsRow(), settingsRow({ focus_alerts_enabled: true })]) {
      const { html } = render({ environment: b.environment, api: serverApi(), settings });
      expect(html).toContain('Coming soon: we’re still setting up Focus alert delivery');
    }
    // Rendered unconditionally: not tied to the switch, the notice or an error.
    const source = readFileSync(new URL('./NotificationsCard.tsx', import.meta.url), 'utf8');
    const at = source.indexOf('Coming soon:');
    expect(source.slice(at - 160, at)).not.toMatch(/&&|\?\s*\(|focus\.(checked|notice)/);
  });

  it("settles both switches from the server's answer (accountAfter), not from what was asked", () => {
    const source = readFileSync(new URL('./NotificationsCard.tsx', import.meta.url), 'utf8');
    expect(source).toContain('setAccountOverride((current) => accountAfter(current, feature, on, result));');
    expect(source.match(/setAccountOverride\(/g)).toHaveLength(1);
  });

  it('quiet hours follow quietHoursChange: the switch shows only what it decided', () => {
    const source = readFileSync(new URL('./NotificationsCard.tsx', import.meta.url), 'utf8');
    expect(source).toContain('if (next.on !== undefined) setQuietOn(change.shownOn);');
    expect(source.match(/setQuietOn\(/g)).toHaveLength(1);
    expect(source).toContain("onCheckedChange={(checked) => saveQuietHours({ on: checked })}");
  });

  it('quiet hours: says they apply to nudges only, and what happens to a nudge inside them', () => {
    const b = browser();
    const { html } = render({ environment: b.environment, api: serverApi() });
    expect(html).toContain('Quiet hours apply to Gentle Nudges only');
    expect(html).toContain('within two hours of your nudge time');
    expect(html).toContain('Focus alerts aren’t held back');
  });

  it('shows the saved time zone, and when this device differs', () => {
    const b = browser();
    const same = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ timezone: 'Europe/London' }) });
    expect(same.html).toContain('Nudge times and quiet hours use Europe/London.');
    const differs = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ timezone: 'UTC' }), deviceTimeZone: 'Asia/Karachi' });
    expect(differs.html).toContain('This device is set to Asia/Karachi');
  });

  it('rendering never asks for permission, subscribes or writes anything', () => {
    const b = browser();
    const api = serverApi();
    const { save } = render({ environment: b.environment, api, settings: settingsRow({ nudges_enabled: true }) });
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(apiCalls(api) === 0).toBe(true);
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
    const quiet = render({
      environment: b.environment,
      api: serverApi(),
      settings: settingsRow({ quiet_hours_enabled: true, quiet_hours_start: '13:00:00', quiet_hours_end: '15:30:00' })
    });
    expect(quiet.control('quiet-hours').checked).toBe(true);
    expect(quiet.control('quiet-hours-start').value).toBe('13:00');
    expect(quiet.control('quiet-hours-end').value).toBe('15:30');
  });

  it('signed out (Guest Mode): everything disabled, asks to sign in, touches nothing', () => {
    const b = browser();
    const api = serverApi();
    const { html, control } = render({ signedIn: false, environment: b.environment, api, settings: null });
    expect(html).toContain('Sign in to turn on notifications');
    for (const id of ['focus-alerts', 'gentle-nudges']) expect(control(id)).toMatchObject({ checked: false, disabled: true });
    for (const id of ['nudge-time', 'nudge-show-titles', 'quiet-hours', 'quiet-hours-start', 'quiet-hours-end']) expect(control(id).disabled).toBe(true);
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(apiCalls(api) === 0).toBe(true);
  });

  it.each([
    ['iPhone/iPad Safari outside the Home Screen app', { hasPushManager: false, navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' }, isStandalone: () => false }, undefined, 'Add to Home Screen'],
    ['unsupported browser', { hasPushManager: false }, undefined, 'can&#x27;t show notifications from iMA'],
    ['missing configuration', {}, '', 'aren&#x27;t available right now'],
  ] as const)('%s: both switches disabled with a human message', (_label, overrides, vapid, text) => {
    const b = browser(overrides as Partial<NudgePushEnvironment>);
    const { html, control } = render({ environment: b.environment, api: serverApi(), vapidPublicKey: vapid });
    expect(control('gentle-nudges')).toMatchObject({ checked: false, disabled: true });
    expect(control('focus-alerts')).toMatchObject({ checked: false, disabled: true });
    expect(html).toContain(text);
    expect(html).not.toMatch(/vapid|VITE_|service worker|not-configured|install-required/i);
  });

  it('permission blocked: switch disabled, explains how to allow', () => {
    const b = browser({}, 'denied');
    const { html, control } = render({ environment: b.environment, api: serverApi() });
    expect(control('gentle-nudges').disabled).toBe(true);
    expect(control('focus-alerts').disabled).toBe(true);
    expect(html).toContain('Notifications are blocked for iMA');
  });
});

describe('NotificationsCard — turning nudges on (Safari user-gesture rule)', () => {
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
    expect(apiCalls(api) === 0).toBe(true);
  });

  it('Focus alerts: the same prompt inside the tap, then only focus_alerts_enabled is saved', async () => {
    const b = browser();
    const api = serverApi();
    const { control, save } = render({ environment: b.environment, api });

    tap(control('focus-alerts'), true, b.gesture);
    expect(b.gesture.promptedInsideTap).toBe(true);

    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalled());
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { focus_alerts_enabled: true, timezone: 'Europe/London' });
    expect(api.server).toEqual({ nudges_enabled: false, focus_alerts_enabled: true });
    expect(save.saveNow).not.toHaveBeenCalled();
  });

  it('the source keeps enable() as the first thing the tap handler does', () => {
    const source = readFileSync(new URL('./NotificationsCard.tsx', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('const handleToggle'));
    const body = handler.slice(handler.indexOf('// FIRST'), handler.indexOf('push.enable(feature)'));
    // Only comments between the "on" branch and the enable() call.
    expect(body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'))).toEqual(['const enabling =']);
    const code = handler.slice(0, handler.indexOf('push.enable(feature)')).replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bawait\b|\basync\b|setTimeout|\.then\(/);
    // Never subscribes on its own: enable() is reached only from the switch.
    expect(source.match(/push\.enable\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/useEffect/);
  });
});

describe('NotificationsCard — turning nudges off', () => {
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

  it('turning nudges off while Focus alerts are on keeps this device', async () => {
    const b = browser({}, 'granted');
    b.pushManager.getSubscription.mockResolvedValue(b.subscription);
    const api = serverApi({ nudges_enabled: true, focus_alerts_enabled: true });
    const { control } = render({ environment: b.environment, api, settings: settingsRow({ nudges_enabled: true, focus_alerts_enabled: true }) });

    tap(control('gentle-nudges'), false);

    await vi.waitFor(() => expect(api.readFeatureFlags).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.server).toEqual({ nudges_enabled: false, focus_alerts_enabled: true });
    expect(api.removeSubscription).not.toHaveBeenCalled();
    expect(b.subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('turning Focus alerts off with nudges already off removes this device', async () => {
    const b = browser({}, 'granted');
    b.pushManager.getSubscription.mockResolvedValue(b.subscription);
    const api = serverApi({ nudges_enabled: false, focus_alerts_enabled: true });
    const { control } = render({ environment: b.environment, api, settings: settingsRow({ focus_alerts_enabled: true }) });

    tap(control('focus-alerts'), false);

    await vi.waitFor(() => expect(b.subscription.unsubscribe).toHaveBeenCalled());
    expect(api.saveSettings).toHaveBeenCalledWith(USER_ID, { focus_alerts_enabled: false });
    expect(api.removeSubscription).toHaveBeenCalledWith(USER_ID, b.subscription.endpoint);
  });
});

describe('NotificationsCard — preferences persist through user_settings', () => {
  it('the daily time saves as HH:MM once complete', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });

    control('nudge-time').onChange?.({ target: { value: '' } });
    expect(save.saveSoon).not.toHaveBeenCalled();

    control('nudge-time').onChange?.({ target: { value: '18:30' } });
    expect(save.saveSoon).toHaveBeenCalledWith({ nudge_time: '18:30' });
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it('quiet hours: turning on saves the whole range; an overnight range is fine', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });
    tap(control('quiet-hours'), true);
    expect(save.saveNow).toHaveBeenCalledWith({ quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
  });

  it('quiet hours: a same-day range edited while on saves the whole range', () => {
    const b = browser();
    const { control, save } = render({
      environment: b.environment,
      api: serverApi(),
      settings: settingsRow({ quiet_hours_enabled: true, quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00' })
    });
    control('quiet-hours-start').onChange?.({ target: { value: '13:00' } });
    expect(save.saveSoon).toHaveBeenLastCalledWith({ quiet_hours_enabled: true, quiet_hours_start: '13:00', quiet_hours_end: '07:00' });
  });

  it('quiet hours: equal start and end are never saved while on', () => {
    const b = browser();
    const { control, save } = render({
      environment: b.environment,
      api: serverApi(),
      settings: settingsRow({ quiet_hours_enabled: true, quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00' })
    });
    control('quiet-hours-end').onChange?.({ target: { value: '22:00' } });
    expect(save.saveSoon).not.toHaveBeenCalled();
    expect(save.saveNow).not.toHaveBeenCalled();
  });

  it('quiet hours: equal start and end stored while off cannot be switched on as they are', () => {
    const b = browser();
    const { control, save } = render({
      environment: b.environment,
      api: serverApi(),
      settings: settingsRow({ quiet_hours_start: '09:00:00', quiet_hours_end: '09:00:00' })
    });
    tap(control('quiet-hours'), true);
    expect(save.saveNow).not.toHaveBeenCalled();
  });

  it('quiet hours: editing a time while off saves only that time', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });
    control('quiet-hours-start').onChange?.({ target: { value: '23:15' } });
    expect(save.saveSoon).toHaveBeenCalledWith({ quiet_hours_enabled: false, quiet_hours_start: '23:15' });
  });

  it('time zone: a failing time zone save never stops the preference being saved', () => {
    const b = browser();
    controls.clear();
    const save = { saveNow: vi.fn(), saveSoon: vi.fn() };
    const saveTimezone = vi.fn(() => {
      throw new Error('invalid time zone');
    });
    renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={authValue(true)}>
          <NotificationsCard
            settings={settingsRow({ timezone: 'UTC' })}
            save={save}
            saveTimezone={saveTimezone}
            deviceTimeZone="Mars/Olympus"
            pushOptions={{ environment: b.environment, api: serverApi(), vapidPublicKey: VAPID_KEY }}
          />
        </AuthContext.Provider>
      </QueryClientProvider>
    );
    expect(() => tap(controls.get('nudge-show-titles')!, true)).not.toThrow();
    expect(save.saveNow).toHaveBeenCalledWith({ nudge_show_task_titles: true });
    expect(saveTimezone).toHaveBeenCalledWith('Mars/Olympus');
  });

  it('time zone: saved separately with the first explicit preference save, only when it differs, only once', () => {
    const b = browser();
    const { control, saveTimezone } = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ timezone: 'UTC' }), deviceTimeZone: 'Asia/Karachi' });
    expect(saveTimezone).not.toHaveBeenCalled(); // never on render
    tap(control('nudge-show-titles'), true);
    tap(control('nudge-show-titles'), false);
    expect(saveTimezone).toHaveBeenCalledTimes(1);
    expect(saveTimezone).toHaveBeenCalledWith('Asia/Karachi');

    const same = render({ environment: b.environment, api: serverApi(), settings: settingsRow({ timezone: 'Asia/Karachi' }), deviceTimeZone: 'Asia/Karachi' });
    tap(same.control('quiet-hours'), true);
    expect(same.saveTimezone).not.toHaveBeenCalled();
  });

  it('the task-name privacy switch saves immediately', () => {
    const b = browser();
    const { control, save } = render({ environment: b.environment, api: serverApi() });

    tap(control('nudge-show-titles'), false);
    expect(save.saveNow).toHaveBeenCalledWith({ nudge_show_task_titles: false });
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});
