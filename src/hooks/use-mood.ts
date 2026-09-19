import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type MoodRow = Database['public']['Tables']['mood_checkins']['Row'];

/**
 * The only five values the mood_checkins_vocab CHECK accepts, lowercased.
 * The home screen labels them in title case; storage is lowercase.
 */
export const MOOD_VALUES = ['happy', 'sad', 'calm', 'anxious', 'focused'] as const;
export type MoodValue = (typeof MOOD_VALUES)[number];

export const isMoodValue = (value: string): value is MoodValue =>
  (MOOD_VALUES as readonly string[]).includes(value);

/** 'happy' -> 'Happy', matching the labels the picker renders. */
export const toMoodLabel = (mood: string) => mood.charAt(0).toUpperCase() + mood.slice(1);

/**
 * Cache key is per user, so switching accounts cannot show the previous
 * account's check-in from cache. RLS scopes every query server-side; the
 * explicit .eq('user_id', ...) below is a second, client-side guard.
 */
const todayMoodKey = (userId: string | null) => ['mood-checkins', 'today', userId ?? 'anonymous'] as const;

/**
 * Midnight today in the user's own timezone, as an ISO instant.
 *
 * Deliberately not `toISOString().slice(0, 10)` on the date: the question on
 * screen is "How are you feeling today?", and "today" has to mean the user's
 * calendar day. A UTC boundary would carry yesterday evening's answer into
 * this morning west of Greenwich, and drop this evening's answer east of it.
 */
function startOfLocalDay(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/**
 * The most recent check-in the user made today, or null if they have not
 * checked in yet. This is what re-selects the mood after a refresh.
 *
 * mood_checkins is an append-only log — several check-ins a day are expected —
 * so "the current mood" is the newest row of the day, not the only row.
 */
export function useTodayMood() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: todayMoodKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<MoodRow | null> => {
      const { data, error } = await supabase
        .from('mood_checkins')
        .select('*')
        .eq('user_id', userId as string)
        .gte('created_at', startOfLocalDay())
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      // limit(1) rather than maybeSingle(), and the array is unwrapped here:
      // no row at all is the normal state at the start of a day, not an error.
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows[0] ?? null;
    }
  });
}

/**
 * Appends a check-in. Never an update: the log keeps the whole day's series,
 * which is the data worth having — a mood that changed at 4pm is a fact about
 * the day, not a correction to the morning.
 */
export function useSaveMoodCheckin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  return useMutation({
    mutationFn: async ({ mood, note }: { mood: MoodValue; note?: string | null }): Promise<MoodRow> => {
      if (!user) throw new Error('You must be signed in to save a mood check-in.');

      const { data, error } = await supabase
        .from('mood_checkins')
        .insert({ user_id: user.id, mood, note: note?.trim() || null })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      // The row just written IS today's newest check-in, so seed the cache with
      // it rather than refetching. A refetch would blank the selection for a
      // beat and make the highlight flicker.
      queryClient.setQueryData(todayMoodKey(userId), row);
    }
  });
}
