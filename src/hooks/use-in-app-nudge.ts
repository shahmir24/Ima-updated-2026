import { useCallback, useState } from 'react';
import {
  nudgeActionPath,
  readNudgeDismissals,
  rememberNudgeDismissal,
  selectInAppNudge,
  type InAppNudge,
  type InAppNudgeInput,
  type NudgeAction,
  type NudgeTask
} from '@/lib/nudges/in-app-nudge';

export interface InAppNudgeState {
  /** The nudge to show, or null. */
  nudge: InAppNudge | null;
  /** ×: hide it for the rest of this session. */
  dismiss: () => void;
  /** A button: hide it for the session and return where to go. */
  act: (action: NudgeAction) => string | null;
}

/**
 * The in-app gentle nudge for Home. Everything it decides comes from the
 * caller's own data (settings, tasks, today) through selectInAppNudge(); the
 * only state here is which nudges this session has already closed.
 *
 * There is no timer anywhere: a nudge stays until the user closes it or acts.
 */
export function useInAppNudge<T extends NudgeTask>(input: Omit<InAppNudgeInput<T>, 'dismissed'>): InAppNudgeState {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => readNudgeDismissals());
  const nudge = selectInAppNudge({ ...input, dismissed });
  const key = nudge?.key ?? null;

  const dismiss = useCallback(() => {
    if (key) setDismissed(rememberNudgeDismissal(key));
  }, [key]);

  const act = useCallback(
    (action: NudgeAction) => {
      if (!nudge) return null;
      setDismissed(rememberNudgeDismissal(nudge.key));
      return nudgeActionPath(nudge, action);
    },
    [nudge]
  );

  return { nudge, dismiss, act };
}
