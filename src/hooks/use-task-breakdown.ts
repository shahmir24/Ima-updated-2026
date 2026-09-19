import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BREAKDOWN_LIMITS,
  sanitiseBreakdownSteps,
  type BreakdownAction,
  type BreakdownErrorCode
} from '@/lib/ai/breakdown-contract';

/**
 * Asks the ai-breakdown Edge Function for smaller next steps.
 *
 * The task and the step being refined are passed in on every call rather than
 * held here, so the caller stays the single owner of what the root task is.
 * That is the point: a refinement sends BOTH — the root task the user set out
 * to do, and the step they are narrowing — and this hook has no way to confuse
 * one for the other.
 *
 * Nothing is persisted. Suggestions live for as long as the dialog is open and
 * are dropped on reset; they are not memory and never reach the database.
 */

const FUNCTION_NAME = 'ai-breakdown';

/**
 * What the user is told, per contract code. Short and honest: no stack, no
 * upstream text, and nothing that implies we know more than we do.
 */
const MESSAGE_BY_CODE: Record<BreakdownErrorCode, string> = {
  unauthenticated: 'Your session could not be verified. Sign in and try again.',
  rate_limited: 'That is a lot of requests at once. Try again in a moment.',
  bad_request: 'Could not ask for suggestions for this task.',
  provider_unavailable: 'Could not reach the suggestion service just now.',
  invalid_output: 'The suggestions that came back were not usable.'
};
const GENERIC_FAILURE = 'Could not get suggestions just now.';

export interface TaskBreakdown {
  /** Currently offered steps. Empty until a request succeeds. */
  steps: string[];
  /** How far the shown steps sit from the root task. 0 = a first breakdown. */
  depth: number;
  pending: boolean;
  error: string | null;
  /** True once a request has been made, so the UI can tell "idle" from "empty". */
  requested: boolean;
  /** False at the cap, so the UI can stop offering to narrow further. */
  canMakeSmaller: boolean;
  breakDown: (task: string) => Promise<void>;
  makeSmaller: (task: string, step: string) => Promise<void>;
  tryAnother: (task: string, step: string) => Promise<void>;
  reset: () => void;
}

export function useTaskBreakdown(): TaskBreakdown {
  const [steps, setSteps] = useState<string[]>([]);
  const [depth, setDepth] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  /**
   * A ref, not `pending`: two taps in one tick read the same render's value and
   * would both fire. Same reason the journal save uses a ref rather than the
   * mutation's isPending.
   */
  const inFlightRef = useRef(false);

  /**
   * Every request takes a ticket; only the newest one may write state. There is
   * no abort to lean on — supabase-js's functions.invoke takes no AbortSignal —
   * so a superseded reply is discarded on arrival instead of being cancelled.
   */
  const ticketRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const run = useCallback(
    async (input: { action: BreakdownAction; task: string; currentStep?: string; depth: number; avoid?: string[] }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      ticketRef.current += 1;
      const ticket = ticketRef.current;
      /** Only the newest live request may touch state. */
      const current = () => mountedRef.current && ticket === ticketRef.current;

      setPending(true);
      setError(null);
      setRequested(true);

      try {
        const { data, error: invokeError } = await supabase.functions.invoke(FUNCTION_NAME, {
          body: {
            action: input.action,
            task: input.task,
            ...(input.currentStep ? { currentStep: input.currentStep } : {}),
            depth: input.depth,
            ...(input.avoid && input.avoid.length > 0 ? { avoid: input.avoid } : {})
          }
        });

        if (invokeError) {
          // A non-2xx arrives as a FunctionsHttpError carrying the Response, so
          // the contract envelope has to be read back out of it.
          let code: BreakdownErrorCode | null = null;
          const context = (invokeError as { context?: unknown }).context;
          if (context && typeof (context as Response).json === 'function') {
            try {
              const body = await (context as Response).json();
              const candidate = (body as { code?: unknown } | null)?.code;
              if (typeof candidate === 'string' && candidate in MESSAGE_BY_CODE) {
                code = candidate as BreakdownErrorCode;
              }
            } catch {
              // No envelope to read. The generic message below is the honest
              // answer; inventing a reason would be worse than saying little.
            }
          }
          if (current()) setError(code ? MESSAGE_BY_CODE[code] : GENERIC_FAILURE);
          return;
        }

        // The edge already sanitised this. Running it again here is deliberate:
        // a stale or tampered function must not be able to put arbitrary text
        // on the screen.
        const checked = sanitiseBreakdownSteps(
          { steps: (data as { steps?: unknown } | null)?.steps },
          { task: input.task, currentStep: input.currentStep }
        );
        if (!current()) return;
        if (!checked.ok) {
          setError(MESSAGE_BY_CODE.invalid_output);
          return;
        }

        setSteps(checked.value);
        setDepth(input.depth);
      } catch {
        // Offline, DNS, CORS — anything that never became a response.
        if (current()) setError(GENERIC_FAILURE);
      } finally {
        inFlightRef.current = false;
        if (current()) setPending(false);
      }
    },
    []
  );

  const breakDown = useCallback(
    (task: string) => run({ action: 'break_down', task, depth: BREAKDOWN_LIMITS.minDepth }),
    [run]
  );

  /** Narrowing moves one step further from the root task. */
  const makeSmaller = useCallback(
    (task: string, step: string) => {
      const next = depth + 1;
      if (next > BREAKDOWN_LIMITS.maxDepth) return Promise.resolve();
      return run({ action: 'make_smaller', task, currentStep: step, depth: next });
    },
    [depth, run]
  );

  /** Replacing a step does not narrow, so the depth is unchanged. */
  const tryAnother = useCallback(
    (task: string, step: string) =>
      run({
        action: 'try_another',
        task,
        currentStep: step,
        depth,
        avoid: steps.slice(0, BREAKDOWN_LIMITS.avoidMaxItems)
      }),
    [depth, run, steps]
  );

  const reset = useCallback(() => {
    // Invalidate any live ticket first, so a reply already on its way cannot
    // repopulate the list after the user has walked away from it.
    ticketRef.current += 1;
    inFlightRef.current = false;
    setSteps([]);
    setDepth(0);
    setPending(false);
    setError(null);
    setRequested(false);
  }, []);

  return {
    steps,
    depth,
    pending,
    error,
    requested,
    canMakeSmaller: depth < BREAKDOWN_LIMITS.maxDepth,
    breakDown,
    makeSmaller,
    tryAnother,
    reset
  };
}
