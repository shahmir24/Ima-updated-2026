
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, Circle, Activity, Smile, Frown, Zap, Brain,
  User, Settings, LogOut, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useTodayMood, useSaveMoodCheckin, toMoodLabel, isMoodValue } from '@/hooks/use-mood';
import { useTasks, useToggleTaskCompleted, type TaskRow } from '@/hooks/use-tasks';
import { useProfile } from '@/hooks/use-profile';
import { useHomeTaskQueue, greetingForHour } from '@/hooks/use-home-task-queue';
import RightNowCard from '@/components/home/RightNowCard';
import UpNextRow from '@/components/home/UpNextRow';
import DesktopHome from '@/components/home/DesktopHome';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import FounderWelcome from '@/components/home/FounderWelcome';
import { IMA_LOCKUP_SRC } from '@/lib/brand';

/** Local YYYY-MM-DD, so "today" is the user's calendar day, not a UTC one. */
const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const Index = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { toast } = useToast();

  // Today's check-in comes from the database, so the selection survives a
  // refresh. `pendingMood` shows the tap immediately while the insert is in
  // flight, and is cleared either way once it settles.
  const { data: todayMood } = useTodayMood();
  const saveMood = useSaveMoodCheckin();
  const [pendingMood, setPendingMood] = useState<string | null>(null);

  // A ref, not saveMood.isPending: two taps in the same tick both read the
  // same render's isPending (still false) and would both insert. A ref is
  // updated synchronously, so the second tap of a double-tap sees it.
  const savingRef = useRef(false);

  const selectedMood = pendingMood ?? (todayMood ? toMoodLabel(todayMood.mood) : null);

  const handleSelectMood = (label: string) => {
    // Two guards, because a tap on this row is cheap and easy to repeat:
    //   * while an insert is in flight, further taps are ignored, so a
    //     double-tap cannot write twice.
    //   * a second tap on the mood already recorded is a no-op, not a new row.
    //     The picker reads as a selection, so re-tapping the highlighted mood
    //     means "yes, still that" — it should not append a duplicate.
    // Choosing a DIFFERENT mood later still appends: the table is an
    // append-only log and the day's series is the point of it.
    if (savingRef.current || selectedMood === label) return;

    const mood = label.toLowerCase();
    if (!isMoodValue(mood)) return;

    savingRef.current = true;
    setPendingMood(label);
    saveMood.mutate(
      { mood },
      {
        onError: (error) => {
          toast({
            title: 'Could not save your mood',
            description: error instanceof Error ? error.message : 'Please try again.',
            variant: 'destructive'
          });
        },
        onSettled: () => {
          savingRef.current = false;
          setPendingMood(null);
        }
      }
    );
  };

  // The same persisted tasks the /tasks screen reads.
  const { data: allTasks = [], isPending: tasksLoading, isError: tasksFailed } = useTasks();
  const toggleTaskCompleted = useToggleTaskCompleted();
  const { data: profile, isPending: profilePending } = useProfile();

  const today = toLocalISODate(new Date());
  const queue = useHomeTaskQueue(allTasks, today);

  /**
   * Hand the Right Now task to whichever screen the user is sent to, so they
   * do not have to remember what the app just told them. Both destinations
   * still work with no task at all when reached from anywhere else.
   */
  const withTask = (path: string) =>
    queue.current ? `${path}?task=${encodeURIComponent(queue.current.id)}` : path;

  // The name is only ever the stored one; there is no fallback that guesses at
  // a first name from anything else.
  const firstName = profile?.first_name?.trim();
  const greeting = firstName
    ? `${greetingForHour(new Date().getHours())}, ${firstName}`
    : greetingForHour(new Date().getHours());

  const handleToggleTask = (task: TaskRow) => {
    // No optimistic removal: a failed write must leave the task exactly where
    // it was rather than quietly dropping it out of the queue. The hook
    // invalidates on success, which is what takes a completed task out.
    toggleTaskCompleted.toggle(task).catch(() => { /* surfaced via taskError */ });
  };

  const taskError = toggleTaskCompleted.error;
  const todaysTasks = allTasks.filter((task) => task.scheduled_date === today);

  const moods = [
    { name: "Happy", icon: Smile, color: "from-yellow-400 to-orange-400" },
    { name: "Sad", icon: Frown, color: "from-blue-400 to-blue-600" },
    { name: "Calm", icon: Circle, color: "from-blue-500 to-teal-400" },
    { name: "Anxious", icon: Zap, color: "from-red-400 to-pink-500" },
    { name: "Focused", icon: Brain, color: "from-purple-400 to-purple-600" }
  ];

  /**
   * Nothing to do right now — said plainly, and never as an empty task card.
   * Computed once here so the mobile card and the desktop hero cannot drift
   * apart on which of the three situations the user is actually in.
   */
  const emptyState =
    allTasks.length === 0
      ? { message: 'No tasks yet.', action: 'Add one' }
      : todaysTasks.length > 0
        ? { message: 'All done for today.', action: 'View tasks' }
        : { message: 'Nothing scheduled for today.', action: 'See all' };

  /** The date, for quiet context on the desktop dashboard. */
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const renderEmptyState = () => {
    const { message, action } = emptyState;

    return (
      <section
        aria-label="Right now"
        className="rounded-3xl bg-secondary/60 p-5 sm:p-7"
      >
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-foreground">Right now</h2>
        <p className="mt-3 text-base text-muted-foreground">{message}</p>
        <Button
          onClick={() => navigate('/tasks')}
          className="mt-5 h-12 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
        >
          {action}
        </Button>
      </section>
    );
  };

  return (
    <>
      {/* ------------------------------------------------ mobile and tablet.
          Unchanged from the Phase 3 Home, header and bottom bar included. The
          whole tree is gated so desktop never inherits its chrome — notably
          the logo and wordmark, which the sidebar already carries. */}
      <div data-testid="mobile-home" className="flex min-h-screen flex-col bg-background text-foreground pb-fixed-nav lg:hidden">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-lg items-center justify-between p-4 md:max-w-2xl lg:max-w-3xl">
        {/* Same width as the account button opposite, so the lockup sits on
            the header's true centre. */}
        <div className="h-11 w-11 shrink-0" aria-hidden="true" />

        <div className="flex h-12 flex-1 items-center justify-center">
          <h1>
            <img src={IMA_LOCKUP_SRC} alt="iMA" className="h-9 w-auto object-contain" />
          </h1>
        </div>

        {/* Profile dropdown in top right. The dead "Help" item that used to sit
            between Settings and Log Out is gone — it had no handler. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="Account menu" className="h-11 w-11 rounded-full p-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                <User className="h-4 w-4 text-white" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border border-border bg-background">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile-settings?tab=profile')}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile Info</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/profile-settings?tab=settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-2 sm:px-6 md:max-w-2xl lg:max-w-3xl">
        {/* Mood — unchanged behaviour, repositioned above the Right Now card. */}
        <div
          role="group"
          aria-label="How are you feeling today?"
          className="flex justify-between gap-1 sm:justify-center sm:gap-6"
        >
          {moods.map((mood) => {
            const IconComponent = mood.icon;
            const isSelected = selectedMood === mood.name;

            return (
              <button
                key={mood.name}
                onClick={() => handleSelectMood(mood.name)}
                aria-pressed={isSelected}
                className="flex min-w-0 flex-1 flex-col items-center gap-2 transition-all duration-200 sm:flex-none sm:basis-20"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 sm:h-14 sm:w-14 ${
                    isSelected
                      ? `bg-gradient-to-br ${mood.color} shadow-lg scale-110`
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  <IconComponent
                    className={`h-6 w-6 ${isSelected ? 'text-white' : 'text-muted-foreground'}`}
                  />
                </span>
                <span
                  className={`text-[11px] font-medium transition-colors sm:text-sm ${
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {mood.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right now */}
        {tasksLoading && (
          <p className="text-sm text-muted-foreground">Loading your tasks…</p>
        )}

        {tasksFailed && !tasksLoading && (
          <p className="text-sm text-red-300">Could not load your tasks.</p>
        )}

        {!tasksLoading && !tasksFailed && (
          queue.current ? (
            <RightNowCard
              task={queue.current}
              greeting={greeting}
              position={queue.position}
              total={queue.total}
              ringFraction={queue.ringFraction}
              canAdvance={queue.canAdvance}
              reason={queue.reason}
              isCompleting={toggleTaskCompleted.isPending}
              onStart={() => navigate(withTask('/focus'))}
              onStuck={() => navigate(withTask('/body-double'))}
              onNotNow={queue.advance}
              onToggleComplete={() => handleToggleTask(queue.current as TaskRow)}
            >
              <UpNextRow
                tasks={queue.upNext}
                isCompleting={toggleTaskCompleted.isPending}
                onToggleComplete={handleToggleTask}
              />
            </RightNowCard>
          ) : (
            renderEmptyState()
          )
        )}

        {taskError && (
          <p className="text-sm text-red-300">{(taskError as Error).message}</p>
        )}

        {/* Tasks live on their own screen; this keeps them one tap away. */}
        {!tasksLoading && !tasksFailed && queue.current && (
          <div className="-mt-2 flex justify-end">
            <Button
              variant="ghost"
              className="h-11 px-4 text-primary"
              onClick={() => navigate('/tasks')}
            >
              View all tasks
            </Button>
          </div>
        )}

        {/* Feature cards. Breathing, Focus, Soundscaping and Daily Journal all
            keep a route: Focus and Soundscaping inside Productivity, Breathing
            and Journal inside Wellness. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Link to="/productivity" className="rounded-3xl">
            <div className="flex min-h-[8rem] flex-col justify-between rounded-3xl bg-gradient-to-br from-amber-600 to-amber-900 p-5 card-hover sm:min-h-[10rem]">
              <div>
                <h3 className="text-lg font-bold">Productivity</h3>
                <p className="text-sm text-amber-200">Tasks, focus &amp; sounds</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Activity className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>

          <Link to="/wellness" className="rounded-3xl">
            <div className="flex min-h-[8rem] flex-col justify-between rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-900 p-5 card-hover sm:min-h-[10rem]">
              <div>
                <h3 className="text-lg font-bold">Wellness</h3>
                <p className="text-sm text-emerald-200">Breathing, journal &amp; calm</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Heart className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>

          {/* No AI claim: there is no model behind Body Double, and its own
              screen is careful not to imply one. */}
          <Link to="/body-double" className="rounded-3xl">
            <div className="flex min-h-[8rem] flex-col justify-between rounded-3xl bg-gradient-to-br from-cyan-600 to-cyan-900 p-5 card-hover sm:min-h-[10rem]">
              <div>
                <h3 className="text-lg font-bold">Body Double</h3>
                <p className="text-sm text-cyan-200">
                  Quiet co-working support for focus &amp; accountability
                </p>
              </div>
              <div className="mt-auto flex justify-end">
                <Users className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>
        </div>
      </main>

      {/* Bottom navigation: the same shared bar every other mobile screen
          renders. Hidden from lg up, where the desktop sidebar takes over. */}
      <BottomNavigation />
      </div>

      {/* -------------------------------------------------------- desktop.
          The same profile, mood, tasks, queue, mutation and handlers — only
          the arrangement differs. */}
      <DesktopHome
        greeting={greeting}
        dateLabel={dateLabel}
        moods={moods}
        selectedMood={selectedMood}
        onSelectMood={handleSelectMood}
        queue={queue}
        todaysTasks={todaysTasks}
        tasksLoading={tasksLoading}
        tasksFailed={tasksFailed}
        taskErrorMessage={taskError ? (taskError as Error).message : null}
        isCompleting={toggleTaskCompleted.isPending}
        onToggleTask={handleToggleTask}
        onStart={() => navigate(withTask('/focus'))}
        onStuck={() => navigate(withTask('/body-double'))}
        emptyState={emptyState}
        onEmptyStateAction={() => navigate('/tasks')}
      />

      {/* Beta: a founder note over Home, shared by both layouts. It decides for
          itself whether to appear (at most three times per browser). */}
      <FounderWelcome firstName={firstName} ready={!profilePending} />
    </>
  );
};

export default Index;
