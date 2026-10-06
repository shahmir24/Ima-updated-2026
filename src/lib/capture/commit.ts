/**
 * Saving confirmed Quick Capture drafts, through the existing task source.
 *
 * The same partial-success model as the guest import (lib/guest/guest-import):
 * drafts are created one at a time, in order, and each one is reported as
 * saved the moment its create succeeds. A failure does not stop the rest. The
 * caller removes every saved draft from the review list straight away, so a
 * retry only ever sends what has not been saved: nothing is created twice.
 *
 * This module never talks to Supabase. `create` is useTaskSource().create.run,
 * the very path the manual task form uses, so RLS, ownership and validation
 * are exactly as for a typed task.
 */
import type { NewTaskInput } from '@/hooks/use-tasks';
import { toNewTaskInput, type CaptureDraft } from './drafts';

export interface CommitResult {
  savedKeys: string[];
  failedKeys: string[];
  /** The first failure, for diagnostics; the UI shows its own sentence. */
  error: Error | null;
}

export async function commitDrafts(
  drafts: readonly CaptureDraft[],
  create: (input: NewTaskInput) => Promise<unknown>,
  onSaved?: (key: string) => void
): Promise<CommitResult> {
  const savedKeys: string[] = [];
  const failedKeys: string[] = [];
  let error: Error | null = null;

  for (const draft of drafts) {
    try {
      await create(toNewTaskInput(draft));
      savedKeys.push(draft.key);
      onSaved?.(draft.key);
    } catch (caught) {
      failedKeys.push(draft.key);
      error ??= caught instanceof Error ? caught : new Error(String(caught));
    }
  }
  return { savedKeys, failedKeys, error };
}
