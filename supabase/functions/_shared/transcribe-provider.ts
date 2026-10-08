/**
 * Where Voice Brain Dump transcription comes from: a deterministic stub, or
 * OpenAI's speech-to-text endpoint. The only module transcribe-capture uses
 * that knows a model provider exists.
 *
 * Separate from organize-provider.ts and provider.ts on purpose: different
 * endpoint, different payload (audio, not text), different failure paths.
 *
 * What the provider is given: the recorded audio bytes and their container
 * format. No user id, no account, no task list, no history. The audio is held
 * in memory for the one request and never written anywhere.
 */

export type AudioFormat = 'webm' | 'mp4' | 'ogg';

export type TranscribeErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'too_large'
  | 'unsupported_format'
  | 'no_speech'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_output';

export type TranscribeProviderFailure =
  | 'not_configured'
  | 'invalid_mode'
  | 'timeout'
  | 'upstream_status'
  | 'upstream_unreachable'
  | 'malformed_output';

export interface TranscribeProviderRequest {
  audio: Uint8Array;
  format: AudioFormat;
}

/** `text` is untrusted: the handler cleans it before anything leaves. */
export type TranscribeProviderResult =
  | { ok: true; text: unknown }
  | { ok: false; code: TranscribeErrorCode; failure: TranscribeProviderFailure };

export interface TranscribeProvider {
  mode: 'stub' | 'openai' | 'invalid';
  transcribe(request: TranscribeProviderRequest): Promise<TranscribeProviderResult>;
}

/** Unset or blank means stub. A typo is NOT quietly treated as stub. */
export function resolveTranscribeProviderMode(raw: string | null | undefined): 'stub' | 'openai' | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '' || value === 'stub') return 'stub';
  if (value === 'openai') return 'openai';
  return null;
}

function failed(failure: TranscribeProviderFailure): TranscribeProviderResult {
  return { ok: false, code: failure === 'malformed_output' ? 'invalid_output' : 'provider_unavailable', failure };
}

/** Fixed text, never derived from the audio. The prefix makes a stub result obvious. */
export const STUB_TRANSCRIPT = 'Stub: voice transcription is not switched on yet.';

export function createStubTranscribeProvider(): TranscribeProvider {
  return { mode: 'stub', transcribe: () => Promise.resolve({ ok: true, text: STUB_TRANSCRIPT }) };
}

/** Overridable by AI_TRANSCRIBE_MODEL. */
export const TRANSCRIBE_PROVIDER_DEFAULTS = {
  endpoint: 'https://api.openai.com/v1/audio/transcriptions',
  model: 'gpt-4o-mini-transcribe',
  timeoutMs: 30000
} as const;

const MIME_BY_FORMAT: Record<AudioFormat, string> = { webm: 'audio/webm', mp4: 'audio/mp4', ogg: 'audio/ogg' };

export interface OpenAiTranscribeConfig {
  apiKey: string | null | undefined;
  model?: string | null;
  endpoint?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** The text from a transcription response, or null for any other shape. */
export function extractTranscript(payload: unknown): unknown | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

export function createOpenAiTranscribeProvider(config: OpenAiTranscribeConfig): TranscribeProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint || TRANSCRIBE_PROVIDER_DEFAULTS.endpoint;
  const model = config.model || TRANSCRIBE_PROVIDER_DEFAULTS.model;
  const timeoutMs = config.timeoutMs ?? TRANSCRIBE_PROVIDER_DEFAULTS.timeoutMs;

  return {
    mode: 'openai',
    async transcribe(request) {
      if (!config.apiKey) return failed('not_configured');

      const form = new FormData();
      // The filename's extension is how the endpoint learns the container.
      form.append('file', new Blob([request.audio as BlobPart], { type: MIME_BY_FORMAT[request.format] }), `capture.${request.format}`);
      form.append('model', model);
      form.append('response_format', 'json');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: controller.signal,
          body: form
        });
      } catch (cause) {
        // One call, one outcome: no retry on a paid endpoint.
        const aborted = cause instanceof Error && cause.name === 'AbortError';
        return failed(aborted ? 'timeout' : 'upstream_unreachable');
      } finally {
        clearTimeout(timer);
      }

      // A non-2xx body is never read: it can carry account detail.
      if (!response.ok) return failed('upstream_status');

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return failed('malformed_output');
      }
      const text = extractTranscript(payload);
      return text === null ? failed('malformed_output') : { ok: true, text };
    }
  };
}

export interface TranscribeProviderConfig {
  /** Raw AI_TRANSCRIBE_PROVIDER. Absent means stub. */
  mode: string | null | undefined;
  apiKey: string | null | undefined;
  model?: string | null;
  fetchImpl?: typeof fetch;
}

/** An invalid mode becomes a provider that always fails, never a silent stub. */
export function createTranscribeProvider(config: TranscribeProviderConfig): TranscribeProvider {
  const mode = resolveTranscribeProviderMode(config.mode);
  if (mode === null) return { mode: 'invalid', transcribe: () => Promise.resolve(failed('invalid_mode')) };
  if (mode === 'stub') return createStubTranscribeProvider();
  return createOpenAiTranscribeProvider({ apiKey: config.apiKey, model: config.model, fetchImpl: config.fetchImpl });
}
