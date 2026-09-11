import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

export type JournalEntryRow = Database['public']['Tables']['journal_entries']['Row'];

/**
 * The six ids the journal_entries_type CHECK accepts. They are the same ids
 * JournalingMenu.tsx already declares, so the menu, the routes and the column
 * agree without a mapping table in between.
 */
export const JOURNAL_TYPES = [
  'morning-intention',
  'daily-journal',
  'post-panic',
  'focus-reset',
  'gratitude',
  'sensory-checkin'
] as const;

export type JournalType = (typeof JOURNAL_TYPES)[number];

/**
 * Cache key is per user AND per type: six screens share one table, and each
 * must only ever see its own kind of entry.
 */
const todayEntryKey = (userId: string | null, entryType: JournalType) =>
  ['journal-entries', 'today', entryType, userId ?? 'anonymous'] as const;

/**
 * Midnight today in the user's own timezone. Journals are a per-day practice
 * and the prompts say "today", so the boundary has to be the user's calendar
 * day — a UTC one would split an evening entry from the day it belongs to.
 */
function startOfLocalDay(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/**
 * Reads a stored `responses` object back into the shape a page expects.
 *
 * The column is jsonb and the client owns the per-type shape, so nothing in
 * the database guarantees the keys. Anything missing or non-string falls back
 * to the empty value rather than putting `undefined` into a controlled input,
 * which would flip it to uncontrolled mid-life.
 */
function readResponses<T extends Record<string, string>>(
  responses: JournalEntryRow['responses'],
  empty: T
): T {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return empty;

  const source = responses as Record<string, unknown>;
  const result = { ...empty };
  for (const key of Object.keys(empty)) {
    const value = source[key];
    if (typeof value === 'string') result[key as keyof T] = value as T[keyof T];
  }
  return result;
}

/**
 * Today's entry of one type for the signed-in user, or null if they have not
 * written one yet today. This is what refills the form after a refresh.
 */
export function useTodayJournalEntry(entryType: JournalType) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: todayEntryKey(userId, entryType),
    enabled: !!userId,
    queryFn: async (): Promise<JournalEntryRow | null> => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId as string)
        .eq('entry_type', entryType)
        .gte('created_at', startOfLocalDay())
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows[0] ?? null;
    }
  });
}

/**
 * Writes one day's entry: updates today's row if there is one, inserts if not.
 *
 * The table carries updated_at and an UPDATE policy — it is the editable one,
 * unlike mood_checkins — so re-saving the same day revises that day's entry
 * instead of stacking near-identical rows. Each new day still gets its own
 * row, which is what keeps the per-type history the
 * (user_id, entry_type, created_at) index exists to serve.
 */
export function useSaveJournalEntry(entryType: JournalType) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const key = todayEntryKey(userId, entryType);

  return useMutation({
    mutationFn: async (responses: Record<string, string>): Promise<JournalEntryRow> => {
      if (!user) throw new Error('You must be signed in to save a journal entry.');

      // Read from the cache rather than a captured value, so a save always
      // sees the entry the form is actually showing.
      const existing = queryClient.getQueryData<JournalEntryRow | null>(key);

      if (existing) {
        const { data, error } = await supabase
          .from('journal_entries')
          .update({ responses })
          .eq('id', existing.id)
          .eq('user_id', user.id)
          .select()
          .single();

        // .single() turns a zero-row update into an error instead of
        // PostgREST's silent success, so a write that matched nothing is never
        // reported to the user as saved.
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('journal_entries')
        .insert({ user_id: user.id, entry_type: entryType, responses })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      // The row just written IS today's entry; seeding the cache avoids a
      // refetch that would briefly blank the form.
      queryClient.setQueryData(key, row);
    }
  });
}

export type JournalSaveOutcome = 'saved' | 'empty' | 'failed' | 'busy';

export interface JournalEntryForm<T extends Record<string, string>> {
  values: T;
  setValue: (key: keyof T, value: string) => void;
  /** True until today's entry has been looked up. */
  isLoading: boolean;
  isSaving: boolean;
  /** Disable the save control while either is true. */
  isBusy: boolean;
  save: () => Promise<JournalSaveOutcome>;
}

/**
 * Everything the six journal screens need, so each page keeps its own copy and
 * its own words. A page supplies its field names once; this owns loading
 * today's entry, refilling the form, and writing it back.
 */
export function useJournalEntryForm<T extends Record<string, string>>(
  entryType: JournalType,
  emptyValues: T
): JournalEntryForm<T> {
  const { toast } = useToast();
  const { data: todayEntry, isFetched, isError, error } = useTodayJournalEntry(entryType);
  const saveEntry = useSaveJournalEntry(entryType);

  // The page passes a fresh object literal every render; hold the first one so
  // it can be used inside effects without re-running them.
  const emptyRef = useRef(emptyValues);
  const [values, setValues] = useState<T>(emptyValues);

  const hydratedRef = useRef(false);
  const savingRef = useRef(false);
  const loadErrorShownRef = useRef(false);

  // Refill the form once, when today's entry has landed. Once only: reapplying
  // it on a later render would overwrite whatever the user has typed since.
  useEffect(() => {
    if (hydratedRef.current || !isFetched) return;
    hydratedRef.current = true;
    if (todayEntry) setValues(readResponses(todayEntry.responses, emptyRef.current));
  }, [todayEntry, isFetched]);

  useEffect(() => {
    if (!isError || loadErrorShownRef.current) return;
    loadErrorShownRef.current = true;
    toast({
      title: 'Could not load today’s entry',
      description:
        error instanceof Error
          ? error.message
          : 'Starting with a blank page — anything you write can still be saved.',
      variant: 'destructive'
    });
  }, [isError, error, toast]);

  const setValue = useCallback((key: keyof T, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async (): Promise<JournalSaveOutcome> => {
    // A ref, not the mutation's isPending: two clicks in the same tick read
    // the same render's isPending and would both write.
    if (savingRef.current) return 'busy';

    const trimmed = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()])
    ) as T;

    // An untouched form should not leave an empty row behind. Clearing an
    // entry that already exists is a deliberate edit, so that still saves.
    if (Object.values(trimmed).every((value) => value === '') && !todayEntry) {
      toast({
        title: 'Nothing to save yet',
        description: 'Write something first, then save.'
      });
      return 'empty';
    }

    savingRef.current = true;
    try {
      await saveEntry.mutateAsync(trimmed);
      toast({ title: 'Saved', description: 'Your entry has been saved.' });
      return 'saved';
    } catch (saveError) {
      // Deliberately no navigation on failure: the page keeps what was written
      // so it can be saved again rather than being lost on the way out.
      toast({
        title: 'Could not save your entry',
        description: saveError instanceof Error ? saveError.message : 'Please try again.',
        variant: 'destructive'
      });
      return 'failed';
    } finally {
      savingRef.current = false;
    }
  }, [values, todayEntry, saveEntry, toast]);

  const isLoading = !isFetched;

  return {
    values,
    setValue,
    isLoading,
    isSaving: saveEntry.isPending,
    isBusy: isLoading || saveEntry.isPending,
    save
  };
}
