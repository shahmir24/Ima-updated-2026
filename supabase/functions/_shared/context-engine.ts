/**
 * Context Engine v1 — the server copy, for the gentle-nudge sender.
 *
 * The app's engine (src/lib/context-engine) is the authority. This is a
 * dependency-free, single-file port of the parts the sender needs, because the
 * Edge Runtime cannot import the app's modules (extensionless imports, the `@/`
 * alias). It must rank EXACTLY as the app does, so a nudge points at the same
 * task the Right Now card shows. context-engine.parity.test.ts runs both over
 * fixed and generated task sets and fails on any difference: change the app's
 * engine, and that test tells you to change this one.
 *
 * Deterministic and pure: no clock, no network, no randomness, no model.
 */

export const TASK_IMPORTANCE = ['low', 'normal', 'high'] as const;
export type TaskImportance = (typeof TASK_IMPORTANCE)[number];

export interface ContextTask {
  id: string;
  /** 'YYYY-MM-DD', the local day the task is planned for. */
  scheduled_date: string;
  /** ISO timestamp. Used only as a stable tie-break. */
  created_at: string;
  completed: boolean;
  importance?: unknown;
}

export type ReasonCode = 'due_today' | 'overdue_recent' | 'overdue_long' | 'overdue_important';

export interface RankedTask<T extends ContextTask = ContextTask> {
  task: T;
  reason: { code: ReasonCode; daysOverdue: number };
}

/** The last day an overdue task still counts as a recent miss. */
export const RECENT_OVERDUE_MAX_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' to a whole day number; null for anything that is not a real date. */
export function toEpochDay(isoDate: string): number | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = Date.UTC(year, month - 1, day);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return utc / MS_PER_DAY;
}

function daysOverdue(scheduledDate: string, today: string): number | null {
  const scheduled = toEpochDay(scheduledDate);
  const now = toEpochDay(today);
  if (scheduled === null || now === null) return null;
  return now - scheduled;
}

function normaliseImportance(value: unknown): TaskImportance {
  return (TASK_IMPORTANCE as readonly string[]).includes(value as string) ? (value as TaskImportance) : 'normal';
}

function importanceRank(value: unknown): number {
  switch (normaliseImportance(value)) {
    case 'high':
      return 0;
    case 'normal':
      return 1;
    default:
      return 2;
  }
}

function isEligible(task: ContextTask, today: string): boolean {
  if (task.completed) return false;
  const overdue = daysOverdue(task.scheduled_date, today);
  return overdue !== null && overdue >= 0;
}

function compareTimestamps(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isNaN(left) && !Number.isNaN(right)) {
    if (left !== right) return left < right ? -1 : 1;
    return 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

const BUCKET_TODAY = 0;
const BUCKET_RECENT = 1;
const BUCKET_LONG = 2;

interface Placed<T extends ContextTask> {
  task: T;
  bucket: number;
  code: ReasonCode;
  overdue: number;
}

function place<T extends ContextTask>(task: T, overdue: number): Placed<T> {
  if (overdue === 0) return { task, bucket: BUCKET_TODAY, code: 'due_today', overdue };
  if (overdue <= RECENT_OVERDUE_MAX_DAYS) return { task, bucket: BUCKET_RECENT, code: 'overdue_recent', overdue };
  // Long overdue but important: promoted to RECENT, never to TODAY.
  if (normaliseImportance(task.importance) === 'high') return { task, bucket: BUCKET_RECENT, code: 'overdue_important', overdue };
  return { task, bucket: BUCKET_LONG, code: 'overdue_long', overdue };
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareByImportanceThenAge<T extends ContextTask>(a: Placed<T>, b: Placed<T>): number {
  const importance = importanceRank(a.task.importance) - importanceRank(b.task.importance);
  if (importance !== 0) return importance;
  const age = compareTimestamps(a.task.created_at, b.task.created_at);
  if (age !== 0) return age;
  return compareIds(a.task.id, b.task.id);
}

function compareByAge<T extends ContextTask>(a: Placed<T>, b: Placed<T>): number {
  const age = compareTimestamps(a.task.created_at, b.task.created_at);
  if (age !== 0) return age;
  return compareIds(a.task.id, b.task.id);
}

function rotate<T>(items: T[], by: number): T[] {
  const size = items.length;
  if (size <= 1) return items.slice();
  const offset = ((by % size) + size) % size;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Long-overdue fairness: rotate by the day number INSIDE each importance tier. */
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

/** The tasks a person could act on, best first, for their local calendar date. */
export function rankTasks<T extends ContextTask>(tasks: T[], now: { today: string }): RankedTask<T>[] {
  const seed = toEpochDay(now.today);
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
