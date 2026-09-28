import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { GuestTaskStoreContext } from '@/contexts/guest-mode-context';
import { createGuestTaskStore } from '@/lib/guest/guest-task-store';
import type { NudgePushEnvironment } from '@/lib/push/gentle-nudges-push';
import { SIGNED_OUT_NUDGE_STATE, useGentleNudgesPush, type GentleNudgesPush } from './use-gentle-nudges-push';

// The real Supabase-backed API must never be reached from these tests.
const realApi = vi.hoisted(() => ({ used: false }));
vi.mock('@/lib/push/gentle-nudges-push-api', () => ({
  supabaseNudgePushApi: new Proxy({}, { get: () => { realApi.used = true; return async () => ({ error: null }); } })
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

function browser() {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }),
    unsubscribe: vi.fn(async () => true)
  };
  const pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) };
  const registration = { active: {}, pushManager };
  const serviceWorker = { getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) };
  const requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));
  const environment: NudgePushEnvironment = {
    navigator: { userAgent: 'Test', serviceWorker },
    Notification: { permission: 'default', requestPermission },
    hasPushManager: true,
    isSecureContext: true,
    timeZone: () => 'Europe/London'
  };
  return { environment, requestPermission, pushManager, serviceWorker };
}

const api = () => ({
  registerSubscription: vi.fn(async () => ({ error: null })),
  removeSubscription: vi.fn(async () => ({ error: null })),
  saveSettings: vi.fn(async () => ({ error: null }))
});

function render(options: { signedIn: boolean; guestStore?: boolean; environment: NudgePushEnvironment; api: ReturnType<typeof api>; queryClient?: QueryClient }) {
  let captured: GentleNudgesPush | undefined;
  const Probe = () => {
    captured = useGentleNudgesPush({ environment: options.environment, api: options.api, vapidPublicKey: VAPID_KEY });
    return null;
  };
  renderToString(
    <QueryClientProvider client={options.queryClient ?? new QueryClient()}>
      <AuthContext.Provider value={authValue(options.signedIn)}>
        <GuestTaskStoreContext.Provider value={options.guestStore ? createGuestTaskStore({ storage: () => null }) : null}>
          <Probe />
        </GuestTaskStoreContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return captured as GentleNudgesPush;
}

describe('useGentleNudgesPush — signed out / Guest Mode', () => {
  it.each([[false], [true]])('is inert (guest store offered: %s): no prompt, no worker, no server', async (guestStore) => {
    const b = browser();
    const serverApi = api();
    const nudges = render({ signedIn: false, guestStore, environment: b.environment, api: serverApi });

    expect(nudges.signedIn).toBe(false);
    expect({ ...nudges, enable: undefined, disable: undefined, refresh: undefined, signedIn: undefined }).toEqual({
      ...SIGNED_OUT_NUDGE_STATE,
      enable: undefined,
      disable: undefined,
      refresh: undefined,
      signedIn: undefined
    });

    const enabled = await nudges.enable();
    const disabled = await nudges.disable();
    await nudges.refresh();
    expect(enabled.ok).toBe(false);
    expect(disabled.ok).toBe(false);
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(b.serviceWorker.getRegistration).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(Object.values(serverApi).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(realApi.used).toBe(false);
  });
});

describe('useGentleNudgesPush — signed in', () => {
  it('rendering reads status only: never prompts or subscribes', () => {
    const b = browser();
    const serverApi = api();
    const nudges = render({ signedIn: true, environment: b.environment, api: serverApi });
    expect(nudges).toMatchObject({ signedIn: true, supported: true, configured: true, permission: 'default', loading: false, error: null });
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    expect(Object.values(serverApi).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('enable() prompts in the same synchronous turn, registers, and refreshes cached settings', async () => {
    const b = browser();
    const serverApi = api();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const nudges = render({ signedIn: true, environment: b.environment, api: serverApi, queryClient });

    const pending = nudges.enable();
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
    expect(await pending).toEqual({ ok: true, timezoneSaved: true });

    expect(serverApi.registerSubscription).toHaveBeenCalledTimes(1);
    expect(serverApi.saveSettings).toHaveBeenCalledWith(USER_ID, { nudges_enabled: true, timezone: 'Europe/London' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-settings'] });
    expect(realApi.used).toBe(false);
  });
});
