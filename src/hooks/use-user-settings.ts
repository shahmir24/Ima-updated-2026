import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

/**
 * The columns the App Settings tab may write.
 *
 * `default_flows` and `timezone` are deliberately absent: neither has a
 * control on this screen, and timezone is load-bearing for day-bucketing
 * elsewhere, so it should not be guessed from a settings edit.
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
    | 'timeboxing_style'
    | 'daily_focus_goal'
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
