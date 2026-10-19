import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';
import { friendlyJournalError, SIGNED_OUT_MESSAGE } from '@/lib/journal-errors';
import { conflictingFields, mergeIntoUntouched, runJournalSave } from '@/lib/journal-save-flow';

export type JournalEntryRow = Database['public']['Tables']['journal_entries']['Row'];

/**
 * The ids the journal_entries_type CHECK accepts. The first six are the ids
 * JournalingMenu.tsx already declares, so the menu, the routes and the column
 * agree without a mapping table in between.
 *
 * 'body-double' has no menu card: it is written by the Body Double wrap-up and
 * read back through Journal History.
 */
export const JOURNAL_TYPES = [
  'morning-intention',
  'daily-journal',
  'post-panic',
  'focus-reset',
  'gratitude',
  'sensory-checkin',
  'body-double'
] as const;

export type JournalType = (typeof JOURNAL_TYPES)[number];

/**
 * Cache key is per user AND per type: six screens share one table, and each
 * must only ever see its own kind of entry.
 */
const todayEntryKey = (userId: string | null, entryType: JournalType) =>
  ['journal-entries', 'today', entryType, userId ?? 'anonymous'] as const;

/** One key for the whole history list; it is not filtered by type. */
const historyKey = (userId: string | null) =>
  ['journal-entries', 'history', userId ?? 'anonymous'] as const;

/**
 * Types where a row is an episode, not a day.
 *
 * Post-panic is written *after* something happened, and two hard moments in
 * one day are two separate facts. Treating the second as an edit of the first
 * — which is what the per-day path below does — silently destroys the earlier
 * episode. A body-double reflection is the same: it belongs to one co-working
 * session, and a second session that day is a second reflection. The other
 * five types genuinely are one-per-day: a day has one morning intention, and
 * re-saving it is a revision, not a new event.
 */
const EPISODIC_TYPES = new Set<JournalType>(['post-panic', 'body-double']);

export function isEpisodicJournal(entryType: JournalType): boolean {
  return EPISODIC_TYPES.has(entryType);
}

/**
 * How much history the screen reads. A flat cap rather than pagination: it is
 * honest about what it shows, and it cannot turn into an unbounded query.
 */
export const JOURNAL_HISTORY_LIMIT = 200;

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
 * Today's newest entry of one type, read straight from the database. Used by
 * the query below and, uncached, by the check made before writing a new entry.
 */
async function fetchTodayEntry(userId: string, entryType: JournalType): Promise<JournalEntryRow | null> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_type', entryType)
    .gte('created_at', startOfLocalDay())
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows[0] ?? null;
}

/**
 * Loading today's entry tries twice, a second apart, then gives up and lets
 * the user write. The library default (three retries, backing off to four
 * seconds) kept the form locked for about eight seconds with no explanation.
 * Writing is not at risk from giving up early: before anything new is saved,
 * the entry is looked for again.
 */
export const TODAY_ENTRY_RETRIES = 1;
export const TODAY_ENTRY_RETRY_DELAY_MS = 1000;

/**
 * Today's entry of one type for the signed-in user, or null if they have not
 * written one yet today. This is what refills the form after a refresh.
 */
export function useTodayJournalEntry(entryType: JournalType) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: todayEntryKey(userId, entryType),
    // An episodic journal has no "today's entry" to load: every visit is a new
    // episode, so the query is never run for one.
    enabled: !!userId && !isEpisodicJournal(entryType),
    retry: TODAY_ENTRY_RETRIES,
    retryDelay: TODAY_ENTRY_RETRY_DELAY_MS,
    queryFn: (): Promise<JournalEntryRow | null> => fetchTodayEntry(userId as string, entryType)
  });
}

/**
 * Every journal entry the signed-in user has written, newest first, capped at
 * JOURNAL_HISTORY_LIMIT.
 *
 * All six types in one list, which is what the reverse-chronological screen
 * shows — and what journal_entries_user_time_idx (user_id, created_at desc)
 * was added to serve. Ordering is by created_at, never updated_at, so editing
 * an old entry does not jump it to the top.
 */
export function useJournalHistory() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: historyKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<JournalEntryRow[]> => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
        .limit(JOURNAL_HISTORY_LIMIT);

      if (error) throw error;
      return data ?? [];
    }
  });
}

