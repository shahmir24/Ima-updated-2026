import React from 'react';
import { Check } from 'lucide-react';
import type { TaskRow } from '@/hooks/use-tasks';
import { formatStartTime } from '@/hooks/use-home-task-queue';

interface UpNextRowProps {
  tasks: TaskRow[];
  isCompleting: boolean;
  onToggleComplete: (task: TaskRow) => void;
}

/**
 * What comes after the current task, from the same queue.
 *
 * These are tasks, not calendar events: nothing here is connected to an
 * external calendar, so there is no calendar iconography, and a time appears
 * only when the task genuinely has a start_time. Each row keeps a completion
 * control, so the home screen does not lose a capability it already had.
 */
const UpNextRow = ({ tasks, isCompleting, onToggleComplete }: UpNextRowProps) => {
  if (tasks.length === 0) return null;

  return (
    <section aria-label="Up next" className="mt-5 border-t border-white/15 pt-4">
      <h3 className="text-sm font-medium text-blue-100">Up next</h3>

      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {tasks.map((task) => {
          const startTime = formatStartTime(task.start_time);

          return (
            <li key={task.id} className="flex items-start gap-2 sm:border-l sm:border-white/10 sm:pl-3 sm:first:border-0 sm:first:pl-0">
              <button
                type="button"
                onClick={() => onToggleComplete(task)}
                disabled={isCompleting}
                aria-label={`Mark “${task.title}” as done`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/50">
                  <Check className="h-3 w-3 text-transparent" />
                </span>
              </button>

              <div className="min-w-0 flex-1 pt-2">
                <p className="break-words text-sm font-medium text-white">{task.title}</p>
                {startTime && <p className="mt-0.5 text-xs text-blue-200">{startTime}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default UpNextRow;
