import { describe, expect, it, vi } from 'vitest';
import {
  MAX_AUDIO_BYTES,
  audioFormatOf,
  cleanTranscript,
  detectFormat,
  handleTranscribeRequest,
  isOctetStream,
  matchesFormat,
  type TranscribeHandlerDeps,
  type TranscribeLogEvent
} from './handler';
import type { TranscribeProvider } from '../_shared/transcribe-provider';

const ORIGIN = 'https://ima-updated-2026.vercel.app';
const SECRET_TRANSCRIPT = 'Call Ali tomorrow at 3pm and finish the accelerator application';

/** Real container signatures, padded to a plausible size. */
const audioOf = (format: 'webm' | 'mp4' | 'ogg', size = 4096) => {
  const bytes = new Uint8Array(size);
  if (format === 'webm') bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  if (format === 'mp4') bytes.set([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
  if (format === 'ogg') bytes.set([0x4f, 0x67, 0x67, 0x53], 0);
  return bytes;
};

function deps(overrides: Partial<TranscribeHandlerDeps> = {}) {
  const logs: TranscribeLogEvent[] = [];
  const transcribe = vi.fn(async () => ({ ok: true as const, text: `  ${SECRET_TRANSCRIPT}\n` }));
  const provider: TranscribeProvider = { mode: 'stub', transcribe };
  const resolveUser = vi.fn(async (token: string) => (token === 'good-token' ? { ok: true as const, user: { id: 'user-1' } } : { ok: false as const }));
  return {
    deps: { resolveUser, allowedOrigins: [ORIGIN], provider, log: (e: TranscribeLogEvent) => logs.push(e), ...overrides } as TranscribeHandlerDeps,
    logs,
    transcribe,
    resolveUser
  };
}

const request = (init: { method?: string; token?: string | null; origin?: string | null; type?: string | null; body?: BodyInit; length?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? 'good-token'}`;
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  if (init.type !== null) headers['Content-Type'] = init.type ?? 'audio/webm;codecs=opus';
  if (init.length) headers['Content-Length'] = init.length;
  const method = init.method ?? 'POST';
  return new Request('https://x.supabase.co/functions/v1/transcribe-capture', {
    method,
    headers,
    body: method === 'POST' ? (init.body ?? (audioOf('webm') as BodyInit)) : undefined
  });
};

describe('transcribe-capture — authentication and transport', () => {
  it('a signed-in webm recording returns cleaned plain text', async () => {
    const d = deps();
    const response = await handleTranscribeRequest(request(), d.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, text: SECRET_TRANSCRIPT });
    expect(d.transcribe).toHaveBeenCalledWith({ audio: expect.any(Uint8Array), format: 'webm' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it.each([
    ['mp4 (Safari)', 'audio/mp4', 'mp4'],
    ['ogg (Firefox)', 'audio/ogg;codecs=opus', 'ogg']
  ] as const)('accepts %s', async (_label, type, format) => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ type, body: audioOf(format) as BodyInit }), d.deps);
    expect(response.status).toBe(200);
    expect(d.transcribe).toHaveBeenCalledWith(expect.objectContaining({ format }));
  });

  it.each([
    ['no token', { token: null }],
    ['a bad token', { token: 'forged' }]
  ])('%s → 401, the audio is never sent on', async (_label, init) => {
    const d = deps();
    const response = await handleTranscribeRequest(request(init), d.deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('a resolver that throws fails closed', async () => {
    const d = deps({ resolveUser: async () => { throw new Error('boom'); } });
    expect((await handleTranscribeRequest(request(), d.deps)).status).toBe(401);
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('a disallowed origin is refused before authentication; preflight needs no credentials; only POST', async () => {
    const d = deps();
    expect((await handleTranscribeRequest(request({ origin: 'https://evil.example' }), d.deps)).status).toBe(403);
    expect(d.resolveUser).not.toHaveBeenCalled();
    expect((await handleTranscribeRequest(request({ method: 'OPTIONS', token: null }), d.deps)).status).toBe(204);
    expect((await handleTranscribeRequest(request({ method: 'GET' }), d.deps)).status).toBe(405);
  });
});

describe('transcribe-capture — application/octet-stream (what supabase-js sends for a Blob)', () => {
  it.each([
    ['WebM (Chrome)', 'webm'],
    ['MP4 (Safari)', 'mp4'],
    ['Ogg (Firefox)', 'ogg']
  ] as const)('%s bytes are identified by signature and transcribed', async (_label, format) => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ type: 'application/octet-stream', body: audioOf(format) as BodyInit }), d.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, text: SECRET_TRANSCRIPT });
    expect(d.transcribe).toHaveBeenCalledWith({ audio: expect.any(Uint8Array), format });
    expect(d.logs.at(-1)).toMatchObject({ status: 200, outcome: 'ok', audioBytes: 4096 });
  });

  it.each([
    ['zeros', new Uint8Array(4096)],
    ['WAV (RIFF)', (() => { const b = new Uint8Array(4096); b.set([0x52, 0x49, 0x46, 0x46], 0); return b; })()],
    ['a JSON document', new TextEncoder().encode(JSON.stringify({ x: 'y'.repeat(4096) }))],
    ['a PNG image', (() => { const b = new Uint8Array(4096); b.set([0x89, 0x50, 0x4e, 0x47], 0); return b; })()]
  ])('an invalid signature (%s) → 415, provider not called', async (_label, body) => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ type: 'application/octet-stream', body: body as BodyInit }), d.deps);
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ ok: false, code: 'unsupported_format' });
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('every other check still applies to octet-stream', async () => {
    const d = deps();
    const octet = (init: Parameters<typeof request>[0]) => request({ type: 'application/octet-stream', ...init });
    expect((await handleTranscribeRequest(octet({ token: null }), d.deps)).status).toBe(401);
    expect((await handleTranscribeRequest(octet({ origin: 'https://evil.example' }), d.deps)).status).toBe(403);
    expect((await handleTranscribeRequest(octet({ length: String(MAX_AUDIO_BYTES + 1) }), d.deps)).status).toBe(413);
    expect((await handleTranscribeRequest(octet({ body: audioOf('webm', MAX_AUDIO_BYTES + 10) as BodyInit }), d.deps)).status).toBe(413);
    expect((await handleTranscribeRequest(octet({ body: audioOf('webm', 200) as BodyInit }), d.deps)).status).toBe(422);
    expect((await handleTranscribeRequest(octet({ body: new Uint8Array(0) as BodyInit }), d.deps)).status).toBe(422);
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('isOctetStream and detectFormat', () => {
    expect(isOctetStream('application/octet-stream')).toBe(true);
    expect(isOctetStream('Application/Octet-Stream; charset=binary')).toBe(true);
    expect(isOctetStream('audio/webm')).toBe(false);
    expect(isOctetStream(null)).toBe(false);
    expect(detectFormat(audioOf('webm'))).toBe('webm');
    expect(detectFormat(audioOf('mp4'))).toBe('mp4');
    expect(detectFormat(audioOf('ogg'))).toBe('ogg');
    expect(detectFormat(new Uint8Array(4096))).toBeNull();
    expect(detectFormat(new Uint8Array(0))).toBeNull();
  });
});

describe('transcribe-capture — audio validation', () => {
  it.each([
    ['no content type', { type: null }],
    ['a non-audio type', { type: 'application/json' }],
    ['an unsupported audio type', { type: 'audio/wav' }],
    ['bytes that are not the declared container', { type: 'audio/webm', body: audioOf('ogg') as BodyInit }],
    ['mp4 declared but webm sent', { type: 'audio/mp4', body: audioOf('webm') as BodyInit }]
  ])('%s → 415, provider not called', async (_label, init) => {
    const d = deps();
    const response = await handleTranscribeRequest(request(init), d.deps);
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ ok: false, code: 'unsupported_format' });
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('a declared length over the cap is refused before reading', async () => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ length: String(MAX_AUDIO_BYTES + 1) }), d.deps);
    expect(response.status).toBe(413);
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('an actual body over the cap is refused while reading', async () => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ body: audioOf('webm', MAX_AUDIO_BYTES + 10) as BodyInit }), d.deps);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'too_large' });
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('a tiny recording → 422 no_speech, provider not called', async () => {
    const d = deps();
    const response = await handleTranscribeRequest(request({ body: audioOf('webm', 200) as BodyInit }), d.deps);
    expect(response.status).toBe(422);
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it('format helpers', () => {
    expect(audioFormatOf('Audio/WebM; codecs=opus')).toBe('webm');
    expect(audioFormatOf('audio/mp4')).toBe('mp4');
    expect(audioFormatOf('audio/mpeg')).toBeNull();
    expect(audioFormatOf(null)).toBeNull();
    expect(matchesFormat(audioOf('mp4'), 'mp4')).toBe(true);
    expect(matchesFormat(new Uint8Array(2), 'webm')).toBe(false);
  });
});

describe('transcribe-capture — provider results', () => {
  it.each([
    ['not_configured', 'provider_unavailable', 503],
    ['timeout', 'provider_unavailable', 503],
    ['upstream_status', 'provider_unavailable', 503],
    ['malformed_output', 'invalid_output', 502]
  ] as const)('%s → %s, with no provider detail', async (failure, code, status) => {
    const d = deps({ provider: { mode: 'openai', transcribe: async () => ({ ok: false, code, failure }) } });
    const response = await handleTranscribeRequest(request(), d.deps);
    expect(response.status).toBe(status);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, code });
    expect(text).not.toMatch(/openai|whisper|gpt|api key|status \d/i);
  });

  it('a provider that throws is a 503, not a crash, and leaks nothing', async () => {
    const d = deps({ provider: { mode: 'openai', transcribe: async () => { throw new Error('reset with sk-secret'); } } });
    const response = await handleTranscribeRequest(request(), d.deps);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sk-secret');
  });

  it.each([
    ['empty text', ''],
    ['only whitespace', '  \n\t '],
    ['not a string', 42]
  ])('%s → 422 no_speech', async (_label, text) => {
    const d = deps({ provider: { mode: 'openai', transcribe: async () => ({ ok: true, text }) } });
    const response = await handleTranscribeRequest(request(), d.deps);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'no_speech' });
  });

  it('transcripts are flattened and capped at 2,000 characters', () => {
    expect(cleanTranscript('  call\n\tAli\u0007 ')).toBe('call Ali');
    expect(Array.from(cleanTranscript('x'.repeat(5000))!)).toHaveLength(2000);
  });

  it('the reply carries only ok and text', async () => {
    const body = await (await handleTranscribeRequest(request(), deps().deps)).json();
    expect(Object.keys(body).sort()).toEqual(['ok', 'text']);
  });
});

describe('transcribe-capture — logs', () => {
  it('logs counts and codes only, never the transcript, audio or tokens', async () => {
    const d = deps();
    await handleTranscribeRequest(request(), d.deps);
    await handleTranscribeRequest(request({ token: 'forged' }), d.deps);
    expect(d.logs[0]).toMatchObject({ method: 'POST', status: 200, outcome: 'ok', audioBytes: 4096, transcriptChars: SECRET_TRANSCRIPT.length });
    expect(Object.keys(d.logs[0]).sort()).toEqual(['audioBytes', 'durationMs', 'method', 'outcome', 'status', 'transcriptChars']);
    const all = JSON.stringify(d.logs);
    for (const secret of ['Ali', 'accelerator', 'good-token', 'forged', 'user-1']) expect(all).not.toContain(secret);
  });
});
