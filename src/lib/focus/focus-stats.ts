/**
 * Focus statistics from recorded focus_sessions rows (Focus Timer and Body
 * Double alike — one table, by design).
 *
 * Only ended sessions count: 'completed' and 'abandoned', kept apart. 'active'
 * rows — a session still going, or one whose device never came back — are
 * neither, and are left out of every number including the completion rate.
 *
 * Focus minutes come from focus_seconds, the time the timer actually ran in a
 * focus phase. Never from ended_at - started_at, which would count pauses.
 */

export interface FocusStatsRow {
  status: string;
  focus_seconds: number | null;
}

export interface FocusStatsGroup {
  sessions: number;
  focusMinutes: number;
}

export interface FocusStatsSummary {
  completed: FocusStatsGroup;
  abandoned: FocusStatsGroup;
  /** completed + abandoned. */
  endedSessions: number;
  /** completed / (completed + abandoned) * 100, rounded; null when there are none. */
  completionRate: number | null;
}

const secondsOf = (row: FocusStatsRow) =>
  typeof row.focus_seconds === 'number' && Number.isFinite(row.focus_seconds) && row.focus_seconds > 0 ? row.focus_seconds : 0;

export function summarizeFocusSessions(rows: readonly FocusStatsRow[]): FocusStatsSummary {
  let completed = 0;
  let abandoned = 0;
  let completedSeconds = 0;
  let abandonedSeconds = 0;

  for (const row of rows) {
    if (row.status === 'completed') {
      completed++;
      completedSeconds += secondsOf(row);
    } else if (row.status === 'abandoned') {
      abandoned++;
      abandonedSeconds += secondsOf(row);
    }
  }

  const endedSessions = completed + abandoned;
  return {
    // Seconds are summed first and converted once, so many short sessions are not each rounded away.
    completed: { sessions: completed, focusMinutes: Math.floor(completedSeconds / 60) },
    abandoned: { sessions: abandoned, focusMinutes: Math.floor(abandonedSeconds / 60) },
    endedSessions,
    completionRate: endedSessions === 0 ? null : Math.round((completed / endedSessions) * 100)
  };
}

/** Supabase returns at most 1000 rows per request by default; totals must read every page. */
export const FOCUS_STATS_PAGE_SIZE = 1000;

/**
 * Reads every page through `fetchPage(from, to)` (inclusive range, the
 * PostgREST convention) until a short page arrives.
 */
export async function fetchAllFocusStatsRows(
  fetchPage: (from: number, to: number) => Promise<FocusStatsRow[]>,
  pageSize = FOCUS_STATS_PAGE_SIZE
): Promise<FocusStatsRow[]> {
  const rows: FocusStatsRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
