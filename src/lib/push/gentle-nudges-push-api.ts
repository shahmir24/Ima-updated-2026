import { supabase } from '@/integrations/supabase/client';
import type { NudgePushApi } from './gentle-nudges-push';

/**
 * The Supabase side of gentle nudges, for a signed-in user's session.
 *
 * - The subscription goes through register_push_subscription(): it reads the
 *   user from the session (auth.uid()), never from the request, and moves a
 *   shared device's subscription to whoever is signed in now.
 * - Removing a subscription is a plain delete; RLS only lets a user delete
 *   their own devices, and the user_id filter says so explicitly too.
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
