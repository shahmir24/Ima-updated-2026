import React from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TaskRow } from '@/hooks/use-tasks';
import { formatStartTime } from '@/hooks/use-home-task-queue';

/** How many of today's tasks the rail lists before deferring to /tasks. */
const VISIBLE_LIMIT = 6;

interface TodaysTasksPanelProps {
  /** Today's tasks, completed ones included. Passed in — this fetches nothing. */
  tasks: TaskRow[];
  isCompleting: boolean;
  onToggleComplete: (task: TaskRow) => void;
}

/**
 * The right rail's list of today's real tasks.
 *
 * Presentational on purpose: Home already holds this data, and calling
 * useTasks() again here would mean two sources of truth for the same list.
 * Unlike Right Now, this shows completed tasks too — seeing what is already
 * done is the point of a day view.
 */
const TodaysTasksPanel = ({ tasks, isCompleting, onToggleComplete }: TodaysTasksPanelProps) => {
  const visible = tasks.slice(0, VISIBLE_LIMIT);

  return (
    <section aria-label="Today's tasks" className="rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Today's tasks</h2>
        {tasks.length > visible.length && (
          <Link to="/tasks" className="text-xs text-primary hover:underline">
            View all
          </Link>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nothing scheduled for today.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {visible.map((task) => {
            const startTime = formatStartTime(task.start_time);

            return (
              <li key={task.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onToggleComplete(task)}
                  disabled={isCompleting}
                  aria-label={
                    task.completed
                      ? `Mark “${task.title}” as not done`
                      : `Mark “${task.title}” as done`
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      task.completed ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`}
                  >
                    {task.completed && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                </button>

                <div className="min-w-0 flex-1 pt-2.5">
                  <p
                    className={`break-words text-sm ${
                      task.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {task.title}
                  </p>
                  {startTime && <p className="text-xs text-muted-foreground">{startTime}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default TodaysTasksPanel;