/**
 * Writes an entry: updates today's row if there is one, inserts if not.
 *
 * The table carries updated_at and an UPDATE policy — it is the editable one,
 * unlike mood_checkins — so re-saving the same day revises that day's entry
 * instead of stacking near-identical rows. Each new day still gets its own
 * row, which is what keeps the per-type history the
 * (user_id, entry_type, created_at) index exists to serve.
 *
 * An episodic type (see EPISODIC_TYPES) skips the update path entirely and
 * always inserts, so two episodes on one day are two rows.
 */
export function useSaveJournalEntry(entryType: JournalType) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const key = todayEntryKey(userId, entryType);

  return useMutation({
    mutationFn: async (responses: Record<string, string>): Promise<JournalEntryRow> => {
      if (!user) throw new Error(SIGNED_OUT_MESSAGE);

      // Read from the cache rather than a captured value, so a save always
      // sees the entry the form is actually showing. An episodic type never
      // looks for one: it always inserts, so each episode keeps its own row
      // and its own created_at.
      const existing = isEpisodicJournal(entryType)
        ? null
        : queryClient.getQueryData<JournalEntryRow | null>(key);

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
      // refetch that would briefly blank the form. Not for an episodic type:
      // there is no "today's entry" there, and seeding one would turn the next
      // episode into an edit of this one.
      if (!isEpisodicJournal(entryType)) queryClient.setQueryData(key, row);

      // Mark the history list stale rather than writing into it. Nothing is
      // observing that query from a journal screen, so this queues a refetch
      // for when the history screen is next opened instead of firing one now —
      // and it never drops the list the user may be looking at.
      void queryClient.invalidateQueries({ queryKey: historyKey(userId) });
    }
  });
}

/**
 * `review`: an entry for today already existed that this form had not shown.
 * Nothing was written; the form now holds it (with the user's own edits kept)
 * and asks for a look before saving again.
 */
export type JournalSaveOutcome = 'saved' | 'empty' | 'review' | 'failed' | 'busy';

/** A message shown on the journal screen itself, beside the questions. */
export interface JournalNotice {
  tone: 'info' | 'error';
  text: string;
}

export interface JournalEntryForm<T extends Record<string, string>> {
  values: T;
  setValue: (key: keyof T, value: string) => void;
  /** True until today's entry has been looked up. The fields are read-only meanwhile. */
  isLoading: boolean;
  isSaving: boolean;
  /** Disable the save control while either is true. */
  isBusy: boolean;
  /** Anything the screen should say about loading or saving, or null. */
  notice: JournalNotice | null;
  save: () => Promise<JournalSaveOutcome>;
}

/**
 * Everything the six journal screens need, so each page keeps its own copy and
 * its own words. A page supplies its field names once; this owns loading
 * today's entry, refilling the form, and writing it back.
 *
 * Writing is never overwritten: fields the user has edited are tracked, and
 * saved answers only ever fill the others. A one-per-day journal that does not
 * hold today's entry looks for it again before creating one, so a failed load,
 * or a save from another tab, cannot quietly add a second entry for the day.
 */
