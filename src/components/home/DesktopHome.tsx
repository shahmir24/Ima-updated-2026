import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Activity, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskRow } from '@/hooks/use-tasks';
import type { HomeTaskQueue } from '@/hooks/use-home-task-queue';
import RightNowCard from '@/components/home/RightNowCard';
import UpNextRow from '@/components/home/UpNextRow';
import TodaysTasksPanel from '@/components/home/TodaysTasksPanel';
import QuickToolsPanel from '@/components/home/QuickToolsPanel';

export interface MoodOption {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface DesktopHomeProps {
  /** Already carries the user's name when there is one. */
  greeting: string;
  /** Quiet date context, derived locally. */
  dateLabel: string;

  moods: MoodOption[];
  selectedMood: string | null;
  onSelectMood: (label: string) => void;

  queue: HomeTaskQueue;
  /** Today's tasks, completed included, for the rail. */
  todaysTasks: TaskRow[];

  tasksLoading: boolean;
  tasksFailed: boolean;
  taskErrorMessage: string | null;
  isCompleting: boolean;

  onToggleTask: (task: TaskRow) => void;
  onStart: () => void;
  onStuck: () => void;

  /** Copy for when no task is eligible — computed once, shared with mobile. */
  emptyState: { message: string; action: string };
  onEmptyStateAction: () => void;
  /** Shown above the mood strip when given. Guest Mode's Try iMA card. */
  notice?: React.ReactNode;
}

/**
 * Home at lg and above.
 *
 * A dashboard, not an analytics console. Right Now is the only loud thing on
 * the screen: the mood strip above it is a thin bar, the shortcuts below it are
 * short and muted, and the rail is bordered rather than filled. Everything
 * comes from the props Home already computed — no hook is called here, so
 * there is exactly one task query, one mood implementation and one queue.
 *
 * The rail appears only from xl (1280px). Between 1024 and 1279 the main
 * column takes the full width, because squeezing a 320px rail in there would
 * cost Right Now the space that makes it the hero.
 */
const DesktopHome = ({
  greeting, dateLabel, moods, selectedMood, onSelectMood, queue, todaysTasks,
  tasksLoading, tasksFailed, taskErrorMessage, isCompleting,
  onToggleTask, onStart, onStuck, emptyState, onEmptyStateAction, notice
}: DesktopHomeProps) => (
  <div data-testid="desktop-home" className="hidden min-h-screen bg-background text-foreground lg:block">
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <header>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{greeting}</h1>
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---------------------------------------------------- main column */}
        <div className="min-w-0 space-y-6">
          {notice}

          {/* Mood — the same five options and the same handler as mobile,
              laid out as one thin strip so it introduces the screen without
              competing with what follows. */}
          <section
            aria-label="How are you feeling today?"
            className="rounded-2xl border border-border bg-secondary/30 px-5 py-4"
          >
            <p className="text-sm text-muted-foreground">How are you feeling today?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {moods.map((mood) => {
                const Icon = mood.icon;
                const isSelected = selectedMood === mood.name;

                return (
                  <button
                    key={mood.name}
                    onClick={() => onSelectMood(mood.name)}
                    aria-pressed={isSelected}
                    className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm transition-all ${
                      isSelected
                        ? `bg-gradient-to-br ${mood.color} text-white shadow-lg`
                        : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{mood.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Right now — the hero. */}
          {tasksLoading && <p className="text-sm text-muted-foreground">Loading your tasks…</p>}
          {tasksFailed && !tasksLoading && (
            <p className="text-sm text-red-300">Could not load your tasks.</p>
          )}

          {!tasksLoading && !tasksFailed && (
            queue.current ? (
              <RightNowCard
                task={queue.current}
                position={queue.position}
                total={queue.total}
                ringFraction={queue.ringFraction}
                canAdvance={queue.canAdvance}
                reason={queue.reason}
                isCompleting={isCompleting}
                onStart={onStart}
                onStuck={onStuck}
                onNotNow={queue.advance}
                onToggleComplete={() => queue.current && onToggleTask(queue.current)}
              >
                <UpNextRow
                  tasks={queue.upNext}
                  isCompleting={isCompleting}
                  onToggleComplete={onToggleTask}
                />
              </RightNowCard>
            ) : (
              /* Sized like the hero it replaces, so an empty queue reads as a
                 finished day rather than a hole in the dashboard. */
              <section
                aria-label="A good place to start"
                className="flex min-h-[18rem] flex-col justify-center rounded-3xl bg-secondary/60 p-8"
              >
                <h2 className="text-3xl font-bold text-foreground">A good place to start</h2>
                <p className="mt-3 text-lg text-muted-foreground">{emptyState.message}</p>
                <Button
                  onClick={onEmptyStateAction}
                  className="mt-6 h-12 w-fit rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                >
                  {emptyState.action}
                </Button>
              </section>
            )
          )}

          {taskErrorMessage && <p className="text-sm text-red-300">{taskErrorMessage}</p>}

          {/* Secondary destinations — deliberately short and quiet. */}
          <div className="grid grid-cols-3 gap-4">
            <Link to="/productivity" className="rounded-2xl">
              <div className="flex h-24 flex-col justify-between rounded-2xl bg-gradient-to-br from-amber-700/80 to-amber-900/80 p-4 card-hover">
                <h3 className="text-sm font-semibold">Productivity</h3>
                <div className="flex items-end justify-between">
                  <p className="text-xs text-amber-200">Tasks, focus &amp; sounds</p>
                  <Activity className="h-5 w-5 text-white/80" />
                </div>
              </div>
            </Link>

            <Link to="/wellness" className="rounded-2xl">
              <div className="flex h-24 flex-col justify-between rounded-2xl bg-gradient-to-br from-emerald-700/80 to-emerald-900/80 p-4 card-hover">
                <h3 className="text-sm font-semibold">Wellness</h3>
                <div className="flex items-end justify-between">
                  <p className="text-xs text-emerald-200">Breathing, journal &amp; calm</p>
                  <Heart className="h-5 w-5 text-white/80" />
                </div>
              </div>
            </Link>

            <Link to="/body-double" className="rounded-2xl">
              <div className="flex h-24 flex-col justify-between rounded-2xl bg-gradient-to-br from-cyan-700/80 to-cyan-900/80 p-4 card-hover">
                <h3 className="text-sm font-semibold">Body Double</h3>
                <div className="flex items-end justify-between">
                  <p className="text-xs text-cyan-200">Quiet co-working support</p>
                  <Users className="h-5 w-5 text-white/80" />
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ------------------------------------------------------ right rail */}
        <aside aria-label="Today" data-testid="home-right-rail" className="hidden min-w-0 space-y-4 xl:block">
          <TodaysTasksPanel
            tasks={todaysTasks}
            isCompleting={isCompleting}
            onToggleComplete={onToggleTask}
          />
          <QuickToolsPanel />
        </aside>
      </div>
    </div>
  </div>
);

export default DesktopHome;
