/**
 * Context Engine v1 — what deserves attention right now.
 *
 * Deterministic, explainable and entirely local: given a person's tasks and
 * their local calendar date, it returns the eligible ones in order with a
 * reason attached to each. There is no model, no clock of its own, no storage
 * and no randomness, so the same inputs always produce the same answer.
 *
 * It decides WHAT. Body Double helps with HOW TO START. Focus helps a person
 * STAY WITH IT.
 */
export { rankTasks, RECENT_OVERDUE_MAX_DAYS } from './rank';
export {
  compareTimestamps,
  daysOverdue,
  importanceRank,
  isEligible,
  normaliseImportance,
  toEpochDay
} from './signals';
export {
  TASK_IMPORTANCE,
  type ContextNow,
  type ContextTask,
  type RankReason,
  type RankedTask,
  type ReasonCode,
  type TaskImportance
} from './types';
