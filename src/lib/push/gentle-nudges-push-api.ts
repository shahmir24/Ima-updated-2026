import { supabase } from '@/integrations/supabase/client';
import type { NudgePushApi, PushSubscriptionLike } from './gentle-nudges-push';
import type { PushDeviceDeps } from './push-device-lifecycle';

/**
 * The Supabase side of gentle nudges, for a signed-in user's session.
 *
 * - The subscription goes through register_push_subscription(): it reads the
 *   user from the session (auth.uid()), never from the request, and moves a
 *   shared device's subscription to whoever is signed in now.
 * - Removing a subscription is a plain delete; RLS only lets a user delete
 *   their own devices, and the user_id filter says so explicitly too.
 * - Ownership is a plain read of the user's own row for this endpoint; RLS
 *   hides every other account's rows, so "no row" means "not this user's".
 * - Settings are upserted exactly as useUpdateUserSettings does, so a missing
 *   user_settings row cannot lose the change.
 */
export const supabaseNudgePushApi: NudgePushApi = {
  async registerSubscription(record) {
    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: record.endpoint,
      p_p256dh: record.p256dh,
      p_auth: record.auth,
      ...(record.userAgent ? { p_user_agent: record.userAgent } : {})
    });
    return { error };
  },

  async ownsSubscription(userId, endpoint) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .eq('user_id', userId)
      .limit(1);
    if (error) return { error };
    return { owned: Array.isArray(data) && data.length > 0 };
  },

  async removeSubscription(userId, endpoint) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', userId);
    return { error };
  },

  async saveSettings(userId, patch) {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' });
    return { error };
  }
};

/** This browser's push subscription, or null where there is none to find. */
async function browserSubscription(): Promise<PushSubscriptionLike | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration?.pushManager ? await registration.pushManager.getSubscription() : null;
  return (subscription as unknown as PushSubscriptionLike | null) ?? null;
}

/** The real browser and Supabase, for push-device-lifecycle.ts. */
export const browserPushDeviceDeps: PushDeviceDeps = {
  getSubscription: browserSubscription,
  removeServerSubscription: (userId, endpoint) => supabaseNudgePushApi.removeSubscription(userId, endpoint),
  ownsSubscription: (userId, endpoint) => supabaseNudgePushApi.ownsSubscription!(userId, endpoint)
};
