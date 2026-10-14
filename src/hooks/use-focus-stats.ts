import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { fetchAllFocusStatsRows, summarizeFocusSessions, type FocusStatsSummary } from '@/lib/focus/focus-stats';

export const focusStatsKey = (userId: string | null) => ['focus-stats', userId ?? 'anonymous'] as const;

/**
 * The signed-in user's ended focus sessions (completed and abandoned), summed.
 * RLS already limits the rows to the user; the user_id filter states it and
 * uses the (user_id, started_at) index. Ordered by started_at so pages stay
 * stable while new sessions are added at the end.
 */
export function useFocusStats() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: focusStatsKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<FocusStatsSummary> => {
      const rows = await fetchAllFocusStatsRows(async (from, to) => {
        const { data, error } = await supabase
          .from('focus_sessions')
          .select('status, focus_seconds')
          .eq('user_id', userId as string)
          .in('status', ['completed', 'abandoned'])
          .order('started_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });
      return summarizeFocusSessions(rows);
    }
  });
}
