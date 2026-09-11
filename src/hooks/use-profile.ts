import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/**
 * The columns the Profile Info tab may write. Narrower than the generated
 * Update type on purpose: `id` is set from the session, and
 * `onboarding_completed_at` belongs to the onboarding flow, not to this screen.
 */
export type ProfilePatch = Partial<
  Pick<
    ProfileRow,
    | 'first_name'
    | 'pronouns'
    | 'date_of_birth'
    | 'mood_checkin_frequency'
    | 'focus_goal'
    | 'preferred_mode'
    | 'avatar_emoji'
    | 'use_emoji_avatar'
  >
>;

/** Per-user cache key, so another account's profile can never come from cache. */
const profileKey = (userId: string | null) => ['profile', userId ?? 'anonymous'] as const;

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId as string)
        .limit(1);

      if (error) throw error;

      // A missing row is a legitimate state, not an error — the save path
      // upserts, so the screen still works without one.
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows[0] ?? null;
    }
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<ProfileRow> => {
      if (!user) throw new Error('You must be signed in to change your profile.');

      // upsert, not update: an UPDATE matching zero rows is a SUCCESS in
      // PostgREST, so a missing profile row would silently swallow every edit.
      // Only the changed columns are sent, so everything else on an existing
      // row — full_name, onboarding_completed_at — is left alone.
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...patch }, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.setQueryData(profileKey(userId), row);
    }
  });
}
