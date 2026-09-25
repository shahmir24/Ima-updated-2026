import { useAuth } from '@/contexts/auth-context';
import { useAllowedGuestTaskStore } from '@/contexts/guest-mode-context';
import { useGuestTaskBackend } from '@/hooks/use-guest-tasks';
import {
  useCreateTask,
  useDeleteTask,
  useTasks,
  useToggleTaskCompleted,
  useUpdateTask,
  type NewTaskInput,
  type TaskRow
} from '@/hooks/use-tasks';
import { composeTaskSource, selectTaskSourceMode, type TaskSource } from '@/lib/task-source';

export type { TaskChanges, TaskSource, TaskSourceMode } from '@/lib/task-source';

const NO_TASKS: TaskRow[] = [];

/**
 * The tasks a screen shows and the writes it makes, from whichever backend
 * applies: the signed-in user's Supabase tasks, or — only where Guest Mode has
 * been switched on — the guest store. See lib/task-source.ts.
 *
 * The Supabase side IS the existing hooks, called exactly as the screens called
 * them before: same query key, same enabled rule, same writes and
 * invalidation. Both backends' hooks run on every render, as hooks must; the
 * one not selected is inert (a disabled query, idle mutations, no guest
 * subscription).
 */
export function useTaskSource(): TaskSource<NewTaskInput> {
  const { user, loading } = useAuth();
  const offeredGuestStore = useAllowedGuestTaskStore();

  const mode = selectTaskSourceMode({
    signedIn: !!user,
    authLoading: loading,
    guestStoreOffered: offeredGuestStore !== null
  });

  const query = useTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const toggle = useToggleTaskCompleted();

  // Subscribed only in guest mode, so a signed-in user's screens never read
  // guest storage at all.
  const guest = useGuestTaskBackend(mode === 'guest' ? offeredGuestStore : null);

  return composeTaskSource<NewTaskInput>(mode, {
    supabase: {
      tasks: query.data ?? NO_TASKS,
      isPending: query.isPending,
      isError: query.isError,
      error: query.error,
      refetch: () => {
        void query.refetch();
      },
      create: { run: create.mutateAsync, isPending: create.isPending, error: create.error },
      update: { run: update.mutateAsync, isPending: update.isPending, error: update.error },
      toggle: { run: toggle.toggle, isPending: toggle.isPending, error: toggle.error },
      remove: { run: remove.mutateAsync, isPending: remove.isPending, error: remove.error }
    },
    guest
  });
}
