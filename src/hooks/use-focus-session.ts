import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type FocusSessionRow = Database['public']['Tables']['focus_sessions']['Row'];

/** What the session was set up to do. Written once, on start. */
export interface FocusSessionStart {
  intention: string;
  /** focus_sessions_start_type: 'task' | 'scattered' | 'lost'. */
  startType: string;
  /** focus_sessions_start_mood: calm | anxious | sleepy | fire | scattered. */
  startMood: string;
  plannedBlockMinutes: number;
  plannedBreakMinutes: number;
}

/** What actually happened. Written on finish, and on leaving early. */
export interface FocusSessionProgress {
  flowsCompleted: number;
  breaksTaken: number;
  focusSeconds: number;
}

export interface FocusSessionReflection {
  endMood: string | null;
  reflectionDidWell: string | null;
  reflectionToImprove: string | null;
}

/**
 * Records a Body Double session in `focus_sessions`.
 *
 * The row is inserted when the session starts and updated as it goes, which is
 * what the table was built for. The lifecycle matters more than it looks:
 *
 * - `focus_sessions_status_span` requires status='active' to have a null
 *   ended_at and any other status to have one, so status and ended_at are
 *   always written together.
 * - `complete()` runs the moment the user says they are done, not when they
 *   finish writing a reflection. A session they actually completed must never
 *   be recorded as abandoned just because they closed the wrap-up screen.
 * - `saveReflection()` patches the same row afterwards. A session with no
 *   reflection is a real outcome, not a failure.
 * - Nothing here is allowed to break the timer. Every call reports its own
 *   failure and returns false; the caller keeps running locally either way,
 *   and never tells the user something was saved when it was not.
 */
export type FocusSessionStatus = 'idle' | 'active' | 'completed' | 'unrecorded';

export interface FocusSessionRecorder {
  /** Row id, or null when nothing is being recorded. */
  sessionId: string | null;
  status: FocusSessionStatus;
  /** Set when a write failed, for honest messaging. Never a fake success. */
  error: string | null;
  start: (input: FocusSessionStart) => Promise<boolean>;
  complete: (progress: FocusSessionProgress) => Promise<boolean>;
  saveReflection: (reflection: FocusSessionReflection) => Promise<boolean>;
  /** Latest counters, so leaving early can still record what was earned. */
  reportProgress: (progress: FocusSessionProgress) => void;
}

function messageFrom(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Please try again.';
}

const EMPTY_PROGRESS: FocusSessionProgress = { flowsCompleted: 0, breaksTaken: 0, focusSeconds: 0 };

export function useFocusSession(): FocusSessionRecorder {
  const { user } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<FocusSessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Refs, not state: the unmount cleanup below needs the values as they are at
  // that moment, not as they were when the effect was created.
  const idRef = useRef<string | null>(null);
  /** True once the session has an ending. Blocks any later abandon. */
  const settledRef = useRef(false);
  const progressRef = useRef<FocusSessionProgress>(EMPTY_PROGRESS);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const reportProgress = useCallback((progress: FocusSessionProgress) => {
    progressRef.current = progress;
  }, []);

  const start = useCallback(
    async (input: FocusSessionStart): Promise<boolean> => {
      if (!user) {
        setStatus('unrecorded');
        setError('You are signed out, so this session will not be saved.');
        return false;
      }

      progressRef.current = EMPTY_PROGRESS;
      settledRef.current = false;

      const { data, error: insertError } = await supabase
        .from('focus_sessions')
        .insert({
          user_id: user.id,
          source: 'body-double',
          status: 'active',
          intention: input.intention,
          start_type: input.startType,
          start_mood: input.startMood,
          planned_block_minutes: input.plannedBlockMinutes,
          planned_break_minutes: input.plannedBreakMinutes
        })
        .select()
        .single();

      if (insertError || !data) {
        idRef.current = null;
        setSessionId(null);
        setStatus('unrecorded');
        setError(messageFrom(insertError));
        return false;
      }

      idRef.current = data.id;
      setSessionId(data.id);
      setStatus('active');
      setError(null);
      return true;
    },
    [user]
  );

  const complete = useCallback(
    async (progress: FocusSessionProgress): Promise<boolean> => {
      progressRef.current = progress;

      // Nothing was recorded, so there is nothing to complete. Marking it
      // settled still matters: it stops the unmount path from trying.
      if (!idRef.current || !user) {
        settledRef.current = true;
        return false;
      }

      // Set before the await: if the user navigates away mid-write, the
      // session they finished must not also be marked abandoned.
      settledRef.current = true;

      const { error: updateError } = await supabase
        .from('focus_sessions')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          flows_completed: progress.flowsCompleted,
          breaks_taken: progress.breaksTaken,
          focus_seconds: progress.focusSeconds
        })
        .eq('id', idRef.current)
        .eq('user_id', user.id);

      if (updateError) {
        setStatus('unrecorded');
        setError(messageFrom(updateError));
        return false;
      }

      setStatus('completed');
      setError(null);
      return true;
    },
    [user]
  );

  const saveReflection = useCallback(
    async (reflection: FocusSessionReflection): Promise<boolean> => {
      if (!idRef.current || !user) return false;

      const { error: updateError } = await supabase
        .from('focus_sessions')
        .update({
          end_mood: reflection.endMood,
          reflection_did_well: reflection.reflectionDidWell,
          reflection_to_improve: reflection.reflectionToImprove
        })
        .eq('id', idRef.current)
        .eq('user_id', user.id);

      if (updateError) {
        setError(messageFrom(updateError));
        return false;
      }

      setError(null);
      return true;
    },
    [user]
  );

  // Leaving an unfinished session ends it as abandoned, with whatever focus
  // time was actually earned. Fire-and-forget by necessity — the component is
  // already going away — and deliberately silent: there is no longer a screen
  // to report a failure to.
  useEffect(() => {
    return () => {
      const id = idRef.current;
      const userId = userIdRef.current;
      idRef.current = null;
      if (!id || !userId || settledRef.current) return;

      const progress = progressRef.current;
      void supabase
        .from('focus_sessions')
        .update({
          status: 'abandoned',
          ended_at: new Date().toISOString(),
          flows_completed: progress.flowsCompleted,
          breaks_taken: progress.breaksTaken,
          focus_seconds: progress.focusSeconds
        })
        .eq('id', id)
        .eq('user_id', userId)
        .then(undefined, () => undefined);
    };
  }, []);

  return { sessionId, status, error, start, complete, saveReflection, reportProgress };
}
