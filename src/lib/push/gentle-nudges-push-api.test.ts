import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ log: [] as Array<[string, ...unknown[]]>, result: { error: null as unknown } as { error: unknown; data?: unknown } }));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string) => {
    const proxy: Record<string, unknown> = {};
    for (const method of ['delete', 'eq', 'upsert', 'select', 'limit']) {
      proxy[method] = (...args: unknown[]) => {
        calls.log.push([`${table}.${method}`, ...args]);
        return proxy;
      };
    }
    proxy.then = (resolve: (value: unknown) => void) => resolve(calls.result);
    return proxy;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: async (name: string, args: unknown) => {
        calls.log.push(['rpc', name, args]);
        return calls.result;
      }
    }
  };
});

import { supabaseNudgePushApi } from './gentle-nudges-push-api';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const record = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'P'.repeat(87), auth: 'A'.repeat(22), userAgent: 'UA' };

beforeEach(() => {
  calls.log.length = 0;
  calls.result = { error: null };
});

describe('supabaseNudgePushApi', () => {
  it('registers through the register_push_subscription RPC with endpoint, keys and user agent', async () => {
    expect(await supabaseNudgePushApi.registerSubscription(record)).toEqual({ error: null });
    expect(calls.log).toEqual([
      ['rpc', 'register_push_subscription', { p_endpoint: record.endpoint, p_p256dh: record.p256dh, p_auth: record.auth, p_user_agent: 'UA' }]
    ]);
  });

  it('omits the user agent when there is none (the RPC defaults it to null)', async () => {
    await supabaseNudgePushApi.registerSubscription({ ...record, userAgent: null });
    expect(calls.log[0][2]).toEqual({ p_endpoint: record.endpoint, p_p256dh: record.p256dh, p_auth: record.auth });
  });

  it('never sends a user id to the RPC — the server takes it from the session', async () => {
    await supabaseNudgePushApi.registerSubscription(record);
    expect(JSON.stringify(calls.log)).not.toContain(USER_ID);
  });

  it('passes RPC errors back instead of throwing', async () => {
    calls.result = { error: { code: '42501', message: 'Not signed in' } };
    expect(await supabaseNudgePushApi.registerSubscription(record)).toEqual({ error: { code: '42501', message: 'Not signed in' } });
  });

  it("removes only this user's row for this endpoint", async () => {
    await supabaseNudgePushApi.removeSubscription(USER_ID, record.endpoint);
    expect(calls.log).toEqual([
      ['push_subscriptions.delete'],
      ['push_subscriptions.eq', 'endpoint', record.endpoint],
      ['push_subscriptions.eq', 'user_id', USER_ID]
    ]);
  });

  it('upserts settings on user_id, like useUpdateUserSettings', async () => {
    await supabaseNudgePushApi.saveSettings(USER_ID, { nudges_enabled: true, timezone: 'Asia/Karachi' });
    expect(calls.log).toEqual([
      ['user_settings.upsert', { user_id: USER_ID, nudges_enabled: true, timezone: 'Asia/Karachi' }, { onConflict: 'user_id' }]
    ]);
  });
});

describe('supabaseNudgePushApi.readFeatureFlags — the fresh read behind turning a feature off', () => {
  it("reads both switches from this user's own row, uncached", async () => {
    calls.result = { error: null, data: [{ nudges_enabled: true, focus_alerts_enabled: false }] };
    expect(await supabaseNudgePushApi.readFeatureFlags(USER_ID)).toEqual({ flags: { nudges_enabled: true, focus_alerts_enabled: false } });
    expect(calls.log).toEqual([
      ['user_settings.select', 'nudges_enabled, focus_alerts_enabled'],
      ['user_settings.eq', 'user_id', USER_ID],
      ['user_settings.limit', 1]
    ]);
  });

  it('a missing row is an error, never "both off"', async () => {
    for (const data of [[], null, undefined]) {
      calls.result = { error: null, data };
      const result = await supabaseNudgePushApi.readFeatureFlags(USER_ID);
      expect(result).not.toHaveProperty('flags');
      expect(result).toHaveProperty('error');
    }
  });

  it('a row without two real booleans is an error, never "off"', async () => {
    for (const row of [{ nudges_enabled: null, focus_alerts_enabled: false }, { nudges_enabled: false }, { nudges_enabled: 'false', focus_alerts_enabled: false }]) {
      calls.result = { error: null, data: [row] };
      expect(await supabaseNudgePushApi.readFeatureFlags(USER_ID)).not.toHaveProperty('flags');
    }
  });

  it('a read failure is passed back as an error', async () => {
    calls.result = { error: { code: 'PGRST301', message: 'JWT expired' }, data: null };
    expect(await supabaseNudgePushApi.readFeatureFlags(USER_ID)).toEqual({ error: { code: 'PGRST301', message: 'JWT expired' } });
  });
});
