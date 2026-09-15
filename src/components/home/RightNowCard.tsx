import React from 'react';
import { Check, Clock, Play, Brain, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskRow } from '@/hooks/use-tasks';
import { formatStartTime, formatTaskDuration } from '@/hooks/use-home-task-queue';

interface RightNowCardProps {
  task: TaskRow;
  /**
   * Already includes the user's name when there is one. Optional: the desktop
   * dashboard shows the greeting in its own header, so it omits it here rather
   * than printing it twice.
   */
  greeting?: string;
  /** 1-based position in the queue, and its length. */
  position: number;
  total: number;
  /** 0–1. Queue position, not task progress. */
  ringFraction: number;
  /** False when advancing would land on the same task. */
  canAdvance: boolean;
  isCompleting: boolean;
  onStart: () => void;
  onStuck: () => void;
  onNotNow: () => void;
  onToggleComplete: () => void;
  /** Rendered inside the card, below the actions — the Up Next row. */
  children?: React.ReactNode;
}

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The one thing the home screen is for: the task to do next.
 *
 * Every value on it is real. Only metadata the task actually carries is
 * rendered — a start time when the column is set, a derived duration only when
 * both times exist. No estimate, no tag chip, no "due today" badge: the queue
 * is today-only by construction, and the tag column is NOT NULL with a default
 * no UI ever changes, so both would be decoration rather than information.
 */
const RightNowCard = ({
  task, greeting, position, total, ringFraction, canAdvance,
  isCompleting, onStart, onStuck, onNotNow, onToggleComplete, children
}: RightNowCardProps) => {
  const startTime = formatStartTime(task.start_time);
  const duration = formatTaskDuration(task.start_time, task.end_time);

  return (
    <section
      aria-label="Right now"
      className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 sm:p-7 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        {greeting ? <p className="text-sm text-blue-100">{greeting}</p> : <span />}

        {/* The ring means nothing on its own, so the count sits beside it and
            carries the meaning in words. */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white whitespace-nowrap">
            {position} of {total}
          </span>
          <div className="relative h-14 w-14 sm:h-16 sm:w-16">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-white/20" />
              <circle
                cx="32" cy="32" r={RING_RADIUS} fill="none" strokeWidth="4" strokeLinecap="round"
                className="stroke-white transition-[stroke-dashoffset] duration-500"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringFraction)}
              />
            </svg>
            <span className="sr-only">Task {position} of {total} in today’s queue</span>
          </div>
        </div>
      </div>

      <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-white">Right now</h2>

      <div className="mt-3 flex items-start gap-3">
        {/* Subtle by design: it must not compete with Start, but completing a
            task from Home is a capability this screen already had. */}
        <button
          type="button"
          onClick={onToggleComplete}
          disabled={isCompleting}
          aria-label={`Mark “${task.title}” as done`}
          className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/60">
            <Check className="h-4 w-4 text-transparent" />
          </span>
        </button>

        <p className="min-w-0 flex-1 break-words text-xl sm:text-2xl font-semibold text-white">
          {task.title}
        </p>
      </div>

      {(startTime || duration) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 pl-14 text-sm text-blue-100">
          {startTime && (
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {startTime}
            </span>
          )}
          {duration && (
            <span className="flex items-center gap-2">
              <Timer className="h-4 w-4" aria-hidden="true" />
              {duration}
            </span>
          )}
        </div>
      )}

      {/* Start leads; the other two are quieter. They wrap rather than shrink,
          because three buttons on one row are unreadable at 360px. */}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          onClick={onStart}
          className="h-12 min-w-[150px] flex-1 rounded-full bg-white text-blue-700 hover:bg-blue-50"
        >
          <Play className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
          Start
        </Button>

        <Button
          onClick={onStuck}
          className="h-12 min-w-[130px] flex-1 rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
          I’m stuck
        </Button>

        {canAdvance && (
          <Button
            onClick={onNotNow}
            className="h-12 min-w-[130px] flex-1 rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
            Not now
          </Button>
        )}
      </div>

      {children}
    </section>
  );
};

export default RightNowCard;
