/**
 * Context Engine v1 — the shapes.
 *
 * The engine answers one question: of the tasks a person could do now, which
 * deserves attention first, and why. It is a pure function of the task rows
 * and the local calendar date. It knows nothing about React, Supabase, the
 * network, storage or any model, and it never reads a clock of its own — the
 * caller supplies the date, which is what makes every ranking reproducible.
 */

export const TASK_IMPORTANCE = ['low', 'normal', 'high'] as const;
export type TaskImportance = (typeof TASK_IMPORTANCE)[number];

/**
 * The task fields ranking actually reads.
 *
 * Structural rather than an import of TaskRow, so the engine carries no
 * dependency on Supabase's generated types and can be exercised with plain
 * object literals. Any object with these fields ranks, including a real
 * TaskRow, which has them all.
 *
 * `importance` is deliberately `unknown`: rows written before the column
 * existed, or read from an older cache, may carry anything at all, and the
 * engine normalises rather than trusts.
 */
export interface ContextTask {
  id: string;
  /** 'YYYY-MM-DD', the local day the task is planned for. */
  scheduled_date: string;
  /** ISO timestamp. Used only as a stable tie-break. */
  created_at: string;
  completed: boolean;
  importance?: unknown;
}

/**
 * Everything the engine is allowed to know about "now".
 *
 * One field, on purpose. Time of day is absent because the task form used to
 * default every start time to 2 PM, so a stored time does not reliably mean
 * the user chose it; ranking on that would sort people's afternoons by a value
 * they never set. Once times are genuinely optional and the old defaults have
 * aged out, this is where a time signal would be added.
 */
export interface ContextNow {
  /** The user's local calendar date as 'YYYY-MM-DD'. */
  today: string;
}

/**
 * Why a task is where it is, as data rather than a sentence.
 *
 * The UI owns the wording. Scores, bucket numbers and comparator positions are
 * deliberately not part of this: a number the user cannot act on is not an
 * explanation, and exposing one invites the interface to argue with itself.
 */
export type ReasonCode =
  /** Planned for today. */
  | 'due_today'
  /** Planned for the last week and not done. */
  | 'overdue_recent'
  /** Planned more than a week ago and not done. */
  | 'overdue_long'
  /** Long overdue, and marked important, so it is surfaced sooner. */
  | 'overdue_important';

export interface RankReason {
  code: ReasonCode;
  /** 0 for today, positive for overdue. Never negative — those are ineligible. */
  daysOverdue: number;
}

export interface RankedTask<T extends ContextTask = ContextTask> {
  /** The caller's own task object, handed back untouched. */
  task: T;
  /** Exactly one primary reason. A stack of justifications is its own burden. */
  reason: RankReason;
}
