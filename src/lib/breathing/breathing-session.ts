/**
 * A breathing session's length and progress: five full cycles, then done.
 *
 * A cycle is the whole pattern (Triangle Calm: Inhale + Hold + Exhale), never
 * one phase of it. The exercise pages count completed cycles exactly as they
 * always have; this only turns that count into what the screen shows and says
 * when to stop. Plain functions, so every state is testable without a page.
 */

export const BREATHING_CYCLE_TARGET = 5;

export type BreathingDot = 'done' | 'current' | 'todo';

export interface BreathingProgress {
  /** Completed cycles, never above the target. */
  completed: number;
  /** The cycle in progress (1-based); the last one once the session is complete. */
  current: number;
  target: number;
  complete: boolean;
  /** "Cycle 3 of 5": the third cycle is under way. */
  label: string;
  dots: BreathingDot[];
}

/** One more completed cycle, never past the target. */
export const nextCycleCount = (completed: number, target = BREATHING_CYCLE_TARGET): number =>
  Math.min(Math.max(0, completed) + 1, target);

export const isBreathingComplete = (completed: number, target = BREATHING_CYCLE_TARGET): boolean => completed >= target;

export function breathingProgress(completedCycles: number, target = BREATHING_CYCLE_TARGET): BreathingProgress {
  const completed = Math.min(Math.max(0, Math.floor(completedCycles) || 0), target);
  const complete = completed >= target;
  // Before the first cycle this is "Cycle 1 of 5"; it never reads "6 of 5".
  const current = complete ? target : completed + 1;
  const dots = Array.from({ length: target }, (_, index): BreathingDot =>
    index < completed ? 'done' : index === completed && !complete ? 'current' : 'todo'
  );
  return { completed, current, target, complete, label: `Cycle ${current} of ${target}`, dots };
}
