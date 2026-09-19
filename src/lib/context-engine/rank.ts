/**
 * Context Engine v1 — the ranking itself.
 *
 * Buckets and rules rather than a weighted score, for one reason: the bucket
 * IS the explanation. A person who is stuck needs to understand why the app is
 * pointing at this task, and "it scored 7.3" is not an answer they can act on.
 * Every rule below can be read as a sentence, tested on its own, and changed
 * without retuning anything else.
 */
import {
  compareTimestamps,
  daysOverdue,
  importanceRank,
  isEligible,
  normaliseImportance,
  toEpochDay
} from './signals';
import type { ContextNow, ContextTask, RankedTask, ReasonCode } from './types';

/** The last day an overdue task still counts as a recent miss. */
export const RECENT_OVERDUE_MAX_DAYS = 7;

/**
 * Bucket order. Today first: the plan a person made for today is the plan they
 * meant to follow, and leading with yesterday's misses turns the home screen
 * into a list of failures.
 */
const BUCKET_TODAY = 0;
const BUCKET_RECENT = 1;
const BUCKET_LONG = 2;

interface Placed<T extends ContextTask> {
  task: T;
  bucket: number;
  code: ReasonCode;
  overdue: number;
}

/**
 * Which bucket a task belongs in, and why.
 *
 * The one promotion rule lives here: a long-overdue task marked high is ranked
 * as a recent miss, so important work that slipped can resurface without
 * importance overriding dates altogether. It is promoted to RECENT and never
 * to TODAY — being important does not make something due today.
 */
function place<T extends ContextTask>(task: T, overdue: number): Placed<T> {
  if (overdue === 0) {
    return { task, bucket: BUCKET_TODAY, code: 'due_today', overdue };
  }
  if (overdue <= RECENT_OVERDUE_MAX_DAYS) {
    return { task, bucket: BUCKET_RECENT, code: 'overdue_recent', overdue };
  }
  if (normaliseImportance(task.importance) === 'high') {
    return { task, bucket: BUCKET_RECENT, code: 'overdue_important', overdue };
  }
  return { task, bucket: BUCKET_LONG, code: 'overdue_long', overdue };
}

/** Stable and total: importance, then age, then id. Ids are unique, so no ties remain. */
function compareByImportanceThenAge<T extends ContextTask>(a: Placed<T>, b: Placed<T>): number {
  const importance = importanceRank(a.task.importance) - importanceRank(b.task.importance);
  if (importance !== 0) return importance;
  const age = compareTimestamps(a.task.created_at, b.task.created_at);
  if (age !== 0) return age;
  return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
}

/** Age then id, with importance deliberately left out — see rotateLongOverdue. */
function compareByAge<T extends ContextTask>(a: Placed<T>, b: Placed<T>): number {
  const age = compareTimestamps(a.task.created_at, b.task.created_at);
  if (age !== 0) return age;
  return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
}

/** Left-rotate by `by` places. Negative and oversized offsets are wrapped. */
function rotate<T>(items: T[], by: number): T[] {
  const size = items.length;
  if (size <= 1) return items.slice();
  const offset = ((by % size) + size) % size;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Fairness inside the long-overdue bucket, without letting it eat importance.
 *
 * The problem this solves: sorted purely by age, the single oldest task heads
 * the backlog on every visit, for ever. A person sees the same reproach every
 * time they open the app, and the rest of the backlog is invisible.
 *
 * The trap in fixing it: rotating the whole bucket by one offset would, on
 * most days, put a low-importance task ahead of a normal one. Fairness would
 * have quietly destroyed the ordering the user asked for.
 *
 * So rotation happens INSIDE each importance tier, never across them. Tiers
 * stay in importance order; the head of each tier moves day by day. A low task
 * can never precede a normal one, and no single task owns the top spot.
 *
 * The offset is the day number itself, so it is fixed for a whole local
 * calendar day — the list does not reshuffle while someone is looking at it —
 * and moves on tomorrow. No randomness and nothing stored.
 */
function rotateLongOverdue<T extends ContextTask>(items: Placed<T>[], seed: number): Placed<T>[] {
  const tiers = new Map<number, Placed<T>[]>();
  for (const item of items) {
    const rank = importanceRank(item.task.importance);
    const tier = tiers.get(rank);
    if (tier) tier.push(item);
    else tiers.set(rank, [item]);
  }

  return [...tiers.keys()]
    .sort((a, b) => a - b)
    .flatMap((rank) => rotate(tiers.get(rank)!.slice().sort(compareByAge), seed));
}

/**
 * Ranks the tasks a person could act on now, best first.
 *
 * Deterministic: the same tasks and the same date always produce the same
 * order, in the same objects, with the same reasons. The caller's own task
 * objects come back untouched.
 */
export function rankTasks<T extends ContextTask>(tasks: T[], now: ContextNow): RankedTask<T>[] {
  const seed = toEpochDay(now.today);
  // An unreadable date cannot be reasoned about, and the honest answer to
  // "what should I do now" when "now" is unknown is nothing at all.
  if (seed === null) return [];

  const placed: Placed<T>[] = [];
  for (const task of tasks) {
    if (!isEligible(task, now.today)) continue;
    const overdue = daysOverdue(task.scheduled_date, now.today);
    if (overdue === null) continue;
    placed.push(place(task, overdue));
  }

  const today = placed.filter((item) => item.bucket === BUCKET_TODAY).sort(compareByImportanceThenAge);
  const recent = placed.filter((item) => item.bucket === BUCKET_RECENT).sort(compareByImportanceThenAge);
  const long = rotateLongOverdue(placed.filter((item) => item.bucket === BUCKET_LONG), seed);

  return [...today, ...recent, ...long].map((item) => ({
    task: item.task,
    reason: { code: item.code, daysOverdue: item.overdue }
  }));
}
