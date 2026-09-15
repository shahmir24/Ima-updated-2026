import { useCallback, useState } from 'react';
import type { TaskRow } from '@/hooks/use-tasks';

/**
 * The "Right Now" queue behind the home screen.
 *
 * Deliberately not a ranking engine: the order is whatever useTasks() already
 * returned (scheduled_date, then start_time with nulls last, then created_at),
 * so Home and /tasks always agree about what comes next, and completing a task
 * cannot make the list jump.
 *
 * There is no time-of-day weighting either. Promoting "overdue" work would
 * make the same data produce a different queue minute to minute, which is both
 * untestable and disorienting for someone who glances at the screen twice.
 *
 * The cursor is session state and nothing more. "Not now" moves it; a refresh
 * puts it back to the first task. Nothing here writes anything.
 */

/** How many upcoming tasks the home screen lists under the current one. */
export const UP_NEXT_LIMIT = 3;

export interface HomeTaskQueue {
  /** Today's incomplete tasks, in the order useTasks() returned them. */
  eligible: TaskRow[];
  total: number;
  /** The task the Right Now card is showing, or null when there are none. */
  current: TaskRow | null;
  /** 1-based, for "x of y". 0 when the queue is empty. */
  position: number;
  /** position / total, 0–1, for the queue-position ring. 0 when empty. */
  ringFraction: number;
  /** The next tasks after the current one, wrapping, capped and never the current one. */
  upNext: TaskRow[];
  /** True only when advancing would actually change the task. */
  canAdvance: boolean;
  /** Session-local. Advances one place and wraps at the end. */
  advance: () => void;
}

const isSameLocalDay = (scheduledDate: string, localToday: string) => scheduledDate === localToday;

export function useHomeTaskQueue(tasks: TaskRow[], localToday: string): HomeTaskQueue {
  const [cursor, setCursor] = useState(0);

  const eligible = tasks.filter(
    (task) => isSameLocalDay(task.scheduled_date, localToday) && !task.completed
  );
  const total = eligible.length;

  // Read through a modulo rather than trusting the stored cursor: completing a
  // task shrinks the queue underneath it, and a stale index would otherwise
  // point past the end or at the wrong task.
  const safeCursor = total > 0 ? ((cursor % total) + total) % total : 0;
  const current = total > 0 ? eligible[safeCursor] : null;

  const upNext: TaskRow[] = [];
  for (let step = 1; step <= Math.min(UP_NEXT_LIMIT, total - 1); step++) {
    upNext.push(eligible[(safeCursor + step) % total]);
  }

  const advance = useCallback(() => {
    // Wrapping is the least confusing option: stopping at the end would leave
    // the card empty with no way back short of a reload, and the "x of y"
    // label right beside the control makes the wrap legible.
    setCursor((previous) => previous + 1);
  }, []);

  return {
    eligible,
    total,
    current,
    position: total > 0 ? safeCursor + 1 : 0,
    ringFraction: total > 0 ? (safeCursor + 1) / total : 0,
    upNext,
    canAdvance: total > 1,
    advance
  };
}

/** '14:00:00' -> '2:00 PM'. Null when the task has no start time — the column
 *  is nullable and a time must never be invented for a task that has none. */
export function formatStartTime(value: string | null): string | null {
  if (!value) return null;
  const [hours, minutes] = value.split(':');
  const parsed = new Date(2000, 0, 1, Number(hours), Number(minutes));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * The exact length of a task, derived from the two times it actually has.
 *
 * Null unless BOTH are present: no task the app can currently create sets
 * end_time, so in practice this returns null today. It is written this way so
 * that the day an end time exists the card shows a real figure — never an
 * estimate, and never a "~".
 */
export function formatTaskDuration(startTime: string | null, endTime: string | null): string | null {
  if (!startTime || !endTime) return null;

  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':');
    const h = Number(hours);
    const m = Number(minutes);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;

  // The tasks_time_order CHECK guarantees end > start, but a row could still
  // arrive from anywhere, so a non-positive span is reported as no duration.
  const span = end - start;
  if (span <= 0) return null;

  const hours = Math.floor(span / 60);
  const minutes = span % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

/** Local-time greeting. Never includes a name; the caller adds one if it has one. */
export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
