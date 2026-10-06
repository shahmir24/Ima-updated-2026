import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sanitiseOrganizeOutput, type OrganizeErrorCode, type OrganizeResult } from '@/lib/ai/organize-contract';

/**
 * Asks the organize-capture Edge Function to turn a signed-in person's brain
 * dump into proposals. Built like useTaskBreakdown: one request at a time,
 * only the newest reply may land, and errors become plain sentences.
 *
 * The reply is validated again here with the same contract the server used,
 * so a proposal reaches the screen only if both sides accept it. Nothing is
 * saved: the result is handed back for review.
 *
 * Signed-in only. Quick Capture never calls this for a guest.
 */

export const ORGANIZE_FUNCTION = 'organize-capture';

const MESSAGE_BY_CODE: Record<OrganizeErrorCode, string> = {
  unauthenticated: 'Your session could not be verified. Sign in and try again.',
  rate_limited: 'That is a lot at once. Try again in a moment.',
  bad_request: 'Could not organize that. Try shortening it.',
  provider_unavailable: 'Organizing is not available right now. You can add tasks manually.',
  invalid_output: 'Could not organize that just now. Try again.'
};
const GENERIC_FAILURE = 'Could not organize that just now. Try again.';

export interface OrganizeInput {
  text: string;
  /** The browser's local 'YYYY-MM-DD'. */
  today: string;
  timeZone?: string;
}

export interface CaptureOrganizer {
  pending: boolean;
  error: string | null;
  /** The result, or null when it failed (see `error`) or was superseded. */
  organize: (input: OrganizeInput) => Promise<OrganizeResult | null>;
  clearError: () => void;
}

type Invoke = typeof supabase.functions.invoke;

/** The request and reply handling, without React, for tests. */
export async function requestOrganize(
  input: OrganizeInput,
  invoke: Invoke = supabase.functions.invoke.bind(supabase.functions)
): Promise<{ ok: true; result: OrganizeResult } | { ok: false; message: string }> {
  let data: unknown;
  let invokeError: unknown;
  try {
    ({ data, error: invokeError } = await invoke(ORGANIZE_FUNCTION, {
      body: { text: input.text, today: input.today, ...(input.timeZone ? { timeZone: input.timeZone } : {}) }
    }));
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (invokeError) {
    // A non-2xx carries the Response; read the contract code out of it.
    const context = (invokeError as { context?: unknown }).context;
    if (context && typeof (context as Response).json === 'function') {
      try {
        const code = ((await (context as Response).json()) as { code?: unknown } | null)?.code;
        if (typeof code === 'string' && code in MESSAGE_BY_CODE) return { ok: false, message: MESSAGE_BY_CODE[code as OrganizeErrorCode] };
      } catch {
        // No envelope: the generic sentence is the honest answer.
      }
    }
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) return { ok: false, message: GENERIC_FAILURE };
  const checked = sanitiseOrganizeOutput(data, { today: input.today });
  return checked.ok ? { ok: true, result: checked.value } : { ok: false, message: GENERIC_FAILURE };
}

export function useCaptureOrganizer(invoke?: Invoke): CaptureOrganizer {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const organize = useCallback(
    async (input: OrganizeInput) => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setPending(true);
      setError(null);
      try {
        const outcome = await requestOrganize(input, invoke);
        if (!mountedRef.current) return null;
        if ('message' in outcome) {
          setError(outcome.message);
          return null;
        }
        return outcome.result;
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setPending(false);
      }
    },
    [invoke]
  );

  return { pending, error, organize, clearError: useCallback(() => setError(null), []) };
}
