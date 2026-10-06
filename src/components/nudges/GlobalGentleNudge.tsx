import { useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { useInAppNudge } from '@/hooks/use-in-app-nudge';
import { useTaskSource } from '@/hooks/use-task-source';
import { useUserSettings } from '@/hooks/use-user-settings';
import { offeredForImport } from '@/lib/guest/guest-import';
import { getGuestTaskStore, type GuestTask } from '@/lib/guest/guest-task-store';
import type { NudgeAction } from '@/lib/nudges/in-app-nudge';
import { isNudgeRoute } from '@/lib/nudges/nudge-routes';
import GentleNudgePopup from './GentleNudgePopup';

/** Local YYYY-MM-DD, the same "today" Home ranks with. */
const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const NO_GUEST_TASKS: readonly GuestTask[] = Object.freeze([]);
const noSubscription = () => () => {};
const noGuestTasks = () => NO_GUEST_TASKS;

/**
 * The single, app-wide in-app gentle nudge.
 *
 * Mounted ONCE, in App.tsx, inside the router and outside <Routes>, so it
 * lives for the whole visit: moving between pages never mounts a second one
 * or resets what was dismissed. It decides where it may appear from the
 * current path (lib/nudges/nudge-routes.ts) and what it says from the same
 * Context Engine, settings and session dismissals as before.
 *
 * Shown only to a signed-in, onboarded account. A guest is never "signed in"
 * here, so Guest Mode never sees it; auth and onboarding are not on the route
 * list either. On Home it also waits while "Keep your tasks?" is open.
 */
const GlobalGentleNudge = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, onboardingCompleted } = useAuth();
  const taskSource = useTaskSource();
  const { data: settings } = useUserSettings();

  const signedIn = !!user && onboardingCompleted === true && taskSource.mode === 'authenticated';

  // Read-only: Home's "Keep your tasks?" prompt owns the guest store; this
  // only checks whether that prompt is up, so the two never stack.
  const guestStore = signedIn && pathname === '/' ? getGuestTaskStore() : null;
  const leftoverGuestTasks = useSyncExternalStore(
    guestStore ? guestStore.subscribe : noSubscription,
    guestStore ? guestStore.list : noGuestTasks,
    guestStore ? guestStore.list : noGuestTasks
  );
  const askingAboutGuestTasks = offeredForImport(leftoverGuestTasks).length > 0;

  const { nudge, dismiss, act } = useInAppNudge({
    signedIn,
    settings,
    tasksReady: !taskSource.isPending && !taskSource.isError,
    tasks: taskSource.tasks,
    today: toLocalISODate(new Date())
  });

  if (!isNudgeRoute(pathname) || askingAboutGuestTasks) return null;

  const handleAction = (action: NudgeAction) => {
    const path = act(action);
    if (path) navigate(path);
  };

  return <GentleNudgePopup nudge={nudge} onDismiss={dismiss} onAction={handleAction} />;
};

export default GlobalGentleNudge;
