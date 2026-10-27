import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/** Every Supabase query the push API builds, as a list of calls. */
const queries: string[][] = [];
vi.mock('@/integrations/supabase/client', () => {
  const chain = (log: string[]): unknown =>
    new Proxy(
      {},
      {
        get: (_t, name: string) => {
          if (name === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
          return (...args: unknown[]) => {
            log.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
            return chain(log);
          };
        }
      }
    );
  return {
    supabase: {
      from: (table: string) => {
        const log = [`from(${table})`];
        queries.push(log);
        return chain(log);
      }
    }
  };
});

const { supabaseNudgePushApi } = await import('@/lib/push/gentle-nudges-push-api');

describe('the Supabase calls only ever name this device and this user', () => {
  it('removal deletes by endpoint AND user_id', async () => {
    queries.length = 0;
    await supabaseNudgePushApi.removeSubscription('user-a', 'https://push.example/this');
    expect(queries[0]).toEqual(['from(push_subscriptions)', 'delete()', 'eq("endpoint","https://push.example/this")', 'eq("user_id","user-a")']);
  });

  it('ownership reads only this user\'s row for this endpoint', async () => {
    queries.length = 0;
    expect(await supabaseNudgePushApi.ownsSubscription!('user-b', 'https://push.example/this')).toEqual({ owned: false });
    expect(queries[0]).toEqual([
      'from(push_subscriptions)',
      'select("id")',
      'eq("endpoint","https://push.example/this")',
      'eq("user_id","user-b")',
      'limit(1)'
    ]);
  });
});

describe('AuthProvider wiring', () => {
  const source = readFileSync(new URL('./AuthProvider.tsx', import.meta.url), 'utf8');

  it('sign-out releases this device first, with the signed-in user, then runs the unchanged Supabase sign-out', () => {
    const signOut = source.slice(source.indexOf('const signOut = useCallback'), source.indexOf('const refreshOnboardingStatus'));
    expect(signOut).toMatch(/await signOutWithDeviceRelease\(\s+userIdRef\.current,\s+browserPushDeviceDeps,/);
    // The existing sign-out, its local fallback and its state reset all still run inside it.
    expect(signOut).toContain("await supabase.auth.signOut();");
    expect(signOut).toContain("await supabase.auth.signOut({ scope: 'local' });");
    expect(signOut).toContain('setSession(null);');
    expect(signOut).toContain('SIGN_OUT_DEVICE_CLEANUP_MS');
  });

  it('the device is reconciled once the session is known and on every account change; a run for an earlier account is cancelled', () => {
    expect(source).toMatch(
      /if \(!sessionResolved\) return;\s+pushCoordination\.setActiveAccount\(userId\);[\s\S]{0,120}let current = true;\s+void reconcileDeviceSubscription\(userId, browserPushDeviceDeps, \(\) => current\)[\s\S]{0,400}return \(\) => \{\s+current = false;\s+\};\s+\}, \[sessionResolved, userId\]\);/
    );
  });

  it('sign-out clears the active account first, so nothing can register this device for the user signing out', () => {
    expect(source).toContain('() => pushCoordination.setActiveAccount(null)');
  });

  it('when the device could not be confirmed disconnected, a visible notice shows the approved text and nothing else', () => {
    expect(source).toMatch(/if \(cleanupLeftDeviceConnected\(cleanup\)\) \{[\s\S]{0,240}showDeviceStillConnectedNotice\(\);/);
    expect(source).not.toContain('toast(');
    expect(source).not.toMatch(/console\.(warn|log|error)\([^)]*(endpoint|subscription)/i);
  });

  it('the notice is cleared only once a later check confirms this device is free of the old subscription', () => {
    expect(source).toMatch(/if \(current && \(result === 'none' \|\| result === 'released' \|\| result === 'kept'\)\) clearDeviceStillConnectedNotice\(\);/);
  });
});
