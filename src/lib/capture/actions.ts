/**
 * Quick Capture's two actions, without React: "Organize it" and "Add tasks".
 * The sheet calls these; tests call them directly.
 */
import type { Dispatch } from 'react';
import type { NewTaskInput } from '@/hooks/use-tasks';
import type { CaptureOrganizer } from '@/hooks/use-capture-organizer';
import { commitDrafts } from './commit';
import { findInvalidDrafts, type CaptureAction, type CaptureState } from './drafts';

/** Local YYYY-MM-DD, the same "today" Tasks and Home use. */
export const localToday = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const browserTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

/**
 * "Organize it". A guest's text NEVER leaves this function: for a guest the
 * organizer is not called at all and the account boundary is shown instead.
 * Exported for tests.
 */
export async function runOrganize(args: {
  isGuest: boolean;
  text: string;
  today: string;
  timeZone?: string;
  organize: CaptureOrganizer['organize'];
  dispatch: Dispatch<CaptureAction>;
  showGuestBoundary: () => void;
}): Promise<void> {
  if (args.isGuest) {
    args.showGuestBoundary();
    return;
  }
  if (!args.text.trim()) return;
  const result = await args.organize({ text: args.text, today: args.today, ...(args.timeZone ? { timeZone: args.timeZone } : {}) });
  if (result) args.dispatch({ type: 'organized', result });
}

/**
 * "Add tasks". Nothing is saved before this runs, and it saves only drafts
 * that pass validation, one at a time, through the existing task source.
 * Returns true when every draft was saved (the sheet can close). Exported for tests.
 */
export async function runSave(args: {
  state: CaptureState;
  create: (input: NewTaskInput) => Promise<unknown>;
  dispatch: Dispatch<CaptureAction>;
}): Promise<boolean> {
  const { state, create, dispatch } = args;
  if (state.saving || state.drafts.length === 0) return false;
  const invalid = findInvalidDrafts(state.drafts);
  if (Object.keys(invalid).length > 0) {
    dispatch({ type: 'invalid', invalid });
    return false;
  }
  dispatch({ type: 'saveStarted' });
  const result = await commitDrafts(state.drafts, create);
  dispatch({ type: 'saveFinished', savedKeys: result.savedKeys, failedCount: result.failedKeys.length });
  return result.failedKeys.length === 0;
}
