/**
 * Context Engine v1 — signals derived from a task and the local date.
 *
 * Pure arithmetic. Nothing here reads a clock, a store or a network.
 */
import { TASK_IMPORTANCE, type ContextTask, type TaskImportance } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * 'YYYY-MM-DD' to a whole day number, or null when the string is not a real
 * date.
 *
 * Date.UTC is used for both sides of every comparison, so the result is a
 * count of calendar days and cannot drift with the viewer's timezone. The
 * round-trip check is what rejects 2026-02-30 and 2026-02-29, which Date.UTC
 * would otherwise silently roll forward into March.
 */
export function toEpochDay(isoDate: string): number | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utc = Date.UTC(year, month - 1, day);
  const back = new Date(utc);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return utc / MS_PER_DAY;
}

/**
 * How many whole days a task is past its planned day.
 *
 * 0 means today, positive means overdue, negative means the future. Null when
 * either date is unreadable — the caller treats that as ineligible rather than
 * guessing at a day.
 */
export function daysOverdue(scheduledDate: string, today: string): number | null {
  const scheduled = toEpochDay(scheduledDate);
  const now = toEpochDay(today);
  if (scheduled === null || now === null) return null;
  return now - scheduled;
}

/**
 * Anything that is not one of the three values reads as 'normal'.
 *
 * Rows predate the importance column, and a cached row can hold anything at
 * all. The safe reading is the default, because it is the one that ranks a
 * task exactly as every task ranked before importance existed.
 */
export function normaliseImportance(value: unknown): TaskImportance {
  return (TASK_IMPORTANCE as readonly string[]).includes(value as string)
    ? (value as TaskImportance)
    : 'normal';
}

/** high first. Lower is more important, so it sorts ascending like everything else. */
export function importanceRank(value: unknown): number {
  switch (normaliseImportance(value)) {
    case 'high':
      return 0;
    case 'normal':
      return 1;
    default:
      return 2;
  }
}

/**
 * A task is eligible when it is not done and its planned day has arrived.
 *
 * Unchanged from the queue this replaces: today and overdue are eligible, the
 * future is not. Importance does not enter into it — marking something
 * important must never drag tomorrow's work into today.
 */
export function isEligible(task: ContextTask, today: string): boolean {
  if (task.completed) return false;
  const overdue = daysOverdue(task.scheduled_date, today);
  return overdue !== null && overdue >= 0;
}

/**
 * Orders timestamps that may not share a format.
 *
 * Postgres returns timestamps at varying precision and offset, so comparing
 * the strings directly can order '…T00:00:00Z' against '…T00:00:00.5+00:00'
 * wrongly. Parsed values are compared when both parse; the string comparison
 * is the fallback for anything that does not, so the order stays total.
 */
export function compareTimestamps(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isNaN(left) && !Number.isNaN(right)) {
    if (left !== right) return left < right ? -1 : 1;
    return 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