export function useJournalEntryForm<T extends Record<string, string>>(
  entryType: JournalType,
  emptyValues: T
): JournalEntryForm<T> {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const episodic = isEpisodicJournal(entryType);
  const todayQuery = useTodayJournalEntry(entryType);
  const saveEntry = useSaveJournalEntry(entryType);

  // The query is disabled for an episodic type, so it never fetches and never
  // reports as fetched. Both have to be read through `episodic`, or the form
  // would wait forever for an entry that is never coming and leave its save
  // button disabled.
  const todayEntry = episodic ? null : todayQuery.data ?? null;
  const isFetched = episodic || todayQuery.isFetched;
  const isError = !episodic && todayQuery.isError;
  const error = todayQuery.error;

  // The page passes a fresh object literal every render; hold the first one so
  // it can be used inside effects without re-running them.
  const emptyRef = useRef(emptyValues);
  const [values, setValues] = useState<T>(emptyValues);
  const [notice, setNotice] = useState<JournalNotice | null>(null);

  /** Fields the user has typed in. Saved answers never replace these. */
  const editedRef = useRef<Set<keyof T>>(new Set());
  /**
   * The saved entry this form is editing, or null when it holds none. Only an
   * entry the user has been shown counts: a newer one that appears in the
   * cache later (a refetch, another tab) is checked for and shown first.
   */
  const baseRef = useRef<JournalEntryRow | null>(null);

  const hydratedRef = useRef(false);
  const savingRef = useRef(false);
  const loadErrorShownRef = useRef(false);

  // Refill the form once, when today's entry has landed — into the fields the
  // user has not touched. Once only, so a later render never reapplies it.
  useEffect(() => {
    if (hydratedRef.current || !isFetched) return;
    hydratedRef.current = true;
    // `todayEntry` is already null for an episodic type, so this opens blank
    // every visit and an earlier episode is never presented as a draft.
    if (todayEntry) {
      baseRef.current = todayEntry;
      const saved = readResponses(todayEntry.responses, emptyRef.current);
      setValues((current) => mergeIntoUntouched(current, editedRef.current, saved));
    }
  }, [todayEntry, isFetched]);

  useEffect(() => {
    if (!isError || loadErrorShownRef.current) return;
    loadErrorShownRef.current = true;
    const text = friendlyJournalError(error, 'load');
    setNotice({ tone: 'error', text });
    toast({ title: 'Could not load today’s entry', description: text, variant: 'destructive' });
  }, [isError, error, toast]);

  const setValue = useCallback((key: keyof T, value: string) => {
    editedRef.current.add(key);
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
    if (Object.values(trimmed).every((value) => value === '') && !baseRef.current) {
      toast({
        title: 'Nothing to save yet',
        description: 'Write something first, then save.'
      });
      return 'empty';
    }

    savingRef.current = true;
    try {
      const key = todayEntryKey(userId, entryType);
      const result = await runJournalSave<JournalEntryRow>({
        episodic,
        base: baseRef.current,
        recheck: () => {
          if (!userId) throw new Error(SIGNED_OUT_MESSAGE);
          return fetchTodayEntry(userId, entryType);
        },
        // The mutation updates the entry in the cache, or inserts when there
        // is none, so the cache is set to exactly what this form is editing:
        // its own entry, or — just confirmed — none.
        write: () => {
          if (!episodic) queryClient.setQueryData(key, baseRef.current);
          return saveEntry.mutateAsync(trimmed);
        }
      });

      switch (result.kind) {
        case 'written':
          if (!episodic) baseRef.current = result.row;
          editedRef.current = new Set();
          setNotice(null);
          toast({ title: 'Saved', description: 'Your entry has been saved.' });
          return 'saved';

        case 'found-existing': {
          // Today's entry exists after all. Show it — in the fields not yet
          // written in — and ask for a look before saving over it.
          queryClient.setQueryData(key, result.row);
          baseRef.current = result.row;
          const saved = readResponses(result.row.responses, emptyRef.current);
          const conflicts = conflictingFields(values, editedRef.current, saved);
          setValues((current) => mergeIntoUntouched(current, editedRef.current, saved));
          const text =
            conflicts.length > 0
              ? 'You already saved this journal today, so nothing new was saved. We’ve filled in the answers you hadn’t changed. Where you wrote something new, your new writing is kept — saving will replace what you wrote there earlier. Review it, then save again.'
              : 'You already saved this journal today, so nothing new was saved. We’ve filled in what you wrote earlier, alongside your new writing. Review it, then save again.';
          setNotice({ tone: 'info', text });
          toast({ title: 'Today’s entry is already saved', description: 'Review it, then save again.' });
          return 'review';
        }

        case 'check-failed': {
          // Not knowing whether today's entry exists, write nothing rather
          // than risk a second entry for the day.
          const text = friendlyJournalError(result.error, 'check');
          setNotice({ tone: 'error', text });
          toast({ title: 'Nothing was saved', description: text, variant: 'destructive' });
          return 'failed';
        }

        case 'write-failed': {
          // Deliberately no navigation on failure: the page keeps what was
          // written so it can be saved again rather than being lost on the way out.
          const text = friendlyJournalError(result.error, 'save');
          setNotice({ tone: 'error', text });
          toast({ title: 'Could not save your entry', description: text, variant: 'destructive' });
          return 'failed';
        }
      }
    } finally {
      savingRef.current = false;
    }
  }, [values, userId, entryType, episodic, queryClient, saveEntry, toast]);

  const isLoading = !isFetched;

  return {
    values,
    setValue,
    isLoading,
    isSaving: saveEntry.isPending,
    isBusy: isLoading || saveEntry.isPending,
    notice,
    save
  };
}
