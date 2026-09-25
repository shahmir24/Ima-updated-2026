import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { GuestTask, GuestTaskChanges, GuestTaskInput, GuestTaskStore } from '@/lib/guest/guest-task-store';
import type { TaskAction, TaskChanges, TaskSourceBackend } from '@/lib/task-source';

/**
 * The guest task store as a task-source backend.
 *
 * Guest writes are synchronous and local, so nothing is ever pending; a write
 * the store refuses (a blank title, say) is kept as `error` until the next
 * one, the same way a failed Supabase mutation is. Nothing here can reach
 * Supabase — the ESLint guest rule covers this file.
 */

const EMPTY: readonly GuestTask[] = Object.freeze([]);
const noSubscription = () => () => {};
const noTasks = () => EMPTY;

const unavailable = () => new Error('Guest Mode is not available here.');

function useGuestAction<Input, Output>(
  store: GuestTaskStore | null,
  write: (store: GuestTaskStore, input: Input) => Output
): TaskAction<Input, Output> {
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(
    async (input: Input): Promise<Output> => {
      setError(null);
      try {
        if (!store) throw unavailable();
        return write(store, input);
      } catch (caught) {
        const failure = caught instanceof Error ? caught : new Error(String(caught));
        setError(failure);
        throw failure;
      }
    },
    // `write` is always one of the module-level functions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );

  return { run, isPending: false, error };
}

const createTask = (store: GuestTaskStore, input: GuestTaskInput) => store.create(input);
// The store validates tag and importance itself, exactly as the table's
// CHECK constraints would, so the wider string types are safe to pass on.
const updateTask = (store: GuestTaskStore, input: { id: string; changes: TaskChanges }) =>
  store.update(input.id, input.changes as GuestTaskChanges);
// Flips the task as the caller last saw it, like useToggleTaskCompleted.
const toggleTask = (store: GuestTaskStore, task: { id: string; completed: boolean }) =>
  store.update(task.id, { completed: !task.completed });
const removeTask = (store: GuestTaskStore, id: string) => store.remove(id);

/** Pass null when Guest Mode is off: nothing is read, and every write refuses. */
export function useGuestTaskBackend(store: GuestTaskStore | null): TaskSourceBackend<GuestTaskInput> {
  const list = useSyncExternalStore(
    store ? store.subscribe : noSubscription,
    store ? store.list : noTasks,
    store ? store.list : noTasks
  );
  const tasks = useMemo(() => list.slice(), [list]);

  const create = useGuestAction(store, createTask);
  const update = useGuestAction(store, updateTask);
  const toggle = useGuestAction(store, toggleTask);
  const remove = useGuestAction(store, removeTask);

  return {
    tasks,
    isPending: false,
    isError: false,
    error: null,
    refetch: () => {},
    create,
    update,
    toggle,
    remove
  };
}
