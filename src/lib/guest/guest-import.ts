/**
 * Moving guest tasks into a signed-in account — only when the account holder
 * says so, and only through the account's normal task creation.
 *
 * This module never talks to Supabase. The caller hands in `create`, which in
 * the app is the existing useCreateTask mutation; each guest task is rebuilt
 * as a fresh NewTaskInput first, so no guest id, guest user_id or completion
 * data can reach it. The database generates new ids and stamps the signed-in
 * user as owner, exactly as for a task typed into the form.
 *
 * Partial failure: tasks are imported one at a time, and each one is removed
 * from the guest store the moment its create succeeds. If a later one fails,
 * the store holds exactly the tasks that have not been imported, so nothing
 * is lost and a retry cannot create a second copy of one that already went
 * through. Only when every task has succeeded is the store cleared outright.
 */
import type { NewTaskInput, TaskImportance } from '@/hooks/use-tasks';
import type { GuestTask, GuestTaskStore } from './guest-task-store';

/** Only unfinished work is offered; completed guest tasks are never imported. */
export function offeredForImport(tasks: readonly GuestTask[]): GuestTask[] {
  return tasks.filter((task) => !task.completed);
}

/**
 * The fields carried over, and nothing else. `id`, `user_id`, `completed`,
 * `completed_at`, `created_at` and `updated_at` are deliberately absent.
 */
export function toImportInput(task: GuestTask): NewTaskInput {
  return {
    title: task.title,
    description: task.description,
    tag: task.tag,
    scheduled_date: task.scheduled_date,
    start_time: task.start_time,
    end_time: task.end_time,
    importance: task.importance as TaskImportance
  };
}

export interface GuestImportResult {
  imported: number;
  failed: number;
  /** The first failure, for the message shown to the user. */
  error: Error | null;
}

export async function importGuestTasks(
  store: GuestTaskStore,
  create: (input: NewTaskInput) => Promise<unknown>
): Promise<GuestImportResult> {
  // Read once: the list is what the user confirmed, minus anything that went
  // through on an earlier attempt (already removed from the store).
  const offered = offeredForImport(store.list());
  let imported = 0;
  let failed = 0;
  let error: Error | null = null;

  for (const task of offered) {
    try {
      await create(toImportInput(task));
      store.remove(task.id);
      imported += 1;
    } catch (caught) {
      failed += 1;
      error ??= caught instanceof Error ? caught : new Error(String(caught));
    }
  }

  // Everything offered is now in the account: drop the rest of the guest data
  // too (completed tasks were never offered and are not wanted).
  if (failed === 0) store.clear();

  return { imported, failed, error };
}
