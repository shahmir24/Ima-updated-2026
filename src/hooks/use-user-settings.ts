import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

/**
 * The columns the App Settings tab may write.
 *
 * `timezone` has no control on this screen, and it is load-bearing for
 * day-bucketing elsewhere, so no general settings edit guesses it; its one
 * writer here is described below. `default_flows` (the round count) is written by the
 * Focus setup (lib/focus/focus-setup.ts).
 *
 * `nudges_enabled` and `focus_alerts_enabled` are absent too: only the
 * notification enable/disable flow (lib/push/gentle-nudges-push.ts) may write
 * them, so the account is never "on" without a stored device. The nudge time,
 * quiet hours and the task-name privacy choice are plain preferences.
 *
 * `timezone` is the one exception to the rule above, and only for the
 * Notifications card: when someone explicitly saves a notification preference
 * there, the device's own zone is saved with it (a separate, best-effort
 * write — see NotificationsCard), because nudge times and quiet hours are read
 * in it.
 */
export type UserSettingsPatch = Partial<
  Pick<
    UserSettingsRow,
    | 'theme'
    | 'sound_volume'
    | 'animation_speed'
    | 'adhd_mode'
    | 'encouragement'
    | 'ai_companion_name'
    | 'focus_block_minutes'
    | 'buffer_minutes'
    | 'default_flows'
    | 'timeboxing_style'
    | 'daily_focus_goal'
    | 'nudge_time'
    | 'nudge_show_task_titles'
    | 'quiet_hours_enabled'
    | 'quiet_hours_start'
    | 'quiet_hours_end'
    | 'timezone'
  >
>;

const settingsKey = (userId: string | null) => ['user-settings', userId ?? 'anonymous'] as const;

export function useUserSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: settingsKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<UserSettingsRow | null> => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId as string)
        .limit(1);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows[0] ?? null;
    }
  });
}

export function useUpdateUserSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  return useMutation({
    mutationFn: async (patch: UserSettingsPatch): Promise<UserSettingsRow> => {
      if (!user) throw new Error('You must be signed in to change your settings.');

      // upsert for the same reason as the profile: the on_auth_user_created
      // trigger seeds this row, but an edit must not vanish if it is missing.
      // The row's NOT NULL columns all carry defaults, so a partial insert is
      // complete and valid.
      const { data, error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.setQueryData(settingsKey(userId), row);
    }
  });
}

/**
 * Saves a time zone on its own, best effort: resolves true once saved, false
 * if the save fails (most likely a zone this database does not recognise).
 * Never rejects and never throws, so it cannot disturb the preference saved
 * alongside it, and it writes nothing but `timezone`.
 */
export function saveTimezoneBestEffort(
  save: (patch: UserSettingsPatch) => Promise<unknown>,
  timezone: string
): Promise<boolean> {
  try {
    return save({ timezone }).then(
      () => true,
      () => false
    );
  } catch {
    return Promise.resolve(false);
  }
}
