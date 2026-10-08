/**
 * transcribe-capture — Voice Brain Dump: audio in, plain text out.
 *
 * Built like organize-capture: index.ts wires Deno in; this module is handed
 * a UserResolver, the allowed origins and a provider, so every path is
 * testable and no request can select a test double.
 *
 * What it does: takes ONE short recording from a signed-in person and returns
 * its transcript as text. The browser puts that text into the Brain Dump box;
 * nothing is organized or saved here.
 *
 * What it can never do: read or write the database (no service-role key, no
 * table), keep the audio (it lives in memory for this request only), or log
 * the audio or the transcript. A log line is method, status, outcome,
 * duration, audio byte count and transcript character count.
 *
 * Request: the raw audio bytes as the body, with Content-Type audio/webm,
 * audio/mp4 or audio/ogg (codec parameters allowed), or
 * application/octet-stream. supabase-js sends a Blob as octet-stream and drops
 * the body if a Content-Type is set by the caller, so the app sends
 * octet-stream and the container is identified from the bytes themselves.
 * Either way the bytes must be a webm, mp4 or ogg container, and the body is
 * read with a hard size limit.
 */
import { corsHeaders, isOriginAllowed, jsonResponse } from '../_shared/http.ts';
import type { UserResolver } from '../ai-breakdown/handler.ts';
import type {
  AudioFormat,
  TranscribeErrorCode,
  TranscribeProvider,
  TranscribeProviderFailure
} from '../_shared/transcribe-provider.ts';

/** About 60 seconds of compressed speech is well under 2 MB; the cap leaves headroom. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
/** Anything smaller cannot hold meaningful speech (a bare container header). */
export const MIN_AUDIO_BYTES = 1024;
/** The Brain Dump box holds 2,000 characters; a transcript never needs more. */
export const MAX_TRANSCRIPT_LENGTH = 2000;

export type TranscribeResponse = { ok: true; text: string } | { ok: false; code: TranscribeErrorCode; message: string };

export interface TranscribeLogEvent {
  method: string;
  status: number;
  outcome: TranscribeErrorCode | 'ok';
  durationMs: number;
  /** Counts only. */
  audioBytes?: number;
  transcriptChars?: number;
}

export interface TranscribeHandlerDeps {
  resolveUser: UserResolver;
  allowedOrigins: readonly string[];
  provider: TranscribeProvider;
  log?: (event: TranscribeLogEvent) => void;
}

const STATUS_BY_CODE: Record<TranscribeErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  too_large: 413,
  unsupported_format: 415,
  no_speech: 422,
  rate_limited: 429,
  provider_unavailable: 503,
  invalid_output: 502
};

/** Looked up, never interpolated: no provider name, status or upstream text reaches the browser. */
const MESSAGE_BY_FAILURE: Record<TranscribeProviderFailure, string> = {
  not_configured: 'Voice is not available right now.',
  invalid_mode: 'Voice is not available right now.',
  timeout: 'That took too long. Try a shorter recording.',
  upstream_status: 'Could not turn that recording into text just now.',
  upstream_unreachable: 'Could not turn that recording into text just now.',
  malformed_output: 'Could not turn that recording into text just now.'
};

const UNVERIFIED_SESSION = 'Your session could not be verified. Sign in and try again.';

const FORMAT_BY_TYPE: Record<string, AudioFormat> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' };

/** 'audio/webm;codecs=opus' → 'webm'. Anything not on the list is null. */
export function audioFormatOf(contentType: string | null): AudioFormat | null {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return FORMAT_BY_TYPE[base] ?? null;
}

/** True for application/octet-stream: the container is then read from the bytes. */
export function isOctetStream(contentType: string | null): boolean {
  return !!contentType && contentType.split(';')[0].trim().toLowerCase() === 'application/octet-stream';
}

/** The container these bytes really are, by signature, or null for anything else. */
export function detectFormat(bytes: Uint8Array): AudioFormat | null {
  for (const format of ['webm', 'mp4', 'ogg'] as const) {
    if (matchesFormat(bytes, format)) return format;
  }
  return null;
}

/** The bytes actually are the declared container (checked by its signature). */
export function matchesFormat(bytes: Uint8Array, format: AudioFormat): boolean {
  const at = (offset: number, signature: number[]) => signature.every((byte, i) => bytes[offset + i] === byte);
  switch (format) {
    case 'webm':
      return at(0, [0x1a, 0x45, 0xdf, 0xa3]); // EBML
    case 'mp4':
      return at(4, [0x66, 0x74, 0x79, 0x70]); // 'ftyp'
    case 'ogg':
      return at(0, [0x4f, 0x67, 0x67, 0x53]); // 'OggS'
    default:
      return false;
  }
}

