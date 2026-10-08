/**
 * Sends one recording to the transcribe-capture Edge Function and returns its
 * text, or a plain sentence when it could not. Signed-in only: Quick Capture
 * never offers voice to a guest.
 *
 * The audio goes as the raw request body with its container type; the
 * session token is attached by supabase-js. The reply is checked again here:
 * only a non-empty string of text is accepted.
 */
import { supabase } from '@/integrations/supabase/client';
import type { TranscribeResult } from './voice-capture';

export const TRANSCRIBE_FUNCTION = 'transcribe-capture';
const MAX_TEXT = 2000;

const MESSAGE_BY_CODE: Record<string, string> = {
  unauthenticated: 'Your session could not be verified. Sign in and try again.',
  too_large: 'That recording is too long. Try up to a minute.',
  unsupported_format: "This browser's recording format isn't supported. You can still type.",
  no_speech: 'iMA did not catch any words. Try again a little closer to the mic.',
  rate_limited: 'That is a lot at once. Try again in a moment.',
  provider_unavailable: 'Voice is not available right now. You can still type.',
  invalid_output: 'Could not turn that recording into text just now.',
  bad_request: 'Could not send that recording. Try again.'
};
const GENERIC_FAILURE = 'Could not turn that recording into text just now.';

type Invoke = typeof supabase.functions.invoke;

/** Plain text, one paragraph, bounded; null when nothing usable is left. */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return Array.from(flat).slice(0, MAX_TEXT).join('').trimEnd();
}

export async function requestTranscription(
  audio: Blob,
  invoke: Invoke = supabase.functions.invoke.bind(supabase.functions)
): Promise<TranscribeResult> {
  const contentType = audio.type.split(';')[0].trim() || 'application/octet-stream';
  let data: unknown;
  let invokeError: unknown;
  try {
    ({ data, error: invokeError } = await invoke(TRANSCRIBE_FUNCTION, { body: audio, headers: { 'Content-Type': contentType } }));
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (invokeError) {
    const context = (invokeError as { context?: unknown }).context;
    if (context && typeof (context as Response).json === 'function') {
      try {
        const code = ((await (context as Response).json()) as { code?: unknown } | null)?.code;
        if (typeof code === 'string' && code in MESSAGE_BY_CODE) return { ok: false, message: MESSAGE_BY_CODE[code] };
      } catch {
        // No envelope: the generic sentence is the honest answer.
      }
    }
    return { ok: false, message: GENERIC_FAILURE };
  }

  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) return { ok: false, message: GENERIC_FAILURE };
  const text = cleanText((data as { text?: unknown }).text);
  return text ? { ok: true, text } : { ok: false, message: MESSAGE_BY_CODE.no_speech };
}
