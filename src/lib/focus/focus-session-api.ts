/**
 * The Supabase side of Focus Timer recording. Every write is idempotent (see
 * focus-session-outbox.ts) and scoped to the signed-in user on top of RLS.
 *
 * Uses the existing focus_sessions columns only — no schema change:
 *   source 'focus-timer', status active → completed | abandoned (or the
 *   row is deleted on Reset — see discard below),
 *   planned_block_minutes / planned_break_minutes / planned_flows,
 *   flows_completed / breaks_taken / focus_seconds, started_at / ended_at.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { FocusSessionApi, WriteResult } from './focus-session-outbox';

export const FOCUS_TIMER_SOURCE = 'focus-timer';

interface PostgrestLikeResult {
  error: unknown;
  status?: number;
}

/**
 * Worth trying again later: no response (offline), a server error, a timeout,
 * rate limiting, or an expired session. Anything else (a constraint, a policy)
 * would fail the same way forever.
 */
export function toWriteResult(result: PostgrestLikeResult): WriteResult {
  if (!result.error) return { ok: true };
  const status = typeof result.status === 'number' ? result.status : 0;
  const retry = status === 0 || status >= 500 || status === 401 || status === 408 || status === 429;
  return { ok: false, retry };
}

/** A request with no answer by then is treated as offline; replaying it later is safe. */
export const WRITE_TIMEOUT_MS = 15_000;

async function run(write: () => PromiseLike<PostgrestLikeResult>, timeoutMs = WRITE_TIMEOUT_MS): Promise<WriteResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<WriteResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, retry: true }), timeoutMs);
  });
  try {
    // Without this a hung request would hold the outbox (and its cross-tab lock) indefinitely.
    return await Promise.race([Promise.resolve(write()).then(toWriteResult), timedOut]);
  } catch {
    return { ok: false, retry: true };
  } finally {
    clearTimeout(timer);
  }
}

export function createSupabaseFocusSessionApi(client: SupabaseClient<Database>): FocusSessionApi {
  return {
    start: (userId, op) =>
      run(() =>
        client.from('focus_sessions').upsert(
          {
            id: op.sessionId,
            user_id: userId,
            source: FOCUS_TIMER_SOURCE,
            status: 'active',
            started_at: op.startedAt,
            planned_block_minutes: op.plannedBlockMinutes,
            planned_break_minutes: op.plannedBreakMinutes,
            planned_flows: op.plannedFlows
          },
          // ON CONFLICT DO NOTHING: a replayed start never touches the row.
          { onConflict: 'id', ignoreDuplicates: true }
        )
      ),

    checkpoint: (userId, op) =>
      run(() =>
        client
          .from('focus_sessions')
          .update({ flows_completed: op.flowsCompleted, breaks_taken: op.breaksTaken, focus_seconds: op.focusSeconds })
          .eq('id', op.sessionId)
          .eq('user_id', userId)
          .eq('status', 'active')
          // Never lowers recorded focus time, whatever order writes arrive in.
          .lte('focus_seconds', op.focusSeconds)
      ),

    finish: (userId, op) =>
      run(() =>
        client
          .from('focus_sessions')
          .update({
            status: op.status,
            ended_at: op.endedAt,
            flows_completed: op.flowsCompleted,
            breaks_taken: op.breaksTaken,
            focus_seconds: op.focusSeconds,
            planned_block_minutes: op.plannedBlockMinutes,
            planned_break_minutes: op.plannedBreakMinutes,
            planned_flows: op.plannedFlows
          })
          .eq('id', op.sessionId)
          .eq('user_id', userId)
          // The first ending wins; a repeat (another tab, a retry) changes nothing.
          .eq('status', 'active')
      ),

    // Reset. The schema has no status for "thrown away", and a reset session
    // must count as neither completed nor abandoned, so its row is removed
    // (focus_sessions_delete_own allows a user to delete their own rows).
    // Only while still 'active': a session another tab completed, or one the
    // idle rule abandoned, is never deleted. Deleting a missing row is a no-op.
    discard: (userId, op) =>
      run(() => client.from('focus_sessions').delete().eq('id', op.sessionId).eq('user_id', userId).eq('status', 'active'))
  };
}
