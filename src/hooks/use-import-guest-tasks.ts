import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useCreateTask } from '@/hooks/use-tasks';
import { importGuestTasks, offeredForImport } from '@/lib/guest/guest-import';
import { getGuestTaskStore, type GuestTask, type GuestTaskStore } from '@/lib/guest/guest-task-store';

/**
 * The one bridge from guest tasks to an account, and only on the account
 * holder's say-so.
 *
 * Used by Home for a signed-in, onboarded user. It reads the guest store
 * directly (Guest Mode's context is never offered to a signed-in user) and
 * reports the unfinished guest tasks, if any, so Home can ask. Nothing moves
 * until `addToAccount` is called; `discard` throws the guest tasks away and
 * writes nothing. Leftover guest data with nothing unfinished in it is cleared
 * quietly — there is nothing to ask about.
 *
 * Writes go through useCreateTask, the same path as the task form, which also
 * refreshes the task list after each one.
 */

const EMPTY: readonly GuestTask[] = Object.freeze([]);
const noSubscription = () => () => {};
const noTasks = () => EMPTY;

export interface GuestTaskImport {
  /** Unfinished guest tasks awaiting a decision. Empty means nothing to ask. */
  offered: GuestTask[];
  isImporting: boolean;
  /** Set after an attempt where some tasks did not go through. */
  error: string | null;
  addToAccount: () => Promise<void>;
  discard: () => void;
}

export function useImportGuestTasks(enabled: boolean): GuestTaskImport {
  const { user, onboardingCompleted } = useAuth();
  const eligible = enabled && !!user && onboardingCompleted === true;
  const store: GuestTaskStore | null = eligible ? getGuestTaskStore() : null;

  const tasks = useSyncExternalStore(
    store ? store.subscribe : noSubscription,
    store ? store.list : noTasks,
    store ? store.list : noTasks
  );
  const offered = offeredForImport(tasks);

  const create = useCreateTask();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not isImporting: a double tap in one tick must not start two runs.
  const runningRef = useRef(false);

  // Only completed guest tasks left: nothing to offer, so clear them quietly.
  useEffect(() => {
    if (store && tasks.length > 0 && offered.length === 0) store.clear();
  }, [store, tasks.length, offered.length]);

  const { mutateAsync } = create;
  const addToAccount = useCallback(async () => {
    if (!store || runningRef.current) return;
    runningRef.current = true;
    setIsImporting(true);
    setError(null);
    try {
      const result = await importGuestTasks(store, mutateAsync);
      if (result.failed > 0) {
        const total = result.imported + result.failed;
        setError(
          `${result.failed} of ${total} ${total === 1 ? 'task' : 'tasks'} could not be added. ` +
            'They are still here — try again.'
        );
      }
    } finally {
      runningRef.current = false;
      setIsImporting(false);
    }
  }, [store, mutateAsync]);

  const discard = useCallback(() => {
    if (!store || runningRef.current) return;
    setError(null);
    store.clear();
  }, [store]);

  return { offered, isImporting, error, addToAccount, discard };
}
