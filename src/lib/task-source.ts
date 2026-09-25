/**
 * Task source — one task interface over two backends.
 *
 *   authenticated -> the existing Supabase hooks in use-tasks.ts, untouched
 *   guest         -> the guest task store in the browser tab
 *   signed-out    -> also the Supabase hooks, which is what a signed-out render
 *                    has always used: the query stays disabled and every
 *                    write throws "You must be signed in".
 *
 * This file holds the parts that need no React, so they can be tested without
 * a Supabase client. The hook that wires them up is hooks/use-task-source.ts.
 *
 * The two backends never mix. Each action is taken wholesale from one side;
 * nothing here copies a guest task, or anything from one, into a Supabase call.
 */
import type { Database } from '@/integrations/supabase/types';
import { isGuestTaskId } from '@/lib/guest/guest-task-store';

type TaskRow = Database['public']['Tables']['tasks']['Row'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

export type TaskSourceMode = 'authenticated' | 'guest' | 'signed-out';

/**
 * What an edit may change. Completion goes through `toggle`, and identity,
 * ownership and timestamps are not editable from a screen.
 */
export type TaskChanges = Pick<
  TaskUpdate,
  'title' | 'description' | 'tag' | 'scheduled_date' | 'start_time' | 'end_time' | 'importance'
>;

/** One write, with the state a screen shows while it runs and after it fails. */
export interface TaskAction<Input, Output> {
  run: (input: Input) => Promise<Output>;
  isPending: boolean;
  /** The last run's failure, cleared when the next run starts. */
  error: Error | null;
}

export interface TaskSourceActions<NewTask> {
  create: TaskAction<NewTask, TaskRow>;
  update: TaskAction<{ id: string; changes: TaskChanges }, TaskRow>;
  /** Flips completion of the task as the caller last saw it. */
  toggle: TaskAction<TaskRow, TaskRow>;
  remove: TaskAction<string, void>;
}

export interface TaskSource<NewTask> extends TaskSourceActions<NewTask> {
  mode: TaskSourceMode;
  /** In useTasks() order: date, start time (untimed last), creation time. */
  tasks: TaskRow[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface TaskSourceBackend<NewTask> extends TaskSourceActions<NewTask> {
  tasks: TaskRow[];
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Which backend a screen uses.
 *
 * A session always wins: a signed-in user is on Supabase even inside a part of
 * the app that allows guests. Without a session, the guest store is used only
 * where one has been offered (see GuestTaskStoreContext) and only once the
 * auth state is known — otherwise a returning user would briefly be a guest
 * while their session is still being restored.
 */
export function selectTaskSourceMode(input: {
  signedIn: boolean;
  authLoading: boolean;
  guestStoreOffered: boolean;
}): TaskSourceMode {
  if (input.signedIn) return 'authenticated';
  if (input.guestStoreOffered && !input.authLoading) return 'guest';
  return 'signed-out';
}

const notOnAccount = () => new Error('That task is not saved to your account.');

/**
 * The Supabase actions with one extra check: a guest id is refused before any
 * request is made. A guest id cannot match a real row anyway; refusing it here
 * means a stray guest task can never even reach a Supabase call. Every real id
 * passes straight through, so signed-in behaviour is unchanged.
 */
export function refuseGuestIds<NewTask>(actions: TaskSourceActions<NewTask>): TaskSourceActions<NewTask> {
  const guard = <Input, Output>(action: TaskAction<Input, Output>, idOf: (input: Input) => unknown): TaskAction<Input, Output> => ({
    isPending: action.isPending,
    error: action.error,
    run: (input) => (isGuestTaskId(idOf(input)) ? Promise.reject(notOnAccount()) : action.run(input))
  });

  return {
    create: actions.create,
    update: guard(actions.update, (input) => input?.id),
    toggle: guard(actions.toggle, (task) => task?.id),
    remove: guard(actions.remove, (id) => id)
  };
}

/** Picks one backend, whole. */
export function composeTaskSource<NewTask>(
  mode: TaskSourceMode,
  backends: { supabase: TaskSourceBackend<NewTask>; guest: TaskSourceBackend<NewTask> }
): TaskSource<NewTask> {
  if (mode === 'guest') return { mode, ...backends.guest };
  return { mode, ...backends.supabase, ...refuseGuestIds(backends.supabase) };
}