/** One paragraph of plain text: control characters and runs of whitespace collapsed, bounded. */
export function cleanTranscript(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const chars = Array.from(flat);
  return chars.length > MAX_TRANSCRIPT_LENGTH ? chars.slice(0, MAX_TRANSCRIPT_LENGTH).join('').trimEnd() : flat;
}

/** Reads at most `limit` bytes; null as soon as the body proves to be larger. */
async function readBounded(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function failure(code: TranscribeErrorCode, message: string, headers: Record<string, string>, status = STATUS_BY_CODE[code]): Response {
  const body: TranscribeResponse = { ok: false, code, message };
  return jsonResponse(body, status, headers);
}

export async function handleTranscribeRequest(request: Request, deps: TranscribeHandlerDeps): Promise<Response> {
  const startedAt = Date.now();
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  const done = (response: Response, outcome: TranscribeLogEvent['outcome'], counts: { audioBytes?: number; transcriptChars?: number } = {}) => {
    deps.log?.({ method: request.method, status: response.status, outcome, durationMs: Date.now() - startedAt, ...counts });
    return response;
  };

  // 1. Preflight: carries no credentials, so it is answered before any auth.
  if (request.method === 'OPTIONS') {
    if (origin !== null && !isOriginAllowed(origin, deps.allowedOrigins)) {
      return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
    }
    return done(new Response(null, { status: 204, headers: cors }), 'ok');
  }

  // 2. Browser origin allow-list.
  if (origin !== null && !isOriginAllowed(origin, deps.allowedOrigins)) {
    return done(failure('bad_request', 'Origin is not allowed.', cors, 403), 'bad_request');
  }

  // 3. One verb.
  if (request.method !== 'POST') {
    return done(failure('bad_request', 'This endpoint accepts POST.', { ...cors, Allow: 'POST, OPTIONS' }, 405), 'bad_request');
  }

  // 4. A session, verified by Auth. The gateway (verify_jwt) is the first lock.
  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');
  let resolved: Awaited<ReturnType<UserResolver>>;
  try {
    resolved = await deps.resolveUser(token);
  } catch {
    resolved = { ok: false };
  }
  if (!resolved.ok) return done(failure('unauthenticated', UNVERIFIED_SESSION, cors), 'unauthenticated');

  // 5. Declared format, before reading anything. An audio type names the
  //    container; octet-stream defers to the signature check in step 7.
  const contentType = request.headers.get('Content-Type');
  const declaredFormat = audioFormatOf(contentType);
  if (!declaredFormat && !isOctetStream(contentType)) {
    return done(failure('unsupported_format', 'That recording format is not supported.', cors), 'unsupported_format');
  }

  // 6. Size: refuse early on a declared length, and always read with a hard limit.
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) {
    return done(failure('too_large', 'That recording is too long. Try up to a minute.', cors), 'too_large');
  }
  let audio: Uint8Array | null;
  try {
    audio = await readBounded(request.body, MAX_AUDIO_BYTES);
  } catch {
    return done(failure('bad_request', 'Could not read that recording.', cors), 'bad_request');
  }
  if (audio === null) return done(failure('too_large', 'That recording is too long. Try up to a minute.', cors), 'too_large');
  if (audio.byteLength < MIN_AUDIO_BYTES) {
    return done(failure('no_speech', 'That recording was too short. Try again.', cors), 'no_speech', { audioBytes: audio.byteLength });
  }

  // 7. The bytes must really be a supported container: the declared one, or,
  //    for octet-stream, whichever signature they carry.
  const format = declaredFormat ?? detectFormat(audio);
  if (!format || !matchesFormat(audio, format)) {
    return done(failure('unsupported_format', 'That recording format is not supported.', cors), 'unsupported_format', { audioBytes: audio.byteLength });
  }

  // 8. Transcribe. Only the bytes and the format reach the provider.
  let result: Awaited<ReturnType<TranscribeProvider['transcribe']>>;
  try {
    result = await deps.provider.transcribe({ audio, format });
  } catch {
    result = { ok: false, code: 'provider_unavailable', failure: 'upstream_unreachable' };
  }
  if (!result.ok) {
    const message = MESSAGE_BY_FAILURE[result.failure] ?? 'Could not turn that recording into text just now.';
    return done(failure(result.code, message, cors), result.code, { audioBytes: audio.byteLength });
  }

  // 9. The transcript is untrusted until cleaned. Empty means nothing was heard.
  const text = cleanTranscript(result.text);
  if (text === null) {
    return done(failure('no_speech', 'iMA did not catch any words. Try again a little closer to the mic.', cors), 'no_speech', {
      audioBytes: audio.byteLength
    });
  }

  const body: TranscribeResponse = { ok: true, text };
  return done(jsonResponse(body, 200, cors), 'ok', { audioBytes: audio.byteLength, transcriptChars: Array.from(text).length });
}
